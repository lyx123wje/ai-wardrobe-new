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

// 思维训练室用 — 1v1 倾诉（不带穿搭标签，支持对话历史）
export function personaRoomThink(personaId, userProblem, history = []) {
  return api.post('/persona_think', {
    persona_id: personaId,
    user_problem: userProblem,
    clothing_tag: '',
    history,
  });
}

// 天才视角周报 — 话题匹配角色 + 生成点评
export function geniusLens(topics) {
  return api.post('/genius_lens', {
    topics,
  });
}

// 每日金句 — 随机获取1位高人的金句
export function fetchDailyQuote() {
  return api.get('/quotes/daily');
}

// 获取指定高人的金句
export function fetchPersonaQuotes(personaId) {
  return api.get(`/quotes/${personaId}`);
}

// 跨人物对比 — 解析多位高人的心智模型 + 决策启发式
export function compareMethodology(personaIds, question) {
  return api.post('/methodology/compare', {
    persona_ids: personaIds,
    question,
  });
}

// 获取微博热搜
export function fetchTrendingTopics() {
  return api.get('/trending');
}
