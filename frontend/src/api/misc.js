import api from './client';

export function fetchMiscItems(params = {}) {
  return api.get('/misc', { params });
}

export function createMiscItem(data) {
  return api.post('/misc', data);
}

export function updateMiscItem(id, data) {
  return api.put(`/misc/${id}`, data);
}

export function deleteMiscItem(id) {
  return api.delete(`/misc/${id}`);
}
