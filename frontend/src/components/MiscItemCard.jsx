import { useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { CATEGORY_COLORS } from '../utils/constants';

function getImageSource(image) {
  if (!image) return null;
  if (image.startsWith('data:')) {
    return { uri: image };
  }
  return { uri: `data:image/jpeg;base64,${image}` };
}

export default function MiscItemCard({ item, onPress }) {
  const [imageError, setImageError] = useState(false);
  const miscColor = CATEGORY_COLORS['杂物'] || '#8B7355';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress?.(item)}
    >
      <View style={styles.imageContainer}>
        {!imageError && item.image ? (
          <Image
            source={getImageSource(item.image)}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderText}>暂无图片</Text>
          </View>
        )}
        {item.location ? (
          <View style={styles.locationBadge}>
            <Text style={styles.locationIcon}>📍</Text>
          </View>
        ) : null}
        {item.is_lost === 1 && (
          <View style={styles.lostBadge}>
            <Text style={styles.lostText}>丢失</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name || '未命名'}
        </Text>
        <View style={styles.row}>
          {item.location ? (
            <View style={[styles.tag, { backgroundColor: miscColor + '20' }]}>
              <Text style={[styles.tagText, { color: miscColor }]}>📍 {item.location}</Text>
            </View>
          ) : null}
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
  locationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationIcon: {
    fontSize: 14,
  },
  lostBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#ef4444',
  },
  lostText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
