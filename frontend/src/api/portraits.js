import api from './client';

export function processPortraitBase64(imageBase64) {
  return api.post('/process_portrait', { image_base64: imageBase64 });
}

export function processClothingBase64(imageBase64) {
  return api.post('/process', { image_base64: imageBase64 });
}

export function fetchHairstyles() {
  return api.get('/hairstyles/list');
}
