import api from './client';
import { getAuthHeaders } from '../services/auth';

export async function createRoom(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await api.post('/collab/rooms', {}, { headers });
  return res.data;
}

export async function joinRoom(roomCode, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await api.post(`/collab/rooms/${roomCode}/join`, {}, { headers });
  return res.data;
}

export async function getRoom(roomCode, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await api.get(`/collab/rooms/${roomCode}`, { headers });
  return res.data;
}

export async function shareWardrobe(userId, itemIds, token, roomCode) {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await api.post('/collab/share-wardrobe', { user_id: userId, item_ids: itemIds, room_code: roomCode }, { headers });
  return res.data;
}
