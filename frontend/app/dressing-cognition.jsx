import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fetchPersonas, personaRoomThink, fetchDailyQuote, fetchPersonaQuotes, compareMethodology, fetchTrendingTopics, geniusLens } from '../src/api/personas';
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

  // 每日金句
  const [dailyQuote, setDailyQuote] = useState(null);  // {persona_id, persona_name, persona_style, quotes: [...]}

  // 天才视角周报
  const [trendingTopics, setTrendingTopics] = useState([]);
  const [selectedTopicIdx, setSelectedTopicIdx] = useState(new Set());
  const [customTopicTitle, setCustomTopicTitle] = useState('');
  const [customTopicSummary, setCustomTopicSummary] = useState('');
  const [lensResults, setLensResults] = useState(null);
  const [lensLoading, setLensLoading] = useState(false);

  // 跨人物对比
  const [compareResults, setCompareResults] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

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

  // 加载每日金句
  useEffect(() => {
    if (mode === 'lobby' && !dailyQuote) {
      fetchDailyQuote()
        .then(res => {
          if (res.data) setDailyQuote(res.data);
        })
        .catch(() => {});
    }
  }, [mode, dailyQuote]);

  // ===== 每日金句：切换下一位高人 =====
  const handleQuoteRefresh = useCallback(async () => {
    try {
      const res = await fetchDailyQuote();
      if (res.data) setDailyQuote(res.data);
    } catch (e) {
      console.warn('获取金句失败:', e);
    }
  }, []);

  // ===== 每日金句：发送给当前高人 → 跳到 chat =====
  const handleQuoteToChat = useCallback((personaId) => {
    setSelectedIds([personaId]);
    setMode('chat');
    setQuestion('');
    setMessages([]);
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

  // ===== 倾诉模式: 1v1 对话（带记忆） =====
  const handleSoloAsk = useCallback(async () => {
    if (!question.trim() || selectedIds.length !== 1) return;
    const pid = selectedIds[0];
    const persona = getPersona(pid);
    if (!persona) return;

    const userMsgId = addMessage('user', '我', question.trim());
    setMode('chat');
    setLoading(true);

    // Build conversation history (last 10 messages)
    const history = messages
      .filter(m => m.content && !m.isTyping)
      .slice(-11, -1)  // exclude the just-added user message
      .map(m => ({
        speaker: m.speaker === 'user' ? 'user' : m.speakerName,
        content: m.content,
      }));

    try {
      const res = await personaRoomThink(pid, question.trim(), history);
      if (res.data) {
        const msgId = addMessage(pid, res.data.persona_name || persona.name, res.data.response_text, true);
        setTypingMsgId(msgId);
      }
    } catch (e) {
      addMessage('system', '系统', '回复失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [question, selectedIds, personas, addMessage, messages]);

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

  // ===== 天才视角周报：获取热搜 =====
  const handleFetchTrending = useCallback(async () => {
    try {
      const res = await fetchTrendingTopics();
      if (res.data && res.data.topics && res.data.topics.length > 0) {
        setTrendingTopics(res.data.topics);
      } else {
        setTrendingTopics([{ title: '（无法获取热搜，请手动输入话题）', rank: 0, hot: '' }]);
      }
    } catch (e) {
      console.warn('获取热搜失败:', e);
      setTrendingTopics([{ title: '（网络连接失败，请手动输入话题）', rank: 0, hot: '' }]);
    }
  }, []);

  // ===== 天才视角周报：切换选中话题 =====
  const handleToggleTopic = useCallback((idx) => {
    // skip placeholder entries
    const topic = trendingTopics[idx];
    if (topic && topic.title.startsWith('（')) return;

    setSelectedTopicIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        if (next.size >= 3) return prev;
        next.add(idx);
      }
      return next;
    });
  }, [trendingTopics]);

  // ===== 天才视角周报：提交点评 =====
  const handleGeniusLens = useCallback(async () => {
    const topics = [];
    selectedTopicIdx.forEach(idx => {
      if (trendingTopics[idx]) topics.push(trendingTopics[idx]);
    });
    // 添加自定义话题
    if (customTopicTitle.trim()) {
      topics.push({
        title: customTopicTitle.trim(),
        summary: customTopicSummary.trim(),
      });
    }
    if (topics.length === 0) return;

    setLensLoading(true);
    setLensResults(null);
    try {
      const payload = topics.slice(0, 3).map(t => ({
        title: t.title,
        summary: t.summary || t.hot || '',
        keywords: t.title.split(/[，,\s]+/).filter(Boolean),
      }));
      const res = await geniusLens(payload);
      if (res.data && res.data.lens) {
        setLensResults(res.data.lens);
      } else {
        Alert.alert('错误', res.data?.error || '周报生成失败');
      }
    } catch (e) {
      console.warn('天才周报请求失败:', e);
      Alert.alert('错误', '请求失败，请检查网络后重试。');
    } finally {
      setLensLoading(false);
    }
  }, [selectedTopicIdx, trendingTopics, customTopicTitle, customTopicSummary]);

  // ===== 天才视角周报：重置 =====
  const handleLensReset = useCallback(() => {
    setTrendingTopics([]);
    setSelectedTopicIdx(new Set());
    setCustomTopicTitle('');
    setCustomTopicSummary('');
    setLensResults(null);
  }, []);

  // ===== 跨人物对比 =====
  const handleCompare = useCallback(async () => {
    if (!question.trim() || selectedIds.length < 2) return;
    setCompareLoading(true);
    setCompareResults(null);
    try {
      const res = await compareMethodology(selectedIds, question.trim());
      if (res.data && res.data.comparisons) {
        setCompareResults(res.data.comparisons);
        setMode('compare');
      }
    } catch (e) {
      console.warn('对比请求失败:', e);
      Alert.alert('错误', '对比分析失败，请重试。');
    } finally {
      setCompareLoading(false);
    }
  }, [question, selectedIds]);

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
    setCompareResults(null);
    setLensResults(null);
    setTrendingTopics([]);
    setSelectedTopicIdx(new Set());
    setCustomTopicTitle('');
    setCustomTopicSummary('');
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
        <Pressable onPress={() => Platform.OS === 'web' ? router.replace('/') : router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{Platform.OS === 'web' ? '← 主页' : '<'}</Text>
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
        {/* 每日金句卡片（大堂顶部） */}
        {mode === 'lobby' && dailyQuote && (
          <View style={styles.quoteCard}>
            <View style={styles.quoteHeaderRow}>
              <Text style={styles.quoteIcon}>「</Text>
              <Text style={styles.quotePersona}>
                {dailyQuote.persona_name}
                {dailyQuote.persona_style ? ` · ${dailyQuote.persona_style}` : ''}
              </Text>
            </View>
            <View style={styles.quoteBody}>
              {dailyQuote.quotes.map((q, i) => (
                <Text key={i} style={styles.quoteText}>{q}</Text>
              ))}
            </View>
            <View style={styles.quoteActions}>
              <Pressable style={styles.quoteBtn} onPress={handleQuoteRefresh}>
                <Text style={styles.quoteBtnText}>换一句</Text>
              </Pressable>
              <Pressable
                style={styles.quoteBtnChat}
                onPress={() => handleQuoteToChat(dailyQuote.persona_id)}
              >
                <Text style={styles.quoteBtnChatText}>和他聊聊</Text>
              </Pressable>
            </View>
          </View>
        )}

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

        {/* 对话/广播/辩论/对比中显示选中的人 */}
        {(mode === 'chat' || mode === 'broadcast' || mode === 'debate' || mode === 'compare') && (
          <View style={styles.roomInfo}>
            <Text style={styles.roomLabel}>
              {mode === 'chat' ? '1v1 倾诉' : mode === 'broadcast' ? '广播提问' : mode === 'debate' ? '群聊辩论' : '跨人物对比'}
            </Text>
            <Text style={styles.roomMembers}>
              {selectedIds.map(id => getPersona(id)?.name).join(' · ')}
            </Text>
          </View>
        )}

        {/* 天才视角周报 Banner */}
        {mode === 'lens' && (
          <View style={styles.lensBanner}>
            <Text style={styles.lensBannerTitle}>天才视角周报</Text>
            <Text style={styles.lensBannerSub}>微博热搜 + 跨时空点评</Text>
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

        {/* ===== 天才视角周报：话题选择区 ===== */}
        {mode === 'lens' && !lensResults && (
          <View style={styles.lensSection}>
            {/* 热搜列表 */}
            {trendingTopics.length === 0 ? (
              <Pressable style={styles.lensFetchBtn} onPress={handleFetchTrending}>
                <Text style={styles.lensFetchText}>获取微博热搜</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.lensSectionLabel}>
                  热搜话题（最多选3条，当前已选 {selectedTopicIdx.size}/3）
                </Text>
                {trendingTopics.map((topic, i) => {
                  const isSelected = selectedTopicIdx.has(i);
                  const isPlaceholder = topic.title.startsWith('（');
                  return (
                    <Pressable
                      key={i}
                      style={[styles.topicItem, isSelected && styles.topicItemSelected]}
                      onPress={() => handleToggleTopic(i)}
                      disabled={isPlaceholder}
                    >
                      <Text style={styles.topicRank}>{topic.rank || i + 1}</Text>
                      <Text style={styles.topicTitle} numberOfLines={1}>{topic.title}</Text>
                      {topic.hot ? <Text style={styles.topicHot}>{typeof topic.hot === 'number' ? `${topic.hot}` : topic.hot}</Text> : null}
                      {isSelected && <Text style={styles.topicCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
                <Pressable style={styles.lensRefreshBtn} onPress={handleFetchTrending}>
                  <Text style={styles.lensRefreshText}>刷新热搜</Text>
                </Pressable>

                {/* 自定义话题 */}
                <Text style={styles.lensSectionLabel}>+ 自定义话题</Text>
                <TextInput
                  style={styles.topicCustomInput}
                  value={customTopicTitle}
                  onChangeText={setCustomTopicTitle}
                  placeholder="输入自定义话题标题..."
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  style={styles.topicCustomSummary}
                  value={customTopicSummary}
                  onChangeText={setCustomTopicSummary}
                  placeholder="简短描述（可选）"
                  placeholderTextColor="#94a3b8"
                  multiline
                />

                <Pressable
                  style={[
                    styles.lensSubmitBtn,
                    (selectedTopicIdx.size === 0 && !customTopicTitle.trim()) && styles.btnDisabled,
                  ]}
                  onPress={handleGeniusLens}
                  disabled={selectedTopicIdx.size === 0 && !customTopicTitle.trim()}
                >
                  <Text style={styles.lensSubmitText}>让天才们来点评</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* ===== 天才视角周报：Loading ===== */}
        {lensLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#10b981" />
            <Text style={styles.loadingText}>天才们正在思考中...</Text>
          </View>
        )}

        {/* ===== 天才视角周报：结果 ===== */}
        {mode === 'lens' && lensResults && (
          <View style={styles.lensResults}>
            {lensResults.map((lens, i) => (
              <View key={i} style={styles.lensCard}>
                <View style={styles.lensCardHeader}>
                  <Text style={styles.lensTopic}>{lens.topic_title}</Text>
                  <View style={styles.lensPersonaRow}>
                    <Text style={styles.lensPersonaName}>{lens.matched_persona_name}</Text>
                    <View style={styles.lensStyleTag}>
                      <Text style={styles.lensStyleTagText}>{lens.matched_persona_style}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.lensCommentaryBox}>
                  <Text style={styles.lensCommentary}>{lens.commentary}</Text>
                </View>
                {lens.soul_question ? (
                  <View style={styles.lensSoulBox}>
                    <Text style={styles.lensSoulLabel}>灵魂提问</Text>
                    <Text style={styles.lensSoulText}>{lens.soul_question}</Text>
                  </View>
                ) : null}
              </View>
            ))}
            <Pressable style={styles.lensAgainBtn} onPress={handleLensReset}>
              <Text style={styles.lensAgainText}>再来一期</Text>
            </Pressable>
          </View>
        )}

        {/* ===== 跨人物对比：Loading ===== */}
        {compareLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.loadingText}>正在分析各位高人的思维方式...</Text>
          </View>
        )}

        {/* ===== 跨人物对比：结果 ===== */}
        {mode === 'compare' && compareResults && (
          <View style={styles.compareResults}>
            <Text style={styles.compareQuestion}>
              问题：{question}
            </Text>
            {compareResults.map((comp, i) => (
              <View key={i} style={styles.compareCard}>
                <View style={styles.compareHeader}>
                  <Text style={styles.compareName}>{comp.persona_name}</Text>
                  {comp.persona_style ? (
                    <View style={styles.compareStyleTag}>
                      <Text style={styles.compareStyleText}>{comp.persona_style}</Text>
                    </View>
                  ) : null}
                </View>

                {/* 核心心智模型 */}
                {comp.mental_models && comp.mental_models.length > 0 && (
                  <View style={styles.compareSection}>
                    <Text style={styles.compareSectionLabel}>核心心智模型</Text>
                    {comp.mental_models.map((mm, j) => (
                      <View key={j} style={styles.compareModelItem}>
                        <Text style={styles.compareModelTitle}>{mm.title}</Text>
                        <Text style={styles.compareModelContent} numberOfLines={3}>
                          {mm.content}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* 决策启发式 */}
                {comp.heuristics && comp.heuristics.length > 0 && (
                  <View style={styles.compareSection}>
                    <Text style={styles.compareSectionLabel}>决策启发式</Text>
                    {comp.heuristics.map((h, j) => (
                      <Text key={j} style={styles.compareHeuristic} numberOfLines={1}>
                        {j + 1}. {h}
                      </Text>
                    ))}
                  </View>
                )}

                {/* 金句 */}
                {comp.relevant_quotes && comp.relevant_quotes.length > 0 && (
                  <View style={styles.compareSection}>
                    <Text style={styles.compareSectionLabel}>相关金句</Text>
                    {comp.relevant_quotes.map((q, j) => (
                      <Text key={j} style={styles.compareQuote}>「{q}」</Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
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

      {/* 底部输入区（大堂/聊天/广播/对比模式） */}
      {(mode === 'lobby' || mode === 'chat' || mode === 'broadcast' || mode === 'compare') && (
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
              <>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnPrimary, (!question.trim() || loading) && styles.btnDisabled]}
                  onPress={handleSoloAsk}
                  disabled={!question.trim() || loading}
                >
                  <Text style={styles.actionBtnText}>单独请教</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtnOutline}
                  onPress={() => { setMode('lens'); }}
                >
                  <Text style={styles.actionBtnOutlineText}>天才视角</Text>
                </Pressable>
              </>
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
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnCompare, (!question.trim() || compareLoading) && styles.btnDisabled]}
                  onPress={handleCompare}
                  disabled={!question.trim() || compareLoading}
                >
                  <Text style={styles.actionBtnText}>对比思维</Text>
                </Pressable>
              </>
            )}
            {selectedIds.length === 0 && (
              <View style={styles.actionRow}>
                <Text style={styles.hintText}>请选择至少一位高人开始对话</Text>
                <Pressable
                  style={styles.actionBtnOutline}
                  onPress={() => setMode('lens')}
                >
                  <Text style={styles.actionBtnOutlineText}>天才视角</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 底部导航区（天才视角模式） */}
      {mode === 'lens' && (
        <View style={styles.inputArea}>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={() => setMode('lobby')}
            >
              <Text style={styles.actionBtnText}>返回大堂</Text>
            </Pressable>
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
  // 每日金句
  quoteCard: {
    backgroundColor: '#fffbe6', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#fde68a',
  },
  quoteHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  quoteIcon: { fontSize: 24, color: '#d97706', fontWeight: '700', marginRight: 8 },
  quotePersona: { fontSize: 13, fontWeight: '700', color: '#92400e' },
  quoteBody: { marginBottom: 12 },
  quoteText: {
    fontSize: 16, color: '#78350f', lineHeight: 26,
    fontStyle: 'italic', marginBottom: 4,
  },
  quoteActions: { flexDirection: 'row', gap: 10 },
  quoteBtn: {
    backgroundColor: '#fef3c7', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  quoteBtnText: { fontSize: 13, fontWeight: '600', color: '#d97706' },
  quoteBtnChat: {
    backgroundColor: '#d97706', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  quoteBtnChatText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  // 天才视角周报
  lensBanner: {
    backgroundColor: '#ecfdf5', borderRadius: 14, padding: 14, marginBottom: 14,
    borderLeftWidth: 4, borderLeftColor: '#10b981',
  },
  lensBannerTitle: { fontSize: 16, fontWeight: '800', color: '#065f46', marginBottom: 4 },
  lensBannerSub: { fontSize: 13, color: '#047857' },
  lensSection: { gap: 8 },
  lensSectionLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 8, marginBottom: 4 },
  lensFetchBtn: {
    backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  lensFetchText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  topicItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  topicItemSelected: {
    borderColor: '#10b981', backgroundColor: '#f0fdf4',
  },
  topicRank: {
    fontSize: 13, fontWeight: '700', color: '#94a3b8',
    minWidth: 28, textAlign: 'center',
  },
  topicTitle: { flex: 1, fontSize: 14, color: '#1e293b', marginHorizontal: 8 },
  topicHot: { fontSize: 11, color: '#ef4444', fontWeight: '600' },
  topicCheck: { fontSize: 16, color: '#10b981', fontWeight: '700', marginLeft: 4 },
  lensRefreshBtn: {
    paddingVertical: 8, alignItems: 'center',
    borderWidth: 1, borderColor: '#c7d2fe', borderStyle: 'dashed', borderRadius: 8,
  },
  lensRefreshText: { fontSize: 13, color: '#6366f1', fontWeight: '500' },
  topicCustomInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b',
  },
  topicCustomSummary: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#475569',
    minHeight: 50, maxHeight: 80,
  },
  lensSubmitBtn: {
    backgroundColor: '#10b981', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  lensSubmitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  lensResults: { gap: 14 },
  lensCard: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  lensCardHeader: {
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  lensTopic: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  lensPersonaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lensPersonaName: { fontSize: 14, fontWeight: '600', color: '#6366f1' },
  lensStyleTag: {
    backgroundColor: '#eef2ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  lensStyleTagText: { fontSize: 11, fontWeight: '600', color: '#4338ca' },
  lensCommentaryBox: {
    padding: 14, backgroundColor: '#fafafa',
  },
  lensCommentary: {
    fontSize: 15, color: '#334155', lineHeight: 24,
    borderLeftWidth: 3, borderLeftColor: '#6366f1', paddingLeft: 12,
  },
  lensSoulBox: {
    padding: 14, backgroundColor: '#f8faff',
    borderTopWidth: 1, borderTopColor: '#eef2ff',
  },
  lensSoulLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 6 },
  lensSoulText: { fontSize: 14, color: '#6366f1', fontStyle: 'italic', lineHeight: 21 },
  lensAgainBtn: {
    backgroundColor: '#f1f5f9', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  lensAgainText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  // 跨人物对比
  compareResults: { gap: 14 },
  compareQuestion: {
    fontSize: 15, fontWeight: '700', color: '#1e293b',
    backgroundColor: '#eef2ff', borderRadius: 12, padding: 12,
    borderLeftWidth: 4, borderLeftColor: '#6366f1',
  },
  compareCard: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  compareHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  compareName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  compareStyleTag: {
    backgroundColor: '#eef2ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  compareStyleText: { fontSize: 11, fontWeight: '600', color: '#4338ca' },
  compareSection: {
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  compareSectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 8,
  },
  compareModelItem: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginBottom: 8,
  },
  compareModelTitle: { fontSize: 14, fontWeight: '600', color: '#6366f1', marginBottom: 4 },
  compareModelContent: { fontSize: 13, color: '#475569', lineHeight: 20 },
  compareHeuristic: {
    fontSize: 13, color: '#475569', lineHeight: 22,
    paddingVertical: 2, paddingHorizontal: 4,
  },
  compareQuote: {
    fontSize: 14, color: '#92400e', fontStyle: 'italic', lineHeight: 22,
    paddingVertical: 2,
  },
  // 新按钮
  actionBtnCompare: { backgroundColor: '#10b981' },
  actionBtnOutline: {
    borderWidth: 1.5, borderColor: '#6366f1', borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  actionBtnOutlineText: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
});
