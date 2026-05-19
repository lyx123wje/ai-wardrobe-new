import api from './client';

export function fetchDiary(params = {}) {
  return api.get('/diary', { params });
}

export function createDiaryEntry(data) {
  return api.post('/diary', data);
}

export function updateDiaryEntry(id, content) {
  return api.put(`/diary/${id}`, { content });
}

export function deleteDiaryEntry(id) {
  return api.delete(`/diary/${id}`);
}
