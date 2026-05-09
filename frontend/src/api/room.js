import api from './client';

export function broadcastThink(personaIds, question) {
  return api.post('/room/broadcast', {
    persona_ids: personaIds,
    question,
  });
}

export function debateSend({ roomId, personaIds, currentSpeakerId, userMessage, history, topic }) {
  return api.post('/room/debate/send', {
    room_id: roomId || '',
    persona_ids: personaIds,
    current_speaker_id: currentSpeakerId || '',
    user_message: userMessage || '',
    history: history || [],
    topic,
  });
}
