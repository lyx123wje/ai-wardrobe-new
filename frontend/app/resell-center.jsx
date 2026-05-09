import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fetchWardrobe, updateWardrobeItem } from '../src/api/wardrobe';
import ResellCard, { parseResell, buildResellNotes } from '../src/components/ResellCard';

export default function ResellCenterScreen() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [priceModal, setPriceModal] = useState(false);
  const [priceItem, setPriceItem] = useState(null);
  const [priceInput, setPriceInput] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWardrobe({ is_unwanted: 1 });
      if (res.data?.items) setItems(res.data.items);
    } catch (e) {
      console.warn('加载转卖列表失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const stats = useMemo(() => {
    let totalPotential = 0, totalSold = 0, soldCount = 0;
    items.forEach(item => {
      const r = parseResell(item.notes || '');
      if (r.status === '已售出') { totalSold += r.price; soldCount++; }
      else if (r.price > 0) totalPotential += r.price;
    });
    return {
      totalPotential, totalSold, soldCount,
      unsoldCount: items.filter(i => parseResell(i.notes || '').status !== '已售出').length,
    };
  }, [items]);

  const unsoldItems = useMemo(
    () => items.filter(i => parseResell(i.notes || '').status !== '已售出'), [items]
  );
  const soldItems = useMemo(
    () => items.filter(i => parseResell(i.notes || '').status === '已售出'), [items]
  );

  const handleMarkPrice = useCallback((item) => {
    const r = parseResell(item.notes || '');
    setPriceItem(item);
    setPriceInput(r.price > 0 ? String(r.price) : '');
    setPriceModal(true);
  }, []);

  const submitPrice = useCallback(async () => {
    if (!priceItem) return;
    const price = parseFloat(priceInput) || 0;
    const newNotes = buildResellNotes(priceItem.notes || '', { price, status: '待售', date: '' });
    try {
      await updateWardrobeItem(priceItem.id, { notes: newNotes });
      setPriceModal(false);
      setPriceItem(null);
      loadItems();
    } catch { Alert.alert('标价失败'); }
  }, [priceItem, priceInput, loadItems]);

  const handleMarkSold = useCallback(async (item) => {
    const r = parseResell(item.notes || '');
    const price = r.price > 0 ? r.price : item.purchase_amount;
    const today = new Date().toISOString().slice(0, 10);
    Alert.alert('确认售出', `售价 ¥${price}？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        onPress: async () => {
          const newNotes = buildResellNotes(item.notes || '', { price, status: '已售出', date: today });
          try {
            await updateWardrobeItem(item.id, { notes: newNotes });
            loadItems();
          } catch { Alert.alert('操作失败'); }
        },
      },
    ]);
  }, [loadItems]);

  const handleMoveBack = useCallback(async (item) => {
    Alert.alert('移回衣柜', `把「${item.sub_tag}」放回衣柜？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移回',
        onPress: async () => {
          try {
            await updateWardrobeItem(item.id, { is_unwanted: 0 });
            loadItems();
          } catch { Alert.alert('操作失败'); }
        },
      },
    ]);
  }, [loadItems]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>卖了还钱</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {items.length > 0 && (
          <View style={styles.statsRow}>
            <View style={[styles.statBox, styles.statPotential]}>
              <Text style={styles.statValue}>¥{stats.totalPotential}</Text>
              <Text style={styles.statLabel}>预期回血</Text>
            </View>
            <View style={[styles.statBox, styles.statSold]}>
              <Text style={styles.statValue}>¥{stats.totalSold}</Text>
              <Text style={styles.statLabel}>已回血</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.unsoldCount}件</Text>
              <Text style={styles.statLabel}>待转卖</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.soldCount}件</Text>
              <Text style={styles.statLabel}>已售</Text>
            </View>
          </View>
        )}

        {loading && <View style={styles.loadingBox}><ActivityIndicator size="small" color="#ef4444" /></View>}

        {unsoldItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>待转卖 ({unsoldItems.length})</Text>
            {unsoldItems.map(item => (
              <ResellCard
                key={item.id}
                item={item}
                onMarkPrice={() => handleMarkPrice(item)}
                onMarkSold={() => handleMarkSold(item)}
                onMoveBack={() => handleMoveBack(item)}
              />
            ))}
          </View>
        )}

        {soldItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>已售出 ({soldItems.length})</Text>
            {soldItems.map(item => {
              const r = parseResell(item.notes || '');
              return (
                <View key={item.id} style={styles.soldRow}>
                  <Text style={styles.soldIcon}>✨</Text>
                  <Text style={styles.soldName} numberOfLines={1}>{item.sub_tag}</Text>
                  <Text style={styles.soldPrice}>¥{r.price}</Text>
                  <Text style={styles.soldDate}>{r.date || ''}</Text>
                </View>
              );
            })}
          </View>
        )}

        {!loading && items.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>暂无待转卖物品</Text>
            <Text style={styles.emptySub}>
              在衣柜中标记"不想要"的衣物，{'\n'}或在智能管家说"XX不想要了"
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={priceModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>标价 — {priceItem?.sub_tag}</Text>
            <Text style={styles.modalSub}>买入 ¥{priceItem?.purchase_amount} · 穿{priceItem?.wear_count || 0}次</Text>
            <TextInput
              style={styles.priceInput}
              value={priceInput}
              onChangeText={setPriceInput}
              placeholder="输入转卖价格"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => { setPriceModal(false); setPriceItem(null); }}>
                <Text style={styles.modalCancelText}>取消</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={submitPrice}>
                <Text style={styles.modalConfirmText}>确定</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backText: { fontSize: 22, color: '#ef4444', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center' },
  statPotential: { borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
  statSold: { borderLeftWidth: 3, borderLeftColor: '#10b981' },
  statValue: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  statLabel: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  loadingBox: { alignItems: 'center', paddingVertical: 32 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  soldRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 6,
  },
  soldIcon: { fontSize: 16, marginRight: 8 },
  soldName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#334155' },
  soldPrice: { fontSize: 14, fontWeight: '700', color: '#16a34a', marginRight: 12 },
  soldDate: { fontSize: 12, color: '#94a3b8' },
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#64748b', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#94a3b8', marginBottom: 20 },
  priceInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, fontWeight: '700',
    textAlign: 'center', color: '#ef4444', marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#f1f5f9' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  modalConfirm: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#ef4444' },
  modalConfirmText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
