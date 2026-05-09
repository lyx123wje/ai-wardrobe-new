import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Modal,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
  Image, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createMiscItem } from '../api/misc';

const STEPS = {
  PICKING: 'picking',
  FORM: 'form',
  SAVING: 'saving',
};

export default function MiscAddModal({ visible, onClose, onSaved }) {
  const [step, setStep] = useState(STEPS.PICKING);
  const [image, setImage] = useState(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  function reset() {
    setStep(STEPS.PICKING);
    setImage(null);
    setName('');
    setLocation('');
    setNotes('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── 拍照 / 选图 ──
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
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setImage({ uri: asset.uri, base64: asset.base64 });
      setStep(STEPS.FORM);
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
      setImage({ uri: asset.uri, base64: asset.base64 });
      setStep(STEPS.FORM);
    } catch (err) {
      Alert.alert('拍照失败', '请重试');
    }
  }

  // ── 保存 ──
  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('请填写名称', '杂物名称不能为空');
      return;
    }
    setStep(STEPS.SAVING);
    try {
      const payload = {
        name: trimmedName,
        location: location.trim(),
        notes: notes.trim(),
        image: image ? `data:image/jpeg;base64,${image.base64}` : null,
      };
      const res = await createMiscItem(payload);
      const savedItem = res.data?.item || res.data?.data || res.data;
      onSaved?.(savedItem);
      reset();
      onClose();
    } catch (err) {
      Alert.alert('保存失败', '请检查网络后重试');
      setStep(STEPS.FORM);
    }
  }

  // ── 选图步骤 ──
  function renderPickingStep() {
    return (
      <View style={styles.stepContainer}>
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
      </View>
    );
  }

  // ── 表单步骤 ──
  function renderFormStep() {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          {image && (
            <View style={styles.imagePreview}>
              <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="cover" />
              <Pressable style={styles.changeImageBtn} onPress={() => setStep(STEPS.PICKING)}>
                <Text style={styles.changeImageText}>更换图片</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.fieldLabel}>名称 *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="例如：剪刀、充电线..."
            placeholderTextColor="#94a3b8"
            autoFocus
          />

          <Text style={styles.fieldLabel}>存放位置</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="例如：客厅抽屉、阳台柜子..."
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.fieldLabel}>备注</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="补充说明..."
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
          />

          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>保存杂物</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── 保存中 ──
  function renderSavingStep() {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" color="#8B7355" />
        <Text style={styles.savingText}>保存中...</Text>
      </View>
    );
  }

  function renderStep() {
    switch (step) {
      case STEPS.PICKING: return renderPickingStep();
      case STEPS.FORM: return renderFormStep();
      case STEPS.SAVING: return renderSavingStep();
      default: return renderPickingStep();
    }
  }

  function getHeaderTitle() {
    switch (step) {
      case STEPS.PICKING: return '添加杂物';
      case STEPS.FORM: return '填写信息';
      case STEPS.SAVING: return '保存中';
      default: return '添加杂物';
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
  headerBtnText: { fontSize: 16, color: '#8B7355' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1e293b' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  savingText: { marginTop: 16, fontSize: 16, color: '#64748b' },
  stepContainer: { flex: 1 },
  pickButtons: {
    flexDirection: 'row', gap: 16, marginTop: 32, justifyContent: 'center',
  },
  pickBtn: {
    width: 130, height: 130, backgroundColor: '#fff', borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  pickBtnIcon: { fontSize: 36, marginBottom: 8 },
  pickBtnLabel: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  formContent: { padding: 20, paddingBottom: 40 },
  imagePreview: { alignItems: 'center', marginBottom: 20 },
  previewImage: {
    width: 160, height: 160, borderRadius: 12, backgroundColor: '#f1f5f9',
  },
  changeImageBtn: {
    marginTop: 10, paddingVertical: 6, paddingHorizontal: 16,
    borderRadius: 8, backgroundColor: '#f1f5f9',
  },
  changeImageText: { fontSize: 14, color: '#8B7355', fontWeight: '500' },
  fieldLabel: {
    fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 14,
  },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    fontSize: 15, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0',
  },
  notesInput: {
    minHeight: 80,
  },
  saveBtn: {
    backgroundColor: '#8B7355', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 28,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
