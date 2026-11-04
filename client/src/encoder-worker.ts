// Encodes the Track to Opus in an Ogg container, writes it to OPFS as it goes, and
// uploads it progressively with tus while it grows (CU4, CU6). Ogg output is
// append-only, so the file only grows and the upload can follow behind it.

import { AudioSample, AudioSampleSource, OggOutputFormat, Output, StreamTarget } from "mediabunny";
import { Upload } from "tus-js-client";

const BITRATE_PER_CHANNEL = 256_000;
const OPUS_MAX_BITRATE = 510_000;
/** ~2 s of audio per PATCH: bounds what a dropped connection can leave unsent. */
const UPLOAD_CHUNK_BYTES = 64 * 1024;
/** Keep retrying for a few minutes before giving up. */
const RETRY_DELAYS_MS = [0, 1000, 3000, 5000, ...Array(30).fill(10_000)];

// Worker-only API, missing from the DOM typings this project compiles against.
type SyncAccessHandle = {
  getSize(): number;
  read(buffer: Uint8Array, opts: { at: number }): number;
  write(data: Uint8Array, opts: { at: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
};

/** The Track file on OPFS, shared by the encoder (writer) and the upload (reader). */
type TrackFile = { handle: SyncAccessHandle; size: number; finished: boolean; waiters: (() => void)[] };

type Recording = {
  output: Output;
  source?: AudioSampleSource;
  take: number;
  sampleRate: number;
  frames: number;
};

let rec: Recording | undefined;
// Serializes setup, encoding and finalization: audio may arrive while OPFS is still opening.
let queue = Promise.resolve();
const enqueue = (job: () => Promise<void>) => {
  queue = queue.then(job).catch((e) => postMessage({ error: String(e) }));
};

self.onmessage = ({ data }) => {
  if (data.port) {
    (data.port as MessagePort).onmessage = ({ data }) => (data.end ? enqueue(finish) : enqueue(() => encode(data)));
  } else if (data.resume) {
    enqueue(() => resume(data));
  } else {
    enqueue(() => begin(data));
  }
};

async function openTrack(fileName: string, create: boolean) {
  const dir = await navigator.storage.getDirectory();
  const fileHandle = await dir.getFileHandle(fileName, { create });
  const handle: SyncAccessHandle = await (fileHandle as any).createSyncAccessHandle();
  return handle;
}

function grew(file: TrackFile) {
  file.waiters.splice(0).forEach((wake) => wake());
}

type Begin = {
  fileName: string;
  sampleRate: number;
  take: number;
  invite: string;
  startTime: number;
  outputLatencyMs: number;
  inputLatencyMs: number;
  roundTripMs?: number;
};

async function begin({ fileName, sampleRate, take, invite, startTime, outputLatencyMs, inputLatencyMs, roundTripMs }: Begin) {
  const handle = await openTrack(fileName, true);
  handle.truncate(0);
  const file: TrackFile = { handle, size: 0, finished: false, waiters: [] };

  const output = new Output({
    format: new OggOutputFormat(),
    target: new StreamTarget(
      new WritableStream({
        write(chunk) {
          // The upload trails the file, so every write must extend it.
          if (chunk.position !== file.size) throw new Error(`non-append write at ${chunk.position}`);
          handle.write(chunk.data, { at: chunk.position });
          handle.flush();
          file.size += chunk.data.length;
          grew(file);
        },
        close() {
          file.finished = true;
          grew(file);
        },
      }),
    ),
  });
  rec = { output, take, sampleRate, frames: 0 };
  startUpload(file, fileName, take, invite, {
    endpoint: `${self.location.origin}/takes/${take}/uploads`,
    creationHeaders: {
      "X-Track-Start": String(startTime),
      "X-Sample-Rate": String(sampleRate),
      "X-Output-Latency-Ms": String(outputLatencyMs),
      "X-Input-Latency-Ms": String(inputLatencyMs),
      ...(roundTripMs !== undefined && { "X-Round-Trip-Ms": String(roundTripMs) }),
    },
  });
}

/** A Track part whose upload an earlier page left unfinished: the file is complete on OPFS. */
async function resume({ resume: fileName, uploadUrl, take, invite }: { resume: string; uploadUrl: string; take: number; invite: string }) {
  let handle: SyncAccessHandle;
  try {
    handle = await openTrack(fileName, false);
  } catch {
    postMessage({ uploadLost: fileName });
    return;
  }
  const file: TrackFile = { handle, size: handle.getSize(), finished: true, waiters: [] };
  startUpload(file, fileName, take, invite, { uploadUrl });
}

type Target = { endpoint: string; creationHeaders: Record<string, string> } | { uploadUrl: string };

function startUpload(file: TrackFile, fileName: string, take: number, invite: string, target: Target) {
  const where = "uploadUrl" in target ? { uploadUrl: target.uploadUrl } : { endpoint: target.endpoint };
  // Only read by the Coordinator on creation; harmless on the other requests.
  const extraHeaders = "creationHeaders" in target ? target.creationHeaders : {};
  // The input only reaches our own fileReader, so its type does not matter to tus-js-client.
  const upload = new Upload(file as unknown as Blob, {
    ...where,
    headers: { "X-Invite": invite, ...extraHeaders },
    uploadLengthDeferred: true,
    chunkSize: UPLOAD_CHUNK_BYTES,
    retryDelays: RETRY_DELAYS_MS,
    // The default URL storage needs localStorage, which Workers lack.
    // (tus-js-client's typings lag its docs: null fingerprint and null size are both allowed.)
    fingerprint: async () => null as unknown as string,
    storeFingerprintForResuming: false,
    fileReader: {
      openFile: async () => ({
        size: null as unknown as number,
        async slice(start: number, end: number) {
          // Wait until the encoder has written this whole chunk, or the Track is complete.
          while (!file.finished && file.size < end) await new Promise<void>((wake) => file.waiters.push(wake));
          const stop = Math.min(end, file.size);
          const bytes = new Uint8Array(Math.max(0, stop - start));
          file.handle.read(bytes, { at: start });
          // tus-js-client measures the chunk with `.size`, so it must be a Blob.
          return { value: bytes.length ? new Blob([bytes]) : null, done: file.finished && stop >= file.size };
        },
        close() {},
      }),
    },
    onUploadUrlAvailable() {
      postMessage({ uploadStarted: fileName, uploadUrl: upload.url, take });
    },
    async onSuccess() {
      file.handle.close();
      // The Coordinator has it all: the local copy is no longer needed.
      await (await navigator.storage.getDirectory()).removeEntry(fileName).catch(() => {});
      postMessage({ uploaded: take, fileName });
    },
    onError(e) {
      const status = (e as { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus();
      // The Coordinator no longer knows this upload (e.g. it restarted): nothing left to resume.
      if (status === 404 || status === 403) postMessage({ uploadLost: fileName });
      else postMessage({ error: String(e) });
    },
  });
  upload.start();
}

async function encode({ data, channels }: { data: Float32Array; channels: number }) {
  if (!rec) return;
  if (!rec.source) {
    // The channel count is only known once the first audio arrives.
    rec.source = new AudioSampleSource({
      codec: "opus",
      bitrate: Math.min(BITRATE_PER_CHANNEL * channels, OPUS_MAX_BITRATE),
    });
    rec.output.addAudioTrack(rec.source);
    await rec.output.start();
  }
  const sample = new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: rec.sampleRate,
    timestamp: rec.frames / rec.sampleRate,
  });
  await rec.source.add(sample);
  sample.close();
  rec.frames += data.length / channels;
}

async function finish() {
  if (!rec) return;
  const { output, take, frames, sampleRate } = rec;
  rec = undefined;
  if (output.state === "started") await output.finalize();
  else await output.cancel();
  postMessage({ recorded: take, seconds: frames / sampleRate });
}
