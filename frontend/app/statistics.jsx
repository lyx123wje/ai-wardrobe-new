import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ImageBackground, View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Platform } from 'react-native';
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

  const now = new Date();
  const thisYear = String(now.getFullYear());

  // 套装不算衣物统计
  const clothingOnly = useMemo(() => items.filter(i => i.category !== '套装'), [items]);

  const overview = useMemo(() => {
    const totalItems = clothingOnly.length;
    const totalValue = clothingOnly.reduce((s, i) => s + (i.purchase_amount || 0), 0);
    const thisYearItems = clothingOnly.filter(i => (i.purchase_date || '').startsWith(thisYear));
    const thisYearCount = thisYearItems.length;
    const thisYearSpend = thisYearItems.reduce((s, i) => s + (i.purchase_amount || 0), 0);
    return { totalItems, totalValue, thisYearCount, thisYearSpend, thisYear };
  }, [clothingOnly, thisYear]);

  const categoryStats = useMemo(() => {
    const map = {};
    clothingOnly.forEach(i => {
      const cat = i.category || '其他';
      if (!map[cat]) map[cat] = { count: 0 };
      map[cat].count++;
    });
    return Object.entries(map)
      .map(([cat, d]) => ({
        category: cat, count: d.count,
        pct: clothingOnly.length > 0 ? ((d.count / clothingOnly.length) * 100).toFixed(1) : '0',
        color: CATEGORY_COLORS[cat] || '#9CA3AF',
      }))
      .sort((a, b) => b.count - a.count);
  }, [clothingOnly]);

  const mostWorn = useMemo(() =>
    [...clothingOnly].filter(i => i.wear_count > 0)
      .sort((a, b) => b.wear_count - a.wear_count).slice(0, 5)
  , [clothingOnly]);

  const recentWorn = useMemo(() =>
    [...clothingOnly].filter(i => i.last_worn_date)
      .sort((a, b) => (b.last_worn_date || '').localeCompare(a.last_worn_date || ''))
      .slice(0, 5)
  , [clothingOnly]);

  const neverWorn = useMemo(() => clothingOnly.filter(i => i.wear_count === 0), [clothingOnly]);

  const thisYearItems = useMemo(() =>
    clothingOnly.filter(i => (i.purchase_date || '').startsWith(thisYear))
      .sort((a, b) => (b.purchase_date || '').localeCompare(a.purchase_date || ''))
  , [clothingOnly, thisYear]);

  const fmt = v => v >= 1000 ? `¥${(v / 1000).toFixed(1)}k` : `¥${v}`;

  return (
    <ImageBackground source={require('../assets/bg.png')} style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => Platform.OS === 'web' ? router.replace('/') : router.back()} style={styles.headerBtn}>
          <Text style={styles.backText}>{Platform.OS === 'web' ? '← 主页' : '<'}</Text>
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
              { label: '衣物品', value: overview.totalItems, unit: '件', color: '#6366f1' },
              { label: '总价值', value: fmt(overview.totalValue), unit: '', color: '#f59e0b' },
              { label: `${overview.thisYear}购入`, value: overview.thisYearCount, unit: '件', color: '#10b981' },
              { label: '今年花费', value: fmt(overview.thisYearSpend), unit: '', color: '#ef4444' },
            ].map((o, i) => (
              <View key={i} style={[styles.overviewBox, { borderTopWidth: 3, borderTopColor: o.color }]}>
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

          {/* 最近穿着 */}
          {recentWorn.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>最近穿着</Text>
              {recentWorn.map((item, idx) => (
                <View key={item.id} style={styles.rankRow}>
                  <Text style={styles.rankIdx}>{idx + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>{item.sub_tag}</Text>
                  <Text style={styles.rankMeta}>{item.category}</Text>
                  <Text style={styles.wearDate}>{item.last_worn_date}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 今年购入 */}
          {thisYearItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{overview.thisYear}购入 · {thisYearItems.length}件 · ¥{overview.thisYearSpend}</Text>
              {thisYearItems.map((item, idx) => (
                <View key={item.id} style={styles.rankRow}>
                  <Text style={styles.rankIdx}>{idx + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>{item.sub_tag}</Text>
                  <Text style={styles.rankMeta}>{item.purchase_date || '未知'} · {item.category}</Text>
                  <Text style={styles.wearCount}>{item.purchase_amount > 0 ? `¥${item.purchase_amount}` : '--'}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 闲置警告 */}
          {neverWorn.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>从未穿过</Text>
              <View style={styles.warningBox}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <Text style={styles.warningText}>
                  共 {neverWorn.length} 件：{' '}
                  {neverWorn.map(i => i.sub_tag).join(' / ')}
                </Text>
              </View>
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
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
  wearCount: { fontSize: 14, fontWeight: '700', color: '#06b6d4' },
  wearDate: { fontSize: 12, fontWeight: '500', color: '#94a3b8' },
  wearSummaryRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  wearSummaryBox: {
    flex: 1, backgroundColor: '#F0FDF4', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  wearSummaryNum: { fontSize: 20, fontWeight: '700', color: '#16A34A' },
  wearSummaryLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },
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
