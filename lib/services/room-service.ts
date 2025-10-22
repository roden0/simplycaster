/**
 * Room Service
 * 
 * Client-side service for room-related API operations
 */

import { api, type ApiResponse } from '../utils/api-client.ts';

export interface Room {
  id: string;
  name?: string;
  slug?: string;
  status: string;
  hostId: string;
  maxParticipants: number;
  allowVideo: boolean;
  recordingStartedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomData {
  name?: string;
  slug?: string;
  maxParticipants?: number;
  allowVideo?: boolean;
}

export interface StartRecordingData {
  participantCount?: number;
}

export interface InviteGuestData {
  displayName: string;
  email?: string;
  tokenExpirationHours?: number;
}

export interface Guest {
  id: string;
  roomId: string;
  displayName: string;
  email?: string;
  tokenExpiresAt: string;
  joinedAt: string;
  invitedBy: string;
}

export interface Invitation {
  token: string;
  url: string;
  expiresAt: string;
}

export class RoomService {
  /**
   * Create a new room
   */
  static async createRoom(data: CreateRoomData): Promise<ApiResponse<{ room: Room; message: string }>> {
    return api.post('/api/rooms/create', data);
  }

  /**
   * List rooms for the current user
   */
  static async listRooms(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<ApiResponse<{ rooms: Room[]; pagination: any }>> {
    const searchParams = new URLSearchParams();
    
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.status) searchParams.set('status', params.status);
    
    const query = searchParams.toString();
    const endpoint = query ? `/api/rooms/list?${query}` : '/api/rooms/list';
    
    return api.get(endpoint);
  }

  /**
   * Start recording in a room
   */
  static async startRecording(roomId: string, data: StartRecordingData): Promise<ApiResponse<any>> {
    return api.post(`/api/rooms/${roomId}/start-recording`, data);
  }

  /**
   * Invite a guest to a room
   */
  static async inviteGuest(roomId: string, data: InviteGuestData): Promise<ApiResponse<{
    guest: Guest;
    room: Room;
    invitation: Invitation;
    message: string;
  }>> {
    return api.post(`/api/rooms/${roomId}/invite-guest`, data);
  }
}

export default RoomService;