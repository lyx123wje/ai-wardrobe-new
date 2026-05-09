import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Animated,
  FlatList, ScrollView, ActivityIndicator, Alert, Modal, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fetchWardrobe, updateWardrobeItem, deleteWardrobeItem } from '../src/api/wardrobe';
import { fetchMiscItems, updateMiscItem, deleteMiscItem } from '../src/api/misc';
import { CATEGORIES } from '../src/utils/constants';
import ClothingCard from '../src/components/ClothingCard';
import MiscItemCard from '../src/components/MiscItemCard';
import AddItemModal from '../src/components/AddItemModal';
import DetailModal from '../src/components/DetailModal';
import MiscAddModal from '../src/components/MiscAddModal';
import ButlerChat from '../src/components/ButlerChat';

export default function WardrobeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState([]);
  const [miscItems, setMiscItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedMiscItem, setSelectedMiscItem] = useState(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [miscAddModalVisible, setMiscAddModalVisible] = useState(false);
  const [butlerVisible, setButlerVisible] = useState(false);

  // 多选模式（仅衣物）
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // FAB 展开/收起
  const [fabExpanded, setFabExpanded] = useState(false);
  const fabAnim = useState(new Animated.Value(0))[0];
  const isMisc = activeCategory === '杂物';

  function ensureArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }

  // ── 加载衣物 ──
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

  // ── 加载杂物 ──
  const loadMisc = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await fetchMiscItems();
      setMiscItems(ensureArray(res.data));
    } catch (err) {
      Alert.alert(isRefresh ? '刷新失败' : '加载失败', '请检查网络后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWardrobe();
    loadMisc();
  }, [loadWardrobe, loadMisc]);

  // ── 搜索过滤 ──
  const filteredItems = useMemo(() => {
    if (isMisc) {
      let result = miscItems;
      if (searchText.trim()) {
        const kw = searchText.trim().toLowerCase();
        result = result.filter((i) =>
          (i.name || '').toLowerCase().includes(kw) ||
          (i.location || '').toLowerCase().includes(kw) ||
          (i.notes || '').toLowerCase().includes(kw)
        );
      }
      return result;
    }

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
  }, [items, miscItems, activeCategory, searchText, isMisc]);

  // ── 单选（衣物） ──
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

  // ── 杂物操作 ──
  function handleMiscPress(item) {
    setSelectedMiscItem(item);
  }

  function handleMiscUpdate(id, updates, isRollback = false) {
    setMiscItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.map((it) => (it.id === id ? { ...it, ...updates } : it));
    });
    if (!isRollback && selectedMiscItem?.id === id) {
      setSelectedMiscItem((prev) => (prev ? { ...prev, ...updates } : prev));
    }
  }

  function handleMiscDelete(id) {
    setMiscItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.filter((it) => it.id !== id);
    });
    setSelectedMiscItem(null);
  }

  function handleMiscSaved(newItem) {
    if (!newItem) { setMiscAddModalVisible(false); return; }
    setMiscItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return [newItem, ...arr];
    });
    setMiscAddModalVisible(false);
  }

  // ── 多选（衣物） ──
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

  // ── FAB 动画 ──
  function toggleFab() {
    const toValue = fabExpanded ? 0 : 1;
    setFabExpanded(!fabExpanded);
    Animated.spring(fabAnim, {
      toValue,
      useNativeDriver: true,
      tension: 200,
      friction: 15,
    }).start();
  }

  function collapseFab() {
    if (fabExpanded) {
      setFabExpanded(false);
      Animated.spring(fabAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 200,
        friction: 15,
      }).start();
    }
  }

  // ── 管家 actions 回调 ──
  function handleButlerActions(actions) {
    // 刷新数据以反映 AI 做过的修改
    loadWardrobe();
    loadMisc();
  }

  // ── 空状态 ──
  function renderEmpty() {
    if (loading) return null;
    const isFiltered = searchText.trim().length > 0 || (activeCategory !== '全部' && activeCategory !== '杂物');
    const isEmptyMisc = isMisc && miscItems.length === 0 && !isFiltered;
    const isEmptyWardrobe = !isMisc && items.length === 0 && !isFiltered;

    if (isEmptyMisc) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>杂物栏还是空的</Text>
          <Text style={styles.emptySub}>添加第一件杂物吧</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>{isFiltered ? '🔍' : '👔'}</Text>
        <Text style={styles.emptyTitle}>{isFiltered ? '无匹配结果' : '衣柜还是空的'}</Text>
        <Text style={styles.emptySub}>
          {isFiltered ? '尝试更换筛选条件或搜索关键词' : '添加第一件衣物吧'}
        </Text>
      </View>
    );
  }

  function renderCategoryChip(category) {
    const isActive = activeCategory === category;
    const isMiscCat = category === '杂物';
    return (
      <Pressable
        key={category}
        style={[
          styles.chip,
          isActive && styles.chipActive,
          isMiscCat && isActive && { backgroundColor: '#8B7355' },
        ]}
        onPress={() => {
          setActiveCategory(category);
          exitMultiSelect();
          collapseFab();
        }}
      >
        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{category}</Text>
      </Pressable>
    );
  }

  // ── 杂物编辑 Modal（simple inline modal） ──
  function renderMiscDetailModal() {
    if (!selectedMiscItem) return null;
    return (
      <Modal visible={true} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedMiscItem(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSelectedMiscItem(null)} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>关闭</Text>
            </Pressable>
            <Text style={styles.headerTitle}>杂物详情</Text>
            <View style={styles.headerBtn} />
          </View>
          <ScrollView contentContainerStyle={styles.miscDetailContent}>
            {selectedMiscItem.image ? (
              <Image
                source={{
                  uri: selectedMiscItem.image.startsWith('data:')
                    ? selectedMiscItem.image
                    : `data:image/jpeg;base64,${selectedMiscItem.image}`,
                }}
                style={styles.miscDetailImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.miscDetailImageEmpty}>
                <Text style={{ color: '#94a3b8', fontSize: 14 }}>暂无图片</Text>
              </View>
            )}

            <View style={styles.miscDetailRow}>
              <Text style={styles.miscDetailLabel}>名称</Text>
              <TextInput
                style={styles.miscDetailInput}
                value={selectedMiscItem.name}
                onChangeText={(v) => setSelectedMiscItem((prev) => prev ? { ...prev, name: v } : prev)}
              />
            </View>
            <View style={styles.miscDetailRow}>
              <Text style={styles.miscDetailLabel}>位置</Text>
              <TextInput
                style={styles.miscDetailInput}
                value={selectedMiscItem.location || ''}
                onChangeText={(v) => setSelectedMiscItem((prev) => prev ? { ...prev, location: v } : prev)}
                placeholder="存放位置..."
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.miscDetailRow}>
              <Text style={styles.miscDetailLabel}>备注</Text>
              <TextInput
                style={[styles.miscDetailInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={selectedMiscItem.notes || ''}
                onChangeText={(v) => setSelectedMiscItem((prev) => prev ? { ...prev, notes: v } : prev)}
                placeholder="备注..."
                placeholderTextColor="#94a3b8"
                multiline
              />
            </View>

            <View style={styles.miscDetailBtns}>
              <Pressable
                style={styles.miscSaveBtn}
                onPress={async () => {
                  try {
                    await updateMiscItem(selectedMiscItem.id, {
                      name: selectedMiscItem.name,
                      location: selectedMiscItem.location || '',
                      notes: selectedMiscItem.notes || '',
                    });
                    setMiscItems((prev) =>
                      prev.map((it) => (it.id === selectedMiscItem.id ? { ...selectedMiscItem } : it))
                    );
                    setSelectedMiscItem(null);
                  } catch { Alert.alert('保存失败'); }
                }}
              >
                <Text style={styles.miscSaveBtnText}>保存</Text>
              </Pressable>
              <Pressable
                style={styles.miscDeleteBtn}
                onPress={() => {
                  Alert.alert('确认删除', `确定删除「${selectedMiscItem.name}」吗？`, [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '删除', style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteMiscItem(selectedMiscItem.id);
                          handleMiscDelete(selectedMiscItem.id);
                        } catch { Alert.alert('删除失败'); }
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.miscDeleteBtnText}>删除</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
            <Text style={styles.headerTitle}>{isMisc ? '杂物' : '衣柜'}</Text>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {/* 管家按钮 */}
              <Pressable style={styles.butlerBtn} onPress={() => setButlerVisible(true)}>
                <Text style={styles.butlerBtnText}>🤖</Text>
              </Pressable>
              {/* 多选按钮（杂物模式隐藏） */}
              {!isMisc && (
                <Pressable style={styles.multiSelectBtn} onPress={enterMultiSelect}>
                  <Text style={styles.multiSelectBtnText}>多选</Text>
                </Pressable>
              )}
            </View>
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
            placeholder={isMisc ? '搜索杂物（名称/位置/备注）...' : '搜索衣物...'}
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
          <ActivityIndicator size="large" color={isMisc ? '#8B7355' : '#6366f1'} />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          renderItem={({ item }) =>
            isMisc ? (
              <MiscItemCard item={item} onPress={handleMiscPress} />
            ) : (
              <ClothingCard
                item={item}
                onPress={handleItemPress}
                multiSelect={multiSelectMode}
                isSelected={selectedIds.has(item.id)}
              />
            )
          }
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            filteredItems.length === 0 && styles.listContentEmpty,
            multiSelectMode && { paddingBottom: 80 },
          ]}
          columnWrapperStyle={filteredItems.length > 0 ? styles.row : undefined}
          onRefresh={() => {
            if (isMisc) loadMisc(true);
            else loadWardrobe(true);
          }}
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

      {/* Dual FAB */}
      {!multiSelectMode && (
        <View style={[styles.fabGroup, { bottom: insets.bottom + 20 }]}>
          {/* 衣物添加按钮（展开时显示） */}
          <Animated.View
            style={{
              opacity: fabAnim,
              transform: [
                {
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
                { scale: fabAnim },
              ],
              pointerEvents: fabExpanded ? 'auto' : 'none',
            }}
          >
            <Pressable
              style={[styles.fab, styles.fabMain]}
              onPress={() => {
                setAddModalVisible(true);
                collapseFab();
              }}
            >
              <Text style={styles.fabIcon}>👔</Text>
            </Pressable>
          </Animated.View>

          {/* 杂物添加按钮（展开时显示） */}
          <Animated.View
            style={{
              opacity: fabAnim,
              transform: [
                {
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
                { scale: fabAnim },
              ],
              pointerEvents: fabExpanded ? 'auto' : 'none',
            }}
          >
            <Pressable
              style={[styles.fab, styles.fabMisc]}
              onPress={() => {
                setMiscAddModalVisible(true);
                collapseFab();
              }}
            >
              <Text style={styles.fabIconMisc}>📦</Text>
            </Pressable>
          </Animated.View>

          {/* 主切换按钮：＋展开 → ✕收起 */}
          <Pressable
            style={[styles.fab, styles.fabToggle]}
            onPress={() => {
              if (fabExpanded) {
                collapseFab();
              } else if (isMisc) {
                setMiscAddModalVisible(true);
              } else {
                toggleFab();
              }
            }}
          >
            <Text style={styles.fabText}>{fabExpanded ? '✕' : '＋'}</Text>
          </Pressable>
        </View>
      )}

      {/* Modals */}
      <AddItemModal visible={addModalVisible} onClose={() => setAddModalVisible(false)} onSaved={handleAddSaved} />
      <DetailModal visible={selectedItem !== null} item={selectedItem} onClose={handleCloseDetail} onUpdate={handleUpdateItem} onDelete={handleDeleteItem} />
      <MiscAddModal visible={miscAddModalVisible} onClose={() => setMiscAddModalVisible(false)} onSaved={handleMiscSaved} />
      <ButlerChat visible={butlerVisible} onClose={() => setButlerVisible(false)} onActionExecuted={handleButlerActions} />
      {renderMiscDetailModal()}
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
  butlerBtn: {
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  butlerBtnText: { fontSize: 18 },
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
  // Dual FAB
  fabGroup: {
    position: 'absolute', right: 20, alignItems: 'center',
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  fabMain: {
    backgroundColor: '#6366f1',
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  fabMisc: {
    backgroundColor: '#8B7355',
    shadowColor: '#8B7355', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  fabToggle: {
    backgroundColor: '#6366f1',
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  fabIcon: { fontSize: 24 },
  fabIconMisc: { fontSize: 22 },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 30 },
  // 杂物详情 Modal
  modal: { flex: 1, backgroundColor: '#f8f9fc' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  headerBtn: { minWidth: 50, paddingVertical: 4 },
  headerBtnText: { fontSize: 16, color: '#6366f1' },
  miscDetailContent: { padding: 20, paddingBottom: 40 },
  miscDetailImage: {
    width: '100%', height: 200, borderRadius: 12, backgroundColor: '#f1f5f9',
    marginBottom: 20,
  },
  miscDetailImageEmpty: {
    width: '100%', height: 200, borderRadius: 12, backgroundColor: '#f1f5f9',
    marginBottom: 20, alignItems: 'center', justifyContent: 'center',
  },
  miscDetailRow: { marginBottom: 16 },
  miscDetailLabel: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6 },
  miscDetailInput: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    fontSize: 15, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0',
  },
  miscDetailBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
  miscSaveBtn: {
    flex: 1, backgroundColor: '#8B7355', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  miscSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  miscDeleteBtn: {
    flex: 1, backgroundColor: '#fef2f2', borderRadius: 12, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#fecaca',
  },
  miscDeleteBtnText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
});
