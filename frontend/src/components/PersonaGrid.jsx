import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

const STYLE_PRESETS = {
  '心学智慧':      { color: '#6366f1', emoji: '🧘' },
  '旷达人生':      { color: '#f59e0b', emoji: '🌊' },
  '理想主义':      { color: '#ef4444', emoji: '⚡' },
  '温柔共情':      { color: '#ec4899', emoji: '🌸' },
  '自我主张':      { color: '#8b5cf6', emoji: '👑' },
  '周到温暖':      { color: '#10b981', emoji: '☕' },
  '荒诞哲学':      { color: '#06b6d4', emoji: '🎪' },
  // 13 external skills
  '创业教父':      { color: '#f97316', emoji: '✍️' },
  '理性主义':      { color: '#3b82f6', emoji: '🧠' },
  'AI教育':        { color: '#8b5cf6', emoji: '🤖' },
  'AI安全':        { color: '#6366f1', emoji: '🔮' },
  '内容创造':      { color: '#ef4444', emoji: '📺' },
  '交易权力':      { color: '#dc2626', emoji: '🇺🇸' },
  '产品哲学':      { color: '#1d1d1f', emoji: '🍎' },
  '工程思维':      { color: '#0ea5e9', emoji: '🚀' },
  '价值投资':      { color: '#059669', emoji: '📊' },
  '科学思维':      { color: '#7c3aed', emoji: '🔬' },
  '自由哲学':      { color: '#d97706', emoji: '💎' },
  '风险管理':      { color: '#475569', emoji: '🦢' },
  '教育实用':      { color: '#0891b2', emoji: '📚' },
};

const FALLBACK_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316'];
const FALLBACK_EMOJIS = ['💡','🌟','🔥','🎯','💭','✨','🧭','⚡'];

function getStylePreset(style, personaId) {
  if (STYLE_PRESETS[style]) return STYLE_PRESETS[style];
  const hash = personaId.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return {
    color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
    emoji: FALLBACK_EMOJIS[hash % FALLBACK_EMOJIS.length],
  };
}

export default function PersonaGrid({ personas, selectedIds, onToggle, maxSelect = 5 }) {
  // 筛选出思维训练室的高人（associated_categories 包含 "思维"）
  const thinkingPersonas = personas.filter(
    p => p.associated_categories && p.associated_categories.includes('思维')
  );

  if (thinkingPersonas.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>暂无高人入驻</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          大厅 · 在座的各位 ({thinkingPersonas.length}人)
        </Text>
        {selectedIds.length > 0 && (
          <Text style={styles.headerSub}>
            已选 {selectedIds.length}/{Math.min(maxSelect, thinkingPersonas.length)} 位
          </Text>
        )}
      </View>
      <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
      >
        {thinkingPersonas.map(persona => {
          const isSelected = selectedIds.includes(persona.id);
          const preset = getStylePreset(persona.style, persona.id);
          const accent = preset.color;
          const emoji = preset.emoji;
          const disabled = !isSelected && selectedIds.length >= maxSelect;

          return (
            <Pressable
              key={persona.id}
              style={[
                styles.card,
                isSelected && { ...styles.cardSelected, borderColor: accent },
                disabled && styles.cardDisabled,
              ]}
              onPress={() => !disabled && onToggle(persona.id)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.emoji}>{emoji}</Text>
                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: accent }]}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.name, isSelected && { color: accent }]}>
                {persona.name}
              </Text>
              <Text style={styles.style} numberOfLines={1}>
                {persona.style}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  headerSub: { fontSize: 13, fontWeight: '500', color: '#6366f1' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 10,
  },
  card: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardSelected: {
    borderWidth: 2,
    backgroundColor: '#f8faff',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  cardDisabled: {
    opacity: 0.4,
  },
  cardTop: {
    position: 'relative',
    marginBottom: 6,
  },
  emoji: { fontSize: 28 },
  checkmark: {
    position: 'absolute',
    top: -12,
    right: -16,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  style: { fontSize: 11, color: '#94a3b8' },
  empty: { padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
});
