import { useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { CATEGORY_COLORS } from '../utils/constants';

function getImageSource(processedImage) {
  if (!processedImage) return null;
  if (processedImage.startsWith('data:')) {
    return { uri: processedImage };
  }
  return { uri: `data:image/jpeg;base64,${processedImage}` };
}

export default function ClothingCard({ item, onPress, multiSelect, isSelected }) {
  const [imageError, setImageError] = useState(false);
  const categoryColor = CATEGORY_COLORS[item.category] || '#94a3b8';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && !multiSelect && styles.cardPressed,
        multiSelect && isSelected && styles.cardSelected,
      ]}
      onPress={() => onPress?.(item)}
    >
      <View style={styles.imageContainer}>
        {!imageError && item.processed_image ? (
          <Image
            source={getImageSource(item.processed_image)}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderText}>暂无图片</Text>
          </View>
        )}
        {!multiSelect && item.is_dirty === 1 && (
          <View style={styles.dirtyBadge}>
            <View style={styles.dirtyDot} />
          </View>
        )}

        {/* 多选勾选框 */}
        {multiSelect && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}

        {/* 多选模式下已选遮罩 */}
        {multiSelect && isSelected && (
          <View style={styles.selectedOverlay} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {item.sub_tag || '未命名'}
        </Text>
        <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
          <Text style={styles.categoryText}>{item.category || '其他'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  cardSelected: {
    borderWidth: 2.5,
    borderColor: '#6366f1',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#f1f5f9',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  dirtyBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirtyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  info: {
    padding: 10,
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
});
