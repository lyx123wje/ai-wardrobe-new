import React from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';

const STATUS_MAP = {
  '待售': { color: '#f59e0b', label: '待售' },
  '议价中': { color: '#3b82f6', label: '议价中' },
  '已售出': { color: '#10b981', label: '已售出' },
};

export default function ResellCard({ item, onMarkPrice, onMarkSold, onMoveBack }) {
  const resell = parseResell(item.notes || '');
  const status = resell.status || '待售';
  const badge = STATUS_MAP[status] || STATUS_MAP['待售'];

  return (
    <View style={[styles.card, status === '已售出' && styles.cardSold]}>
      <View style={styles.row}>
        {item.processed_image ? (
          <Image source={{ uri: item.processed_image }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={{ fontSize: 20 }}>👔</Text>
          </View>
        )}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.sub_tag}</Text>
            <View style={[styles.badge, { backgroundColor: badge.color }]}>
              <Text style={styles.badgeText}>{badge.label}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {item.category} · {item.color} · 购入¥{item.purchase_amount} · 穿{item.wear_count || 0}次
          </Text>
          {resell.price > 0 && (
            <Text style={styles.priceLabel}>
              挂售 <Text style={styles.priceValue}>¥{resell.price}</Text>
              {resell.date ? ` · ${resell.date}` : ''}
            </Text>
          )}
        </View>
      </View>

      {status !== '已售出' && (
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={onMarkPrice}>
            <Text style={styles.actionText}>{resell.price > 0 ? '改价' : '标价'}</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionSold]} onPress={onMarkSold}>
            <Text style={styles.actionTextSold}>已售出</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionBack]} onPress={onMoveBack}>
            <Text style={styles.actionTextBack}>移回衣柜</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// 从 notes 解析转卖信息: RESELL:price:150|status:sold|date:2024-03-15
export function parseResell(notes) {
  const result = { price: 0, status: '', date: '' };
  try {
    const match = notes.match(/RESELL:([^\n]*)/);
    if (!match) return result;
    const parts = match[1].split('|');
    parts.forEach(p => {
      const [k, v] = p.split(':');
      if (k === 'price') result.price = parseFloat(v) || 0;
      if (k === 'status') result.status = v;
      if (k === 'date') result.date = v;
    });
  } catch { /* ignore */ }
  return result;
}

// 生成新的 notes 内容（保留原有非转卖内容 + 新的转卖数据）
export function buildResellNotes(originalNotes, { price, status, date }) {
  const clean = (originalNotes || '').replace(/RESELL:[^\n]*\n?/g, '').trim();
  const parts = [`RESELL:price:${price || 0}`];
  if (status) parts.push(`status:${status}`);
  if (date) parts.push(`date:${date}`);
  const resellLine = parts.join('|');
  return clean ? `${clean}\n${resellLine}` : resellLine;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
  },
  cardSold: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  image: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#f8fafc' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name: { fontSize: 15, fontWeight: '600', color: '#1e293b', flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  meta: { fontSize: 12, color: '#94a3b8', marginBottom: 2 },
  priceLabel: { fontSize: 13, color: '#64748b', marginTop: 2 },
  priceValue: { fontWeight: '700', color: '#ef4444' },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12,
    borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12,
  },
  actionBtn: {
    backgroundColor: '#f1f5f9', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  actionText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  actionSold: { backgroundColor: '#dcfce7' },
  actionTextSold: { fontSize: 12, fontWeight: '600', color: '#16a34a' },
  actionBack: { backgroundColor: '#fef3c7' },
  actionTextBack: { fontSize: 12, fontWeight: '600', color: '#d97706' },
});
