import api from './client';

export async function register(nickname, password) {
  const res = await api.post('/auth/register', { nickname, password });
  return res.data;
}

export async function login(userId, password) {
  const res = await api.post('/auth/login', { user_id: userId, password });
  return res.data;
}

export async function verify(token) {
  const res = await api.get('/auth/verify', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
