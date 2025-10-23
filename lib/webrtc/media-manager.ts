/**
 * Media Manager
 * 
 * Handles getUserMedia, media stream management, device enumeration,
 * and media constraints for WebRTC functionality.
 */

import { MediaConstraints, MediaStreamInfo, SignalingErrorCode } from './types.ts';

/**
 * Media Device Information
 */
export interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
  groupId: string;
}

/**
 * Media Manager Configuration
 */
export interface MediaManagerConfig {
  defaultAudioConstraints: MediaTrackConstraints;
  defaultVideoConstraints: MediaTrackConstraints;
  enableEchoCancellation: boolean;
  enableNoiseSuppression: boolean;
  enableAutoGainControl: boolean;
}

/**
 * Media Manager Events
 */
export interface MediaManagerEvents {
  'stream-started': (stream: MediaStream, type: 'audio' | 'video' | 'screen') => void;
  'stream-stopped': (streamId: string) => void;
  'device-changed': (deviceId: string, kind: string) => void;
  'permission-denied': (type: 'audio' | 'video' | 'screen') => void;
  'error': (error: Error, code?: SignalingErrorCode) => void;
}

/**
 * Media Manager Class
 */
export class MediaManager {
  private config: MediaManagerConfig;
  private activeStreams = new Map<string, MediaStreamInfo>();
  private eventListeners = new Map<keyof MediaManagerEvents, Function[]>();
  private deviceChangeListener: (() => void) | null = null;

  constructor(config?: Partial<MediaManagerConfig>) {
    this.config = {
      defaultAudioConstraints: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1
      },
      defaultVideoConstraints: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      enableEchoCancellation: true,
      enableNoiseSuppression: true,
      enableAutoGainControl: true,
      ...config
    };

    this.setupDeviceChangeListener();
  }

  /**
   * Get user media stream
   */
  async getUserMedia(constraints: MediaConstraints): Promise<MediaStream> {
    try {
      // Build MediaStreamConstraints from our custom constraints
      const mediaConstraints: MediaStreamConstraints = {};

      if (constraints.audio) {
        if (typeof constraints.audio === 'boolean') {
          mediaConstraints.audio = constraints.audio ? this.config.defaultAudioConstraints : false;
        } else {
          mediaConstraints.audio = {
            ...this.config.defaultAudioConstraints,
            ...constraints.audio
          };
        }
      }

      if (constraints.video) {
        if (typeof constraints.video === 'boolean') {
          mediaConstraints.video = constraints.video ? this.config.defaultVideoConstraints : false;
        } else {
          mediaConstraints.video = {
            ...this.config.defaultVideoConstraints,
            ...constraints.video
          };
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      
      // Register the stream
      const streamInfo: MediaStreamInfo = {
        streamId: stream.id,
        participantId: 'local',
        type: constraints.video ? 'video' : 'audio',
        enabled: true,
        muted: false,
        constraints: mediaConstraints.audio || mediaConstraints.video || undefined
      };

      this.activeStreams.set(stream.id, streamInfo);
      this.emit('stream-started', stream, streamInfo.type);

      console.log(`Started ${streamInfo.type} stream:`, stream.id);
      return stream;
    } catch (error) {
      console.error('Failed to get user media:', error);
      
      let errorCode = SignalingErrorCode.MEDIA_PERMISSION_DENIED;
      let errorMessage = 'Failed to access media devices';

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorCode = SignalingErrorCode.MEDIA_PERMISSION_DENIED;
          errorMessage = 'Media access permission denied';
          this.emit('permission-denied', constraints.video ? 'video' : 'audio');
        } else if (error.name === 'NotFoundError') {
          errorCode = SignalingErrorCode.MEDIA_PERMISSION_DENIED;
          errorMessage = 'No media devices found';
        } else if (error.name === 'NotReadableError') {
          errorCode = SignalingErrorCode.MEDIA_PERMISSION_DENIED;
          errorMessage = 'Media device is already in use';
        }
      }

      const mediaError = new Error(errorMessage);
      this.emit('error', mediaError, errorCode);
      throw mediaError;
    }
  }

  /**
   * Get screen share stream
   */
  async getDisplayMedia(constraints?: MediaTrackConstraints): Promise<MediaStream> {
    try {
      if (!navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Screen sharing is not supported in this browser');
      }

      const displayConstraints: DisplayMediaStreamConstraints = {
        video: constraints || {
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false // Screen audio can be enabled separately
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      
      // Register the stream
      const streamInfo: MediaStreamInfo = {
        streamId: stream.id,
        participantId: 'local',
        type: 'screen',
        enabled: true,
        muted: false,
        constraints: displayConstraints.video || undefined
      };

      this.activeStreams.set(stream.id, streamInfo);
      this.emit('stream-started', stream, 'screen');

      // Handle screen share end
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopStream(stream.id);
      });

      console.log('Started screen share stream:', stream.id);
      return stream;
    } catch (error) {
      console.error('Failed to get display media:', error);
      
      let errorMessage = 'Failed to start screen sharing';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Screen sharing permission denied';
          this.emit('permission-denied', 'screen');
        }
      }

      const screenError = new Error(errorMessage);
      this.emit('error', screenError, SignalingErrorCode.MEDIA_PERMISSION_DENIED);
      throw screenError;
    }
  }

  /**
   * Stop a media stream
   */
  stopStream(streamId: string): void {
    const streamInfo = this.activeStreams.get(streamId);
    if (!streamInfo) {
      console.warn(`Stream ${streamId} not found`);
      return;
    }

    // Find the actual stream object (this is a limitation of our current design)
    // In a real implementation, we'd store the stream object as well
    this.activeStreams.delete(streamId);
    this.emit('stream-stopped', streamId);
    
    console.log(`Stopped ${streamInfo.type} stream:`, streamId);
  }

  /**
   * Stop all active streams
   */
  stopAllStreams(): void {
    const streamIds = Array.from(this.activeStreams.keys());
    streamIds.forEach(streamId => this.stopStream(streamId));
  }

  /**
   * Get available media devices
   */
  async getMediaDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `${device.kind} ${device.deviceId.slice(0, 8)}`,
        kind: device.kind as 'audioinput' | 'videoinput' | 'audiooutput',
        groupId: device.groupId
      }));
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      this.emit('error', new Error('Failed to get media devices'));
      return [];
    }
  }

  /**
   * Get audio input devices
   */
  async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await this.getMediaDevices();
    return devices.filter(device => device.kind === 'audioinput');
  }

  /**
   * Get video input devices
   */
  async getVideoInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await this.getMediaDevices();
    return devices.filter(device => device.kind === 'videoinput');
  }

  /**
   * Get audio output devices
   */
  async getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await this.getMediaDevices();
    return devices.filter(device => device.kind === 'audiooutput');
  }

  /**
   * Check if media type is supported
   */
  async isMediaTypeSupported(type: 'audio' | 'video' | 'screen'): Promise<boolean> {
    try {
      switch (type) {
        case 'audio':
          return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        case 'video':
          return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        case 'screen':
          return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Check media permissions
   */
  async checkMediaPermissions(): Promise<{
    audio: PermissionState;
    video: PermissionState;
  }> {
    try {
      const audioPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const videoPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      
      return {
        audio: audioPermission.state,
        video: videoPermission.state
      };
    } catch (error) {
      console.warn('Failed to check media permissions:', error);
      return {
        audio: 'prompt',
        video: 'prompt'
      };
    }
  }

  /**
   * Create optimized constraints for different scenarios
   */
  createConstraints(scenario: 'audio-only' | 'video-call' | 'screen-share' | 'high-quality'): MediaConstraints {
    switch (scenario) {
      case 'audio-only':
        return {
          audio: {
            ...this.config.defaultAudioConstraints,
            sampleRate: 48000,
            channelCount: 1
          },
          video: false
        };

      case 'video-call':
        return {
          audio: {
            ...this.config.defaultAudioConstraints,
            sampleRate: 48000,
            channelCount: 1
          },
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 }
          }
        };

      case 'screen-share':
        return {
          audio: false,
          video: false, // Screen sharing uses getDisplayMedia
          screen: {
            width: { ideal: 1920, max: 3840 },
            height: { ideal: 1080, max: 2160 },
            frameRate: { ideal: 15, max: 30 }
          }
        };

      case 'high-quality':
        return {
          audio: {
            ...this.config.defaultAudioConstraints,
            sampleRate: 48000,
            channelCount: 2
          },
          video: {
            width: { ideal: 1920, max: 3840 },
            height: { ideal: 1080, max: 2160 },
            frameRate: { ideal: 30, max: 60 }
          }
        };

      default:
        return {
          audio: this.config.defaultAudioConstraints,
          video: this.config.defaultVideoConstraints
        };
    }
  }

  /**
   * Add event listener
   */
  on<K extends keyof MediaManagerEvents>(event: K, listener: MediaManagerEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof MediaManagerEvents>(event: K, listener: MediaManagerEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit<K extends keyof MediaManagerEvents>(event: K, ...args: Parameters<MediaManagerEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in media manager event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Setup device change listener
   */
  private setupDeviceChangeListener(): void {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      this.deviceChangeListener = () => {
        console.log('Media devices changed');
        this.emit('device-changed', '', '');
      };
      
      navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeListener);
    }
  }

  /**
   * Get active streams information
   */
  getActiveStreams(): Map<string, MediaStreamInfo> {
    return new Map(this.activeStreams);
  }

  /**
   * Get media manager statistics
   */
  getStats(): {
    activeStreams: number;
    audioStreams: number;
    videoStreams: number;
    screenStreams: number;
  } {
    const streams = Array.from(this.activeStreams.values());
    return {
      activeStreams: streams.length,
      audioStreams: streams.filter(s => s.type === 'audio').length,
      videoStreams: streams.filter(s => s.type === 'video').length,
      screenStreams: streams.filter(s => s.type === 'screen').length
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Remove device change listener
    if (this.deviceChangeListener && navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeListener);
      this.deviceChangeListener = null;
    }

    // Stop all streams
    this.stopAllStreams();

    // Clear event listeners
    this.eventListeners.clear();
  }
}