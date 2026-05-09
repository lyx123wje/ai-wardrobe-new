import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  Pressable, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fetchWardrobe, updateWardrobeItem, markAllClean } from '../src/api/wardrobe';
import { CATEGORY_COLORS } from '../src/utils/constants';
import DetailModal from '../src/components/DetailModal';

function getImageSource(image) {
  if (!image) return null;
  if (image.startsWith('data:')) return { uri: image };
  return { uri: `data:image/jpeg;base64,${image}` };
}

function ensureArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

export default function LaundryBasketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [dirtyItems, setDirtyItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // ── 获取脏衣 ──
  const fetchDirtyItems = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await fetchWardrobe({ is_dirty: 1 });
      setDirtyItems(ensureArray(res.data));
    } catch (err) {
      Alert.alert('加载失败', '请检查网络后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDirtyItems(); }, [fetchDirtyItems]);

  // ── 单件清洗（乐观更新） ──
  const handleWashItem = async (id) => {
    const originalItems = [...dirtyItems];
    setDirtyItems((prev) => prev.filter((item) => item.id !== id));

    try {
      await updateWardrobeItem(id, { is_dirty: 0 });
    } catch (err) {
      setDirtyItems(originalItems);
      Alert.alert('操作失败', '标记清洗失败，请检查网络');
    }
  };

  // ── 一键全洗 ──
  const handleWashAll = () => {
    if (dirtyItems.length === 0) return;
    Alert.alert(
      '全洗好了吗？',
      `确定要把 ${dirtyItems.length} 件衣物全部标记为已清洗吗？`,
      [
        { text: '还没', style: 'cancel' },
        {
          text: '是的',
          onPress: async () => {
            try {
              await markAllClean();
              setDirtyItems([]);
              Alert.alert('成功', '所有衣物已回到衣柜！');
            } catch (err) {
              Alert.alert('失败', '操作失败，请检查网络');
            }
          },
        },
      ],
    );
  };

  // ── 更新/删除回调（来自 DetailModal） ──
  function handleUpdateItem(id, updates, isRollback = false) {
    setDirtyItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updates } : it)),
    );
  }

  function handleDeleteItem(id) {
    setDirtyItems((prev) => prev.filter((it) => it.id !== id));
  }

  // ── 渲染列表项 ──
  const renderItem = ({ item }) => {
    const catColor = CATEGORY_COLORS[item.category] || '#94a3b8';
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => setSelectedItem(item)}
      >
        <View style={styles.thumbWrap}>
          {item.processed_image ? (
            <Image
              source={getImageSource(item.processed_image)}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Text style={styles.thumbPlaceholderText}>?</Text>
            </View>
          )}
        </View>

        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.sub_tag || '未命名'}
          </Text>
          <View style={styles.itemMeta}>
            <View style={[styles.catBadge, { backgroundColor: catColor }]}>
              <Text style={styles.catBadgeText}>{item.category || '其他'}</Text>
            </View>
            {item.color ? (
              <Text style={styles.colorText}>{item.color}</Text>
            ) : null}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.washBtn, pressed && styles.washBtnPressed]}
          onPress={() => handleWashItem(item.id)}
        >
          <Text style={styles.washBtnText}>已清洗</Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>← 返回</Text>
        </Pressable>
        <Text style={styles.headerTitle}>脏衣篓</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{dirtyItems.length} 件</Text>
        </View>
      </View>

      {/* 列表 */}
      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={styles.loading} />
      ) : (
        <FlatList
          data={dirtyItems}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.listContent,
            dirtyItems.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchDirtyItems(true); }}
              tintColor="#6366f1"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🧺</Text>
              <Text style={styles.emptyText}>暂无脏衣，真干净！</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 底部一键全洗 */}
      {dirtyItems.length > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.footerBtn,
            pressed && styles.footerBtnPressed,
          ]}
          onPress={handleWashAll}
        >
          <Text style={styles.footerBtnText}>
            全部洗好了 ({dirtyItems.length} 件)
          </Text>
        </Pressable>
      )}

      {/* 详情模态框 */}
      <DetailModal
        visible={selectedItem !== null}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onUpdate={handleUpdateItem}
        onDelete={handleDeleteItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backText: { fontSize: 16, color: '#6366f1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  countBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  loading: { marginTop: 80 },
  listContent: { padding: 12 },
  listContentEmpty: { flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardPressed: { opacity: 0.85 },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  thumbnail: { width: 64, height: 64 },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  thumbPlaceholderText: { color: '#94a3b8', fontSize: 20 },
  itemInfo: { flex: 1, marginLeft: 14, marginRight: 8 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  catBadgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  colorText: { fontSize: 13, color: '#64748b' },
  washBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  washBtnPressed: { opacity: 0.75 },
  washBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  footerBtn: {
    marginHorizontal: 20,
    marginBottom: 30,
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  footerBtnPressed: { opacity: 0.85 },
  footerBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  emptyBox: { marginTop: 120, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, color: '#94a3b8', fontWeight: '500' },
});
