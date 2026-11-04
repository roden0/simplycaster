// Audio thread: forwards microphone frames in [start, stop) to the encoder Worker,
// replacing the first frames of the Track with the Sync tone.

import { TONE_HZ, TONE_SECONDS } from "./sync-tone.ts";

declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

const CHUNK_FRAMES = 4800;
/** This much exact digital silence means the microphone is not delivering sound. */
const SILENT_SECONDS = 2;

class CaptureProcessor extends AudioWorkletProcessor {
  out?: MessagePort;
  start = Infinity;
  stop = Infinity;
  /** Only the part recorded from T carries the Sync tone. */
  tone = false;
  chunk: Float32Array[] = [];
  filled = 0;
  /** Consecutive recorded frames that were exactly zero on every channel. */
  zeroRun = 0;
  silent = false;

  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data.port) this.out = data.port;
      if (data.start !== undefined) {
        this.start = data.start;
        this.tone = data.tone;
        this.stop = Infinity;
        this.chunk = [];
        this.filled = 0;
        this.setSilent(false);
        this.zeroRun = 0;
      }
      if (data.stop !== undefined) this.stop = data.stop;
    };
  }

  /** Tells the main thread when the microphone goes silent or comes back. */
  setSilent(silent: boolean) {
    if (silent !== this.silent) this.port.postMessage({ silent });
    this.silent = silent;
  }

  flush() {
    if (this.filled === 0) return;
    // f32-planar: all frames of channel 0, then channel 1…
    const planar = new Float32Array(this.filled * this.chunk.length);
    this.chunk.forEach((ch, c) => planar.set(ch.subarray(0, this.filled), c * this.filled));
    this.out!.postMessage({ data: planar, channels: this.chunk.length }, [planar.buffer]);
    this.filled = 0;
  }

  process(inputs: Float32Array[][]) {
    const input = inputs[0];
    if (!this.out || this.start === Infinity || input.length === 0) return true;
    if (this.chunk.length === 0) this.chunk = input.map(() => new Float32Array(CHUNK_FRAMES));
    const toneFrames = this.tone ? Math.round(TONE_SECONDS * sampleRate) : 0;

    for (let i = 0; i < input[0].length; i++) {
      const frame = currentFrame + i;
      if (frame < this.start) continue;
      if (frame >= this.stop) {
        this.flush();
        this.out.postMessage({ end: true });
        this.start = Infinity;
        this.setSilent(false);
        return true;
      }
      const k = frame - this.start;
      const tone = k < toneFrames ? 0.5 * Math.sin((2 * Math.PI * TONE_HZ * k) / sampleRate) : undefined;
      this.chunk.forEach((ch, c) => (ch[this.filled] = tone ?? input[c]?.[i] ?? 0));
      if (tone === undefined) {
        const zero = input.every((ch) => ch[i] === 0);
        this.zeroRun = zero ? this.zeroRun + 1 : 0;
        if (!zero) this.setSilent(false);
        else if (this.zeroRun === SILENT_SECONDS * sampleRate) this.setSilent(true);
      }
      if (++this.filled === CHUNK_FRAMES) this.flush();
    }
    return true;
  }
}

registerProcessor("capture", CaptureProcessor);
