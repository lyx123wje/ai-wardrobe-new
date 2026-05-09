import { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Modal,
  ActivityIndicator, ScrollView, KeyboardAvoidingView,
  Platform, Alert, Image, FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { processClothingBase64 } from '../api/portraits';
import { createWardrobeItem } from '../api/wardrobe';
import { CATEGORIES } from '../utils/constants';

const STEPS = {
  PICKING: 'picking',
  PROCESSING: 'processing',
  REVIEW: 'review',
  SAVING: 'saving',
};

export default function AddItemModal({ visible, onClose, onSaved }) {
  const [step, setStep] = useState(STEPS.PICKING);
  const [pendingImages, setPendingImages] = useState([]);
  const [processedBatch, setProcessedBatch] = useState([]);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [savingIndex, setSavingIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState(null);

  // 用于在异步循环中中断
  const cancelledRef = useRef(false);

  function reset() {
    cancelledRef.current = false;
    setStep(STEPS.PICKING);
    setPendingImages([]);
    setProcessedBatch([]);
    setProcessingIndex(0);
    setSavingIndex(0);
    setExpandedIndex(null);
  }

  function handleClose() {
    cancelledRef.current = true;
    reset();
    onClose();
  }

  // ── 选图 ──
  async function pickFromGallery() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('权限不足', '需要访问相册权限才能选择图片');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
        allowsMultipleSelection: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const newImages = result.assets.map((a) => ({ uri: a.uri, base64: a.base64 }));
      setPendingImages((prev) => [...prev, ...newImages]);
    } catch (err) {
      Alert.alert('选图失败', '请重试');
    }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('权限不足', '需要访问相机权限才能拍照');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPendingImages((prev) => [...prev, { uri: asset.uri, base64: asset.base64 }]);
    } catch (err) {
      Alert.alert('拍照失败', '请重试');
    }
  }

  function removePendingImage(index) {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }

  // ── AI 批量识别 ──
  async function startProcessing() {
    if (pendingImages.length === 0) return;
    cancelledRef.current = false;
    setStep(STEPS.PROCESSING);
    const results = [];
    for (let i = 0; i < pendingImages.length; i++) {
      if (cancelledRef.current) return;
      setProcessingIndex(i);
      const img = pendingImages[i];
      try {
        const res = await processClothingBase64(img.base64);
        const data = res.data;
        results.push({
          uri: img.uri,
          base64: img.base64,
          aiResult: data,
          form: {
            sub_tag: data.sub_tag || '',
            category: data.category || '上衣',
            color: data.color || '',
            purchase_date: data.purchase_date || '',
            price: data.price != null ? String(data.price) : '',
            notes: data.notes || '',
          },
        });
      } catch (err) {
        results.push({
          uri: img.uri,
          base64: img.base64,
          aiResult: null,
          aiError: true,
          form: { sub_tag: '', category: '上衣', color: '', purchase_date: '', price: '', notes: '' },
        });
      }
    }
    setProcessedBatch(results);
    setStep(STEPS.REVIEW);
  }

  // ── 编辑单项 ──
  function updateItemForm(index, key, value) {
    setProcessedBatch((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, form: { ...item.form, [key]: value } } : item,
      ),
    );
  }

  function removeProcessedItem(index) {
    setProcessedBatch((prev) => prev.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
  }

  // ── 批量保存 ──
  async function handleSaveAll() {
    const toSave = processedBatch.filter((item) => item.form.sub_tag.trim());
    if (toSave.length === 0) {
      Alert.alert('请填写名称', '至少有一件衣物需要填写名称');
      return;
    }
    cancelledRef.current = false;
    setStep(STEPS.SAVING);
    setSavingIndex(0);
    for (let i = 0; i < toSave.length; i++) {
      if (cancelledRef.current) return;
      setSavingIndex(i);
      const item = toSave[i];
      try {
        const payload = {
          sub_tag: item.form.sub_tag.trim(),
          category: item.form.category,
          color: item.form.color.trim(),
          purchase_date: item.form.purchase_date || null,
          price: item.form.price ? parseFloat(item.form.price) : null,
          notes: item.form.notes.trim(),
          processed_image: item.aiResult?.processed_image_base64 || item.base64 || null,
        };
        const result = await createWardrobeItem(payload);
        const savedItem = result.data?.item || result.data?.data || result.data;
        onSaved?.(savedItem);
      } catch (err) {
        Alert.alert('保存失败', `第 ${i + 1} 件保存失败，请检查网络`);
      }
    }
    reset();
    onClose();
  }

  // ── 渲染 ──
  function renderPickingStep() {
    return (
      <View style={styles.stepContainer}>
        <ScrollView contentContainerStyle={styles.pickingContent}>
          {/* 选图按钮 */}
          <View style={styles.pickButtons}>
            <Pressable style={styles.pickBtn} onPress={takePhoto}>
              <Text style={styles.pickBtnIcon}>📷</Text>
              <Text style={styles.pickBtnLabel}>拍照</Text>
            </Pressable>
            <Pressable style={styles.pickBtn} onPress={pickFromGallery}>
              <Text style={styles.pickBtnIcon}>🖼️</Text>
              <Text style={styles.pickBtnLabel}>从相册选择</Text>
            </Pressable>
          </View>

          {/* 已选图片预览 */}
          {pendingImages.length > 0 && (
            <>
              <Text style={styles.countLabel}>已选 {pendingImages.length} 张</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
                {pendingImages.map((img, i) => (
                  <View key={i} style={styles.thumbWrap}>
                    <Image source={{ uri: img.uri }} style={styles.thumb} />
                    <Pressable style={styles.removeThumb} onPress={() => removePendingImage(i)}>
                      <Text style={styles.removeThumbText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>

              <Pressable style={styles.startBtn} onPress={startProcessing}>
                <Text style={styles.startBtnText}>开始识别 ({pendingImages.length} 张)</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  function renderProcessingStep() {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.stepTitle}>AI 识别中</Text>
        <ActivityIndicator size="large" color="#6366f1" style={styles.spinner} />
        <Text style={styles.progressText}>
          正在识别 {processingIndex + 1} / {pendingImages.length}
        </Text>
      </View>
    );
  }

  function renderCategoryChips(value, onSelect) {
    return CATEGORIES.filter((c) => c !== '全部').map((cat) => (
      <Pressable
        key={cat}
        style={[styles.chip, value === cat && styles.chipActive]}
        onPress={() => onSelect(cat)}
      >
        <Text style={[styles.chipText, value === cat && styles.chipTextActive]}>{cat}</Text>
      </Pressable>
    ));
  }

  function renderReviewStep() {
    if (processedBatch.length === 0) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.stepSubtitle}>没有可保存的衣物</Text>
        </View>
      );
    }

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={processedBatch}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.reviewList}
          renderItem={({ item, index }) => {
            const isExpanded = expandedIndex === index;
            return (
              <View style={styles.reviewCard}>
                {/* 折叠行 */}
                <Pressable
                  style={styles.reviewHeader}
                  onPress={() => setExpandedIndex(isExpanded ? null : index)}
                >
                  <Image
                    source={{
                      uri: item.aiResult?.processed_image_base64
                        ? (item.aiResult.processed_image_base64.startsWith('data:')
                            ? item.aiResult.processed_image_base64
                            : `data:image/png;base64,${item.aiResult.processed_image_base64}`)
                        : item.uri,
                    }}
                    style={styles.reviewThumb}
                  />
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewName} numberOfLines={1}>
                      {item.form.sub_tag || (item.aiError ? '识别失败 — 点此编辑' : '未命名 — 点此编辑')}
                    </Text>
                    <Text style={styles.reviewCat}>{item.form.category}</Text>
                  </View>
                  <Text style={styles.expandArrow}>{isExpanded ? '▲' : '▼'}</Text>
                  <Pressable
                    style={styles.reviewRemove}
                    onPress={() => removeProcessedItem(index)}
                    hitSlop={8}
                  >
                    <Text style={styles.reviewRemoveText}>✕</Text>
                  </Pressable>
                </Pressable>

                {/* 展开编辑区 */}
                {isExpanded && (
                  <View style={styles.reviewForm}>
                    {item.aiError && (
                      <View style={styles.errorBanner}>
                        <Text style={styles.errorBannerText}>AI 识别失败，请手动填写</Text>
                      </View>
                    )}
                    <Text style={styles.fieldLabel}>名称</Text>
                    <TextInput
                      style={styles.input}
                      value={item.form.sub_tag}
                      onChangeText={(v) => updateItemForm(index, 'sub_tag', v)}
                      placeholder="衣物名称"
                      placeholderTextColor="#94a3b8"
                    />
                    <Text style={styles.fieldLabel}>分类</Text>
                    <View style={styles.chipRow}>
                      {renderCategoryChips(item.form.category, (v) => updateItemForm(index, 'category', v))}
                    </View>
                    <Text style={styles.fieldLabel}>颜色</Text>
                    <TextInput
                      style={styles.input}
                      value={item.form.color}
                      onChangeText={(v) => updateItemForm(index, 'color', v)}
                      placeholder="颜色"
                      placeholderTextColor="#94a3b8"
                    />
                    <Text style={styles.fieldLabel}>购买日期</Text>
                    <TextInput
                      style={styles.input}
                      value={item.form.purchase_date}
                      onChangeText={(v) => updateItemForm(index, 'purchase_date', v)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94a3b8"
                    />
                    <Text style={styles.fieldLabel}>价格（元）</Text>
                    <TextInput
                      style={styles.input}
                      value={item.form.price}
                      onChangeText={(v) => updateItemForm(index, 'price', v)}
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="decimal-pad"
                    />
                  </View>
                )}
              </View>
            );
          }}
        />
        <View style={styles.reviewFooter}>
          <Pressable
            style={styles.saveBtn}
            onPress={handleSaveAll}
          >
            <Text style={styles.saveBtnText}>
              全部保存 ({processedBatch.filter((i) => i.form.sub_tag.trim()).length} 件)
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  function renderSavingStep() {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.stepTitle}>保存中</Text>
        <ActivityIndicator size="large" color="#6366f1" style={styles.spinner} />
        <Text style={styles.progressText}>
          已保存 {savingIndex} / {processedBatch.length}
        </Text>
      </View>
    );
  }

  function renderStep() {
    switch (step) {
      case STEPS.PICKING: return renderPickingStep();
      case STEPS.PROCESSING: return renderProcessingStep();
      case STEPS.REVIEW: return renderReviewStep();
      case STEPS.SAVING: return renderSavingStep();
      default: return renderPickingStep();
    }
  }

  function getHeaderTitle() {
    switch (step) {
      case STEPS.PICKING: return '添加衣物';
      case STEPS.PROCESSING: return 'AI 识别中';
      case STEPS.REVIEW: return `确认信息 (${processedBatch.length} 件)`;
      case STEPS.SAVING: return '保存中';
      default: return '添加衣物';
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>
              {step === STEPS.PICKING ? '关闭' : '取消'}
            </Text>
          </Pressable>
          <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
          <View style={styles.headerBtn} />
        </View>
        {renderStep()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#f8f9fc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  headerBtn: { minWidth: 50, paddingVertical: 4 },
  headerBtnText: { fontSize: 16, color: '#6366f1' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1e293b' },
  // 公用居中
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  stepTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 8, textAlign: 'center' },
  stepSubtitle: { fontSize: 15, color: '#64748b', textAlign: 'center' },
  spinner: { marginVertical: 24 },
  progressText: { fontSize: 16, color: '#64748b', marginTop: 4 },
  stepContainer: { flex: 1 },
  // Picking
  pickingContent: { paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 },
  pickButtons: { flexDirection: 'row', gap: 16, marginTop: 32, justifyContent: 'center' },
  pickBtn: {
    width: 130, height: 130, backgroundColor: '#fff', borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  pickBtnIcon: { fontSize: 36, marginBottom: 8 },
  pickBtnLabel: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  countLabel: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginTop: 24, marginBottom: 12 },
  thumbRow: { marginBottom: 20 },
  thumbWrap: { marginRight: 8, position: 'relative' },
  thumb: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#e2e8f0' },
  removeThumb: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
  },
  removeThumbText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  startBtn: {
    backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Review
  reviewList: { padding: 12, flexGrow: 1 },
  reviewCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2, overflow: 'hidden',
  },
  reviewHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
  },
  reviewThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f1f5f9' },
  reviewInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  reviewName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  reviewCat: { fontSize: 13, color: '#64748b', marginTop: 2 },
  expandArrow: { fontSize: 12, color: '#94a3b8', marginRight: 4 },
  reviewRemove: { padding: 6 },
  reviewRemoveText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  reviewForm: { padding: 12, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  reviewFooter: { padding: 16, paddingBottom: 32 },
  // 表单
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#f8f9fc', borderRadius: 10, padding: 12,
    fontSize: 15, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#6366f1' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#475569' },
  chipTextActive: { color: '#fff' },
  errorBanner: {
    backgroundColor: '#fef2f2', padding: 10, borderRadius: 8, marginBottom: 8, marginTop: 4,
    borderWidth: 1, borderColor: '#fecaca',
  },
  errorBannerText: { color: '#dc2626', fontSize: 13, textAlign: 'center' },
  saveBtn: {
    backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
