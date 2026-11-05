// Live conversation (iteration 0c, ADR-0005): a WebRTC mesh where every Participant hears the
// others. The Coordinator only relays the signalling; audio goes browser to browser, or through
// its TURN. It sends the same raw microphone as the Track, so headphones are needed.

import type { IceServer } from "./protocol/IceServer.ts";

type Signal = {
  /** Sender's connection, so signals of a connection that was replaced are told apart. */
  id: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type Peer = {
  pc: RTCPeerConnection;
  /** This side's id for the connection, and the other side's once known. */
  id: string;
  remoteId?: string;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audio: HTMLAudioElement;
};

export type Live = ReturnType<typeof createLive>;

export function createLive(myName: string, send: (to: string, data: string) => void, onChange: () => void) {
  const peers = new Map<string, Peer>();
  /** Remote connection ids we have left behind: their late signals are ignored. */
  const dead = new Set<string>();
  let iceServers: IceServer[] = [];
  let track: MediaStreamTrack | undefined;
  let connected: string[] = [];
  /** Signals that arrived before we joined: answered once we do, or an offer would wait forever. */
  let early: [string, string][] = [];
  /** Signals are handled one at a time, in order: a candidate needs its description set first. */
  let queue = Promise.resolve();

  function open(name: string): Peer {
    const pc = new RTCPeerConnection({ iceServers });
    // Not Web Audio: browsers only cancel echo, and some only play, WebRTC audio through an element.
    const audio = new Audio();
    audio.autoplay = true;
    const peer: Peer = { pc, id: crypto.randomUUID(), makingOffer: false, ignoreOffer: false, audio };
    peers.set(name, peer);
    const signal = (data: Omit<Signal, "id">) => send(name, JSON.stringify({ id: peer.id, ...data }));
    pc.ontrack = (e) => {
      audio.srcObject = new MediaStream([e.track]);
      audio.play().catch(() => {});
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) signal({ candidate: e.candidate.toJSON() });
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        signal({ description: pc.localDescription!.toJSON() });
      } catch (e) {
        console.warn(`live ${name}:`, e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") pc.restartIce();
      onChange();
    };
    pc.addTrack(track!);
    onChange();
    return peer;
  }

  function close(name: string) {
    const peer = peers.get(name);
    if (!peer) return;
    if (peer.remoteId) dead.add(peer.remoteId);
    peer.pc.close();
    peer.audio.srcObject = null;
    peers.delete(name);
    onChange();
  }

  /** Opens a connection to every other connected Participant, and drops those who left. */
  function sync() {
    if (!track) return;
    for (const name of connected) if (name !== myName && !peers.has(name)) open(name);
    for (const name of [...peers.keys()]) if (!connected.includes(name)) close(name);
  }

  return {
    setIceServers(servers: IceServer[]) {
      iceServers = servers;
    },

    /** Joins the conversation with this microphone, or switches to another one. */
    async setTrack(t: MediaStreamTrack | undefined) {
      track = t;
      for (const { pc } of peers.values()) pc.getSenders()[0]?.replaceTrack(t ?? null);
      sync();
      const pending = early;
      early = [];
      for (const [from, data] of pending) await receive(from, data);
    },

    roster(names: string[]) {
      connected = names;
      sync();
    },

    receive,

    state: (name: string): RTCPeerConnectionState | undefined => peers.get(name)?.pc.connectionState,

    leave() {
      track = undefined;
      early = [];
      for (const name of [...peers.keys()]) close(name);
    },
  };

  function receive(from: string, data: string) {
    // A failed signal must not stall the ones behind it.
    queue = queue.then(() => handle(from, data)).catch((e) => console.warn(`live ${from}:`, e));
    return queue;
  }

  /** Perfect negotiation (W3C WebRTC example): on colliding offers the polite side yields. */
  async function handle(from: string, data: string) {
    if (!track) {
      early = [...early.slice(-200), [from, data]];
      return;
    }
    const msg: Signal = JSON.parse(data);
    if (dead.has(msg.id)) return;
    let peer = peers.get(from);
    // A new connection from them (page reloaded, or they dropped ours): start over.
    if (peer?.remoteId && peer.remoteId !== msg.id) {
      close(from);
      peer = undefined;
    }
    peer ??= open(from);
    peer.remoteId = msg.id;
    const { pc } = peer;
    const polite = myName > from;
    try {
      if (msg.description) {
        const collision = msg.description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
        peer.ignoreOffer = !polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(msg.description);
        if (msg.description.type === "offer") {
          await pc.setLocalDescription();
          send(from, JSON.stringify({ id: peer.id, description: pc.localDescription!.toJSON() }));
        }
      } else if (msg.candidate) {
        await pc.addIceCandidate(msg.candidate).catch((e) => {
          if (!peer.ignoreOffer) throw e;
        });
      }
    } catch (e) {
      console.warn(`live ${from}:`, e);
    }
  }
}
