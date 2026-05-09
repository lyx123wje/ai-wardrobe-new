import { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Modal,
  ActivityIndicator, ScrollView, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { askWardrobe } from '../api/wardrobe';

const QUICK_QUESTIONS = [
  '什么东西在哪？',
  '我有多少件衣服？',
  '哪些衣服还没穿过？',
];

export default function ButlerChat({ visible, onClose, onActionExecuted }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  function addMessage(type, content, extra = {}) {
    setMessages((prev) => [...prev, { id: Date.now(), type, content, ...extra }]);
    // 滚动到底部
    setTimeout(() => {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    }, 100);
  }

  async function handleSend(text) {
    const question = (text || inputText).trim();
    if (!question || loading) return;

    // 添加用户消息
    addMessage('user', question);
    setInputText('');
    setLoading(true);

    try {
      const res = await askWardrobe(question);
      const data = res.data;

      // 添加 AI 回复
      const answer = data.answer || '抱歉，我无法回答这个问题。';
      addMessage('bot', answer, {
        actions: data.actions || [],
        relatedItems: data.related_items || [],
      });

      // 通知外部有 actions 被执行
      if (data.actions && data.actions.length > 0) {
        onActionExecuted?.(data.actions);
      }
    } catch (err) {
      addMessage('bot', '抱歉，智能管家服务暂时不可用，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  function handleQuickQuestion(q) {
    handleSend(q);
  }

  function renderActionCard(action, idx) {
    const type = action.type;
    if (action.status === 'failed') {
      return (
        <View key={`action-${idx}`} style={styles.actionCardError}>
          <Text style={styles.actionCardText}>❌ 操作失败：{action.error || '未知错误'}</Text>
        </View>
      );
    }
    switch (type) {
      case 'update_misc_location':
        return (
          <View key={`action-${idx}`} style={styles.actionCard}>
            <Text style={styles.actionCardIcon}>📍</Text>
            <Text style={styles.actionCardText}>
              已将「{action.name}」位置更新为「{action.new_location}」
            </Text>
          </View>
        );
      case 'update_wardrobe_unwanted':
        return (
          <View key={`action-${idx}`} style={styles.actionCardWarn}>
            <Text style={styles.actionCardIcon}>💸</Text>
            <Text style={styles.actionCardText}>
              已标记「{action.name}」为不想要，可在"卖了还钱"页查看
            </Text>
          </View>
        );
      case 'update_wardrobe_dirty':
        return (
          <View key={`action-${idx}`} style={styles.actionCard}>
            <Text style={styles.actionCardIcon}>🧺</Text>
            <Text style={styles.actionCardText}>
              已标记「{action.name}」为脏衣，可在脏衣篓中查看
            </Text>
          </View>
        );
      case 'update_wardrobe_clean':
        return (
          <View key={`action-${idx}`} style={styles.actionCardClean}>
            <Text style={styles.actionCardIcon}>✨</Text>
            <Text style={styles.actionCardText}>
              已将「{action.name}」标记为干净，已从脏衣篓移除
            </Text>
          </View>
        );
      case 'update_wardrobe_keep':
        return (
          <View key={`action-${idx}`} style={styles.actionCardKeep}>
            <Text style={styles.actionCardIcon}>💚</Text>
            <Text style={styles.actionCardText}>
              已取消「{action.name}」的不想要标记，已从"卖了还钱"页移除
            </Text>
          </View>
        );
      default:
        return null;
    }
  }

  function renderRelatedItem(item, idx) {
    return (
      <View key={`related-${idx}`} style={styles.relatedCard}>
        <Text style={styles.relatedIcon}>{item.type === 'misc' ? '📦' : '👔'}</Text>
        <View style={styles.relatedInfo}>
          <Text style={styles.relatedName}>{item.name}</Text>
          {item.location ? (
            <Text style={styles.relatedDetail}>📍 {item.location}</Text>
          ) : null}
          {item.category ? (
            <Text style={styles.relatedDetail}>{item.category}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  function renderMessage(msg) {
    const isUser = msg.type === 'user';
    return (
      <View key={msg.id} style={[styles.msgRow, isUser ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isUser && (
          <View style={styles.avatarBot}>
            <Text style={styles.avatarText}>🤖</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {msg.content}
          </Text>
          {/* Action cards */}
          {msg.actions && msg.actions.length > 0 && (
            <View style={styles.actionCards}>
              {msg.actions.map((action, idx) => renderActionCard(action, idx))}
            </View>
          )}
          {/* Related items */}
          {msg.relatedItems && msg.relatedItems.length > 0 && (
            <View style={styles.relatedCards}>
              {msg.relatedItems.map((item, idx) => renderRelatedItem(item, idx))}
            </View>
          )}
        </View>
        {isUser && (
          <View style={styles.avatarUser}>
            <Text style={styles.avatarText}>💬</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>关闭</Text>
          </Pressable>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerIcon}>🤖</Text>
            <Text style={styles.headerTitle}>衣柜管家</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.msgList}
          contentContainerStyle={styles.msgContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.emptyChat}>
              <Text style={styles.emptyIcon}>🤖</Text>
              <Text style={styles.emptyTitle}>你好，我是衣柜管家</Text>
              <Text style={styles.emptySub}>
                我可以帮你查找物品位置、统计衣物数量、标记衣物状态等。试试问我吧！
              </Text>
            </View>
          )}
          {messages.map(renderMessage)}
          {loading && (
            <View style={styles.msgRowLeft}>
              <View style={styles.avatarBot}>
                <Text style={styles.avatarText}>🤖</Text>
              </View>
              <View style={[styles.bubble, styles.bubbleBot, styles.loadingBubble]}>
                <ActivityIndicator size="small" color="#8B7355" />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Quick questions */}
        {messages.length === 0 && (
          <View style={styles.quickRow}>
            {QUICK_QUESTIONS.map((q, idx) => (
              <Pressable
                key={idx}
                style={styles.quickChip}
                onPress={() => handleQuickQuestion(q)}
              >
                <Text style={styles.quickChipText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Input */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="输入问题..."
              placeholderTextColor="#94a3b8"
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
            />
            <Pressable
              style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!inputText.trim() || loading}
            >
              <Text style={styles.sendBtnText}>发送</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#f8f9fc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  headerBtn: { minWidth: 50, paddingVertical: 4 },
  headerBtnText: { fontSize: 16, color: '#8B7355' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIcon: { fontSize: 20 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1e293b' },
  msgList: { flex: 1 },
  msgContent: { padding: 16, paddingBottom: 8 },
  emptyChat: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20,
  },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  msgRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  msgRowRight: { justifyContent: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start' },
  avatarBot: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  avatarUser: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#e0e7ff',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  avatarText: { fontSize: 16 },
  bubble: {
    maxWidth: '75%', padding: 12, borderRadius: 16,
  },
  bubbleBot: { backgroundColor: '#fff', borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: '#6366f1', borderTopRightRadius: 4 },
  bubbleText: { fontSize: 15, color: '#1e293b', lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  loadingBubble: { padding: 14, minWidth: 60, alignItems: 'center' },
  actionCards: { marginTop: 10, gap: 6 },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f0fdf4', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  actionCardWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef3c7', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#fde68a',
  },
  actionCardClean: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#e0f2fe', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#bae6fd',
  },
  actionCardKeep: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#d1fae5', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#a7f3d0',
  },
  actionCardError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#fecaca',
  },
  actionCardIcon: { fontSize: 18 },
  actionCardText: { flex: 1, fontSize: 13, color: '#1e293b', lineHeight: 18 },
  relatedCards: { marginTop: 10, gap: 6 },
  relatedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f8f9fc', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  relatedIcon: { fontSize: 24 },
  relatedInfo: { flex: 1 },
  relatedName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  relatedDetail: { fontSize: 12, color: '#64748b', marginTop: 2 },
  quickRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    justifyContent: 'center',
  },
  quickChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(139,115,85,0.1)', borderWidth: 1, borderColor: 'rgba(139,115,85,0.3)',
  },
  quickChipText: { fontSize: 13, color: '#8B7355', fontWeight: '500' },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1, padding: 12, fontSize: 15, color: '#1e293b',
    backgroundColor: '#f1f5f9', borderRadius: 12,
  },
  sendBtn: {
    paddingVertical: 12, paddingHorizontal: 20,
    backgroundColor: '#8B7355', borderRadius: 12,
  },
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
