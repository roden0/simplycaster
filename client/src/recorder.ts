// Microphone, input level and Track recording (CU3, CU4, CU5).
// Pipeline: mic → AudioWorklet (capture + Sync tone) → Worker (Opus/Ogg) → OPFS.

import workletUrl from "./capture-worklet.ts?worker&url";
import { AUDIBLE_TONE_DELAY_SECONDS, TONE_SECONDS } from "./sync-tone.ts";
import { CLICK_COUNT, CLICK_SPACING_SECONDS, LEAD_SECONDS, clickSamples, detectRoundTrip } from "./calibration.ts";

export type Recorder = Awaited<ReturnType<typeof createRecorder>>;

export type WorkerEvent =
  | { recorded: number; seconds: number }
  | { uploadStarted: string; uploadUrl: string; take: number }
  | { uploaded: number; fileName: string }
  | { uploadLost: string }
  | { error: string };

export type Part = {
  fileName: string;
  localStartMs: number;
  startTime: number;
  tone: boolean;
  toneHz: number;
  take: number;
  invite: string;
  /** The clock estimate T was converted with. */
  clockOffsetMs: number;
  clockRttMs: number;
};

/** What the browser tells us about the microphone; any of these means the Track may be losing sound. */
export type MicState = { ended: boolean; muted: boolean; silent: boolean };

export async function createRecorder(onEvent: (e: WorkerEvent) => void, onMicState: (s: MicState) => void) {
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
  const mic: MicState = { ended: false, muted: false, silent: false };
  const micChanged = (change: Partial<MicState>) => onMicState(Object.assign(mic, change));
  let calibrationDone: ((recorded: Float32Array) => void) | undefined;
  capture.port.onmessage = ({ data }) =>
    data.calibration ? calibrationDone?.(data.calibration) : micChanged({ silent: data.silent });
  /** Round trip measured with clicks (s); forgotten when the microphone or an audio device changes. */
  let calibratedRoundTrip: number | undefined;
  navigator.mediaDevices.addEventListener("devicechange", () => (calibratedRoundTrip = undefined));

  let source: MediaStreamAudioSourceNode | undefined;
  /** From sound reaching the microphone to the browser handing it over (ms), when the browser reports it. */
  let inputLatencyMs = 0;
  /** First frame of the part being recorded, for drift marks. */
  let partStartFrame: number | undefined;

  async function openMicrophone(deviceId?: string) {
    calibratedRoundTrip = undefined;
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
    const track = stream.getAudioTracks()[0];
    track.onmute = () => micChanged({ muted: true });
    track.onunmute = () => micChanged({ muted: false });
    track.onended = () => micChanged({ ended: true });
    micChanged({ ended: false, muted: track.muted });
    const settings = track.getSettings() as MediaTrackSettings & { latency?: number };
    inputLatencyMs = (settings.latency ?? 0) * 1000;
    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    source.connect(capture);
    await ctx.resume();
    return settings.deviceId;
  }

  /** From rendering a sample to hearing it (s), as the browser reports it. */
  const outputLatency = () => (ctx.baseLatency || 0) + (ctx.outputLatency || 0);

  /** From rendering a sample to capturing its sound (s): calibrated, or as the browser reports it. */
  const roundTrip = () => calibratedRoundTrip ?? outputLatency() + inputLatencyMs / 1000;

  /** Context time (s) of the sample heard at a local wall-clock time (ms since the Unix epoch). */
  function heardTimeAt(localMs: number) {
    const perfMs = localMs - performance.timeOrigin;
    const { contextTime, performanceTime } = ctx.getOutputTimestamp();
    if (performanceTime) return contextTime! + (perfMs - performanceTime) / 1000;
    return ctx.currentTime - outputLatency() + (perfMs - performance.now()) / 1000;
  }

  /**
   * Frame holding the sound that reached the microphone at a local wall-clock time: the sample
   * rendered then is heard at once, and what the microphone hears comes back one round trip later.
   */
  const captureFrameAt = (localMs: number) => Math.round((heardTimeAt(localMs) + roundTrip()) * ctx.sampleRate);

  /** Measures the round trip with clicks; returns it (s), or undefined if they were not heard. */
  async function calibrate() {
    const rate = ctx.sampleRate;
    const first = Math.round((ctx.currentTime + 0.1) * rate);
    const clicks = Array.from({ length: CLICK_COUNT }, (_, k) =>
      first + Math.round((LEAD_SECONDS + k * CLICK_SPACING_SECONDS) * rate),
    );
    const frames = clicks[clicks.length - 1] - first + Math.round(CLICK_SPACING_SECONDS * rate);
    const recorded = new Promise<Float32Array>((done) => (calibrationDone = done));
    capture.port.postMessage({ calibrate: { from: first, frames } });
    const buffer = new AudioBuffer({ length: clickSamples(rate).length, sampleRate: rate });
    buffer.copyToChannel(clickSamples(rate), 0);
    for (const frame of clicks) {
      const click = new AudioBufferSourceNode(ctx, { buffer });
      click.connect(ctx.destination);
      click.start(frame / rate);
    }
    calibratedRoundTrip = detectRoundTrip(await recorded, first, clicks, rate);
    return calibratedRoundTrip;
  }

  /**
   * Records a Track part from `localStartMs`. `startTime` is the same instant on the
   * Coordinator clock; `tone` is true only for the part that starts at T.
   */
  function start({ fileName, localStartMs, startTime, tone, toneHz, take, invite, clockOffsetMs, clockRttMs }: Part) {
    const startFrame = captureFrameAt(localStartMs);
    partStartFrame = startFrame;
    const outputLatencyMs = outputLatency() * 1000;
    const roundTripMs = calibratedRoundTrip === undefined ? undefined : calibratedRoundTrip * 1000;
    worker.postMessage({
      fileName,
      sampleRate: ctx.sampleRate,
      take,
      invite,
      startTime,
      outputLatencyMs,
      inputLatencyMs,
      roundTripMs,
      clockOffsetMs,
      clockRttMs,
    });
    capture.port.postMessage({ start: startFrame, tone });
    if (!tone) return;
    // Play this Participant's own tone, heard at T + delay.
    const at = heardTimeAt(localStartMs) + AUDIBLE_TONE_DELAY_SECONDS;
    const osc = new OscillatorNode(ctx, { frequency: toneHz });
    const gain = new GainNode(ctx, { gain: 0.3 });
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + TONE_SECONDS);
  }

  function stop(localStopMs: number) {
    partStartFrame = undefined;
    capture.port.postMessage({ stop: captureFrameAt(localStopMs) });
  }

  function level() {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    return buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  }

  /** Samples recorded in the current part up to now, and the local wall-clock time of now. */
  function driftMark() {
    if (partStartFrame === undefined) return;
    const localMs = performance.timeOrigin + performance.now();
    const samples = captureFrameAt(localMs) - partStartFrame;
    if (samples > 0) return { samples, localMs };
  }

  /** Finishes uploads left pending by an earlier page (CU7). */
  function resumeUpload(fileName: string, uploadUrl: string, take: number, invite: string) {
    worker.postMessage({ resume: fileName, uploadUrl, take, invite });
  }

  return {
    openMicrophone,
    calibrate,
    /** The round trip in use (ms) and whether it was measured. */
    latency: () => ({ ms: roundTrip() * 1000, calibrated: calibratedRoundTrip !== undefined }),
    start,
    stop,
    resumeUpload,
    driftMark,
    level,
  };
}
