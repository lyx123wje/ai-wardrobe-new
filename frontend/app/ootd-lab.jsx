import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  Image,
  TextInput,
  Modal,
  Alert,
  ToastAndroid,
  Platform,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format, subDays } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import OutfitCanvas, { CANVAS_W, CANVAS_H } from '../src/components/OutfitCanvas';
import { fetchWardrobe, createWardrobeItem } from '../src/api/wardrobe';
import { createOutfit, fetchOutfitByDate } from '../src/api/outfits';
import { processPortraitBase64 } from '../src/api/portraits';
import {
  OOTD_CATEGORIES,
  CANVAS_POSITIONS,
  PRESET_COLORS,
  SCALE_RANGE,
} from '../src/utils/constants';

function getImageSource(raw) {
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('http')) {
    return { uri: raw };
  }
  return { uri: `data:image/png;base64,${raw}` };
}

function getDefaultPosition(category) {
  const pos = CANVAS_POSITIONS[category] || CANVAS_POSITIONS.default;
  return {
    x: pos.x + (Math.random() * 20 - 10),
    y: pos.y + (Math.random() * 10 - 5),
  };
}

function generateElementId() {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function RotationSlider({ rotation, onRotate }) {
  const TRACK_W = 130;
  const startRotation = useRef(0);
  const panRes = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRotation.current = rotation;
      },
      onPanResponderMove: (_, gestureState) => {
        const deg = Math.round(startRotation.current + gestureState.dx * 0.8);
        onRotate(Math.max(-180, Math.min(180, deg)));
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const thumbPercent = ((rotation + 180) / 360) * 100;

  return (
    <View style={{ alignItems: 'center', width: TRACK_W + 20 }}>
      <View style={{ width: TRACK_W, height: 28, justifyContent: 'center' }}>
        <View style={{ width: '100%', height: 3, backgroundColor: '#E5E7EB', borderRadius: 2 }}>
          <View
            {...panRes.panHandlers}
            style={{
              position: 'absolute',
              left: `${thumbPercent}%`,
              top: -7,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: '#6366f1',
              marginLeft: -9,
            }}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: TRACK_W }}>
        <Text style={{ fontSize: 9, color: '#9CA3AF' }}>-180°</Text>
        <Text style={{ fontSize: 9, color: '#9CA3AF' }}>0°</Text>
        <Text style={{ fontSize: 9, color: '#9CA3AF' }}>180°</Text>
      </View>
    </View>
  );
}

function toast(msg) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert('', msg);
  }
}

export default function OOTDLabScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const today = format(new Date(), 'yyyy-MM-dd');
  const initialDate = params.date || today;

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [canvasElements, setCanvasElements] = useState([]);
  const [canvasBackground, setCanvasBackground] = useState({ type: 'color', value: '#FFFFFF' });
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardrobeLoaded, setWardrobeLoaded] = useState(false);

  // Modal states
  const [showBgSheet, setShowBgSheet] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [showPortraitPreview, setShowPortraitPreview] = useState(false);
  const [portraitImage, setPortraitImage] = useState(null);
  const [showFaceSheet, setShowFaceSheet] = useState(false);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentOutfitId, setCurrentOutfitId] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalPreview, setSaveModalPreview] = useState(null);

  const canvasRef = useRef(null);
  const searchInputRef = useRef(null);
  const pendingFaceRef = useRef(null); // 'camera' | 'gallery' | null

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  const displayDate = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    if (selectedDate === todayStr) return '今天';
    const yesterday = format(subDays(now, 1), 'yyyy-MM-dd');
    if (selectedDate === yesterday) return '昨天';
    return `${m}月${d}日 周${WEEKDAYS[dateObj.getDay()]}`;
  }, [selectedDate]);

  // Load wardrobe items
  const loadWardrobe = useCallback(async () => {
    try {
      const res = await fetchWardrobe({ is_unwanted: 0 });
      const data = res.data?.items || res.data?.data || res.data || [];
      setAllItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Load wardrobe failed:', e);
      setAllItems([]);
    } finally {
      setWardrobeLoaded(true);
    }
  }, []);

  // Load outfit for selected date
  const loadOutfit = useCallback(async (date) => {
    if (!date) return;
    try {
      const res = await fetchOutfitByDate(date);
      const record = res.data?.log || res.data?.record || res.data;
      if (record) {
        setCurrentOutfitId(record.id);
        let noteData = null;
        try {
          noteData = record.note ? JSON.parse(record.note) : null;
        } catch {
          noteData = null;
        }
        if (noteData && noteData.canvasElements && Array.isArray(noteData.canvasElements)) {
          setCanvasElements(noteData.canvasElements);
          if (noteData.background) {
            setCanvasBackground(noteData.background);
          } else {
            setCanvasBackground({ type: 'color', value: '#FFFFFF' });
          }
        } else {
          const itemIds = record.wardrobe_item_ids || [];
          const itemsForCanvas = allItems
            .filter((item) => itemIds.includes(item.id))
            .map((item) => ({
              id: generateElementId(),
              type: 'clothing',
              wardrobeId: item.id,
              image: item.processed_image
                ? (item.processed_image.startsWith('data:') || item.processed_image.startsWith('http')
                  ? item.processed_image
                  : `data:image/png;base64,${item.processed_image}`)
                : '',
              category: item.category || '其他',
              name: item.sub_tag || item.name || '',
              ...getDefaultPosition(item.category || '其他'),
              scale: 1.0,
              rotation: 0,
              zIndex: 0,
            }));
          setCanvasElements(itemsForCanvas);
          setCanvasBackground({ type: 'color', value: '#FFFFFF' });
        }
      } else {
        setCurrentOutfitId(null);
        setCanvasElements([]);
        setCanvasBackground({ type: 'color', value: '#FFFFFF' });
      }
    } catch (e) {
      console.error('Load outfit error:', e);
      setCurrentOutfitId(null);
    }
  }, [allItems]);

  useEffect(() => {
    loadWardrobe();
  }, []);

  useEffect(() => {
    if (wardrobeLoaded) {
      setLoading(false);
      loadOutfit(selectedDate);
    }
  }, [wardrobeLoaded, selectedDate]);

  // Face sheet → launch picker after modal closes
  useEffect(() => {
    if (!showFaceSheet && pendingFaceRef.current) {
      const source = pendingFaceRef.current;
      pendingFaceRef.current = null;
      setTimeout(() => startFaceImport(source), 500);
    }
  }, [showFaceSheet, startFaceImport]);

  // Filter clothing items
  const filteredItems = useMemo(() => {
    let items = allItems.filter(
      (item) => item.category !== '杂物'
    );
    if (activeCategory !== '全部') {
      items = items.filter((item) => item.category === activeCategory);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      items = items.filter(
        (item) =>
          (item.sub_tag || '').toLowerCase().includes(q) ||
          (item.color || '').toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q) ||
          (item.notes || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [allItems, activeCategory, searchText]);

  const isItemOnCanvas = useCallback(
    (wardrobeId) => canvasElements.some((el) => el.type === 'clothing' && el.wardrobeId === wardrobeId),
    [canvasElements]
  );

  // Toggle item on/off canvas
  const toggleItem = useCallback((item) => {
    setCanvasElements((prev) => {
      const existing = prev.find((el) => el.type === 'clothing' && el.wardrobeId === item.id);
      if (existing) {
        const next = prev.filter((el) => el.id !== existing.id);
        if (selectedElementId === existing.id) {
          setSelectedElementId(null);
        }
        return next;
      }
      const maxZ = prev.length > 0 ? Math.max(...prev.map((e) => e.zIndex)) : 0;
      return [
        ...prev,
        {
          id: generateElementId(),
          type: 'clothing',
          wardrobeId: item.id,
          image: item.processed_image
            ? (item.processed_image.startsWith('data:') || item.processed_image.startsWith('http')
              ? item.processed_image
              : `data:image/png;base64,${item.processed_image}`)
            : '',
          category: item.category || '其他',
          name: item.sub_tag || item.name || '',
          ...getDefaultPosition(item.category || '其他'),
          scale: 1.0,
          rotation: 0,
          zIndex: maxZ + 1,
        },
      ];
    });
  }, [selectedElementId]);

  // Select element
  const onSelectElement = useCallback(
    (id) => {
      setSelectedElementId(id);
      setCanvasElements((prev) => {
        const maxZ = Math.max(...prev.map((e) => e.zIndex), 0);
        return prev.map((el) =>
          el.id === id ? { ...el, zIndex: maxZ + 1 } : el
        );
      });
    },
    []
  );

  // Update element position
  const onUpdateElement = useCallback((id, updates) => {
    setCanvasElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...updates } : el))
    );
  }, []);

  // Delete element
  const deleteElement = useCallback(
    (id) => {
      setCanvasElements((prev) => prev.filter((el) => el.id !== id));
      if (selectedElementId === id) setSelectedElementId(null);
    },
    [selectedElementId]
  );

  // Scale element
  const zoomElement = useCallback((delta) => {
    if (!selectedElementId) return;
    setCanvasElements((prev) =>
      prev.map((el) =>
        el.id === selectedElementId
          ? {
              ...el,
              scale: Math.max(SCALE_RANGE.min, Math.min(SCALE_RANGE.max, (el.scale || 1) + delta)),
            }
          : el
      )
    );
  }, [selectedElementId]);

  const rotateElement = useCallback((degrees) => {
    if (!selectedElementId) return;
    setCanvasElements((prev) =>
      prev.map((el) =>
        el.id === selectedElementId
          ? { ...el, rotation: degrees }
          : el
      )
    );
  }, [selectedElementId]);

  // Layer controls
  const moveLayerUp = useCallback(() => {
    if (!selectedElementId) return;
    setCanvasElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((el) => el.id === selectedElementId);
      if (idx === -1 || idx === sorted.length - 1) return prev;
      [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
      return sorted.map((el, i) => ({ ...el, zIndex: i }));
    });
  }, [selectedElementId]);

  const moveLayerDown = useCallback(() => {
    if (!selectedElementId) return;
    setCanvasElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((el) => el.id === selectedElementId);
      if (idx <= 0) return prev;
      [sorted[idx], sorted[idx - 1]] = [sorted[idx - 1], sorted[idx]];
      return sorted.map((el, i) => ({ ...el, zIndex: i }));
    });
  }, [selectedElementId]);

  const moveLayerTop = useCallback(() => {
    if (!selectedElementId) return;
    setCanvasElements((prev) => {
      const maxZ = Math.max(...prev.map((e) => e.zIndex), 0);
      return prev.map((el) =>
        el.id === selectedElementId ? { ...el, zIndex: maxZ + 1 } : el
      );
    });
  }, [selectedElementId]);

  const moveLayerBottom = useCallback(() => {
    if (!selectedElementId) return;
    setCanvasElements((prev) => {
      const minZ = Math.min(...prev.map((e) => e.zIndex), 0);
      return prev.map((el) =>
        el.id === selectedElementId ? { ...el, zIndex: minZ - 1 } : el
      );
    });
  }, [selectedElementId]);

  // Background: set color
  const setBgColor = useCallback((color) => {
    setCanvasBackground({ type: 'color', value: color });
    setShowBgColorPicker(false);
    setShowBgSheet(false);
  }, []);

  // Background: pick image
  const pickBgImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要相册权限才能选择背景图片');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        base64: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        setCanvasBackground({ type: 'image', uri: result.assets[0].uri });
        setShowBgSheet(false);
      }
    } catch (e) {
      console.error('Pick bg image error:', e);
    }
  }, []);

  // Face import flow
  const startFaceImport = useCallback(async (source) => {
    try {
      let result;
      if (source === 'camera') {
        const { status, granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted && status !== 'granted') {
          Alert.alert('权限被拒绝', '请在手机系统设置中为 Expo Go 开启相机权限');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 1,
          base64: true,
          base64Size: 1024 * 1024,
        });
      } else {
        const { status, granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!granted && status !== 'granted') {
          Alert.alert('权限被拒绝', '请在手机系统设置中为 Expo Go 开启相册权限');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          base64: true,
          base64Size: 1024 * 1024,
        });
      }
      if (result.canceled || !result.assets?.[0]) return;

      const base64 = result.assets[0].base64;
      if (!base64) {
        Alert.alert('错误', '无法读取图片数据');
        return;
      }

      setPortraitLoading(true);
      const res = await processPortraitBase64(base64);
      const processed = res.data?.processed_image_base64;
      if (processed) {
        setPortraitImage(
          processed.startsWith('data:') ? processed : `data:image/png;base64,${processed}`
        );
        setShowPortraitPreview(true);
      } else {
        Alert.alert('处理失败', 'AI 抠图返回了空结果，请换一张清晰的人像试试');
      }
    } catch (e) {
      console.error('Face import error:', e);
      Alert.alert('导入失败', '人像处理失败，请检查网络后重试');
    } finally {
      setPortraitLoading(false);
    }
  }, []);

  const confirmPortrait = useCallback(() => {
    if (!portraitImage) return;
    setCanvasElements((prev) => {
      const maxZ = Math.max(...prev.map((e) => e.zIndex), 0);
      return [
        ...prev,
        {
          id: generateElementId(),
          type: 'face',
          wardrobeId: null,
          image: portraitImage,
          category: null,
          name: '人脸',
          ...getDefaultPosition('face'),
          scale: 0.8,
          rotation: 0,
          zIndex: maxZ + 10,
        },
      ];
    });
    setPortraitImage(null);
    setShowPortraitPreview(false);
  }, [portraitImage]);

  // Save outfit: open modal with preview + name
  const openSaveModal = useCallback(async () => {
    const clothingItems = canvasElements.filter((el) => el.type === 'clothing');
    if (clothingItems.length === 0) {
      toast('画布上没有衣物，请先添加衣物');
      return;
    }
    const [y, m, d] = selectedDate.split('-').map(Number);
    setSaveModalName(`搭配 ${m}/${d}`);
    setSaveModalPreview(null);
    setShowSaveModal(true);
    // Capture canvas preview in background
    try {
      if (canvasRef.current) {
        const previewUri = await captureRef(canvasRef.current, { format: 'png', quality: 0.7 });
        setSaveModalPreview(previewUri);
      }
    } catch {
      // Preview capture failed, modal still works without image
    }
  }, [canvasElements, selectedDate]);

  const confirmSave = useCallback(async () => {
    const clothingItems = canvasElements.filter((el) => el.type === 'clothing');
    if (clothingItems.length === 0) return;
    setSaving(true);
    try {
      const wardrobeIds = clothingItems.map((el) => el.wardrobeId);
      const noteData = JSON.stringify({
        canvasElements,
        background: canvasBackground,
      });
      // 1. Save outfit log
      await createOutfit({
        log_date: selectedDate,
        wardrobe_item_ids: wardrobeIds,
        note: noteData,
      });
      // 2. Create wardrobe item (套装分类)
      let processedImage = '';
      try {
        if (canvasRef.current) {
          const dataUri = await captureRef(canvasRef.current, { format: 'png', quality: 0.8, result: 'data-uri' });
          processedImage = dataUri;
        }
      } catch {
        // Screenshot failed, save without image
      }
      await createWardrobeItem({
        sub_tag: saveModalName || '未命名搭配',
        category: '套装',
        color: '',
        processed_image: processedImage,
        purchase_date: selectedDate,
        purchase_amount: 0,
        notes: `包含 ${clothingItems.length} 件衣物`,
      });
      toast('套装已保存到衣柜');
      setShowSaveModal(false);
    } catch (e) {
      console.error('Save outfit error:', e);
      Alert.alert('保存失败', '请检查网络后重试');
    } finally {
      setSaving(false);
    }
  }, [canvasElements, canvasBackground, selectedDate, saveModalName]);

  // Export canvas to gallery
  const exportCanvas = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要相册权限才能保存图片');
        return;
      }
      if (!canvasRef.current) {
        Alert.alert('导出失败', '画布未就绪');
        return;
      }
      const uri = await captureRef(canvasRef.current, { format: 'png', quality: 1.0 });
      await MediaLibrary.saveToLibraryAsync(uri);
      toast('已保存到相册');
    } catch (e) {
      console.error('Export error:', e);
      Alert.alert('导出失败', '保存到相册时出错，请重试');
    }
  }, []);

  // Date navigation
  const goPrevDay = useCallback(() => {
    setSelectedDate((prev) => {
      const [y, m, d] = prev.split('-').map(Number);
      const d2 = new Date(y, m - 1, d - 1);
      return format(d2, 'yyyy-MM-dd');
    });
  }, []);
  const goNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const [y, m, d] = prev.split('-').map(Number);
      const d2 = new Date(y, m - 1, d + 1);
      return format(d2, 'yyyy-MM-dd');
    });
  }, []);
  const goToday = useCallback(() => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  }, []);

  // Selected element info
  const selectedElement = useMemo(
    () => canvasElements.find((el) => el.id === selectedElementId) || null,
    [canvasElements, selectedElementId]
  );

  return (
    <View style={styles.container}>
      {/* ===== Header ===== */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={styles.headerBtnText}>← 返回</Text>
        </Pressable>
        <View style={styles.dateRow}>
          <Pressable onPress={goPrevDay} style={styles.arrowBtn}>
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Pressable onPress={goToday}>
            <Text style={styles.dateText}>{displayDate}</Text>
          </Pressable>
          <Pressable onPress={goNextDay} style={styles.arrowBtn}>
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.headerBtn, styles.saveBtn, saving && styles.btnDisabled]}
          onPress={openSaveModal}
          disabled={saving}
        >
          <Text style={styles.headerBtnText}>{saving ? '...' : '💾'}</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} scrollEnabled={selectedElementId === null}>

      {/* ===== Search & Category Chips ===== */}
      <View style={styles.searchSection}>
        {showSearch ? (
          <View style={styles.searchRow}>
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="搜索衣物（名称/颜色/分类/备注）..."
              placeholderTextColor="#9CA3AF"
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            <Pressable
              style={styles.searchClose}
              onPress={() => {
                setShowSearch(false);
                setSearchText('');
              }}
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            <Pressable style={styles.searchChip} onPress={() => setShowSearch(true)}>
              <Text style={styles.searchIcon}>🔍</Text>
            </Pressable>
            {OOTD_CATEGORIES.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.chip, activeCategory === cat && styles.chipActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text
                  style={[
                    styles.chipText,
                    activeCategory === cat && styles.chipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ===== Canvas ===== */}
      <Pressable style={styles.canvasArea} onPress={() => setSelectedElementId(null)}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>加载衣柜数据...</Text>
          </View>
        ) : (
          <OutfitCanvas
            ref={canvasRef}
            elements={canvasElements}
            background={canvasBackground}
            selectedId={selectedElementId}
            onSelect={onSelectElement}
            onUpdateElement={onUpdateElement}
          />
        )}
      </Pressable>

      {/* ===== Selected Element Controls ===== */}
      {selectedElement && (
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedLabel} numberOfLines={1}>
            {selectedElement.name || (selectedElement.type === 'face' ? '人脸' : '未命名')}
          </Text>
          <View style={styles.selectedActions}>
            <Pressable style={styles.zoomBtn} onPress={() => zoomElement(-SCALE_RANGE.step)}>
              <Text style={styles.zoomBtnText}>−</Text>
            </Pressable>
            <Text style={styles.scaleLabel}>{(selectedElement.scale || 1).toFixed(1)}x {(selectedElement.rotation || 0)}°</Text>
            <Pressable style={styles.zoomBtn} onPress={() => zoomElement(SCALE_RANGE.step)}>
              <Text style={styles.zoomBtnText}>+</Text>
            </Pressable>
            <Pressable style={styles.delBtn} onPress={() => deleteElement(selectedElement.id)}>
              <Text style={styles.delBtnText}>删除</Text>
            </Pressable>
          </View>
          <View style={styles.rotationRow}>
            <RotationSlider
              rotation={selectedElement.rotation || 0}
              onRotate={rotateElement}
            />
          </View>
          <View style={styles.layerActions}>
            <Pressable style={styles.layerBtn} onPress={moveLayerBottom}>
              <Text style={styles.layerBtnText}>🔚</Text>
            </Pressable>
            <Pressable style={styles.layerBtn} onPress={moveLayerDown}>
              <Text style={styles.layerBtnText}>↓</Text>
            </Pressable>
            <Pressable style={styles.layerBtn} onPress={moveLayerUp}>
              <Text style={styles.layerBtnText}>↑</Text>
            </Pressable>
            <Pressable style={styles.layerBtn} onPress={moveLayerTop}>
              <Text style={styles.layerBtnText}>🔝</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ===== Canvas Toolbar ===== */}
      <View style={styles.toolbar}>
        <Pressable style={styles.toolBtn} onPress={() => setShowBgSheet(true)}>
          <Text style={styles.toolBtnText}>🎨 背景</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setShowFaceSheet(true)}>
          <Text style={styles.toolBtnText}>📷 人脸</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={exportCanvas}>
          <Text style={styles.toolBtnText}>📤 导出</Text>
        </Pressable>
        {selectedElement && (
          <View style={styles.layerIndicator}>
            <Text style={styles.layerIndText}>
              层级: {(() => {
                const sorted = [...canvasElements].sort((a, b) => a.zIndex - b.zIndex);
                const idx = sorted.findIndex((el) => el.id === selectedElement.id);
                return `${idx + 1}/${sorted.length}`;
              })()}
            </Text>
          </View>
        )}
      </View>

      {/* ===== Clothing Strip ===== */}
      <View style={styles.clothingStrip}>
        {filteredItems.length === 0 ? (
          <View style={styles.emptyStrip}>
            <Text style={styles.emptyStripText}>
              {searchText ? '没有匹配的衣物' : '暂无衣物'}
            </Text>
          </View>
        ) : (
          <FlatList
            horizontal
            data={filteredItems}
            keyExtractor={(item) => String(item.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.clothingList}
            renderItem={({ item }) => {
              const onCanvas = isItemOnCanvas(item.id);
              return (
                <Pressable
                  style={[styles.clothingItem, onCanvas && styles.clothingItemActive]}
                  onPress={() => toggleItem(item)}
                >
                  <Image
                    source={getImageSource(item.processed_image)}
                    style={styles.clothingThumb}
                    resizeMode="contain"
                  />
                  {onCanvas && (
                    <View style={styles.checkBadge}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                  )}
                  <Text style={styles.clothingName} numberOfLines={1}>
                    {item.sub_tag || item.name || ''}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* ===== Friend Collab Button ===== */}
      <View style={styles.bottomBar}>
        <Pressable
          style={styles.collabBtn}
          onPress={() => toast('该功能即将上线，敬请期待')}
        >
          <Text style={styles.collabBtnText}>👥 邀请好友共创</Text>
        </Pressable>
      </View>

      </ScrollView>

      {/* ===== Background Sheet Modal ===== */}
      <Modal visible={showBgSheet} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowBgSheet(false)}>
          <View />
        </Pressable>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>选择背景</Text>
          <Pressable
            style={styles.sheetOption}
            onPress={() => {
              setCanvasBackground({ type: 'color', value: '#FFFFFF' });
              setShowBgSheet(false);
            }}
          >
            <View style={[styles.colorDot, { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' }]} />
            <Text style={styles.sheetOptionText}>白色（默认）</Text>
          </Pressable>
          <Pressable
            style={styles.sheetOption}
            onPress={() => setShowBgColorPicker(true)}
          >
            <Text style={styles.sheetOptionText}>🎨 纯色背景</Text>
          </Pressable>
          <Pressable style={styles.sheetOption} onPress={pickBgImage}>
            <Text style={styles.sheetOptionText}>🖼️ 导入图片</Text>
          </Pressable>
          <Pressable style={styles.sheetCancel} onPress={() => setShowBgSheet(false)}>
            <Text style={styles.sheetCancelText}>取消</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ===== Color Picker Sheet ===== */}
      <Modal visible={showBgColorPicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowBgColorPicker(false)}>
          <View />
        </Pressable>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>选择纯色背景</Text>
          <View style={styles.colorGrid}>
            {PRESET_COLORS.map((c) => (
              <Pressable
                key={c.value}
                style={[styles.colorBlock, { backgroundColor: c.value }]}
                onPress={() => setBgColor(c.value)}
              >
                <Text style={[styles.colorBlockLabel, { color: c.value === '#1a1a2e' ? '#fff' : '#1f2937' }]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.sheetCancel} onPress={() => setShowBgColorPicker(false)}>
            <Text style={styles.sheetCancelText}>取消</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ===== Face Source Sheet ===== */}
      <Modal visible={showFaceSheet} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowFaceSheet(false)}>
          <View />
        </Pressable>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>导入人脸</Text>
          <Pressable
            style={styles.sheetOption}
            onPress={() => {
              pendingFaceRef.current = 'camera';
              setShowFaceSheet(false);
            }}
          >
            <Text style={styles.sheetOptionText}>📷 拍照</Text>
          </Pressable>
          <Pressable
            style={styles.sheetOption}
            onPress={() => {
              pendingFaceRef.current = 'gallery';
              setShowFaceSheet(false);
            }}
          >
            <Text style={styles.sheetOptionText}>🖼️ 从相册选择</Text>
          </Pressable>
          <Pressable style={styles.sheetCancel} onPress={() => setShowFaceSheet(false)}>
            <Text style={styles.sheetCancelText}>取消</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ===== Portrait Preview Modal ===== */}
      <Modal visible={showPortraitPreview} transparent animationType="slide">
        <View style={styles.portraitOverlay}>
          <View style={styles.portraitBox}>
            <Text style={styles.portraitTitle}>AI 抠图结果</Text>
            {portraitImage ? (
              <View style={styles.portraitPreviewWrap}>
                <Image source={{ uri: portraitImage }} style={styles.portraitPreview} resizeMode="contain" />
              </View>
            ) : (
              <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 40 }} />
            )}
            <View style={styles.portraitActions}>
              <Pressable
                style={styles.portraitRetry}
                onPress={() => {
                  setShowPortraitPreview(false);
                  setPortraitImage(null);
                }}
              >
                <Text style={styles.portraitRetryText}>重选</Text>
              </Pressable>
              <Pressable style={styles.portraitConfirm} onPress={confirmPortrait}>
                <Text style={styles.portraitConfirmText}>使用</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Portrait Loading Overlay ===== */}
      <Modal visible={portraitLoading} transparent>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText2}>AI 正在抠图中...</Text>
          </View>
        </View>
      </Modal>

      {/* ===== Save Outfit Modal ===== */}
      <Modal visible={showSaveModal} transparent animationType="fade">
        <View style={styles.saveModalOverlay}>
          <View style={styles.saveModalBox}>
            <Text style={styles.saveModalTitle}>保存套装</Text>
            {saveModalPreview ? (
              <Image
                source={{ uri: saveModalPreview }}
                style={styles.saveModalPreview}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.saveModalPreviewPlaceholder}>
                <ActivityIndicator size="small" color="#6366f1" />
              </View>
            )}
            <Text style={styles.saveModalLabel}>套装名称</Text>
            <TextInput
              style={styles.saveModalInput}
              value={saveModalName}
              onChangeText={setSaveModalName}
              placeholder="输入套装名称..."
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.saveModalActions}>
              <Pressable
                style={styles.saveModalCancel}
                onPress={() => setShowSaveModal(false)}
                disabled={saving}
              >
                <Text style={styles.saveModalCancelText}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.saveModalConfirm, saving && styles.btnDisabled]}
                onPress={confirmSave}
                disabled={saving}
              >
                <Text style={styles.saveModalConfirmText}>
                  {saving ? '保存中...' : '确认保存'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FC',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  headerBtnText: {
    fontSize: 14,
    color: '#374151',
  },
  saveBtn: {
    backgroundColor: '#6366f1',
  },
  saveBtnText: {
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrowBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  arrowText: {
    fontSize: 24,
    color: '#6366f1',
    fontWeight: '300',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    minWidth: 90,
    textAlign: 'center',
  },

  // Search
  searchSection: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#F3F4F6',
    borderRadius: 18,
    paddingHorizontal: 14,
    fontSize: 13,
    color: '#1F2937',
  },
  searchClose: {
    padding: 6,
  },
  closeText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  chipsRow: {
    alignItems: 'center',
  },
  searchChip: {
    marginRight: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  searchIcon: {
    fontSize: 16,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: '#6366f1',
  },
  chipText: {
    fontSize: 12,
    color: '#6B7280',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Canvas
  canvasArea: {
    paddingVertical: 10,
    alignItems: 'center',
    position: 'relative',
  },
  loadingBox: {
    width: CANVAS_W,
    height: CANVAS_H,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#9CA3AF',
  },

  // Selected info (compact inline)
  selectedInfo: {
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
  },
  selectedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4338CA',
    marginBottom: 6,
  },
  selectedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  zoomBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  scaleLabel: {
    fontSize: 12,
    color: '#6B7280',
    minWidth: 30,
    textAlign: 'center',
  },
  delBtn: {
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  delBtnText: {
    fontSize: 12,
    color: '#DC2626',
  },
  rotationRow: {
    alignItems: 'center',
    marginBottom: 6,
  },
  layerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  layerBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#E0E7FF',
  },
  layerBtnText: {
    fontSize: 14,
  },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  toolBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  toolBtnText: {
    fontSize: 13,
    color: '#374151',
  },
  layerIndicator: {
    marginLeft: 4,
  },
  layerIndText: {
    fontSize: 11,
    color: '#9CA3AF',
  },

  // Clothing strip
  clothingStrip: {
    height: 100,
    backgroundColor: '#FFFFFF',
    paddingVertical: 4,
  },
  clothingList: {
    paddingHorizontal: 12,
    gap: 8,
  },
  clothingItem: {
    width: 76,
    alignItems: 'center',
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  clothingItemActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#6366f1',
  },
  clothingThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
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
  clothingName: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 4,
    maxWidth: 70,
  },
  emptyStrip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStripText: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Bottom bar
  bottomBar: {
    paddingVertical: 8,
    paddingBottom: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  collabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  collabBtnText: {
    fontSize: 14,
    color: '#4338CA',
    fontWeight: '500',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  sheetOptionText: {
    fontSize: 15,
    color: '#374151',
  },
  sheetCancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 16,
  },
  colorBlock: {
    width: 64,
    height: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  colorBlockLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Portrait modal
  portraitOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  portraitBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  portraitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  portraitPreviewWrap: {
    width: 240,
    height: 240,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  portraitPreview: {
    width: '100%',
    height: '100%',
  },
  portraitActions: {
    flexDirection: 'row',
    gap: 12,
  },
  portraitRetry: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  portraitRetryText: {
    fontSize: 14,
    color: '#6B7280',
  },
  portraitConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#6366f1',
  },
  portraitConfirmText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Loading overlay
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText2: {
    marginTop: 16,
    fontSize: 14,
    color: '#FFFFFF',
  },

  // Save modal
  saveModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  saveModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  saveModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 14,
  },
  saveModalPreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    marginBottom: 14,
  },
  saveModalPreviewPlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveModalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  saveModalInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 16,
  },
  saveModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  saveModalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  saveModalCancelText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  saveModalConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    alignItems: 'center',
  },
  saveModalConfirmText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
