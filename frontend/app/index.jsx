import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions, Animated, Pressable, ImageBackground, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { useAuth } from './_layout';

// SVG 字符串
import cognitionXml from '../src/assets/svg/穿着认知.js';
import wardrobeXml from '../src/assets/svg/衣柜.js';
import laundryXml from '../src/assets/svg/脏衣篓.js';
import calendarXml from '../src/assets/svg/穿搭日历.js';
import labXml from '../src/assets/svg/穿搭实验室.js';
import statsXml from '../src/assets/svg/统计.js';
import resellXml from '../src/assets/svg/卖了还钱.js';


const ITEMS = [
  { path: '/dressing-cognition', label: '思维训练',   svg: cognitionXml, color: '#6366f1', desc: '人物思维训练 & 周报' },
  { path: '/wardrobe',           label: '衣柜',       svg: wardrobeXml,   color: '#8b5cf6', desc: '衣物管理 & 智能管家' },
  { path: '/laundry-basket',     label: '脏衣篓',     svg: laundryXml,    color: '#ec4899', desc: '待洗衣物管理' },
  { path: '/outfit-calendar',    label: '穿搭日历',   svg: calendarXml,   color: '#f59e0b', desc: '穿搭记录 & 日记' },
  { path: '/ootd-lab',           label: '穿搭实验室', svg: labXml,        color: '#10b981', desc: '可视化搭配 & 协作' },
  { path: '/statistics',         label: '统计',       svg: statsXml,      color: '#06b6d4', desc: '消费 & 穿搭数据' },
  { path: '/resell-center',      label: '卖了还钱',   svg: resellXml,     color: '#ef4444', desc: '闲置衣物转卖' },
];

const DEFAULT_HIT = [
  { left: 0.360, top: 0.320, w: 0.160, h: 0.240 },
  { left: 0.560, top: 0.180, w: 0.200, h: 0.300 },
  { left: 0.380, top: 0.500, w: 0.200, h: 0.240 },
  { left: 0.580, top: 0.260, w: 0.140, h: 0.180 },
  { left: 0.300, top: 0.280, w: 0.180, h: 0.400 },
  { left: 0.360, top: 0.200, w: 0.180, h: 0.160 },
  { left: 0.360, top: 0.520, w: 0.140, h: 0.160 },
];


// ═══════════════════════════════════════════
//  Web 端主页：卡片网格
// ═══════════════════════════════════════════
function WebHome({ user, logout }) {
  const router = useRouter();

  return (
    <ScrollView style={webS.container} contentContainerStyle={webS.content}>
      <View style={webS.header}>
        <View>
          <Text style={webS.greeting}>AI 衣橱</Text>
          <Text style={webS.subtitle}>智能服装管理助手</Text>
        </View>
        <Pressable style={webS.userBtn} onPress={() => {
          Alert.alert('退出登录', '确定要退出登录吗？', [
            { text: '取消' },
            { text: '退出', style: 'destructive', onPress: logout },
          ]);
        }}>
          <Text style={webS.userText}>{user?.nickname || '用户'}</Text>
        </Pressable>
      </View>

      <View style={webS.grid}>
        {ITEMS.map((item) => (
          <Pressable
            key={item.path}
            style={webS.card}
            onPress={() => router.push(item.path)}
          >
            <View style={webS.iconWrap}>
              <SvgXml xml={item.svg} width={48} height={48} fill={item.color} />
            </View>
            <Text style={webS.cardTitle}>{item.label}</Text>
            <Text style={webS.cardDesc}>{item.desc}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const webS = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  content: { padding: 24, paddingTop: 40, maxWidth: 960, alignSelf: 'center', width: '100%' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 32,
  },
  greeting: { fontSize: 28, fontWeight: '800', color: '#1F2937' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  userBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
  },
  userText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 16,
  },
  card: {
    width: 'calc(33.33% - 11px)',
    minWidth: 200,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 16, backgroundColor: '#F8F9FC',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
});


// ═══════════════════════════════════════════
//  手机端主页：浮动 SVG（原版不变）
// ═══════════════════════════════════════════
function MobileHome({ user, logout }) {
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();
  const W = winW;
  const H = winH;

  const defaultCoords = useMemo(() => [
    { x: W * -0.386, y: H * 0.177, size: 800 },
    { x: W * -0.541, y: H * 0.082, size: 800 },
    { x: W * -0.449, y: H * 0.356, size: 445 },
    { x: W *  0.106, y: H * 0.503, size: 420 },
    { x: W * -0.426, y: H * 0.062, size: 633 },
    { x: W * -0.122, y: H * -0.056, size: 639 },
    { x: W * -0.184, y: H * 0.387, size: 533 },
  ], [W, H]);

  return (
    <ImageBackground source={require('../assets/bg.png')} style={mobileS.canvas} resizeMode="cover">
      {ITEMS.map((item, i) => (
        <FloatingItem
          key={item.path}
          index={i}
          label={item.label}
          svg={item.svg}
          color={item.color}
          coord={defaultCoords[i]}
          hitArea={DEFAULT_HIT[i]}
          onNavigate={() => router.push(item.path)}
        />
      ))}

      <Pressable style={mobileS.userBadge} onPress={() => {
        Alert.alert('退出登录', '确定要退出登录吗？', [
          { text: '取消' },
          { text: '退出', style: 'destructive', onPress: logout },
        ]);
      }}>
        <Text style={mobileS.userBadgeText}>
          {user?.nickname || '用户'}
        </Text>
      </Pressable>
    </ImageBackground>
  );
}

const mobileS = StyleSheet.create({
  canvas: { flex: 1 },
  userBadge: {
    position: 'absolute', top: 50, left: 14, zIndex: 1000,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  userBadgeText: {
    fontSize: 13, fontWeight: '600', color: '#6366f1',
  },
  tagBubble: {
    backgroundColor: 'rgba(30,41,59,0.88)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6,
  },
  tagText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});


function FloatingItem({ svg, label, color, index, coord, hitArea, disabled, onNavigate }) {
  const floatY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (disabled || index === 0) { floatY.setValue(0); return; }
    const t = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatY, { toValue: -16, duration: 3200 + index * 600, useNativeDriver: true }),
          Animated.timing(floatY, { toValue: 0, duration: 3200 + index * 600, useNativeDriver: true }),
        ]),
      ).start();
    }, index * 500);
    return () => clearTimeout(t);
  }, [disabled]);

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.85, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 40 }).start();
    onNavigate();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute', left: coord.x, top: coord.y,
        width: coord.size, height: coord.size,
        overflow: 'visible',
        transform: [{ translateY: floatY }, { scale }],
        zIndex: index + 2,
      }}
    >
      <View pointerEvents="none">
        <SvgXml xml={svg} width={coord.size} height={coord.size} fill={color} />
      </View>

      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{
          position: 'absolute',
          width: coord.size * hitArea.w,
          height: coord.size * hitArea.h,
          left: coord.size * hitArea.left,
          top: coord.size * hitArea.top,
        }}
      />

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
        <View style={mobileS.tagBubble}>
          <Text style={mobileS.tagText}>{label}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}


export default function Home() {
  const { user, logout } = useAuth();
  const isWeb = Platform.OS === 'web';

  if (isWeb) {
    return <WebHome user={user} logout={logout} />;
  }
  return <MobileHome user={user} logout={logout} />;
}
