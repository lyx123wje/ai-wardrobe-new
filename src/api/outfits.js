import api from './client';

export function createOutfit(data) {
  return api.post('/outfits', data);
}

export function fetchOutfits(params = {}) {
  return api.get('/outfits', { params });
}

export function fetchOutfitByDate(date) {
  return api.get(`/outfits/date/${date}`);
}

export function deleteOutfit(id) {
  return api.delete(`/outfits/${id}`);
}
