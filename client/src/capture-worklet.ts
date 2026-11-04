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

class CaptureProcessor extends AudioWorkletProcessor {
  out?: MessagePort;
  start = Infinity;
  stop = Infinity;
  /** Only the part recorded from T carries the Sync tone. */
  tone = false;
  chunk: Float32Array[] = [];
  filled = 0;

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
      }
      if (data.stop !== undefined) this.stop = data.stop;
    };
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
        return true;
      }
      const k = frame - this.start;
      const tone = k < toneFrames ? 0.5 * Math.sin((2 * Math.PI * TONE_HZ * k) / sampleRate) : undefined;
      this.chunk.forEach((ch, c) => (ch[this.filled] = tone ?? input[c]?.[i] ?? 0));
      if (++this.filled === CHUNK_FRAMES) this.flush();
    }
    return true;
  }
}

registerProcessor("capture", CaptureProcessor);
