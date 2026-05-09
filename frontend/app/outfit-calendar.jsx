import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fetchOutfits, fetchOutfitByDate, deleteOutfit } from '../src/api/outfits';
import MonthCalendar from '../src/components/MonthCalendar';

export default function OutfitCalendarScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState(null);
  const [outfits, setOutfits] = useState([]);
  const [selectedOutfit, setSelectedOutfit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const firstOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const lastOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const datesWithOutfits = useMemo(() => {
    const set = new Set();
    outfits.forEach(o => set.add(o.log_date));
    return set;
  }, [outfits]);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchOutfits({ start_date: firstOfMonth, end_date: lastOfMonth });
      if (res.data?.outfits) setOutfits(res.data.outfits);
    } catch (e) {
      console.warn('加载穿搭失败:', e);
    } finally {
      setLoading(false);
    }
  }, [firstOfMonth, lastOfMonth]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  const handleSelectDate = useCallback(async (dateKey) => {
    setSelectedDate(dateKey);
    const cached = outfits.find(o => o.log_date === dateKey);
    if (cached) {
      setSelectedOutfit(cached);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await fetchOutfitByDate(dateKey);
      setSelectedOutfit(res.data?.outfit || null);
    } catch (e) {
      console.warn('加载穿搭详情失败:', e);
    } finally {
      setDetailLoading(false);
    }
  }, [outfits]);

  const handleDelete = useCallback((id) => {
    Alert.alert('删除穿搭', '确定删除这一天的穿搭记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          try {
            await deleteOutfit(id);
            setSelectedOutfit(null);
            setSelectedDate(null);
            loadMonth();
          } catch { Alert.alert('删除失败'); }
        },
      },
    ]);
  }, [loadMonth]);

  const handleAddOutfit = useCallback(() => {
    const date = selectedDate || firstOfMonth;
    router.push({ pathname: '/ootd-lab', params: { date } });
  }, [selectedDate, firstOfMonth, router]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null); setSelectedOutfit(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null); setSelectedOutfit(null);
  };

  const cpwRanking = useMemo(() => {
    const map = new Map();
    outfits.forEach(o => {
      (o.items || []).forEach(item => {
        if (item.purchase_amount > 0 && item.wear_count > 0) {
          const cpw = +(item.purchase_amount / item.wear_count).toFixed(2);
          const existing = map.get(item.id);
          if (!existing || cpw < existing.cpw) map.set(item.id, { ...item, cpw });
        }
      });
    });
    return [...map.values()].sort((a, b) => a.cpw - b.cpw).slice(0, 5);
  }, [outfits]);

  const monthLabel = `${year}年${month + 1}月`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>穿搭日历</Text>
        <Pressable onPress={handleAddOutfit} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+穿搭</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 月份切换 */}
        <View style={styles.monthRow}>
          <Pressable onPress={prevMonth} style={styles.arrowBtn}>
            <Text style={styles.arrowText}>◀</Text>
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable onPress={nextMonth} style={styles.arrowBtn}>
            <Text style={styles.arrowText}>▶</Text>
          </Pressable>
        </View>

        {/* 日历网格 */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#f59e0b" />
          </View>
        ) : (
          <MonthCalendar
            year={year} month={month}
            selectedDate={selectedDate}
            datesWithOutfits={datesWithOutfits}
            onSelectDate={handleSelectDate}
          />
        )}

        {/* 加载详情 */}
        {detailLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#f59e0b" />
          </View>
        )}

        {/* 穿搭详情卡 */}
        {selectedOutfit && !detailLoading && (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>穿搭记录</Text>
            <Text style={styles.detailSub}>
              {selectedDate} · {selectedOutfit.items?.length || 0} 件单品
            </Text>
            {selectedOutfit.note ? (
              <Text style={styles.noteText}> {selectedOutfit.note}</Text>
            ) : null}

            {selectedOutfit.items?.map(item => {
              const cpw = item.purchase_amount > 0 && item.wear_count > 0
                ? (item.purchase_amount / item.wear_count).toFixed(2)
                : null;
              return (
                <View key={item.id} style={styles.itemRow}>
                  {item.processed_image ? (
                    <Image source={{ uri: item.processed_image }} style={styles.itemImage} />
                  ) : (
                    <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                      <Text style={{ fontSize: 18 }}>👕</Text>
                    </View>
                  )}
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.sub_tag}</Text>
                    <Text style={styles.itemMeta}>
                      {item.category} · {item.color} · ¥{item.purchase_amount} · 穿{item.wear_count}次
                    </Text>
                    {cpw && (
                      <View style={styles.cpwBadge}>
                        <Text style={styles.cpwText}>CPW ¥{cpw}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            <Pressable style={styles.deleteBtn} onPress={() => handleDelete(selectedOutfit.id)}>
              <Text style={styles.deleteText}>删除这一天的穿搭</Text>
            </Pressable>
          </View>
        )}

        {/* 空日期 */}
        {selectedDate && !selectedOutfit && !detailLoading && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{selectedDate} 暂无穿搭记录</Text>
            <Pressable onPress={handleAddOutfit} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>去搭配一套</Text>
            </Pressable>
          </View>
        )}

        {/* CPW 排行 */}
        {cpwRanking.length > 0 && (
          <View style={styles.cpwSection}>
            <Text style={styles.sectionTitle}>本月 CPW 排行</Text>
            {cpwRanking.map((item, idx) => (
              <View key={item.id} style={styles.rankRow}>
                <Text style={styles.rankNum}>
                  {['#1', '#2', '#3'][idx] || `#${idx + 1}`}
                </Text>
                <Text style={styles.rankName} numberOfLines={1}>{item.sub_tag}</Text>
                <Text style={styles.rankCpw}>¥{item.cpw}/次</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
  backText: { fontSize: 22, color: '#f59e0b', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  addBtn: { backgroundColor: '#f59e0b', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  monthRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, gap: 20,
  },
  arrowBtn: { padding: 8 },
  arrowText: { fontSize: 16, color: '#f59e0b' },
  monthLabel: { fontSize: 18, fontWeight: '700', color: '#1e293b', minWidth: 100, textAlign: 'center' },
  loadingBox: { alignItems: 'center', paddingVertical: 32 },
  detailCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16,
  },
  detailTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  detailSub: { fontSize: 13, color: '#94a3b8', marginBottom: 8 },
  noteText: {
    fontSize: 14, color: '#475569', fontStyle: 'italic',
    backgroundColor: '#f8fafc', padding: 10, borderRadius: 10, marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  itemImage: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#f8fafc' },
  itemImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  itemMeta: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  cpwBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  cpwText: { fontSize: 12, fontWeight: '700', color: '#d97706' },
  deleteBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 10 },
  deleteText: { fontSize: 13, color: '#ef4444' },
  emptyBox: { alignItems: 'center', paddingVertical: 32, marginTop: 16 },
  emptyText: { fontSize: 14, color: '#94a3b8', marginBottom: 12 },
  emptyBtn: {
    backgroundColor: '#f59e0b', borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cpwSection: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  rankRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  rankNum: { fontSize: 14, fontWeight: '700', color: '#94a3b8', width: 36 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#334155' },
  rankCpw: { fontSize: 14, fontWeight: '700', color: '#d97706' },
});
