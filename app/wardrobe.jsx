import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable,
  FlatList, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fetchWardrobe, updateWardrobeItem, deleteWardrobeItem } from '../src/api/wardrobe';
import { CATEGORIES } from '../src/utils/constants';
import ClothingCard from '../src/components/ClothingCard';
import AddItemModal from '../src/components/AddItemModal';
import DetailModal from '../src/components/DetailModal';

export default function WardrobeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');

  const [selectedItem, setSelectedItem] = useState(null);
  const [addModalVisible, setAddModalVisible] = useState(false);

  // 多选模式
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  function ensureArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }

  const loadWardrobe = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await fetchWardrobe();
      setItems(ensureArray(res.data));
    } catch (err) {
      Alert.alert(isRefresh ? '刷新失败' : '加载失败', '请检查网络后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadWardrobe(); }, [loadWardrobe]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeCategory !== '全部') {
      result = result.filter((i) => i.category === activeCategory);
    }
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase();
      result = result.filter((i) =>
        (i.sub_tag || '').toLowerCase().includes(kw) ||
        (i.color || '').toLowerCase().includes(kw) ||
        (i.category || '').toLowerCase().includes(kw) ||
        (i.notes || '').toLowerCase().includes(kw)
      );
    }
    return result;
  }, [items, activeCategory, searchText]);

  // ── 单选 ──
  function handleItemPress(item) {
    if (multiSelectMode) {
      toggleSelect(item.id);
    } else {
      setSelectedItem(item);
    }
  }
  function handleCloseDetail() { setSelectedItem(null); }

  function handleUpdateItem(id, updates, isRollback = false) {
    setItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.map((it) => (it.id === id ? { ...it, ...updates } : it));
    });
    if (!isRollback && selectedItem?.id === id) {
      setSelectedItem((prev) => (prev ? { ...prev, ...updates } : prev));
    }
  }

  function handleDeleteItem(id) {
    setItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.filter((it) => it.id !== id);
    });
  }

  function handleAddSaved(newItem) {
    if (!newItem) { setAddModalVisible(false); return; }
    setItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return [newItem, ...arr];
    });
    setAddModalVisible(false);
  }

  // ── 多选 ──
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allIds = new Set(filteredItems.map((i) => i.id));
    if (selectedIds.size === allIds.size && allIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(allIds);
    }
  }

  function enterMultiSelect() {
    setMultiSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitMultiSelect() {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
  }

  // ── 批量操作 ──
  async function batchMarkDirty() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const rollbackItems = items.filter((i) => ids.includes(i.id));
    setItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.map((it) => ids.includes(it.id) ? { ...it, is_dirty: 1 } : it);
    });
    exitMultiSelect();
    for (const id of ids) {
      try { await updateWardrobeItem(id, { is_dirty: 1 }); } catch {}
    }
  }

  async function batchMarkUnwanted() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.map((it) => ids.includes(it.id) ? { ...it, is_unwanted: 1 } : it);
    });
    exitMultiSelect();
    for (const id of ids) {
      try { await updateWardrobeItem(id, { is_unwanted: 1 }); } catch {}
    }
  }

  function batchDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    Alert.alert(
      '批量删除',
      `确定要删除选中的 ${ids.length} 件衣物吗？此操作不可恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            const rollbackItems = items.filter((i) => ids.includes(i.id));
            setItems((prev) => {
              const arr = Array.isArray(prev) ? prev : [];
              return arr.filter((it) => !ids.includes(it.id));
            });
            exitMultiSelect();
            let hasError = false;
            for (const id of ids) {
              try { await deleteWardrobeItem(id); } catch { hasError = true; }
            }
            if (hasError) {
              setItems((prev) => [...rollbackItems, ...prev]);
              Alert.alert('删除失败', '部分衣物删除失败，已恢复');
            }
          },
        },
      ],
    );
  }

  // ── 空状态 ──
  function renderEmpty() {
    if (loading) return null;
    const isFiltered = activeCategory !== '全部' || searchText.trim().length > 0;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>{isFiltered ? '🔍' : '👔'}</Text>
        <Text style={styles.emptyTitle}>{isFiltered ? '无匹配衣物' : '衣柜还是空的'}</Text>
        <Text style={styles.emptySub}>
          {isFiltered ? '尝试更换筛选条件或搜索关键词' : '添加第一件衣物吧'}
        </Text>
      </View>
    );
  }

  function renderCategoryChip(category) {
    const isActive = activeCategory === category;
    return (
      <Pressable
        key={category}
        style={[styles.chip, isActive && styles.chipActive]}
        onPress={() => setActiveCategory(category)}
      >
        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{category}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {multiSelectMode ? (
          <>
            <Pressable style={styles.backBtn} onPress={toggleSelectAll}>
              <Text style={styles.backBtnText}>
                {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? '取消全选' : '全选'}
              </Text>
            </Pressable>
            <Text style={styles.headerTitle}>已选 {selectedIds.size} 件</Text>
            <Pressable style={styles.multiDoneBtn} onPress={exitMultiSelect}>
              <Text style={styles.multiDoneBtnText}>完成</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>← 返回</Text>
            </Pressable>
            <Text style={styles.headerTitle}>衣柜</Text>
            <Pressable style={styles.multiSelectBtn} onPress={enterMultiSelect}>
              <Text style={styles.multiSelectBtnText}>多选</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Search */}
      {!multiSelectMode && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="搜索衣物..."
            placeholderTextColor="#94a3b8"
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <Pressable style={styles.clearBtn} onPress={() => setSearchText('')}>
              <Text style={styles.clearBtnText}>✕</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Category Filter */}
      {!multiSelectMode && (
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            {CATEGORIES.map(renderCategoryChip)}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          renderItem={({ item }) => (
            <ClothingCard
              item={item}
              onPress={handleItemPress}
              multiSelect={multiSelectMode}
              isSelected={selectedIds.has(item.id)}
            />
          )}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            filteredItems.length === 0 && styles.listContentEmpty,
            multiSelectMode && { paddingBottom: 80 },
          ]}
          columnWrapperStyle={filteredItems.length > 0 ? styles.row : undefined}
          onRefresh={() => loadWardrobe(true)}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 底部批量操作栏 */}
      {multiSelectMode && selectedIds.size > 0 && (
        <View style={[styles.batchBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.batchBtn} onPress={batchMarkDirty}>
            <Text style={styles.batchBtnText}>标记脏衣</Text>
          </Pressable>
          <Pressable style={[styles.batchBtn, styles.batchBtnWarn]} onPress={batchMarkUnwanted}>
            <Text style={[styles.batchBtnText, { color: '#d97706' }]}>标记不要</Text>
          </Pressable>
          <Pressable style={[styles.batchBtn, styles.batchBtnDanger]} onPress={batchDelete}>
            <Text style={[styles.batchBtnText, { color: '#ef4444' }]}>删除</Text>
          </Pressable>
        </View>
      )}

      {/* FAB */}
      {!multiSelectMode && (
        <Pressable style={[styles.fab, { bottom: insets.bottom + 20 }]} onPress={() => setAddModalVisible(true)}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}

      {/* Modals */}
      <AddItemModal visible={addModalVisible} onClose={() => setAddModalVisible(false)} onSaved={handleAddSaved} />
      <DetailModal visible={selectedItem !== null} item={selectedItem} onClose={handleCloseDetail} onUpdate={handleUpdateItem} onDelete={handleDeleteItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { paddingVertical: 4, paddingRight: 12 },
  backBtnText: { fontSize: 16, color: '#6366f1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  multiSelectBtn: { paddingVertical: 4 },
  multiSelectBtnText: { fontSize: 16, color: '#6366f1', fontWeight: '500' },
  multiDoneBtn: {
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: 6,
    backgroundColor: '#6366f1',
  },
  multiDoneBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, padding: 12, fontSize: 15, color: '#1e293b' },
  clearBtn: { padding: 12 },
  clearBtnText: { fontSize: 14, color: '#94a3b8' },
  filterBar: { paddingVertical: 10 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#6366f1' },
  chipText: { fontSize: 14, fontWeight: '500', color: '#475569' },
  chipTextActive: { color: '#fff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#64748b' },
  listContent: { padding: 4 },
  listContentEmpty: { flexGrow: 1 },
  row: { justifyContent: 'flex-start' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  // 批量操作栏
  batchBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 8,
  },
  batchBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#f1f5f9', alignItems: 'center',
  },
  batchBtnWarn: { backgroundColor: '#fef3c7' },
  batchBtnDanger: { backgroundColor: '#fef2f2' },
  batchBtnText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  // FAB
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 30 },
});
