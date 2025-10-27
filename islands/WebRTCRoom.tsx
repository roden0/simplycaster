import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { RecordingControls } from "../components/RecordingControls.tsx";
import { type Participant, VideoMosaic } from "../components/VideoMosaic.tsx";
import { RecordingStatus } from "../components/RecordingStatus.tsx";
import { ConnectionDialog } from "../components/ConnectionDialog.tsx";
import { ErrorDialog } from "../components/ErrorDialog.tsx";
import { InviteDialog } from "../components/InviteDialog.tsx";
import { getCopy } from "../lib/copy.ts";import { WebRTCRoomClient } from "../lib/webrtc/index.ts";
import { WebRTCRoomClientConfig } from "../lib/webrtc/index.ts";
import { WebRTCRoomClientConfig } from "../lib/webrtc/index.ts";
import { type } from "node:os";
import { WebRTCRoomClient } from "../lib/webrtc/index.ts";
\nimport { WebRTCRoomClient } from "../lib/webrtc/index.ts";\nimport type { WebRTCRoomClientConfig, ParticipantInfo } from "../lib/webrtc/index.ts";

export interface WebRTCRoomProps {
  roomId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  initialParticipants?: Participant[];
}

// Signals for room state
const participants = signal<Participant[]>([]);
const isRecording = signal(false);
const recordingTime = signal(0);
const isConnected = signal(false);
const error = signal<string | null>(null);

export default function WebRTCRoom({
  roomId,
  userId,
  userName,
  isHost,
  initialParticipants = [],
}: WebRTCRoomProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const webrtcClientRef = useRef<WebRTCRoomClient | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceServerConfigRef = useRef<RTCIceServer[]>([]);
  
  // Dialog states
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // Initialize participants with current user
  useEffect(() => {
    const currentUser: Participant = {
      id: userId,
      name: userName,
      isHost,
      audioEnabled: true,
      videoEnabled: true,
    };

    participants.value = [currentUser, ...initialParticipants];
  }, [userId, userName, isHost, initialParticipants]);

  // Initialize WebRTC and get user media
  useEffect(() => {
    initializeWebRTC();
    return cleanup;
  }, []);

  // Recording timer
  useEffect(() => {
    if (isRecording.value) {
      recordingTimerRef.current = setInterval(() => {
        recordingTime.value += 1;
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording.value]);

  const initializeWebRTC = async () => {
    try {
      // Fetch ICE server configuration first
      await fetchICEServerConfiguration();

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Update current user with stream
      participants.value = participants.value.map((p) =>
        p.id === userId ? { ...p, videoStream: stream } : p
      );

      isConnected.value = true;

      // Initialize WebRTC signaling connection with ICE servers
      initializeSignaling();
    } catch (err) {
      console.error("Failed to get user media:", err);
      error.value = getCopy("errors.permissionDenied");
    }
  };

  const fetchICEServerConfiguration = async () => {
    try {
      const response = await fetch('/api/webrtc/ice-servers', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Add authentication headers if needed
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ICE servers: ${response.status}`);
      }

      const data = await response.json();
      iceServerConfigRef.current = data.iceServers || [];
      
      console.log('Loaded ICE server configuration:', iceServerConfigRef.current);
    } catch (err) {
      console.warn('Failed to load ICE server configuration, using fallback:', err);
      // Use fallback STUN servers
      iceServerConfigRef.current = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ];
    }
  };

  const createPeerConnection = (participantId: string): RTCPeerConnection => {
    const config: RTCConfiguration = {
      iceServers: iceServerConfigRef.current,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    const peerConnection = new RTCPeerConnection(config);
    const sessionId = `${roomId}-${participantId}`;

    // Start connection analytics tracking
    // TODO: Integrate with room coordinator to start analytics tracking
    console.log(`Starting analytics tracking for session ${sessionId}`);

    // Add local stream to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      remoteStreamsRef.current.set(participantId, remoteStream);
      
      // Update participant with remote stream
      participants.value = participants.value.map((p) =>
        p.id === participantId ? { ...p, videoStream: remoteStream } : p
      );
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidate to remote peer via signaling
        sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          targetParticipant: participantId
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Peer connection state for ${participantId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected') {
        // Start periodic stats collection for analytics
        startStatsCollection(sessionId, peerConnection);
      } else if (peerConnection.connectionState === 'failed') {
        // Attempt to restart ICE
        peerConnection.restartIce();
      } else if (peerConnection.connectionState === 'closed') {
        // Clean up and end analytics tracking
        peerConnectionsRef.current.delete(participantId);
        remoteStreamsRef.current.delete(participantId);
        // TODO: End analytics tracking
        console.log(`Ending analytics tracking for session ${sessionId}`);
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${participantId}:`, peerConnection.iceConnectionState);
      
      if (peerConnection.iceConnectionState === 'failed') {
        console.warn(`ICE connection failed for participant ${participantId}, attempting restart`);
        peerConnection.restartIce();
      }
    };

    peerConnectionsRef.current.set(participantId, peerConnection);
    return peerConnection;
  };

  const startStatsCollection = (sessionId: string, peerConnection: RTCPeerConnection) => {
    const statsInterval = setInterval(async () => {
      if (peerConnection.connectionState === 'closed') {
        clearInterval(statsInterval);
        return;
      }

      try {
        const stats = await peerConnection.getStats();
        // TODO: Send stats to analytics service via API or room coordinator
        console.log(`Collected stats for session ${sessionId}:`, stats.size, 'entries');
      } catch (error) {
        console.error(`Failed to collect stats for session ${sessionId}:`, error);
      }
    }, 5000); // Collect stats every 5 seconds
  };

  const sendSignalingMessage = (message: any) => {
    // TODO: Send message via WebSocket signaling server
    console.log('Sending signaling message:', message);
  };

  const initializeSignaling = () => {
    // TODO: Implement WebSocket connection to signaling server
    // This would handle:
    // - Joining the room
    // - Exchanging ICE candidates
    // - Handling offer/answer SDP
    // - Managing participant list updates
    // - Using the ICE server configuration from iceServerConfigRef.current
    console.log("Initializing signaling for room:", roomId);
    console.log("Using ICE servers:", iceServerConfigRef.current);
  };

  const handleStartRecording = () => {
    if (!isHost) {
      error.value = "Only the host can start recording";
      return;
    }

    try {
      // Recording integration with WebRTC client
      // This would:
      // - Start recording all participant streams
      // - Initialize FFmpeg.wasm for processing
      // - Set up IndexedDB for chunk buffering

      isRecording.value = true;
      recordingTime.value = 0;
      error.value = null;

      console.log("Starting recording for room:", roomId);

      // Notify other participants
      broadcastRecordingStatus(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      error.value = getCopy("errors.generic");
    }
  };

  const handleStopRecording = () => {
    if (!isHost) {
      error.value = "Only the host can stop recording";
      return;
    }

    try {
      // Recording stop integration with WebRTC client
      // This would:
      // - Stop MediaRecorder
      // - Process audio with FFmpeg.wasm
      // - Upload processed files to server
      // - Clean up IndexedDB chunks

      isRecording.value = false;

      console.log("Stopping recording for room:", roomId);

      // Notify other participants
      broadcastRecordingStatus(false);
    } catch (err) {
      console.error("Failed to stop recording:", err);
      error.value = getCopy("errors.generic");
    }
  };

  const handleInvite = () => {
    setShowInviteDialog(true);
  };

  const handleLeave = () => {
    // TODO: Implement leave room functionality
    // This would:
    // - Stop recording if host is leaving
    // - Close peer connections
    // - Clean up media streams
    // - Redirect to dashboard

    if (isHost && isRecording.value) {
      handleStopRecording();
    }

    cleanup();

    // Redirect to dashboard
    globalThis.location.href = "/dashboard";
  };

  const handleKickParticipant = (participantId: string) => {
    if (!isHost) return;

    // TODO: Implement kick functionality
    // This would:
    // - Send kick message via signaling
    // - Remove participant from local state
    // - Close peer connection

    participants.value = participants.value.filter((p) =>
      p.id !== participantId
    );

    console.log("Kicking participant:", participantId);
  };

  const broadcastRecordingStatus = (recording: boolean) => {
    // TODO: Send recording status to all participants via WebRTC data channel
    console.log("Broadcasting recording status:", recording);
  };

  const cleanup = () => {
    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    // Clear remote streams
    remoteStreamsRef.current.clear();

    // Clear timers
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    isConnected.value = false;
  };

  return (
    <div class="webrtc-room">
      {/* Hidden video element for local stream */}
      <video
        ref={localVideoRef}
        style={{ display: "none" }}
        autoplay
        muted
        playsInline
      />

      {/* Top Controls Bar */}
      <div class="room-header">
        <RecordingControls
          isRecording={isRecording.value}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onInvite={handleInvite}
          onLeave={handleLeave}
          disabled={!isConnected.value}
        />
      </div>

      {/* Main Video Area */}
      <div class="room-main">
        <VideoMosaic
          participants={participants.value}
          currentUserId={userId}
          isHost={isHost}
          onKickParticipant={handleKickParticipant}
        />
      </div>

      {/* Bottom Status Bar */}
      <div class="room-footer">
        <RecordingStatus
          isRecording={isRecording.value}
          recordingTime={recordingTime.value}
        />
      </div>

      {/* Dialogs */}
      <ConnectionDialog
        isOpen={!isConnected.value}
        message="Connecting to room..."
      />

      <ErrorDialog
        isOpen={!!error.value}
        message={error.value || ""}
        onClose={() => error.value = null}
      />

      <InviteDialog
        isOpen={showInviteDialog}
        roomId={roomId}
        onClose={() => setShowInviteDialog(false)}
      />
    </div>
  );
}
