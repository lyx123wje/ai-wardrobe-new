import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Pressable, ScrollView, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';

// SVG 字符串
import cognitionXml from '../src/assets/svg/穿着认知.js';
import wardrobeXml from '../src/assets/svg/衣柜.js';
import laundryXml from '../src/assets/svg/脏衣篓.js';
import calendarXml from '../src/assets/svg/穿搭日历.js';
import labXml from '../src/assets/svg/穿搭实验室.js';
import statsXml from '../src/assets/svg/统计.js';
import resellXml from '../src/assets/svg/卖了还钱.js';

const { width: W, height: H } = Dimensions.get('window');

const ITEMS = [
  { path: '/dressing-cognition', label: '穿着认知', svg: cognitionXml, color: '#6366f1' },
  { path: '/wardrobe',           label: '衣柜',     svg: wardrobeXml,   color: '#8b5cf6' },
  { path: '/laundry-basket',     label: '脏衣篓',   svg: laundryXml,    color: '#ec4899' },
  { path: '/outfit-calendar',    label: '穿搭日历', svg: calendarXml,   color: '#f59e0b' },
  { path: '/ootd-lab',           label: '穿搭实验室', svg: labXml,      color: '#10b981' },
  { path: '/statistics',         label: '统计',     svg: statsXml,      color: '#06b6d4' },
  { path: '/resell-center',      label: '卖了还钱', svg: resellXml,     color: '#ef4444' },
];

const DEFAULT_COORDS = [
  { x: W * -0.386, y: H * 0.189, size: 800 },  // 穿着认知
  { x: W * -0.515, y: H * 0.094, size: 800 },  // 衣柜
  { x: W * -0.423, y: H * 0.368, size: 445 },  // 脏衣篓
  { x: W *  0.132, y: H * 0.550, size: 420 },  // 穿搭日历
  { x: W * -0.452, y: H * 0.062, size: 633 },  // 穿搭实验室
  { x: W * -0.096, y: H * -0.056, size: 639 },  // 统计
  { x: W * -0.158, y: H * 0.423, size: 533 },  // 卖了还钱
];

const DEFAULT_HIT = [
  { left: 0.360, top: 0.320, w: 0.160, h: 0.240 },  // 穿着认知
  { left: 0.560, top: 0.180, w: 0.200, h: 0.300 },  // 衣柜
  { left: 0.380, top: 0.500, w: 0.200, h: 0.240 },  // 脏衣篓
  { left: 0.580, top: 0.260, w: 0.140, h: 0.180 },  // 穿搭日历
  { left: 0.300, top: 0.280, w: 0.180, h: 0.400 },  // 穿搭实验室
  { left: 0.360, top: 0.200, w: 0.180, h: 0.160 },  // 统计
  { left: 0.360, top: 0.520, w: 0.140, h: 0.160 },  // 卖了还钱
];

export default function Home() {
  const router = useRouter();
  const [debugMode, setDebugMode] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [hitAreas, setHitAreas] = useState(DEFAULT_HIT);
  const [lockedItems, setLockedItems] = useState(new Set());
  const [panelExpanded, setPanelExpanded] = useState(false);

  // SVG 缩放/位移
  const nudge = (key, delta) => {
    setCoords(prev => prev.map((c, i) => {
      if (i !== selected) return c;
      const next = { ...c, [key]: c[key] + delta };
      if (key === 'size') next.size = Math.max(60, Math.min(800, next.size));
      if (key === 'x') next.x = Math.max(-next.size * 0.5, Math.min(W - next.size * 0.5, next.x));
      if (key === 'y') next.y = Math.max(-next.size * 0.5, Math.min(H - next.size * 0.5, next.y));
      return next;
    }));
  };

  // 触控区独立调节（SVG 不动）
  const nudgeHit = (key, delta) => {
    setHitAreas(prev => prev.map((h, i) => {
      if (i !== selected) return h;
      const next = { ...h, [key]: Math.max(0.02, Math.min(0.98, h[key] + delta)) };
      // 边界校验：left + w 不超出容器
      if (key === 'w' && next.left + next.w > 0.98) next.w = 0.98 - next.left;
      if (key === 'left' && next.left + next.w > 0.98) next.left = 0.98 - next.w;
      if (key === 'h' && next.top + next.h > 0.98) next.h = 0.98 - next.top;
      if (key === 'top' && next.top + next.h > 0.98) next.top = 0.98 - next.h;
      return next;
    }));
  };

  const toggleLock = (i) => {
    setLockedItems(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const formatOutput = () => {
    return coords.map((c, i) =>
      `  { x: W * ${(c.x / W).toFixed(3)}, y: H * ${(c.y / H).toFixed(3)}, size: ${c.size} },  // ${ITEMS[i].label}`
    ).join('\n');
  };

  const formatHitOutput = () => {
    return hitAreas.map((h, i) =>
      `  { left: ${h.left.toFixed(3)}, top: ${h.top.toFixed(3)}, w: ${h.w.toFixed(3)}, h: ${h.h.toFixed(3)} },  // ${ITEMS[i].label}`
    ).join('\n');
  };

  // 选中的是 locked 还是 unlocked
  const isSelectedLocked = selected >= 0 && lockedItems.has(selected);

  return (
    <ImageBackground source={require('../assets/背景图片.jpg')} style={styles.canvas} resizeMode="cover">
      {ITEMS.map((item, i) => (
        <FloatingItem
          key={item.path}
          index={i}
          label={item.label}
          svg={item.svg}
          color={item.color}
          coord={coords[i]}
          hitArea={hitAreas[i]}
          debugMode={debugMode}
          selected={selected === i}
          isLocked={lockedItems.has(i)}
          onSelect={() => { setSelected(i); }}
          onNavigate={() => router.push(item.path)}
        />
      ))}

      {/* 调试按钮 */}
      <Pressable
        style={[styles.debugBtn, debugMode && styles.debugBtnActive]}
        onPress={() => { setDebugMode(!debugMode); setSelected(-1); }}
      >
        <Text style={[styles.debugBtnText, debugMode && { color: '#fff' }]}>
          {debugMode ? '退出调试' : '调试'}
        </Text>
      </Pressable>

      {/* 调试面板 — 可折叠 */}
      {debugMode && (
        <View style={[styles.panel, !panelExpanded && styles.panelCollapsed]}>
          {/* 顶栏：选项卡 + 折叠按钮 */}
          <View style={styles.panelHeader}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
              {ITEMS.map((item, i) => (
                <Pressable
                  key={item.path}
                  style={[
                    styles.tab,
                    selected === i && styles.tabActive,
                    lockedItems.has(i) && selected !== i && styles.tabLocked,
                  ]}
                  onPress={() => { setSelected(i); setPanelExpanded(true); }}
                >
                  <Text style={[styles.tabText, selected === i && styles.tabTextActive]}>
                    {lockedItems.has(i) ? '🔒' : ''}{item.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.expandBtn}
              onPress={() => setPanelExpanded(prev => !prev)}
            >
              <Text style={styles.expandBtnText}>
                {panelExpanded ? '▲ 收起' : '▼ 展开'}
              </Text>
            </Pressable>
          </View>

          {/* 展开内容 */}
          {panelExpanded && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {selected >= 0 && (
                <>
                  {/* ── SVG 控件 ── */}
                  <Text style={styles.sectionLabel}>SVG 定位 &amp; 大小</Text>
                  <View style={styles.ctrlRow}>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudge('size', -10)}>
                      <Text style={styles.ctrlBtnText}>− 缩小</Text>
                    </Pressable>
                    <Text style={styles.sizeVal}>{coords[selected].size}</Text>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudge('size', 10)}>
                      <Text style={styles.ctrlBtnText}>+ 放大</Text>
                    </Pressable>
                  </View>
                  <View style={styles.ctrlRow}>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudge('y', -10)}><Text style={styles.ctrlBtnText}>↑</Text></Pressable>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudge('x', -10)}><Text style={styles.ctrlBtnText}>←</Text></Pressable>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudge('x', 10)}><Text style={styles.ctrlBtnText}>→</Text></Pressable>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudge('y', 10)}><Text style={styles.ctrlBtnText}>↓</Text></Pressable>
                  </View>

                  {/* ── 触控区控件 ── */}
                  <Text style={styles.sectionLabel}>触控区（红色框）独立调节</Text>
                  <View style={styles.ctrlRow}>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudgeHit('w', -0.02)}>
                      <Text style={styles.ctrlBtnText}>− 宽度</Text>
                    </Pressable>
                    <Text style={styles.sizeVal}>{Math.round(coords[selected].size * hitAreas[selected].w)}px</Text>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudgeHit('w', 0.02)}>
                      <Text style={styles.ctrlBtnText}>+ 宽度</Text>
                    </Pressable>
                  </View>
                  <View style={styles.ctrlRow}>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudgeHit('h', -0.02)}>
                      <Text style={styles.ctrlBtnText}>− 高度</Text>
                    </Pressable>
                    <Text style={styles.sizeVal}>{Math.round(coords[selected].size * hitAreas[selected].h)}px</Text>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudgeHit('h', 0.02)}>
                      <Text style={styles.ctrlBtnText}>+ 高度</Text>
                    </Pressable>
                  </View>
                  <View style={styles.ctrlRow}>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudgeHit('top', -0.02)}><Text style={styles.ctrlBtnText}>↑</Text></Pressable>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudgeHit('left', -0.02)}><Text style={styles.ctrlBtnText}>←</Text></Pressable>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudgeHit('left', 0.02)}><Text style={styles.ctrlBtnText}>→</Text></Pressable>
                    <Pressable style={styles.ctrlBtn} onPress={() => nudgeHit('top', 0.02)}><Text style={styles.ctrlBtnText}>↓</Text></Pressable>
                  </View>

                  {/* 锁定 / 解锁 */}
                  <View style={styles.ctrlRow}>
                    <Pressable
                      style={[styles.lockBtn, isSelectedLocked && styles.lockBtnActive]}
                      onPress={() => toggleLock(selected)}
                    >
                      <Text style={[styles.lockBtnText, isSelectedLocked && styles.lockBtnTextActive]}>
                        {isSelectedLocked ? '🔓 解锁当前' : '🔒 锁定当前'}
                      </Text>
                    </Pressable>
                  </View>

                  {lockedItems.size > 0 && (
                    <View style={styles.ctrlRow}>
                      <Pressable
                        style={styles.ctrlBtn}
                        onPress={() => setLockedItems(new Set())}
                      >
                        <Text style={styles.ctrlBtnText}>全部解锁</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}

              {/* 坐标输出（可选中复制） */}
              <View style={styles.outputBox}>
                <Text style={styles.outputLabel}>SVG 坐标：</Text>
                <ScrollView style={styles.outputScroll} nestedScrollEnabled>
                  <Text style={styles.outputText} selectable>
                    {'const COORDS = [\n' + formatOutput() + '\n];'}
                  </Text>
                </ScrollView>
              </View>

              <View style={styles.outputBox}>
                <Text style={styles.outputLabel}>触控区比例（左:上:宽:高 相对于容器 size）：</Text>
                <ScrollView style={styles.outputScroll} nestedScrollEnabled>
                  <Text style={styles.outputText} selectable>
                    {'const HIT_AREAS = [\n' + formatHitOutput() + '\n];'}
                  </Text>
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      )}
    </ImageBackground>
  );
}

// ── 单个 SVG 浮动项 ──
function FloatingItem({ svg, label, color, index, coord, hitArea, debugMode, selected, isLocked, onSelect, onNavigate }) {
  const floatY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  // 浮动动画（调试模式下暂停选中项）
  useEffect(() => {
    if (debugMode && selected) { floatY.setValue(0); return; }
    const t = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatY, { toValue: -16, duration: 3200 + index * 600, useNativeDriver: true }),
          Animated.timing(floatY, { toValue: 0, duration: 3200 + index * 600, useNativeDriver: true }),
        ]),
      ).start();
    }, index * 500);
    return () => clearTimeout(t);
  }, [debugMode, selected]);

  const onPressIn = () => {
    if (debugMode) return;
    Animated.spring(scale, { toValue: 0.85, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    if (debugMode) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 40 }).start();
    onNavigate();
  };

  const handlePress = () => {
    if (debugMode) {
      onSelect();
      return;
    }
  };

  // 调试可视化：只在 debugMode 且 (选中 或 锁定) 时显示边框
  const showDebug = debugMode && (selected || isLocked);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute', left: coord.x, top: coord.y,
        width: coord.size, height: coord.size,
        overflow: 'visible',
        transform: [{ translateY: floatY }, { scale }],
        zIndex: selected ? 99 : index + 2,
        // 蓝虚线：仅选中项显示容器边界
        ...(debugMode && selected ? {
          borderWidth: 1,
          borderColor: 'rgba(0,0,255,0.4)',
          borderStyle: 'dashed',
        } : {}),
      }}
    >
      {/* 视觉层 */}
      <View pointerEvents="none">
        <SvgXml xml={svg} width={coord.size} height={coord.size} fill={color} />
        {debugMode && selected && <View style={styles.dotBlue} />}
      </View>

      {/* 触控层 */}
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={handlePress}
        style={({ pressed }) => ({
          position: 'absolute',
          width: coord.size * hitArea.w,
          height: coord.size * hitArea.h,
          left: coord.size * hitArea.left,
          top: coord.size * hitArea.top,
          ...(showDebug ? {
            borderWidth: 2,
            borderColor: selected ? '#ef4444' : '#22c55e',
            backgroundColor: pressed
              ? (selected ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)')
              : (selected ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)'),
          } : {}),
        })}
      />

      {/* 长按标签 — 渲染在触控区正下方 */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: coord.size * hitArea.left,
          top: coord.size * (hitArea.top + hitArea.h) + 6,
          width: coord.size * hitArea.w,
          alignItems: 'center',
          opacity: scale.interpolate({ inputRange: [0.85, 1], outputRange: [1, 0] }),
        }}
      >
        <View style={styles.tagBubble}>
          <Text style={styles.tagText}>{label}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  // 调试按钮
  debugBtn: {
    position: 'absolute', top: 50, right: 14, zIndex: 1000,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  debugBtnActive: { backgroundColor: '#6366f1' },
  debugBtnText: { fontSize: 13, fontWeight: '600', color: '#6366f1' },
  // 调试面板
  panel: {
    position: 'absolute', bottom: 24, left: 12, right: 12, maxHeight: 420,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 10, zIndex: 1000,
  },
  panelCollapsed: { maxHeight: 58 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabRow: { maxHeight: 36, flex: 1 },
  tab: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    backgroundColor: '#f1f5f9', marginRight: 6,
  },
  tabActive: { backgroundColor: '#6366f1' },
  tabLocked: { backgroundColor: '#dcfce7' },
  tabText: { fontSize: 12, fontWeight: '500', color: '#64748b' },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  // 展开/收起按钮
  expandBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#f1f5f9', marginLeft: 6,
  },
  expandBtnText: { fontSize: 12, fontWeight: '600', color: '#6366f1' },
  // 分区标签
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#94a3b8',
    textAlign: 'center', marginBottom: 2, marginTop: 4,
    letterSpacing: 1,
  },
  // 控件
  ctrlRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 5 },
  ctrlBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  ctrlBtnText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  sizeVal: { fontSize: 16, fontWeight: '700', minWidth: 50, textAlign: 'center' },
  // 锁定按钮
  lockBtn: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fef3c7',
  },
  lockBtnActive: { backgroundColor: '#dcfce7' },
  lockBtnText: { fontSize: 14, fontWeight: '600', color: '#d97706' },
  lockBtnTextActive: { color: '#16a34a' },
  // 坐标输出
  outputBox: { marginTop: 6 },
  outputLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 6, textAlign: 'center' },
  outputScroll: { maxHeight: 60 },
  outputText: {
    backgroundColor: '#1e293b', padding: 12, borderRadius: 8,
    fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', lineHeight: 18,
  },
  // SVG 浮项
  dotBlue: {
    position: 'absolute', top: -4, right: -4,
    width: 16, height: 16, borderRadius: 8, backgroundColor: '#6366f1',
    borderWidth: 2, borderColor: '#fff',
  },
  tagBubble: {
    backgroundColor: 'rgba(30,41,59,0.88)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6,
  },
  tagText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
