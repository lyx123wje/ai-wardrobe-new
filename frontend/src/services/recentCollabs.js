import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ai_wardrobe_recent_collabs';
const MAX_RECORDS = 10;

export async function getRecentCollabs() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

export async function addRecentCollab({ roomCode, partnerNickname, partnerUserId }) {
  try {
    const records = await getRecentCollabs();
    const existingIndex = records.findIndex((r) => r.roomCode === roomCode);
    const entry = {
      roomCode,
      partnerNickname,
      partnerUserId,
      lastConnectedAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      records.splice(existingIndex, 1);
    }
    records.unshift(entry);
    const trimmed = records.slice(0, MAX_RECORDS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save recent collab:', e);
  }
}

export async function removeRecentCollab(roomCode) {
  try {
    const records = await getRecentCollabs();
    const filtered = records.filter((r) => r.roomCode !== roomCode);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to remove recent collab:', e);
  }
}

export async function clearRecentCollabs() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear recent collabs:', e);
  }
}
