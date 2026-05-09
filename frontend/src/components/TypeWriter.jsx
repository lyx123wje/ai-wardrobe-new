import React, { useState, useEffect, useRef } from 'react';
import { Text, Animated } from 'react-native';

export default function TypeWriter({ text, speed = 30, onComplete, style = {} }) {
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const indexRef = useRef(0);
  const timerRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    // 重置
    indexRef.current = 0;
    setDisplayedText('');
    completedRef.current = false;

    if (!text) return;

    const type = () => {
      if (indexRef.current < text.length) {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current += 1;
        timerRef.current = setTimeout(type, speed);
      } else {
        if (!completedRef.current && onComplete) {
          completedRef.current = true;
          onComplete();
        }
      }
    };

    type();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, speed]);

  // 光标闪烁
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const isTyping = displayedText.length < (text || '').length;

  return (
    <Text style={style}>
      {displayedText}
      {isTyping && (
        <Text style={{ opacity: showCursor ? 1 : 0 }}>|</Text>
      )}
    </Text>
  );
}
