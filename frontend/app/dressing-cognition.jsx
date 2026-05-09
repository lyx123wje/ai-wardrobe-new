import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fetchPersonas, personaRoomThink } from '../src/api/personas';
import { broadcastThink, debateSend } from '../src/api/room';
import PersonaGrid from '../src/components/PersonaGrid';
import ChatBubble from '../src/components/ChatBubble';

const MAX_SELECT = 5;
const TYPING_SPEED = 25;

export default function DressingCognitionScreen() {
  const router = useRouter();
  const scrollRef = useRef(null);
  const [personas, setPersonas] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [mode, setMode] = useState('lobby'); // lobby | chat | broadcast | debate
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [typingMsgId, setTypingMsgId] = useState(null);
  const debateTurnRef = useRef(0);
  const maxRoundsRef = useRef(2);

  // 加载高人列表
  useEffect(() => {
    fetchPersonas()
      .then(res => {
        if (res.data && res.data.personas) {
          setPersonas(res.data.personas);
        }
      })
      .catch(err => console.warn('加载高人列表失败:', err));
  }, []);

  // 选择/取消选择高人
  const handleToggle = useCallback((id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(p => p !== id);
      }
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, id];
    });
    // 选择人后重置状态
    setMessages([]);
    setMode('lobby');
    setRoomId(null);
  }, []);

  // 移除已选高人
  const handleRemove = useCallback((id) => {
    setSelectedIds(prev => prev.filter(p => p !== id));
    setMessages([]);
    setMode('lobby');
  }, []);

  // 获取 persona 信息
  const getPersona = (id) => personas.find(p => p.id === id);

  // 构建消息历史（供辩论用）
  const buildHistory = useCallback(() => {
    return messages
      .filter(m => m.content && !m.isTyping)
      .map(m => ({
        speaker: m.speaker,
        speakerName: m.speakerName,
        content: m.content,
      }));
  }, [messages]);

  // 添加消息
  const addMessage = useCallback((speaker, speakerName, content, isTyping = false) => {
    const msg = {
      id: Date.now() + Math.random(),
      speaker,
      speakerName,
      content,
      timestamp: Date.now(),
      isTyping,
    };
    setMessages(prev => [...prev, msg]);
    return msg.id;
  }, []);

  // 轮询辩论发言
  const debateRound = useCallback(async (personaIds, topic, history, turn, maxTurns) => {
    if (turn >= maxTurns * personaIds.length) return;

    try {
      const res = await debateSend({
        roomId,
        personaIds,
        currentSpeakerId: '',
        userMessage: '',
        history,
        topic,
      });

      if (res.data && res.data.speaker_id) {
        const msgId = addMessage(res.data.speaker_id, res.data.speaker_name, res.data.response_text, true);
        setTypingMsgId(msgId);

        // 等待打字完成后继续下一轮
        setTimeout(() => {
          setMessages(prev =>
            prev.map(m => (m.id === msgId ? { ...m, isTyping: false } : m))
          );
          setTypingMsgId(null);

          // 下一轮
          const updatedHistory = [
            ...history,
            { speaker: res.data.speaker_id, speakerName: res.data.speaker_name, content: res.data.response_text },
          ];
          debateRound(personaIds, topic, updatedHistory, turn + 1, maxTurns);
        }, 8000); // 预留打字时间
      }
    } catch (e) {
      console.warn('辩论发言失败:', e);
    }
  }, [roomId, addMessage]);

  // ===== 倾诉模式: 1v1 对话 =====
  const handleSoloAsk = useCallback(async () => {
    if (!question.trim() || selectedIds.length !== 1) return;
    const pid = selectedIds[0];
    const persona = getPersona(pid);
    if (!persona) return;

    const userMsgId = addMessage('user', '我', question.trim());
    setMode('chat');
    setLoading(true);

    try {
      const res = await personaRoomThink(pid, question.trim());
      if (res.data) {
        const msgId = addMessage(pid, res.data.persona_name || persona.name, res.data.response_text, true);
        setTypingMsgId(msgId);
      }
    } catch (e) {
      addMessage('system', '系统', '回复失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [question, selectedIds, personas, addMessage]);

  // ===== 广播模式: 一发多回 =====
  const handleBroadcast = useCallback(async () => {
    if (!question.trim() || selectedIds.length < 2) return;

    setMode('broadcast');
    const userMsgId = addMessage('user', '我', `[广播] ${question.trim()}`);
    setLoading(true);

    try {
      const res = await broadcastThink(selectedIds, question.trim());
      if (res.data && res.data.responses) {
        // 逐个展示，每个之间有短暂延迟
        for (let i = 0; i < res.data.responses.length; i++) {
          const r = res.data.responses[i];
          await new Promise(resolve => setTimeout(resolve, 500));
          const msgId = addMessage(r.persona_id, r.persona_name, r.response_text, true);
          setTypingMsgId(msgId);
          // 等待打字完成
          await new Promise(resolve => setTimeout(resolve, 6000));
          setTypingMsgId(null);
          setMessages(prev =>
            prev.map(m => (m.id === msgId ? { ...m, isTyping: false } : m))
          );
        }
      }
    } catch (e) {
      addMessage('system', '系统', '广播提问失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [question, selectedIds, addMessage]);

  // ===== 辩论模式: 多人轮询 =====
  const handleStartDebate = useCallback(async () => {
    if (!question.trim() || selectedIds.length < 2) return;

    setMode('debate');
    const newRoomId = `room_${Date.now()}`;
    setRoomId(newRoomId);
    debateTurnRef.current = 0;

    const topic = question.trim();
    const userMsgId = addMessage('user', '我', `[辩论议题] ${topic}`);
    setLoading(true);

    try {
      // 第一轮发言
      const res = await debateSend({
        roomId: newRoomId,
        personaIds: selectedIds,
        currentSpeakerId: '',
        userMessage: '',
        history: [],
        topic,
      });

      if (res.data && res.data.speaker_id) {
        const msgId = addMessage(res.data.speaker_id, res.data.speaker_name, res.data.response_text, true);
        setTypingMsgId(msgId);

        // 启动辩论轮询
        const initialHistory = [
          { speaker: 'user', speakerName: '我', content: `辩论议题: ${topic}` },
          { speaker: res.data.speaker_id, speakerName: res.data.speaker_name, content: res.data.response_text },
        ];

        setTimeout(() => {
          setMessages(prev =>
            prev.map(m => (m.id === msgId ? { ...m, isTyping: false } : m))
          );
          setTypingMsgId(null);
          debateRound(selectedIds, topic, initialHistory, 1, maxRoundsRef.current);
        }, 8000);
      }
    } catch (e) {
      addMessage('system', '系统', '发起辩论失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [question, selectedIds, addMessage, debateRound]);

  // ===== 辩论中追加发言 =====
  const [debateInput, setDebateInput] = useState('');
  const handleDebateInput = useCallback(async () => {
    if (!debateInput.trim() || !roomId) return;

    const userMsgId = addMessage('user', '我', debateInput.trim());
    setDebateInput('');
    setLoading(true);

    try {
      const res = await debateSend({
        roomId,
        personaIds: selectedIds,
        currentSpeakerId: '',
        userMessage: debateInput.trim(),
        history: buildHistory(),
        topic: question.trim(),
      });

      if (res.data && res.data.speaker_id) {
        const msgId = addMessage(res.data.speaker_id, res.data.speaker_name, res.data.response_text, true);
        setTypingMsgId(msgId);

        setTimeout(() => {
          setMessages(prev =>
            prev.map(m => (m.id === msgId ? { ...m, isTyping: false } : m))
          );
          setTypingMsgId(null);

          // 继续辩论
          const updatedHistory = [
            ...buildHistory(),
            { speaker: res.data.speaker_id, speakerName: res.data.speaker_name, content: res.data.response_text },
          ];
          debateRound(selectedIds, question.trim(), updatedHistory, debateTurnRef.current, maxRoundsRef.current);
        }, 8000);
      }
    } catch (e) {
      addMessage('system', '系统', '发言失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [debateInput, roomId, selectedIds, question, addMessage, buildHistory, debateRound]);

  // ===== 重置到大堂 =====
  const handleReset = useCallback(() => {
    setSelectedIds([]);
    setMode('lobby');
    setQuestion('');
    setMessages([]);
    setRoomId(null);
    setLoading(false);
    setTypingMsgId(null);
    debateTurnRef.current = 0;
  }, []);

  // 当打字完成回调
  const handleTypingComplete = useCallback((msgId) => {
    setMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, isTyping: false } : m))
    );
    setTypingMsgId(null);
  }, []);

  // 是否正在打字（有消息的 isTyping 为 true）
  const someoneTyping = typingMsgId !== null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>思维训练室</Text>
        <Pressable onPress={handleReset} style={styles.resetBtn}>
          <Text style={styles.resetText}>重选</Text>
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {/* 大堂：高人网格 */}
        {mode === 'lobby' && (
          <PersonaGrid
            personas={personas}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            maxSelect={MAX_SELECT}
          />
        )}

        {/* 大堂中的已选气泡 */}
        {mode === 'lobby' && selectedIds.length > 0 && (
          <View style={styles.selectedBar}>
            <Text style={styles.selectedLabel}>已选:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedScroll}>
              {selectedIds.map(id => {
                const p = getPersona(id);
                return (
                  <View key={id} style={styles.selectedChip}>
                    <Text style={styles.selectedChipText}>{p?.name || id}</Text>
                    <Pressable onPress={() => handleRemove(id)}>
                      <Text style={styles.selectedChipX}> ×</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 对话/广播/辩论中显示选中的人 */}
        {(mode === 'chat' || mode === 'broadcast' || mode === 'debate') && (
          <View style={styles.roomInfo}>
            <Text style={styles.roomLabel}>
              {mode === 'chat' ? '1v1 倾诉' : mode === 'broadcast' ? '广播提问' : '群聊辩论'}
            </Text>
            <Text style={styles.roomMembers}>
              {selectedIds.map(id => getPersona(id)?.name).join(' · ')}
            </Text>
          </View>
        )}

        {/* 对话区域 */}
        {messages.length > 0 && (
          <View style={styles.chatArea}>
            {messages.map(msg => (
              <ChatBubble
                key={msg.id}
                message={msg}
                typingSpeed={TYPING_SPEED}
                onTypingComplete={() => msg.isTyping && handleTypingComplete(msg.id)}
              />
            ))}
          </View>
        )}

        {/* 加载中 */}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.loadingText}>
              {mode === 'broadcast' ? '各位高人正在思考中...' : '正在思考...'}
            </Text>
          </View>
        )}

        {/* 辩论中的追加输入 */}
        {mode === 'debate' && !loading && !someoneTyping && (
          <View style={styles.debateInterject}>
            <TextInput
              style={styles.debateInputField}
              value={debateInput}
              onChangeText={setDebateInput}
              placeholder="插入你的观点..."
              placeholderTextColor="#94a3b8"
              multiline
            />
            <Pressable
              style={[styles.debateSendBtn, !debateInput.trim() && styles.btnDisabled]}
              onPress={handleDebateInput}
              disabled={!debateInput.trim()}
            >
              <Text style={styles.debateSendText}>插话</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* 底部输入区（大堂/聊天/广播模式） */}
      {(mode === 'lobby' || mode === 'chat' || mode === 'broadcast') && (
        <View style={styles.inputArea}>
          <TextInput
            style={styles.textInput}
            value={question}
            onChangeText={setQuestion}
            placeholder="输入你想探讨的问题..."
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={200}
          />
          <View style={styles.actionRow}>
            {selectedIds.length === 1 && (
              <Pressable
                style={[styles.actionBtn, styles.actionBtnPrimary, (!question.trim() || loading) && styles.btnDisabled]}
                onPress={handleSoloAsk}
                disabled={!question.trim() || loading}
              >
                <Text style={styles.actionBtnText}>单独请教</Text>
              </Pressable>
            )}
            {selectedIds.length >= 2 && (
              <>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnPrimary, (!question.trim() || loading) && styles.btnDisabled]}
                  onPress={handleBroadcast}
                  disabled={!question.trim() || loading}
                >
                  <Text style={styles.actionBtnText}>广播提问</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnDebate, (!question.trim() || loading) && styles.btnDisabled]}
                  onPress={handleStartDebate}
                  disabled={!question.trim() || loading}
                >
                  <Text style={styles.actionBtnText}>发起辩论</Text>
                </Pressable>
              </>
            )}
            {selectedIds.length === 0 && (
              <Text style={styles.hintText}>请选择至少一位高人开始对话</Text>
            )}
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backText: { fontSize: 22, color: '#6366f1', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  resetBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  resetText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  // 已选栏
  selectedBar: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
  },
  selectedLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', marginRight: 8 },
  selectedScroll: { flex: 1 },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#eef2ff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
    marginRight: 8,
  },
  selectedChipText: { fontSize: 13, fontWeight: '600', color: '#6366f1' },
  selectedChipX: { fontSize: 16, color: '#94a3b8', fontWeight: '700' },
  // 房间信息
  roomInfo: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16,
    borderLeftWidth: 4, borderLeftColor: '#6366f1',
  },
  roomLabel: { fontSize: 13, fontWeight: '700', color: '#6366f1', marginBottom: 4 },
  roomMembers: { fontSize: 14, color: '#334155' },
  // 对话区
  chatArea: { marginTop: 8, marginBottom: 8 },
  // 加载
  loadingBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 10,
  },
  loadingText: { fontSize: 13, color: '#94a3b8' },
  // 辩论插话区
  debateInterject: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 8, paddingVertical: 12,
    backgroundColor: '#f8f9fc',
  },
  debateInputField: {
    flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, backgroundColor: '#fff',
    color: '#1e293b',
  },
  debateSendBtn: {
    backgroundColor: '#ef4444', borderRadius: 12,
    paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
  },
  debateSendText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  // 底部输入区
  inputArea: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9',
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 30,
  },
  textInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, backgroundColor: '#f8fafc', minHeight: 48, maxHeight: 80,
    color: '#1e293b',
  },
  actionRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 10 },
  actionBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  actionBtnPrimary: { backgroundColor: '#6366f1' },
  actionBtnDebate: { backgroundColor: '#ef4444' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  hintText: { fontSize: 13, color: '#94a3b8', paddingVertical: 10 },
});
