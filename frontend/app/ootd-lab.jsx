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
  Platform,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format, subDays } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import OutfitCanvas, { CANVAS_W, CANVAS_H } from '../src/components/OutfitCanvas';
import { fetchWardrobe, createWardrobeItem, fetchSharedWardrobe } from '../src/api/wardrobe';
import { createOutfit, fetchOutfitByDate } from '../src/api/outfits';
import { processPortraitBase64 } from '../src/api/portraits';
import {
  OOTD_CATEGORIES,
  CANVAS_POSITIONS,
  PRESET_COLORS,
  SCALE_RANGE,
} from '../src/utils/constants';

// ── Collab imports ──
import { useAuth } from './_layout';
import { showToast } from '../src/utils/toast';
import * as collabSocket from '../src/services/collabSocket';
import * as voiceChat from '../src/services/voiceChat';
import { addRecentCollab } from '../src/services/recentCollabs';
import CollabInviteModal from '../src/components/CollabInviteModal';
import CollabChat from '../src/components/CollabChat';
import CollabToolbar from '../src/components/CollabToolbar';
import ShareWardrobeSheet from '../src/components/ShareWardrobeSheet';

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
  const startMouseX = useRef(0);

  const onRotateRef = useRef(onRotate);
  onRotateRef.current = onRotate;
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;

  const panRes = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRotation.current = rotationRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const deg = Math.round(startRotation.current + gestureState.dx * 0.8);
        onRotateRef.current(Math.max(-180, Math.min(180, deg)));
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  // Web mouse support
  const handleMouseDown = useCallback((e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    startRotation.current = rotation;
    startMouseX.current = e.clientX;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startMouseX.current;
      const deg = Math.round(startRotation.current + dx * 0.8);
      onRotate(Math.max(-180, Math.min(180, deg)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [rotation, onRotate]);

  const thumbPercent = ((rotation + 180) / 360) * 100;

  return (
    <View style={{ alignItems: 'center', width: TRACK_W + 20 }}>
      <View style={{ width: TRACK_W, height: 28, justifyContent: 'center' }}>
        <View style={{ width: '100%', height: 3, backgroundColor: '#E5E7EB', borderRadius: 2 }}>
          <View
            {...(Platform.OS === 'web' ? {} : panRes.panHandlers)}
            onMouseDown={Platform.OS === 'web' ? handleMouseDown : undefined}
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

function WebPositionSlider({ label, value, min, max, onChange, displayValue, thumbColor, trackColor, decimal }) {
  const TRACK_W = 130;
  const startValue = useRef(0);
  const startMouseX = useRef(0);

  const handleMouseDown = useCallback((e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    startValue.current = value;
    startMouseX.current = e.clientX;

    const range = max - min;
    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startMouseX.current;
      const ratio = range / TRACK_W;
      const raw = startValue.current + dx * ratio;
      const newVal = decimal
        ? Math.max(min, Math.min(max, Math.round(raw * 10) / 10))
        : Math.max(min, Math.min(max, Math.round(raw)));
      onChange(newVal);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [value, min, max, onChange, decimal]);

  const thumbPercent = max > min ? ((value - min) / (max - min)) * 100 : 50;
  const display = displayValue != null ? displayValue : value;

  return (
    <View style={{ alignItems: 'center', width: TRACK_W + 20, marginBottom: 4 }}>
      <Text style={{ fontSize: 9, color: '#6B7280', marginBottom: 2 }}>{label}: {display}</Text>
      <View style={{ width: TRACK_W, height: 24, justifyContent: 'center' }}>
        <View style={{ width: '100%', height: 3, backgroundColor: trackColor || '#E5E7EB', borderRadius: 2 }}>
          <View
            onMouseDown={handleMouseDown}
            style={{
              position: 'absolute',
              left: `${thumbPercent}%`,
              top: -7,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: thumbColor || '#6366f1',
              marginLeft: -9,
              cursor: 'pointer',
            }}
          />
        </View>
      </View>
    </View>
  );
}

function ScaleSlider({ value, min, max, step, onChange, label, displayValue }) {
  const TRACK_W = 130;
  const startValue = useRef(0);
  const startMouseX = useRef(0);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;
  const minRef = useRef(min);
  minRef.current = min;
  const maxRef = useRef(max);
  maxRef.current = max;
  const stepRef = useRef(step);
  stepRef.current = step;

  const panRes = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startValue.current = valueRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const range = maxRef.current - minRef.current;
        const raw = startValue.current + (gestureState.dx / TRACK_W) * range;
        const stepped = Math.round(raw / stepRef.current) * stepRef.current;
        onChangeRef.current(Math.max(minRef.current, Math.min(maxRef.current, Math.round(stepped * 100) / 100)));
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const handleMouseDown = useCallback((e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    startValue.current = value;
    startMouseX.current = e.clientX;

    const range = max - min;
    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startMouseX.current;
      const raw = startValue.current + (dx / TRACK_W) * range;
      const stepped = Math.round(raw / step) * step;
      onChange(Math.max(min, Math.min(max, Math.round(stepped * 100) / 100)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [value, min, max, step, onChange]);

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 50;

  return (
    <View style={{ alignItems: 'center', width: TRACK_W + 20, marginBottom: 4 }}>
      <Text style={{ fontSize: 9, color: '#6B7280', marginBottom: 2 }}>{label || '缩放'}: {displayValue != null ? displayValue : `${value.toFixed(1)}x`}</Text>
      <View style={{ width: TRACK_W, height: 28, justifyContent: 'center' }}>
        <View style={{ width: '100%', height: 3, backgroundColor: '#E5E7EB', borderRadius: 2 }}>
          <View
            {...(Platform.OS === 'web' ? {} : panRes.panHandlers)}
            onMouseDown={Platform.OS === 'web' ? handleMouseDown : undefined}
            style={{
              position: 'absolute',
              left: `${percent}%`,
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
    </View>
  );
}

function toast(msg) {
  showToast(msg);
}

export default function OOTDLabScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

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
  const [sharedGroups, setSharedGroups] = useState([]);

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

  // Eraser state
  const [eraserMode, setEraserMode] = useState(false);
  const [eraserSize, setEraserSize] = useState(25);
  const [eraserSoftness, setEraserSoftness] = useState(0.3);
  const [eraserStrength, setEraserStrength] = useState(1);
  const eraserSnapshotsRef = useRef([]);

  const canvasRef = useRef(null);
  const searchInputRef = useRef(null);
  const [interacting, setInteracting] = useState(false);
  const pendingFaceRef = useRef(null); // 'camera' | 'gallery' | null

  // ── Collab state ──
  const [showCollabInvite, setShowCollabInvite] = useState(false);
  const [collabRoomCode, setCollabRoomCode] = useState('');
  const [collabConnected, setCollabConnected] = useState(false);
  const [partnerNickname, setPartnerNickname] = useState('');
  const [partnerUserId, setPartnerUserId] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatVisible, setChatVisible] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showShareWardrobe, setShowShareWardrobe] = useState(false);
  const isRemoteAction = useRef(false);
  const pendingElementUpdates = useRef({});
  const rafScheduled = useRef(false);
  const selectedElementIdRef = useRef(selectedElementId);
  selectedElementIdRef.current = selectedElementId;

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

  // Load shared wardrobe items from current partner
  const loadSharedWardrobe = useCallback(async () => {
    if (!partnerUserId) {
      setSharedGroups([]);
      return;
    }
    try {
      const res = await fetchSharedWardrobe(partnerUserId);
      const shared = res.data?.shared;
      console.log('[共享衣柜] lab 加载 partner:', partnerUserId?.slice(0, 8), '→', shared?.length || 0, '组');
      setSharedGroups(shared || []);
    } catch (err) {
      console.error('[共享衣柜] lab 加载失败:', err?.response?.status, err?.response?.data || err.message);
      setSharedGroups([]);
    }
  }, [partnerUserId]);

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
              opacity: 1,
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

  // Load shared wardrobe when partner is known
  useEffect(() => {
    if (partnerUserId) {
      loadSharedWardrobe();
    }
  }, [partnerUserId, loadSharedWardrobe]);

  useEffect(() => {
    if (wardrobeLoaded) {
      setLoading(false);
      loadOutfit(selectedDate);
    }
  }, [wardrobeLoaded, selectedDate]);

  // Face import flow
  const startFaceImport = useCallback(async (source) => {
    try {
      let result;
      if (source === 'camera') {
        if (Platform.OS === 'web') return;
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
        if (Platform.OS !== 'web') {
          const { status, granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!granted && status !== 'granted') {
            Alert.alert('权限被拒绝', '请在手机系统设置中为 Expo Go 开启相册权限');
            return;
          }
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

  // Face sheet → launch picker after modal closes
  useEffect(() => {
    if (!showFaceSheet && pendingFaceRef.current) {
      const source = pendingFaceRef.current;
      pendingFaceRef.current = null;
      setTimeout(() => startFaceImport(source), 500);
    }
  }, [showFaceSheet, startFaceImport]);

  // Eraser snapshot stack: clear when eraser mode toggles off or element changes
  useEffect(() => {
    eraserSnapshotsRef.current = [];
  }, [eraserMode, selectedElementId]);

  // ── Collab socket listeners ──
  useEffect(() => {
    if (!collabConnected) return;

    const handleElementAdded = (data) => {
      isRemoteAction.current = true;
      setCanvasElements((prev) => {
        const exists = prev.find((el) => el.id === data.element?.id);
        if (exists) return prev;
        return [...prev, data.element];
      });
      isRemoteAction.current = false;
    };

    const handleElementUpdated = (data) => {
      isRemoteAction.current = true;
      setCanvasElements((prev) =>
        prev.map((el) =>
          el.id === data.element_id ? { ...el, ...data.updates } : el
        )
      );
      isRemoteAction.current = false;
    };

    const handleElementRemoved = (data) => {
      isRemoteAction.current = true;
      setCanvasElements((prev) => prev.filter((el) => el.id !== data.element_id));
      setSelectedElementId((id) => (id === data.element_id ? null : id));
      isRemoteAction.current = false;
    };

    const handleBgChanged = (data) => {
      setCanvasBackground(data.background);
    };

    const handleChat = (data) => {
      setChatMessages((prev) => [...prev, { text: data.text, nickname: data.nickname, from: 'remote' }]);
    };

    const handlePartnerJoined = (data) => {
      setPartnerNickname(data.nickname || '');
      setPartnerUserId(data.user_id || '');
      // Send full state sync to new joiner
      collabSocket.emit('request_full_state', {
        room_code: collabRoomCode,
        elements: canvasElements,
        background: canvasBackground,
      });
    };

    const handlePartnerLeft = () => {
      setPartnerNickname('');
      setPartnerUserId('');
      setChatMessages((prev) => [...prev, { text: '好友已离开房间', from: 'system' }]);
    };

    const handleFullState = (data) => {
      isRemoteAction.current = true;
      if (data.elements) setCanvasElements(data.elements);
      if (data.background) setCanvasBackground(data.background);
      // Reset element positions for remote items to avoid overlap
      setTimeout(() => {
        isRemoteAction.current = false;
      }, 100);
    };

    const handleWardrobeShared = (data) => {
      console.log('[Collab] Wardrobe shared by', data.from_nickname, data.item_ids);
      loadSharedWardrobe();
    };

    // WebRTC handlers
    const handleWebrtcOffer = async (d) => {
      try {
        const result = await voiceChat.handleAnswer(d.sdp);
        if (result) {
          collabSocket.emit('webrtc_answer', {
            room_code: collabRoomCode,
            from: user?.user_id,
            sdp: result.sdp,
            candidates: result.candidates,
          });
          d.candidates?.forEach((c) => voiceChat.addIceCandidate(c));
        }
      } catch (e) {
        console.error('[WebRTC] handle offer error:', e);
      }
    };

    const handleWebrtcAnswer = async (d) => {
      try {
        await voiceChat.handleAnswer(d.sdp);
        d.candidates?.forEach((c) => voiceChat.addIceCandidate(c));
      } catch (e) {
        console.error('[WebRTC] handle answer error:', e);
      }
    };

    const handleWebrtcIce = (d) => {
      voiceChat.addIceCandidate(d.candidate || d);
    };

    collabSocket.on('canvas_element_added', handleElementAdded);
    collabSocket.on('canvas_element_updated', handleElementUpdated);
    collabSocket.on('canvas_element_removed', handleElementRemoved);
    collabSocket.on('canvas_background_changed', handleBgChanged);
    collabSocket.on('chat_message', handleChat);
    collabSocket.on('partner_joined', handlePartnerJoined);
    collabSocket.on('partner_left', handlePartnerLeft);
    collabSocket.on('full_state_sync', handleFullState);
    collabSocket.on('wardrobe_shared', handleWardrobeShared);
    collabSocket.on('webrtc_offer', handleWebrtcOffer);
    collabSocket.on('webrtc_answer', handleWebrtcAnswer);
    collabSocket.on('webrtc_ice_candidate', handleWebrtcIce);

    return () => {
      collabSocket.off('canvas_element_added', handleElementAdded);
      collabSocket.off('canvas_element_updated', handleElementUpdated);
      collabSocket.off('canvas_element_removed', handleElementRemoved);
      collabSocket.off('canvas_background_changed', handleBgChanged);
      collabSocket.off('chat_message', handleChat);
      collabSocket.off('partner_joined', handlePartnerJoined);
      collabSocket.off('partner_left', handlePartnerLeft);
      collabSocket.off('full_state_sync', handleFullState);
      collabSocket.off('wardrobe_shared', handleWardrobeShared);
      collabSocket.off('webrtc_offer', handleWebrtcOffer);
      collabSocket.off('webrtc_answer', handleWebrtcAnswer);
      collabSocket.off('webrtc_ice_candidate', handleWebrtcIce);
    };
  }, [collabConnected, collabRoomCode, canvasElements, canvasBackground, user]);

  // Cleanup collab on unmount
  useEffect(() => {
    return () => {
      collabSocket.disconnect();
      voiceChat.stopVoice();
    };
  }, []);

  // ── Collab helpers ──
  const handleCollabRoomReady = useCallback(async (roomCode, roomData) => {
    setCollabRoomCode(roomCode);
    try {
      await collabSocket.connect(roomCode);
      setCollabConnected(true);
      if (roomData?.room) {
        const members = Object.values(roomData.room.members || {});
        const partner = members.find((m) => m.nickname !== user?.nickname);
        if (partner) {
          setPartnerNickname(partner.nickname);
          addRecentCollab({
            roomCode,
            partnerNickname: partner.nickname,
            partnerUserId: partner.user_id,
          });
        }
      }
    } catch (e) {
      Alert.alert('连接失败', '无法连接到协作服务器');
    }
    setShowCollabInvite(false);
  }, [user]);

  const handleLeaveCollab = useCallback(() => {
    collabSocket.disconnect();
    voiceChat.stopVoice();
    setCollabConnected(false);
    setCollabRoomCode('');
    setPartnerNickname('');
    setPartnerUserId('');
    setVoiceEnabled(false);
    setChatVisible(false);
    setChatMessages([]);
    setSharedGroups([]);
  }, []);

  const handleToggleVoice = useCallback(async () => {
    if (voiceEnabled) {
      voiceChat.stopVoice();
      setVoiceEnabled(false);
      return;
    }
    const result = await voiceChat.startMic();
    if (result.success) {
      setVoiceEnabled(true);
      const offer = await voiceChat.createOffer();
      if (offer) {
        collabSocket.emit('webrtc_offer', {
          room_code: collabRoomCode,
          from: user?.user_id,
          sdp: offer.sdp,
          candidates: offer.candidates,
        });
      }
    } else {
      Alert.alert('语音不可用', result.error || '语音功能在此平台不可用');
    }
  }, [voiceEnabled, collabRoomCode, user]);

  const handleToggleChat = useCallback(() => {
    setChatVisible((prev) => !prev);
  }, []);

  const handleSendChat = useCallback((text) => {
    const msg = { text, from: 'me', nickname: user?.nickname || '我' };
    setChatMessages((prev) => [...prev, msg]);
    collabSocket.emit('chat_message', {
      room_code: collabRoomCode,
      from: user?.user_id,
      nickname: user?.nickname || '匿名',
      text,
      timestamp: new Date().toISOString(),
    });
  }, [collabRoomCode, user]);

  const handleShareWardrobe = useCallback(() => {
    setShowShareWardrobe(true);
  }, []);

  const handleShared = useCallback((itemIds) => {
    collabSocket.emit('share_wardrobe_broadcast', {
      room_code: collabRoomCode,
      from_user_id: user?.user_id,
      from_nickname: user?.nickname,
      item_ids: itemIds,
    });
    toast(`已分享 ${itemIds.length} 件衣物给好友`);
  }, [collabRoomCode, user]);

  // ── Canvas sync emit helpers ──
  const emitElementAdded = useCallback((element) => {
    if (!collabConnected || isRemoteAction.current) return;
    collabSocket.emit('canvas_element_added', {
      room_code: collabRoomCode,
      element,
    });
  }, [collabConnected, collabRoomCode]);

  const emitElementUpdated = useCallback((elementId, updates) => {
    if (!collabConnected || isRemoteAction.current) return;
    collabSocket.emit('canvas_element_updated', {
      room_code: collabRoomCode,
      element_id: elementId,
      updates,
    });
  }, [collabConnected, collabRoomCode]);

  const emitElementRemoved = useCallback((elementId) => {
    if (!collabConnected || isRemoteAction.current) return;
    collabSocket.emit('canvas_element_removed', {
      room_code: collabRoomCode,
      element_id: elementId,
    });
  }, [collabConnected, collabRoomCode]);

  const emitBgChanged = useCallback((background) => {
    if (!collabConnected || isRemoteAction.current) return;
    collabSocket.emit('canvas_background_changed', {
      room_code: collabRoomCode,
      background,
    });
  }, [collabConnected, collabRoomCode]);

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

  const canvasWardrobeIds = useMemo(() => {
    const ids = new Set();
    for (const el of canvasElements) {
      if (el.type === 'clothing') ids.add(el.wardrobeId);
    }
    return ids;
  }, [canvasElements]);

  // Toggle item on/off canvas
  const toggleItem = useCallback((item) => {
    setCanvasElements((prev) => {
      const existing = prev.find((el) => el.type === 'clothing' && el.wardrobeId === item.id);
      if (existing) {
        emitElementRemoved(existing.id);
        const next = prev.filter((el) => el.id !== existing.id);
        if (selectedElementId === existing.id) {
          setSelectedElementId(null);
        }
        return next;
      }
      const maxZ = prev.length > 0 ? Math.max(...prev.map((e) => e.zIndex)) : 0;
      const newElement = {
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
        opacity: 1,
        zIndex: maxZ + 1,
      };
      emitElementAdded(newElement);
      return [...prev, newElement];
    });
  }, [selectedElementId, emitElementAdded, emitElementRemoved]);

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

  // Update element position — RAF batch for smooth 60fps drag
  const onUpdateElement = useCallback((id, updates) => {
    pendingElementUpdates.current[id] = {
      ...(pendingElementUpdates.current[id] || {}),
      ...updates,
    };
    if (rafScheduled.current) return;
    rafScheduled.current = true;
    requestAnimationFrame(() => {
      rafScheduled.current = false;
      const batch = pendingElementUpdates.current;
      pendingElementUpdates.current = {};
      setCanvasElements((prev) =>
        prev.map((el) => { const u = batch[el.id]; return u ? { ...el, ...u } : el; })
      );
      Object.keys(batch).forEach((id) => emitElementUpdated(id, batch[id]));
    });
  }, [emitElementUpdated]);

  // Delete element
  const deleteElement = useCallback(
    (id) => {
      setCanvasElements((prev) => prev.filter((el) => el.id !== id));
      if (selectedElementId === id) setSelectedElementId(null);
      emitElementRemoved(id);
    },
    [selectedElementId, emitElementRemoved]
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
    const target = canvasElements.find((el) => el.id === selectedElementId);
    if (target) {
      const newScale = Math.max(SCALE_RANGE.min, Math.min(SCALE_RANGE.max, (target.scale || 1) + delta));
      emitElementUpdated(selectedElementId, { scale: newScale });
    }
  }, [selectedElementId, canvasElements, emitElementUpdated]);

  const rotateElement = useCallback((degrees) => {
    if (!selectedElementId) return;
    setCanvasElements((prev) =>
      prev.map((el) =>
        el.id === selectedElementId
          ? { ...el, rotation: degrees }
          : el
      )
    );
    emitElementUpdated(selectedElementId, { rotation: degrees });
  }, [selectedElementId, emitElementUpdated]);

  // Layer controls
  const moveLayerUp = useCallback(() => {
    if (!selectedElementId) return;
    setCanvasElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((el) => el.id === selectedElementId);
      if (idx === -1 || idx === sorted.length - 1) return prev;
      [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
      const result = sorted.map((el, i) => ({ ...el, zIndex: i }));
      emitElementUpdated(selectedElementId, { zIndex: result.find((el) => el.id === selectedElementId)?.zIndex });
      return result;
    });
  }, [selectedElementId, emitElementUpdated]);

  const moveLayerDown = useCallback(() => {
    if (!selectedElementId) return;
    setCanvasElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((el) => el.id === selectedElementId);
      if (idx <= 0) return prev;
      [sorted[idx], sorted[idx - 1]] = [sorted[idx - 1], sorted[idx]];
      const result = sorted.map((el, i) => ({ ...el, zIndex: i }));
      emitElementUpdated(selectedElementId, { zIndex: result.find((el) => el.id === selectedElementId)?.zIndex });
      return result;
    });
  }, [selectedElementId, emitElementUpdated]);

  const moveLayerTop = useCallback(() => {
    if (!selectedElementId) return;
    setCanvasElements((prev) => {
      const maxZ = Math.max(...prev.map((e) => e.zIndex), 0);
      const result = prev.map((el) =>
        el.id === selectedElementId ? { ...el, zIndex: maxZ + 1 } : el
      );
      emitElementUpdated(selectedElementId, { zIndex: maxZ + 1 });
      return result;
    });
  }, [selectedElementId, emitElementUpdated]);

  const moveLayerBottom = useCallback(() => {
    if (!selectedElementId) return;
    setCanvasElements((prev) => {
      const minZ = Math.min(...prev.map((e) => e.zIndex), 0);
      const result = prev.map((el) =>
        el.id === selectedElementId ? { ...el, zIndex: minZ - 1 } : el
      );
      emitElementUpdated(selectedElementId, { zIndex: minZ - 1 });
      return result;
    });
  }, [selectedElementId, emitElementUpdated]);

  // Stable slider callbacks (use ref to avoid creating new functions every render)
  const handleScaleSliderChange = useCallback((v) => {
    const id = selectedElementIdRef.current;
    if (!id) return;
    setCanvasElements((prev) => prev.map((el) => el.id === id ? { ...el, scale: v } : el));
    emitElementUpdated(id, { scale: v });
  }, [emitElementUpdated]);

  const handleOpacitySliderChange = useCallback((v) => {
    const id = selectedElementIdRef.current;
    if (!id) return;
    const op = Math.round(v * 10) / 10;
    setCanvasElements((prev) => prev.map((el) => el.id === id ? { ...el, opacity: op } : el));
    emitElementUpdated(id, { opacity: op });
  }, [emitElementUpdated]);

  // Eraser result callback: push prev image to undo stack before replacing
  const handleEraserResult = useCallback((elementId, dataUrl) => {
    setCanvasElements((prev) => {
      const el = prev.find((e) => e.id === elementId);
      if (el) {
        eraserSnapshotsRef.current.push({ id: elementId, image: el.image });
      }
      return prev.map((el) => el.id === elementId ? { ...el, image: dataUrl } : el);
    });
    emitElementUpdated(elementId, { image: dataUrl });
  }, [emitElementUpdated]);

  // Eraser undo: pop last stroke from stack
  const handleEraserUndo = useCallback(() => {
    const snapshots = eraserSnapshotsRef.current;
    if (snapshots.length === 0) return;
    const snapshot = snapshots.pop();
    setCanvasElements((prev) =>
      prev.map((el) => el.id === snapshot.id ? { ...el, image: snapshot.image } : el)
    );
    emitElementUpdated(snapshot.id, { image: snapshot.image });
  }, [emitElementUpdated]);

  // Background: set color
  const setBgColor = useCallback((color) => {
    const bg = { type: 'color', value: color };
    setCanvasBackground(bg);
    emitBgChanged(bg);
    setShowBgColorPicker(false);
    setShowBgSheet(false);
  }, [emitBgChanged]);

  // Background: pick image
  const pickBgImage = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('权限不足', '需要相册权限才能选择背景图片');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        base64: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        const bg = { type: 'image', uri: result.assets[0].uri };
        setCanvasBackground(bg);
        emitBgChanged(bg);
        setShowBgSheet(false);
      }
    } catch (e) {
      console.error('Pick bg image error:', e);
    }
  }, [emitBgChanged]);

  const confirmPortrait = useCallback(() => {
    if (!portraitImage) return;
    setCanvasElements((prev) => {
      const maxZ = Math.max(...prev.map((e) => e.zIndex), 0);
      const newElement = {
        id: generateElementId(),
        type: 'face',
        wardrobeId: null,
        image: portraitImage,
        category: null,
        name: '人脸',
        ...getDefaultPosition('face'),
        scale: 0.8,
        rotation: 0,
        opacity: 1,
        zIndex: maxZ + 10,
      };
      emitElementAdded(newElement);
      return [...prev, newElement];
    });
    setPortraitImage(null);
    setShowPortraitPreview(false);
  }, [portraitImage, emitElementAdded]);

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
    try {
      if (canvasRef.current) {
        const previewUri = await captureRef(canvasRef.current, { format: 'png', quality: 0.7 });
        setSaveModalPreview(previewUri);
      }
    } catch {
      // Preview capture failed
    }
  }, [canvasElements, selectedDate]);

  const confirmSave = useCallback(async () => {
    const clothingItems = canvasElements.filter((el) => el.type === 'clothing');
    if (clothingItems.length === 0) return;
    setSaving(true);
    try {
      const wardrobeIds = clothingItems.map((el) => el.wardrobeId);
      // Strip base64 image data from canvas elements to keep note small
      const lightElements = canvasElements.map(({ image, src, ...rest }) => rest);
      const noteData = JSON.stringify({
        canvasElements: lightElements,
        background: canvasBackground,
      });
      await createOutfit({
        log_date: selectedDate,
        wardrobe_item_ids: wardrobeIds,
        note: noteData,
      });
      let processedImage = '';
      try {
        if (canvasRef.current) {
          processedImage = await captureRef(canvasRef.current, { format: 'png', quality: 0.8, result: 'data-uri' });
        }
      } catch {}
      // Web fallback: use html2canvas if captureRef fails
      if (!processedImage && Platform.OS === 'web' && canvasRef.current) {
        try {
          const { default: html2canvas } = await import('html2canvas');
          const c = await html2canvas(canvasRef.current, { backgroundColor: '#FFFFFF' });
          processedImage = c.toDataURL('image/png');
        } catch {}
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

  // Export canvas to gallery (native) or download (web)
  const exportCanvas = useCallback(async () => {
    try {
      if (!canvasRef.current) {
        Alert.alert('导出失败', '画布未就绪');
        return;
      }
      if (Platform.OS === 'web') {
        let uri;
        try {
          uri = await captureRef(canvasRef.current, { format: 'png', quality: 1.0 });
        } catch (captureErr) {
          console.warn('captureRef failed, trying html2canvas fallback:', captureErr);
          // Fallback: try to find a canvas element or screenshot the DOM
          const node = canvasRef.current;
          if (node) {
            const { default: html2canvas } = await import('html2canvas');
            const c = await html2canvas(node, { backgroundColor: null });
            uri = c.toDataURL('image/png');
          }
        }
        if (!uri) {
          Alert.alert('导出失败', '无法生成图片');
          return;
        }
        const a = document.createElement('a');
        a.download = `ai-wardrobe-${selectedDate}.png`;
        a.href = uri;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('已下载到本地');
        return;
      }
      const { requestPermissionsAsync, saveToLibraryAsync } = require('expo-media-library');
      const { status } = await requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要相册权限才能保存图片');
        return;
      }
      const uri = await captureRef(canvasRef.current, { format: 'png', quality: 1.0 });
      await saveToLibraryAsync(uri);
      toast('已保存到相册');
    } catch (e) {
      console.error('Export error:', e);
      Alert.alert('导出失败', e?.message || '保存到相册时出错，请重试');
    }
  }, [selectedDate]);

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

  const selectedElement = useMemo(
    () => canvasElements.find((el) => el.id === selectedElementId) || null,
    [canvasElements, selectedElementId]
  );

  const ClothingStripItem = useMemo(() => React.memo(function({ item, onCanvas, onToggle }) {
    return (
      <Pressable style={[styles.clothingItem, onCanvas && styles.clothingItemActive]} onPress={() => onToggle(item)}>
        <Image source={getImageSource(item.processed_image)} style={styles.clothingThumb} resizeMode="contain" />
        {onCanvas && (<View style={styles.checkBadge}><Text style={styles.checkText}>✓</Text></View>)}
        <Text style={styles.clothingName} numberOfLines={1}>{item.sub_tag || item.name || ''}</Text>
      </Pressable>
    );
  }), []);

  return (
    <View style={styles.container}>
      {/* ===== Header ===== */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => {
          if (collabConnected) handleLeaveCollab();
          if (Platform.OS === 'web') router.replace('/');
          else router.back();
        }}>
          <Text style={styles.headerBtnText}>{Platform.OS === 'web' ? '← 主页' : '← 返回'}</Text>
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

      <Pressable style={{ flex: 1 }} onPress={selectedElementId && !eraserMode ? () => setSelectedElementId(null) : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!interacting}
        >

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

      {/* ===== Collab Toolbar ===== */}
      <CollabToolbar
        isConnected={collabConnected}
        partnerNickname={partnerNickname}
        roomCode={collabRoomCode}
        voiceEnabled={voiceEnabled}
        chatVisible={chatVisible}
        onToggleVoice={handleToggleVoice}
        onToggleChat={handleToggleChat}
        onLeave={handleLeaveCollab}
        onShareWardrobe={handleShareWardrobe}
      />

      {/* ===== Canvas & Controls ===== */}
      {Platform.OS === 'web' ? (
        <View style={styles.canvasRow}>
          <Pressable style={[styles.canvasArea, { paddingVertical: 0 }]} onPress={() => setSelectedElementId(null)}>
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
                eraserMode={eraserMode}
                eraserSize={eraserSize}
                eraserSoftness={eraserSoftness}
                eraserStrength={eraserStrength}
                onEraserResult={handleEraserResult}
                onInteractStart={() => setInteracting(true)}
                onInteractEnd={() => setInteracting(false)}
              />
            )}
          </Pressable>
          <View style={styles.controlPanel}>
            {selectedElement ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
                  <Text style={styles.controlPanelTitle} numberOfLines={1}>
                    {selectedElement.name || (selectedElement.type === 'face' ? '人脸' : '未命名')}
                  </Text>
                  <Pressable style={styles.delBtn} onPress={() => deleteElement(selectedElement.id)}>
                    <Text style={styles.delBtnText}>删除</Text>
                  </Pressable>
                </View>
                <View style={[styles.selectedActions, { flexWrap: 'wrap', justifyContent: 'center' }]}>
                  <ScaleSlider
                    value={selectedElement.scale || 1}
                    min={SCALE_RANGE.min}
                    max={SCALE_RANGE.max}
                    step={SCALE_RANGE.step}
                    onChange={handleScaleSliderChange}
                  />
                </View>
                <View style={{ alignItems: 'center', marginBottom: 4 }}>
                  <WebPositionSlider
                    label="透明"
                    value={selectedElement.opacity != null ? selectedElement.opacity : 1}
                    min={0.1}
                    max={1}
                    onChange={handleOpacitySliderChange}
                    displayValue={(selectedElement.opacity != null ? selectedElement.opacity : 1).toFixed(1)}
                    decimal
                  />
                </View>
                {eraserMode && (
                  <View style={{ alignItems: 'center', marginBottom: 4, width: '100%' }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#DC2626', marginBottom: 4 }}>✏️ 橡皮擦</Text>
                    <WebPositionSlider
                      label="大小"
                      value={eraserSize}
                      min={5}
                      max={80}
                      onChange={setEraserSize}
                      displayValue={`${eraserSize}px`}
                      thumbColor="#EF4444"
                      trackColor="#FEE2E2"
                    />
                    <WebPositionSlider
                      label="柔和"
                      value={eraserSoftness}
                      min={0}
                      max={1}
                      onChange={(v) => setEraserSoftness(Math.round(v * 10) / 10)}
                      displayValue={eraserSoftness.toFixed(1)}
                      thumbColor="#EF4444"
                      trackColor="#FEE2E2"
                      decimal
                    />
                    <WebPositionSlider
                      label="强度"
                      value={eraserStrength}
                      min={0.1}
                      max={1}
                      onChange={(v) => setEraserStrength(Math.round(v * 10) / 10)}
                      displayValue={eraserStrength.toFixed(1)}
                      thumbColor="#EF4444"
                      trackColor="#FEE2E2"
                      decimal
                    />
                    {eraserSnapshotsRef.current.length > 0 && (
                      <Pressable
                        style={[styles.delBtn, { backgroundColor: '#FEF3C7', marginTop: 4 }]}
                        onPress={handleEraserUndo}
                      >
                        <Text style={[styles.delBtnText, { color: '#D97706' }]}>↩ 回退</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <View style={styles.rotationRow}>
                  <RotationSlider
                    rotation={selectedElement.rotation || 0}
                    onRotate={rotateElement}
                  />
                </View>
                <View style={{ alignItems: 'center', marginBottom: 6 }}>
                  <WebPositionSlider
                    label="X 位置"
                    value={Math.round(selectedElement.x || 0)}
                    min={0}
                    max={CANVAS_W}
                    onChange={(x) => onUpdateElement(selectedElement.id, { x })}
                  />
                  <WebPositionSlider
                    label="Y 位置"
                    value={Math.round(selectedElement.y || 0)}
                    min={0}
                    max={CANVAS_H}
                    onChange={(y) => onUpdateElement(selectedElement.id, { y })}
                  />
                </View>
                <View style={[styles.layerActions, { justifyContent: 'center' }]}>
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
              </>
            ) : (
              <Text style={styles.controlPanelHint}>点击画布上的衣物{'\n'}进行编辑</Text>
            )}
          </View>
        </View>
      ) : (
        <>
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
                eraserMode={eraserMode}
                eraserSize={eraserSize}
                eraserSoftness={eraserSoftness}
                eraserStrength={eraserStrength}
                onEraserResult={handleEraserResult}
                onInteractStart={() => setInteracting(true)}
                onInteractEnd={() => setInteracting(false)}
              />
            )}
          </Pressable>
          {/* ===== Selected Element Controls (Mobile) ===== */}
          {selectedElement && (
            <View style={styles.selectedInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={styles.selectedLabel} numberOfLines={1}>
                  {selectedElement.name || (selectedElement.type === 'face' ? '人脸' : '未命名')}
                </Text>
                <Pressable style={styles.delBtn} onPress={() => deleteElement(selectedElement.id)}>
                  <Text style={styles.delBtnText}>删除</Text>
                </Pressable>
              </View>
              <View style={[styles.selectedActions, { flexWrap: 'wrap', justifyContent: 'center' }]}>
                <ScaleSlider
                  value={selectedElement.scale || 1}
                  min={SCALE_RANGE.min}
                  max={SCALE_RANGE.max}
                  step={SCALE_RANGE.step}
                  onChange={handleScaleSliderChange}
                />
              </View>
              <View style={[styles.selectedActions, { flexWrap: 'wrap', justifyContent: 'center' }]}>
                <ScaleSlider
                  label="透明"
                  value={selectedElement.opacity != null ? selectedElement.opacity : 1}
                  min={0.1}
                  max={1}
                  step={0.1}
                  onChange={handleOpacitySliderChange}
                  displayValue={(selectedElement.opacity != null ? selectedElement.opacity : 1).toFixed(1)}
                />
              </View>
              {eraserMode && (
                <View style={{ alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#DC2626', marginBottom: 4 }}>✏️ 橡皮擦</Text>
                  <ScaleSlider label="大小" value={eraserSize} min={5} max={80} step={5} onChange={setEraserSize} displayValue={`${eraserSize}px`} />
                  <ScaleSlider label="柔和" value={eraserSoftness} min={0} max={1} step={0.1} onChange={(v) => setEraserSoftness(Math.round(v * 10) / 10)} displayValue={eraserSoftness.toFixed(1)} />
                  <ScaleSlider label="强度" value={eraserStrength} min={0.1} max={1} step={0.1} onChange={(v) => setEraserStrength(Math.round(v * 10) / 10)} displayValue={eraserStrength.toFixed(1)} />
                  {eraserSnapshotsRef.current.length > 0 && (
                    <Pressable style={[styles.delBtn, { backgroundColor: '#FEF3C7', marginTop: 4 }]} onPress={handleEraserUndo}>
                      <Text style={[styles.delBtnText, { color: '#D97706' }]}>↩ 回退</Text>
                    </Pressable>
                  )}
                </View>
              )}
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
        </>
      )}

      {/* ===== Canvas Toolbar ===== */}
      <View style={styles.toolbar}>
        {Platform.OS === 'web' && (
          <Pressable
            style={[styles.toolBtn, eraserMode && { backgroundColor: '#FEE2E2', borderColor: '#EF4444', borderWidth: 1 }]}
            onPress={() => setEraserMode((v) => !v)}
          >
            <Text style={[styles.toolBtnText, eraserMode && { color: '#DC2626' }]}>
              {eraserMode ? '✏️ 橡皮擦(开)' : '✏️ 橡皮擦'}
            </Text>
          </Pressable>
        )}
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
            renderItem={({ item }) => (
              <ClothingStripItem item={item} onCanvas={canvasWardrobeIds.has(item.id)} onToggle={toggleItem} />
            )}
          />
        )}
      </View>

      {/* ===== Shared Wardrobe Section ===== */}
      {sharedGroups.length > 0 && (
        <View style={labSharedStyles.container}>
          <Text style={labSharedStyles.title}>🤝 好友分享的衣服</Text>
          {sharedGroups.map((group) => (
            <View key={group.owner_id} style={labSharedStyles.group}>
              <Text style={labSharedStyles.ownerLabel}>来自 {group.owner_nickname}</Text>
              <View style={labSharedStyles.grid}>
                {group.items.map((item) => (
                  <Pressable
                    key={item.id}
                    style={labSharedStyles.card}
                    onPress={() => toggleItem(item)}
                  >
                    <Image
                      source={getImageSource(item.processed_image)}
                      style={labSharedStyles.cardImage}
                      resizeMode="contain"
                    />
                    <Text style={labSharedStyles.cardTag} numberOfLines={1}>
                      {item.sub_tag || item.category || ''}
                    </Text>
                    {canvasWardrobeIds.has(item.id) && (
                      <View style={labSharedStyles.onCanvasBadge}>
                        <Text style={labSharedStyles.badgeText}>已上画布</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ===== Friend Collab Button ===== */}
      <View style={styles.bottomBar}>
        <Pressable
          style={styles.collabBtn}
          onPress={() => setShowCollabInvite(true)}
        >
          <Text style={styles.collabBtnText}>👥 邀请好友共创</Text>
        </Pressable>
      </View>

      {/* ===== Collab Chat Panel ===== */}
      <CollabChat
        messages={chatMessages}
        onSend={handleSendChat}
        partnerNickname={partnerNickname}
        visible={chatVisible && collabConnected}
      />

      </ScrollView>
      </Pressable>

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
              const bg = { type: 'color', value: '#FFFFFF' };
              setCanvasBackground(bg);
              emitBgChanged(bg);
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
          {Platform.OS !== 'web' && (
            <Pressable
              style={styles.sheetOption}
              onPress={() => {
                pendingFaceRef.current = 'camera';
                setShowFaceSheet(false);
              }}
            >
              <Text style={styles.sheetOptionText}>📷 拍照</Text>
            </Pressable>
          )}
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

      {/* ===== Collab Invite Modal ===== */}
      <CollabInviteModal
        visible={showCollabInvite}
        onClose={() => setShowCollabInvite(false)}
        onRoomReady={handleCollabRoomReady}
      />

      {/* ===== Share Wardrobe Sheet ===== */}
      <ShareWardrobeSheet
        visible={showShareWardrobe}
        items={allItems}
        onClose={() => setShowShareWardrobe(false)}
        onShared={handleShared}
        roomCode={collabRoomCode}
      />
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
  canvasRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  controlPanel: {
    width: 200,
    minHeight: CANVAS_H,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  controlPanelTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4338CA',
    marginBottom: 10,
    maxWidth: 180,
    textAlign: 'center',
  },
  controlPanelHint: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
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

// Shared wardrobe styles for OOTD Lab
const labSharedStyles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C2410C',
    marginBottom: 8,
  },
  group: {
    marginBottom: 8,
  },
  ownerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9A3412',
    marginBottom: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 6,
  },
  card: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
  },
  cardImage: {
    width: '100%',
    height: 100,
    borderRadius: 6,
    backgroundColor: '#F9FAFB',
  },
  cardTag: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
    marginTop: 4,
    textAlign: 'center',
  },
  onCanvasBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#10B981',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
  },
});
