import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform } from 'react-native';
import { setToastRef } from '../utils/toast';

export default function Toast() {
  const [message, setMessage] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-80)).current;

  const show = useCallback((msg) => {
    setMessage(msg);
    opacity.setValue(0);
    translateY.setValue(-80);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -80, duration: 250, useNativeDriver: true }),
        ]).start();
      }, 1800);
    });
  }, [opacity, translateY]);

  useEffect(() => {
    setToastRef(show);
    return () => setToastRef(null);
  }, [show]);

  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <Text style={styles.text} numberOfLines={3}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 24,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
  },
  text: {
    backgroundColor: 'rgba(30,41,59,0.92)',
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
    maxWidth: '90%',
  },
});
