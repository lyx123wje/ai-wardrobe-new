import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { shareWardrobe } from '../api/collab';
import { getToken } from '../services/auth';
import { getUser } from '../services/auth';

function getImageSource(raw) {
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('http')) {
    return { uri: raw };
  }
  return { uri: `data:image/png;base64,${raw}` };
}

export default function ShareWardrobeSheet({ visible, items, onClose, onShared }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  const toggleItem = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleShare = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    try {
      const token = await getToken();
      const user = await getUser();
      await shareWardrobe(user.user_id, [...selectedIds], token);
      onShared([...selectedIds]);
    } catch (e) {
      console.error('Share wardrobe failed:', e);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>分享衣柜给好友</Text>
          <Pressable onPress={toggleAll}>
            <Text style={styles.toggleAllText}>
              {selectedIds.size === items.length ? '取消全选' : '全选'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          已选 {selectedIds.size}/{items.length} 件
        </Text>

        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            return (
              <Pressable
                style={[styles.item, selected && styles.itemSelected]}
                onPress={() => toggleItem(item.id)}
              >
                <Image
                  source={getImageSource(item.processed_image)}
                  style={styles.image}
                  resizeMode="contain"
                />
                <Text style={styles.name} numberOfLines={1}>
                  {item.sub_tag || item.name || ''}
                </Text>
                {selected && (
                  <View style={styles.checkBadge}>
                    <Text style={styles.checkText}>✓</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>暂无衣物可分享</Text>
            </View>
          }
        />

        <View style={styles.actions}>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmBtn, (selectedIds.size === 0 || loading) && styles.btnDisabled]}
            onPress={handleShare}
            disabled={selectedIds.size === 0 || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.confirmText}>分享</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '70%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  toggleAllText: {
    fontSize: 13,
    color: '#6366f1',
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  grid: {
    paddingBottom: 16,
  },
  item: {
    width: '31%',
    margin: '1%',
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  itemSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#EEF2FF',
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  name: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 4,
    maxWidth: 80,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
