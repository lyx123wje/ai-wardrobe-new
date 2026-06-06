import React, { useEffect, useRef, useCallback, useState, forwardRef, useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  PanResponder,
  ImageBackground,
  Dimensions,
  Platform,
} from 'react-native';
import Svg, { Defs, Mask, Rect, Circle, Image as SvgImage, RadialGradient, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_MAX_W = Platform.OS === 'web' ? 500 : 9999;
const CANVAS_W = Math.min(SCREEN_W - 32, CANVAS_MAX_W);
const CANVAS_H = Platform.OS === 'web' ? Math.round(CANVAS_W * 0.75) : CANVAS_W * (4 / 3);

function getPinchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function canvasElementPropsAreEqual(prev, next) {
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.eraserMode !== next.eraserMode) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onUpdate !== next.onUpdate) return false;
  if (prev.onEraserResult !== next.onEraserResult) return false;
  if (prev.eraserSize !== next.eraserSize) return false;
  if (prev.eraserSoftness !== next.eraserSoftness) return false;
  if (prev.eraserStrength !== next.eraserStrength) return false;
  const pe = prev.element, ne = next.element;
  return pe.id === ne.id && pe.x === ne.x && pe.y === ne.y &&
    pe.scale === ne.scale && pe.rotation === ne.rotation &&
    pe.zIndex === ne.zIndex && pe.opacity === ne.opacity &&
    pe.image === ne.image && pe.type === ne.type;
}

const CanvasElement = React.memo(function CanvasElement({
  element, isSelected, onSelect, onUpdate,
  eraserMode, eraserSize, eraserSoftness, eraserStrength, onEraserResult,
}) {
  const startPos = useRef({ x: 0, y: 0 });
  const startPinch = useRef({ scale: 1, distance: 0 });
  const isPinching = useRef(false);
  const elementRef = useRef(element);
  elementRef.current = element;

  // Web mouse handlers for selection and drag
  const dragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Eraser canvas ref and state
  const eraserCanvasRef = useRef(null);
  const eraserCtxRef = useRef(null);
  const isErasing = useRef(false);
  const eraserInitDone = useRef(false);
  const eraserSettingsRef = useRef({ size: 25, softness: 0.3, strength: 1 });
  eraserSettingsRef.current = { size: eraserSize || 25, softness: eraserSoftness || 0.3, strength: eraserStrength != null ? eraserStrength : 1 };
  const eraserModeRef = useRef(eraserMode);
  eraserModeRef.current = eraserMode;

  const [eraserPaths, setEraserPaths] = useState([]);
  const eraserPathsRef = useRef([]);
  const eraserSvgRef = useRef(null);
  const mobileEraserThrottle = useRef(0);
  const touchStartPoint = useRef(null);

  // Eraser cursor indicator (web only)
  const eraserCursorRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !eraserMode || !isSelected) {
      if (eraserCursorRef.current) {
        eraserCursorRef.current.remove();
        eraserCursorRef.current = null;
      }
      return;
    }
    if (!eraserCursorRef.current) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;border-radius:50%;border:2px dashed #EF4444;pointer-events:none;z-index:9999;display:none;';
      document.body.appendChild(el);
      eraserCursorRef.current = el;
    }
    return () => {
      if (eraserCursorRef.current) {
        eraserCursorRef.current.remove();
        eraserCursorRef.current = null;
      }
    };
  }, [eraserMode, isSelected]);

  const handleEraserMouseMove = useCallback((e) => {
    const cursor = eraserCursorRef.current;
    if (!cursor) return;
    const size = eraserSettingsRef.current.size;
    cursor.style.left = `${e.clientX - size}px`;
    cursor.style.top = `${e.clientY - size}px`;
    cursor.style.width = `${size * 2}px`;
    cursor.style.height = `${size * 2}px`;
    cursor.style.display = 'block';
  }, []);

  const handleEraserMouseLeave = useCallback(() => {
    if (eraserCursorRef.current) {
      eraserCursorRef.current.style.display = 'none';
    }
  }, []);

  const doErase = useCallback((e) => {
    const canvas = eraserCanvasRef.current;
    const ctx = eraserCtxRef.current;
    if (!canvas || !ctx || !eraserInitDone.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const { size, softness, strength } = eraserSettingsRef.current;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    if (softness > 0) {
      const grad = ctx.createRadialGradient(x, y, size * 0.1, x, y, size);
      grad.addColorStop(0, `rgba(0,0,0,${strength})`);
      grad.addColorStop(0.3, `rgba(0,0,0,${strength * 0.8})`);
      grad.addColorStop(0.7, `rgba(0,0,0,${strength * 0.2})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
    } else {
      ctx.globalAlpha = strength;
      ctx.fillStyle = 'rgba(0,0,0,1)';
    }

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (Platform.OS !== 'web') return;
    // In eraser mode, don't select/drag
    if (eraserMode && eraserCanvasRef.current) {
      e.stopPropagation();
      e.preventDefault();
      isErasing.current = true;
      doErase(e);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const el = elementRef.current;
    onSelect(el.id);
    dragging.current = true;
    dragStartPos.current = {
      x: e.clientX - el.x,
      y: e.clientY - el.y,
    };
  }, [onSelect, eraserMode, doErase]);

  const handleClick = useCallback((e) => {
    if (Platform.OS !== 'web') return;
    e.stopPropagation();
  }, []);

  // Document-level mouse events for drag
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleMouseMove = (e) => {
      if (eraserMode && isErasing.current) {
        doErase(e);
        return;
      }
      if (eraserMode) return;
      if (!dragging.current) return;
      const el = elementRef.current;
      const newX = e.clientX - dragStartPos.current.x;
      const newY = e.clientY - dragStartPos.current.y;
      onUpdate(el.id, { x: newX, y: newY });
    };
    const handleMouseUp = () => {
      if (eraserMode && isErasing.current) {
        isErasing.current = false;
        // Export eraser result
        const canvas = eraserCanvasRef.current;
        if (canvas && onEraserResult) {
          const dataUrl = canvas.toDataURL('image/png');
          onEraserResult(elementRef.current.id, dataUrl);
        }
        return;
      }
      dragging.current = false;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onUpdate, eraserMode, doErase, onEraserResult]);

  // Init eraser canvas with image
  useEffect(() => {
    if (!eraserMode || !isSelected || Platform.OS !== 'web') {
      eraserInitDone.current = false;
      return;
    }
    const canvas = eraserCanvasRef.current;
    if (!canvas) return;

    const el = elementRef.current;
    const baseSize = el.type === 'face' ? 120 : 140;
    const w = Math.round(baseSize * (el.scale || 1));
    const h = w;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    eraserCtxRef.current = ctx;
    eraserInitDone.current = false;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, w, h);
      // Contain mode: preserve aspect ratio like resizeMode="contain"
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = w / h;
      let drawW, drawH, drawX, drawY;
      if (imgRatio > canvasRatio) {
        drawW = w;
        drawH = w / imgRatio;
        drawX = 0;
        drawY = (h - drawH) / 2;
      } else {
        drawH = h;
        drawW = h * imgRatio;
        drawX = (w - drawW) / 2;
        drawY = 0;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      eraserInitDone.current = true;
    };
    img.onerror = () => {
      // Fallback: fill with placeholder
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, w, h);
      eraserInitDone.current = true;
    };
    img.src = el.image;
  }, [eraserMode, isSelected, element.image, element.type, element.scale]);

  const panResponder = useRef(
    Platform.OS === 'web' ? {} : PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt) => {
        return evt.nativeEvent.touches?.length >= 1;
      },
      onPanResponderGrant: (evt) => {
        if (eraserModeRef.current) {
          const { locationX, locationY } = evt.nativeEvent;
          const el = elementRef.current;
          const size = el.type === 'face' ? 120 : 140;
          const renderW = Math.round(size * (el.scale || 1));
          const sc = renderW / size;
          const s = eraserSettingsRef.current;
          const pt = { cx: locationX * sc, cy: locationY * sc, r: s.size * sc, strength: s.strength, softness: s.softness };
          eraserPathsRef.current = [pt];
          touchStartPoint.current = pt;
          setEraserPaths([pt]);
          return;
        }
        const el = elementRef.current;
        startPos.current = { x: el.x, y: el.y };
        if (evt.nativeEvent.touches?.length >= 2) {
          isPinching.current = true;
          startPinch.current = {
            scale: el.scale || 1,
            distance: getPinchDistance(evt.nativeEvent.touches),
          };
        } else {
          isPinching.current = false;
        }
        onSelect(el.id);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (eraserModeRef.current && eraserPathsRef.current.length > 0) {
          const { locationX, locationY } = evt.nativeEvent;
          const el = elementRef.current;
          const size = el.type === 'face' ? 120 : 140;
          const renderW = Math.round(size * (el.scale || 1));
          const sc = renderW / size;
          const s = eraserSettingsRef.current;
          const last = eraserPathsRef.current[eraserPathsRef.current.length - 1];
          const dx = locationX * sc - last.cx;
          const dy = locationY * sc - last.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < s.size * sc * 0.3) return;
          const pt = { cx: locationX * sc, cy: locationY * sc, r: s.size * sc, strength: s.strength, softness: s.softness };
          eraserPathsRef.current.push(pt);
          const now = Date.now();
          if (now - mobileEraserThrottle.current > 30) {
            mobileEraserThrottle.current = now;
            setEraserPaths([...eraserPathsRef.current]);
          }
          return;
        }
        const el = elementRef.current;
        if (evt.nativeEvent.touches?.length >= 2) {
          isPinching.current = true;
          const currentDistance = getPinchDistance(evt.nativeEvent.touches);
          const scaleRatio = startPinch.current.distance > 0
            ? currentDistance / startPinch.current.distance
            : 1;
          const newScale = Math.max(0.15, Math.min(4.0, startPinch.current.scale * scaleRatio));
          onUpdate(el.id, { scale: Math.round(newScale * 100) / 100 });
        } else if (!isPinching.current) {
          const newX = startPos.current.x + gestureState.dx;
          const newY = startPos.current.y + gestureState.dy;
          onUpdate(el.id, { x: newX, y: newY });
        }
      },
      onPanResponderRelease: () => {
        if (eraserModeRef.current && eraserPathsRef.current.length > 0) {
          if (eraserSvgRef.current && onEraserResult) {
            const el = elementRef.current;
            const size = el.type === 'face' ? 120 : 140;
            const renderW = Math.round(size * (el.scale || 1));
            captureRef(eraserSvgRef.current, { format: 'png', quality: 1.0, width: renderW, height: renderW })
              .then(dataUrl => onEraserResult(el.id, dataUrl))
              .catch(err => console.error('Eraser capture failed:', err));
          }
          eraserPathsRef.current = [];
          setEraserPaths([]);
          touchStartPoint.current = null;
          return;
        }
        isPinching.current = false;
      },
    })
  ).current;

  const elStyle = useMemo(() => {
    const size = element.type === 'face' ? 120 : 140;
    return {
      position: 'absolute',
      left: element.x,
      top: element.y,
      width: size * (element.scale || 1),
      height: size * (element.scale || 1),
      zIndex: element.zIndex,
      borderWidth: isSelected ? 2 : 0,
      borderColor: isSelected && eraserMode ? '#EF4444' : '#6366f1',
      borderRadius: element.type === 'face' ? 60 : 4,
      overflow: 'hidden',
      opacity: element.opacity != null ? element.opacity : 1,
      transform: [{ rotate: `${element.rotation || 0}deg` }],
    };
  }, [element.x, element.y, element.scale, element.zIndex, element.rotation, element.opacity, element.type, isSelected, eraserMode]);

  const baseSize = element.type === 'face' ? 120 : 140;
  const renderW = Math.round(baseSize * (element.scale || 1));

  return (
    <View
      {...panResponder.panHandlers}
      onMouseDown={Platform.OS === 'web' ? handleMouseDown : undefined}
      onClick={Platform.OS === 'web' ? handleClick : undefined}
      style={elStyle}
    >
      {Platform.OS === 'web' && eraserMode && isSelected ? (
        <canvas
          ref={eraserCanvasRef}
          onMouseMove={handleEraserMouseMove}
          onMouseLeave={handleEraserMouseLeave}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: 'none',
          }}
        />
      ) : Platform.OS !== 'web' && eraserMode && isSelected ? (
        <View ref={eraserSvgRef} collapsable={false} style={{ width: '100%', height: '100%' }}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${renderW} ${renderW}`} preserveAspectRatio="none">
            <Defs>
              <Mask id={`mask-${element.id}`}>
                <Rect width={renderW} height={renderW} fill="white" />
                {eraserPaths.map((pt, i) =>
                  pt.softness > 0 ? (
                    <Circle key={i} cx={pt.cx} cy={pt.cy} r={pt.r} fill={`url(#g-${element.id}-${i})`} />
                  ) : (
                    <Circle key={i} cx={pt.cx} cy={pt.cy} r={pt.r} fill="black" opacity={pt.strength} />
                  )
                )}
              </Mask>
              {eraserPaths.filter(p => p.softness > 0).map((pt, i) => (
                <RadialGradient key={i} id={`g-${element.id}-${i}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="black" stopOpacity={pt.strength} />
                  <Stop offset="30%" stopColor="black" stopOpacity={pt.strength * 0.8} />
                  <Stop offset="70%" stopColor="black" stopOpacity={pt.strength * 0.2} />
                  <Stop offset="100%" stopColor="white" stopOpacity={0} />
                </RadialGradient>
              ))}
            </Defs>
            <SvgImage
              href={{ uri: element.image }}
              x={0} y={0} width={renderW} height={renderW}
              mask={`url(#mask-${element.id})`}
              preserveAspectRatio="none"
            />
          </Svg>
        </View>
      ) : (
        <Image
          source={{ uri: element.image }}
          style={styles.elementImage}
          resizeMode="contain"
        />
      )}
    </View>
  );
}, canvasElementPropsAreEqual);

const OutfitCanvas = forwardRef(({
  elements, background, selectedId, onSelect, onUpdateElement,
  eraserMode, eraserSize, eraserSoftness, eraserStrength, onEraserResult,
}, ref) => {
  const canvasRef = useRef(null);

  const setCanvasNodeRef = useCallback((node) => {
    canvasRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  }, [ref]);

  const lastSortKey = useRef('');
  const sortedElements = useMemo(() => {
    const sortKey = elements.map(el => `${el.id}:${el.zIndex}`).join('|');
    if (sortKey === lastSortKey.current) return elements;
    lastSortKey.current = sortKey;
    return [...elements].sort((a, b) => a.zIndex - b.zIndex);
  }, [elements]);

  const bgContent = (() => {
    if (background.type === 'image' && background.uri) {
      return (
        <ImageBackground
          source={{ uri: background.uri }}
          style={styles.canvas}
          imageStyle={styles.bgImage}
        >
          {sortedElements.map((el) => (
            <CanvasElement
              key={el.id}
              element={el}
              isSelected={selectedId === el.id}
              onSelect={onSelect}
              onUpdate={onUpdateElement}
              eraserMode={eraserMode}
              eraserSize={eraserSize}
              eraserSoftness={eraserSoftness}
              eraserStrength={eraserStrength}
              onEraserResult={onEraserResult}
            />
          ))}
        </ImageBackground>
      );
    }
    return (
      <View
        style={[
          styles.canvas,
          { backgroundColor: background.type === 'color' ? background.value : '#FFFFFF' },
        ]}
      >
        {sortedElements.map((el) => (
          <CanvasElement
            key={el.id}
            element={el}
            isSelected={selectedId === el.id}
            onSelect={onSelect}
            onUpdate={onUpdateElement}
            eraserMode={eraserMode}
            eraserSize={eraserSize}
            eraserSoftness={eraserSoftness}
            eraserStrength={eraserStrength}
            onEraserResult={onEraserResult}
          />
        ))}
      </View>
    );
  })();

  return (
    <View ref={setCanvasNodeRef} collapsable={false} style={styles.wrapper}>
      {bgContent}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: CANVAS_W,
    height: CANVAS_H,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  canvas: {
    width: CANVAS_W,
    height: CANVAS_H,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bgImage: {
    borderRadius: 12,
    resizeMode: 'cover',
  },
  elementImage: {
    width: '100%',
    height: '100%',
  },
});

export default OutfitCanvas;
export { CANVAS_W, CANVAS_H };
