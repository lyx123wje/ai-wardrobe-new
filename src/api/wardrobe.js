import api from './client';

export function fetchWardrobe(params = {}) {
  return api.get('/wardrobe', { params });
}

export function fetchWardrobeItem(id) {
  return api.get(`/wardrobe/${id}`);
}

export function createWardrobeItem(data) {
  return api.post('/wardrobe', data);
}

export function updateWardrobeItem(id, data) {
  return api.put(`/wardrobe/${id}`, data);
}

export function deleteWardrobeItem(id) {
  return api.delete(`/wardrobe/${id}`);
}

export function batchCreateItems(items) {
  return api.post('/wardrobe/batch', { items });
}

export function fetchStats() {
  return api.get('/wardrobe/stats');
}

export function markAllClean() {
  return api.post('/wardrobe/mark_all_clean');
}
