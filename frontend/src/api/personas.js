import api from './client';

export function fetchPersonas() {
  return api.get('/personas/list');
}

export function matchPersonas(clothingTag, clothingCategory) {
  return api.post('/personas/match', {
    clothing_tag: clothingTag,
    clothing_category: clothingCategory,
  });
}

export function personaThink(personaId, userProblem, clothingTag = '') {
  return api.post('/persona_think', {
    persona_id: personaId,
    user_problem: userProblem,
    clothing_tag: clothingTag,
  });
}

// 思维训练室用 — 1v1 倾诉（不带穿搭标签）
export function personaRoomThink(personaId, userProblem) {
  return api.post('/persona_think', {
    persona_id: personaId,
    user_problem: userProblem,
    clothing_tag: '',
  });
}
