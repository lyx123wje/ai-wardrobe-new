import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchWardrobe } from '../src/api/wardrobe';
import { CATEGORY_COLORS } from '../src/utils/constants';

export default function StatisticsScreen() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWardrobe();
      if (res.data?.items) setItems(res.data.items);
    } catch (e) {
      console.warn('加载统计数据失败:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const overview = useMemo(() => {
    const totalItems = items.length;
    const totalValue = items.reduce((s, i) => s + (i.purchase_amount || 0), 0);
    const totalWears = items.reduce((s, i) => s + (i.wear_count || 0), 0);
    const priced = items.filter(i => i.purchase_amount > 0 && i.wear_count > 0);
    const pv = priced.reduce((s, i) => s + i.purchase_amount, 0);
    const pw = priced.reduce((s, i) => s + i.wear_count, 0);
    return { totalItems, totalValue, totalWears, avgCpw: pw > 0 ? Math.round(pv / pw) : 0 };
  }, [items]);

  const categoryStats = useMemo(() => {
    const map = {};
    items.forEach(i => {
      const cat = i.category || '其他';
      if (!map[cat]) map[cat] = { count: 0 };
      map[cat].count++;
    });
    return Object.entries(map)
      .map(([cat, d]) => ({
        category: cat, count: d.count,
        pct: items.length > 0 ? ((d.count / items.length) * 100).toFixed(1) : '0',
        color: CATEGORY_COLORS[cat] || '#9CA3AF',
      }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const cpwRanking = useMemo(() =>
    items.filter(i => i.purchase_amount > 0 && i.wear_count > 0)
      .map(i => ({ ...i, cpw: +(i.purchase_amount / i.wear_count).toFixed(2) }))
      .sort((a, b) => a.cpw - b.cpw)
  , [items]);

  const mostWorn = useMemo(() =>
    [...items].filter(i => i.wear_count > 0)
      .sort((a, b) => b.wear_count - a.wear_count).slice(0, 5)
  , [items]);

  const neverWorn = useMemo(() => items.filter(i => i.wear_count === 0), [items]);
  const highCpw = useMemo(() => items.filter(i => {
    if (i.purchase_amount <= 0 || i.wear_count <= 0) return false;
    return (i.purchase_amount / i.wear_count) > 100;
  }), [items]);

  const fmt = v => v >= 1000 ? `¥${(v / 1000).toFixed(1)}k` : `¥${v}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>衣柜统计</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingFull}><ActivityIndicator size="large" color="#06b6d4" /></View>
      ) : (
        <ScrollView
          style={styles.scroll} contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
        >
          {/* 总览 */}
          <View style={styles.overviewRow}>
            {[
              { label: '衣物品', value: overview.totalItems, unit: '件' },
              { label: '总价值', value: fmt(overview.totalValue), unit: '' },
              { label: '总穿着', value: overview.totalWears, unit: '次' },
              { label: '均CPW', value: fmt(overview.avgCpw), unit: '' },
            ].map((o, i) => (
              <View key={i} style={styles.overviewBox}>
                <Text style={styles.overviewValue}>{o.value}</Text>
                <Text style={styles.overviewUnit}>{o.unit}</Text>
                <Text style={styles.overviewLabel}>{o.label}</Text>
              </View>
            ))}
          </View>

          {/* 分类占比 */}
          {categoryStats.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>分类占比</Text>
              {categoryStats.map(cat => (
                <View key={cat.category} style={styles.barRow}>
                  <View style={styles.barLabel}>
                    <View style={[styles.barDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.barCategory}>{cat.category}</Text>
                    <Text style={styles.barCount}>{cat.count}件</Text>
                    <Text style={styles.barPct}>{cat.pct}%</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${cat.pct}%`, backgroundColor: cat.color }]} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* CPW 排行 */}
          {cpwRanking.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>CPW 排行 · 最划算</Text>
              {cpwRanking.slice(0, 10).map((item, idx) => (
                <View key={item.id} style={styles.rankRow}>
                  <Text style={styles.rankIdx}>{idx + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>{item.sub_tag}</Text>
                  <Text style={styles.rankMeta}>穿{item.wear_count}次 · ¥{item.purchase_amount}</Text>
                  <Text style={styles.rankCpw}>¥{item.cpw}/次</Text>
                </View>
              ))}
            </View>
          )}

          {/* 最常穿 */}
          {mostWorn.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>最常穿 Top 5</Text>
              {mostWorn.map((item, idx) => (
                <View key={item.id} style={styles.rankRow}>
                  <Text style={styles.rankIdx}>{idx + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>{item.sub_tag}</Text>
                  <Text style={styles.rankMeta}>{item.category}</Text>
                  <Text style={styles.wearCount}>{item.wear_count}次</Text>
                </View>
              ))}
            </View>
          )}

          {/* 闲置警告 */}
          {(neverWorn.length > 0 || highCpw.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>闲置警告</Text>
              {neverWorn.length > 0 && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningIcon}>⚠️</Text>
                  <Text style={styles.warningText}>
                    {neverWorn.length}件衣物从未穿过：{' '}
                    {neverWorn.map(i => i.sub_tag).join(' / ')}
                  </Text>
                </View>
              )}
              {highCpw.length > 0 && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningIcon}>💸</Text>
                  <Text style={styles.warningText}>
                    {highCpw.length}件衣物CPW超过¥100：{' '}
                    {highCpw.map(i => `${i.sub_tag}(¥${(i.purchase_amount / i.wear_count).toFixed(0)}/次)`).join(' / ')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {items.length === 0 && !loading && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyText}>衣柜还是空的，先添加衣物吧</Text>
            </View>
          )}
        </ScrollView>
      )}
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
  backText: { fontSize: 22, color: '#06b6d4', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  loadingFull: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overviewRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  overviewBox: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center' },
  overviewValue: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  overviewUnit: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  overviewLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  barRow: { marginBottom: 14 },
  barLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  barDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  barCategory: { fontSize: 13, fontWeight: '600', color: '#334155', flex: 1 },
  barCount: { fontSize: 12, color: '#64748b', marginRight: 6 },
  barPct: { fontSize: 12, fontWeight: '600', color: '#94a3b8', width: 44, textAlign: 'right' },
  barTrack: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  rankRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6,
  },
  rankIdx: { fontSize: 13, fontWeight: '700', color: '#94a3b8', width: 24 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#334155' },
  rankMeta: { flex: 1, fontSize: 12, color: '#94a3b8' },
  rankCpw: { fontSize: 14, fontWeight: '700', color: '#d97706' },
  wearCount: { fontSize: 14, fontWeight: '700', color: '#06b6d4' },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  warningIcon: { fontSize: 14, marginRight: 8, marginTop: 1 },
  warningText: { flex: 1, fontSize: 13, color: '#991b1b', lineHeight: 19 },
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 14, color: '#94a3b8' },
});
