import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import TypeWriter from './TypeWriter';

const SPEAKER_COLORS = {
  user: '#6366f1',
};

const SPEAKER_EMOJIS = {
  '王阳明': '🧘',
  '苏轼': '🌊',
  '罗永浩': '⚡',
  '蔡康永': '🌸',
  '大S': '👑',
  '何炅': '☕',
  '大张伟': '🎪',
};

export default function ChatBubble({ message, typingSpeed = 25, onTypingComplete }) {
  const isUser = message.speaker === 'user';
  const speakerName = message.speakerName || message.speaker;
  const accent = SPEAKER_COLORS[message.speaker] || '#64748b';
  const emoji = SPEAKER_EMOJIS[speakerName] || '';

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  if (message.isTyping && message.content) {
    return (
      <View style={styles.botRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{emoji}</Text>
        </View>
        <View style={styles.contentCol}>
          <Text style={styles.speakerName}>{speakerName}</Text>
          <View style={[styles.botBubble, { borderLeftColor: accent }]}>
            <TypeWriter
              text={message.content}
              speed={typingSpeed}
              onComplete={onTypingComplete}
              style={styles.botText}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.botRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{emoji}</Text>
      </View>
      <View style={styles.contentCol}>
        <Text style={styles.speakerName}>{speakerName}</Text>
        <View style={[styles.botBubble, { borderLeftColor: accent }]}>
          <Text style={styles.botText}>{message.content}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 用户消息 — 右侧
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14, paddingHorizontal: 8 },
  userBubble: {
    maxWidth: '80%',
    backgroundColor: '#6366f1',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 22 },

  // 高人消息 — 左侧
  botRow: { flexDirection: 'row', marginBottom: 14, paddingHorizontal: 8 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  avatarText: { fontSize: 20 },
  contentCol: { flex: 1 },
  speakerName: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4, marginLeft: 4 },
  botBubble: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  botText: { color: '#334155', fontSize: 15, lineHeight: 22 },
});
