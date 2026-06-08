import { io } from 'socket.io-client';
import Constants from 'expo-constants';
import { getToken } from './auth';

const API_BASE = Constants.expoConfig?.extra?.apiBaseUrl || 'http://10.29.137.80:5000';

let socket = null;
let listeners = [];

export function getSocket() {
  return socket;
}

export async function connect(roomCode) {
  if (socket?.connected) {
    socket.disconnect();
  }

  const token = await getToken();

  socket = io(API_BASE, {
    query: { token, room_code: roomCode },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  // Re-register pending listeners
  listeners.forEach(([event, handler]) => {
    socket.on(event, handler);
  });

  return new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log('[CollabSocket] Connected:', socket.id);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      console.error('[CollabSocket] Connection error:', err.message);
      reject(err);
    });
    socket.on('disconnect', (reason) => {
      console.log('[CollabSocket] Disconnected:', reason);
    });
  });
}

export function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function emit(event, data = {}) {
  if (socket?.connected) {
    socket.emit(event, data);
  }
}

export function on(event, handler) {
  listeners.push([event, handler]);
  if (socket) {
    socket.on(event, handler);
  }
}

export function off(event, handler) {
  listeners = listeners.filter(([e, h]) => !(e === event && h === handler));
  if (socket) {
    socket.off(event, handler);
  }
}

export function removeAllListeners() {
  listeners.forEach(([event, handler]) => {
    if (socket) socket.off(event, handler);
  });
  listeners = [];
}
