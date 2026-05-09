import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Modal,
  Image, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { updateWardrobeItem, deleteWardrobeItem } from '../api/wardrobe';
import { CATEGORIES, CATEGORY_COLORS } from '../utils/constants';

function getImageSource(processedImage) {
  if (!processedImage) return null;
  if (processedImage.startsWith('data:')) {
    return { uri: processedImage };
  }
  return { uri: `data:image/jpeg;base64,${processedImage}` };
}

export default function DetailModal({ visible, item, onClose, onUpdate, onDelete }) {
  const [editMode, setEditMode] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    sub_tag: '',
    category: '',
    color: '',
    purchase_date: '',
    price: '',
    notes: '',
  });

  function enterEdit() {
    if (!item) return;
    setForm({
      sub_tag: item.sub_tag || '',
      category: item.category || '上衣',
      color: item.color || '',
      purchase_date: item.purchase_date || '',
      price: item.price != null ? String(item.price) : '',
      notes: item.notes || '',
    });
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
  }

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.sub_tag.trim()) {
      Alert.alert('请填写名称', '衣物名称不能为空');
      return;
    }
    if (!item) return;
    setSaving(true);
    try {
      const payload = {
        sub_tag: form.sub_tag.trim(),
        category: form.category,
        color: form.color.trim(),
        purchase_date: form.purchase_date || null,
        price: form.price ? parseFloat(form.price) : null,
        notes: form.notes.trim(),
      };
      const result = await updateWardrobeItem(item.id, payload);
      onUpdate?.(item.id, result.data || payload);
      setEditMode(false);
    } catch (err) {
      Alert.alert('保存失败', '请检查网络后重试');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    Alert.alert(
      '确认删除',
      `确定要删除「${item.sub_tag || '这件衣物'}」吗？此操作不可恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            const rollbackItem = { ...item };
            onDelete?.(item.id);
            onClose();
            try {
              await deleteWardrobeItem(item.id);
            } catch (err) {
              onUpdate?.(rollbackItem.id, rollbackItem, true);
              Alert.alert('删除失败', '网络错误，衣物已恢复');
            }
          },
        },
      ],
    );
  }

  async function handleToggle(field) {
    if (!item) return;
    const newValue = item[field] === 1 ? 0 : 1;
    onUpdate?.(item.id, { [field]: newValue });
    try {
      await updateWardrobeItem(item.id, { [field]: newValue });
    } catch (err) {
      const rollbackValue = item[field];
      onUpdate?.(item.id, { [field]: rollbackValue });
      Alert.alert('操作失败', '请检查网络后重试');
    }
  }

  function handleClose() {
    setEditMode(false);
    setImageError(false);
    onClose();
  }

  if (!item) return null;

  const categoryColor = CATEGORY_COLORS[item.category] || '#94a3b8';

  function renderViewMode() {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.imageWrapper}>
          {!imageError && item.processed_image ? (
            <Image
              source={getImageSource(item.processed_image)}
              style={styles.image}
              resizeMode="contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>暂无图片</Text>
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.itemName}>{item.sub_tag || '未命名'}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>分类</Text>
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
              <Text style={styles.categoryBadgeText}>{item.category || '其他'}</Text>
            </View>
          </View>

          {item.color ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>颜色</Text>
              <Text style={styles.infoValue}>{item.color}</Text>
            </View>
          ) : null}

          {item.purchase_date ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>购买日期</Text>
              <Text style={styles.infoValue}>{item.purchase_date}</Text>
            </View>
          ) : null}

          {item.price != null ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>价格</Text>
              <Text style={styles.infoValue}>¥{item.price}</Text>
            </View>
          ) : null}

          {item.notes ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>备注</Text>
              <Text style={styles.infoValue}>{item.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[
              styles.actionBtn,
              item.is_dirty === 1 && styles.actionBtnActive,
            ]}
            onPress={() => handleToggle('is_dirty')}
          >
            <Text
              style={[
                styles.actionBtnText,
                item.is_dirty === 1 && styles.actionBtnTextActive,
              ]}
            >
              {item.is_dirty === 1 ? '🧺 已标记脏衣' : '标记脏衣'}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.actionBtn,
              item.is_unwanted === 1 && styles.actionBtnDanger,
            ]}
            onPress={() => handleToggle('is_unwanted')}
          >
            <Text
              style={[
                styles.actionBtnText,
                item.is_unwanted === 1 && styles.actionBtnTextActive,
              ]}
            >
              {item.is_unwanted === 1 ? '🚫 已标记不要' : '标记不要'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomActions}>
          <Pressable style={styles.editBtn} onPress={enterEdit}>
            <Text style={styles.editBtnText}>编辑</Text>
          </Pressable>
          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>删除</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  function renderEditMode() {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.fieldLabel}>名称</Text>
        <TextInput
          style={styles.input}
          value={form.sub_tag}
          onChangeText={(v) => updateForm('sub_tag', v)}
          placeholder="衣物名称"
          placeholderTextColor="#94a3b8"
        />

        <Text style={styles.fieldLabel}>分类</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.filter((c) => c !== '全部').map((cat) => (
            <Pressable
              key={cat}
              style={[
                styles.chip,
                form.category === cat && styles.chipActive,
              ]}
              onPress={() => updateForm('category', cat)}
            >
              <Text
                style={[
                  styles.chipText,
                  form.category === cat && styles.chipTextActive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>颜色</Text>
        <TextInput
          style={styles.input}
          value={form.color}
          onChangeText={(v) => updateForm('color', v)}
          placeholder="颜色"
          placeholderTextColor="#94a3b8"
        />

        <Text style={styles.fieldLabel}>购买日期</Text>
        <TextInput
          style={styles.input}
          value={form.purchase_date}
          onChangeText={(v) => updateForm('purchase_date', v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#94a3b8"
        />

        <Text style={styles.fieldLabel}>价格（元）</Text>
        <TextInput
          style={styles.input}
          value={form.price}
          onChangeText={(v) => updateForm('price', v)}
          placeholder="0.00"
          placeholderTextColor="#94a3b8"
          keyboardType="decimal-pad"
        />

        <Text style={styles.fieldLabel}>备注</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={form.notes}
          onChangeText={(v) => updateForm('notes', v)}
          placeholder="备注信息（选填）"
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={3}
        />

        <View style={styles.editActions}>
          <Pressable style={styles.cancelBtn} onPress={cancelEdit}>
            <Text style={styles.cancelBtnText}>取消</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? '保存中...' : '保存'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modal}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>关闭</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {editMode ? '编辑衣物' : '衣物详情'}
          </Text>
          <View style={styles.headerBtn} />
        </View>
        {editMode ? renderEditMode() : renderViewMode()}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: '#f8f9fc',
  },
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
  headerBtn: {
    minWidth: 50,
    paddingVertical: 4,
  },
  headerBtnText: {
    fontSize: 16,
    color: '#6366f1',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  imageWrapper: {
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
    fontSize: 15,
  },
  infoSection: {
    padding: 20,
  },
  itemName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 15,
    color: '#64748b',
  },
  infoValue: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionBtnActive: {
    backgroundColor: '#eef2ff',
    borderColor: '#6366f1',
  },
  actionBtnDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  actionBtnTextActive: {
    color: '#1e293b',
  },
  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 12,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
  },
  editBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 14,
    paddingHorizontal: 20,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginHorizontal: 20,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  chipActive: {
    backgroundColor: '#6366f1',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  chipTextActive: {
    color: '#fff',
  },
  editActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
