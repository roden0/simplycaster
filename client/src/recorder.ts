// Microphone, input level and Track recording (CU3, CU4, CU5).
// Pipeline: mic → AudioWorklet (capture + Sync tone) → Worker (Opus/Ogg) → OPFS.

import workletUrl from "./capture-worklet.ts?worker&url";
import { TONE_HZ, TONE_SECONDS } from "./sync-tone.ts";

export type Recorder = Awaited<ReturnType<typeof createRecorder>>;

export type WorkerEvent =
  | { recorded: number; seconds: number }
  | { uploadStarted: string; uploadUrl: string; take: number }
  | { uploaded: number; fileName: string }
  | { uploadLost: string }
  | { error: string };

export async function createRecorder(onEvent: (e: WorkerEvent) => void) {
  // Must be called from a user gesture, or autoplay policy keeps the context suspended.
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(workletUrl);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const capture = new AudioWorkletNode(ctx, "capture", { numberOfOutputs: 0 });
  const worker = new Worker(new URL("./encoder-worker.ts", import.meta.url), { type: "module" });
  const channel = new MessageChannel();
  capture.port.postMessage({ port: channel.port1 }, [channel.port1]);
  worker.postMessage({ port: channel.port2 }, [channel.port2]);
  worker.onmessage = ({ data }) => onEvent(data);

  let source: MediaStreamAudioSourceNode | undefined;

  async function openMicrophone(deviceId?: string) {
    source?.mediaStream.getTracks().forEach((tr) => tr.stop());
    source?.disconnect();
    // Raw signal: the Track is for editing, so no browser processing.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    source.connect(capture);
    await ctx.resume();
    return stream.getAudioTracks()[0].getSettings().deviceId;
  }

  /** AudioContext frame at a given local wall-clock time (ms since the Unix epoch). */
  function frameAt(localMs: number) {
    let { contextTime, performanceTime } = ctx.getOutputTimestamp();
    if (!performanceTime) [contextTime, performanceTime] = [ctx.currentTime, performance.now()];
    const perfMs = localMs - performance.timeOrigin;
    return Math.round((contextTime! + (perfMs - performanceTime) / 1000) * ctx.sampleRate);
  }

  /**
   * Records a Track part from `localStartMs`. `startTime` is the same instant on the
   * Coordinator clock; `tone` is true only for the part that starts at T.
   */
  function start(fileName: string, localStartMs: number, startTime: number, tone: boolean, take: number, invite: string) {
    const startFrame = frameAt(localStartMs);
    worker.postMessage({ fileName, sampleRate: ctx.sampleRate, take, invite, startTime });
    capture.port.postMessage({ start: startFrame, tone });
    if (!tone) return;
    // Let everyone hear the Sync tone too.
    const osc = new OscillatorNode(ctx, { frequency: TONE_HZ });
    const gain = new GainNode(ctx, { gain: 0.3 });
    osc.connect(gain).connect(ctx.destination);
    osc.start(startFrame / ctx.sampleRate);
    osc.stop(startFrame / ctx.sampleRate + TONE_SECONDS);
  }

  function stop(localStopMs: number) {
    capture.port.postMessage({ stop: frameAt(localStopMs) });
  }

  function level() {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    return buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  }

  /** Finishes uploads left pending by an earlier page (CU7). */
  function resumeUpload(fileName: string, uploadUrl: string, take: number, invite: string) {
    worker.postMessage({ resume: fileName, uploadUrl, take, invite });
  }

  return { openMicrophone, start, stop, resumeUpload, level };
}
