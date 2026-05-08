import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useRouter } from 'expo-router';

// SVG 字符串映射
import cognitionXml from '../assets/svg/穿着认知.js';
import wardrobeXml from '../assets/svg/衣柜.js';
import laundryXml from '../assets/svg/脏衣篓.js';
import calendarXml from '../assets/svg/穿搭日历.js';
import labXml from '../assets/svg/穿搭实验室.js';
import statsXml from '../assets/svg/统计.js';
import resellXml from '../assets/svg/卖了还钱.js';

const SVG_XML_MAP = {
  穿着认知: cognitionXml, 衣柜: wardrobeXml, 脏衣篓: laundryXml,
  穿搭日历: calendarXml, 穿搭实验室: labXml, 统计: statsXml, 卖了还钱: resellXml,
};

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#ef4444'];

export default function FloatingButton({ label, path, index = 0, color: propColor, x = 0, y = 0, size = 130 }) {
  const router = useRouter();
  const bg = propColor || COLORS[index % COLORS.length];
  const svgXml = SVG_XML_MAP[label];
  const [pressed, setPressed] = useState(false);

  // 循环浮动
  const floatY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatY, { toValue: -16, duration: 3200 + index * 600, useNativeDriver: true }),
          Animated.timing(floatY, { toValue: 0, duration: 3200 + index * 600, useNativeDriver: true }),
        ]),
      ).start();
    }, index * 500);
    return () => clearTimeout(t);
  }, []);

  // 按压缩放 + 显示文字
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    setPressed(true);
    Animated.spring(scale, { toValue: 0.85, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    setPressed(false);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 40 }).start();
    router.push(path);
  };

  if (!svgXml) return null;

  return (
    <Animated.View style={[
      styles.anchor,
      { left: x, top: y, transform: [{ translateY: floatY }, { scale }] },
    ]}>
      {/* 透明矩形热区 —— 只包住 SVG 本身 */}
      <Pressable style={styles.hit} onPressIn={onPressIn} onPressOut={onPressOut}>
        <SvgXml xml={svgXml} width={size} height={size} fill={bg} />
      </Pressable>

      {/* 按下才出现的文字气泡 */}
      {pressed && (
        <Animated.View style={styles.bubble}>
          <Text style={styles.bubbleText}>{label}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    alignItems: 'center',
  },
  hit: {
    backgroundColor: 'transparent',
  },
  bubble: {
    position: 'absolute',
    bottom: -36,
    backgroundColor: 'rgba(30,41,59,0.88)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'center',
  },
  bubbleText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
