import React, { useRef, useCallback, forwardRef, useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  PanResponder,
  ImageBackground,
  Dimensions,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = SCREEN_W - 32;
const CANVAS_H = CANVAS_W * (4 / 3);

function getPinchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

const CanvasElement = React.memo(({ element, isSelected, onSelect, onUpdate }) => {
  const startPos = useRef({ x: 0, y: 0 });
  const startPinch = useRef({ scale: 1, distance: 0 });
  const isPinching = useRef(false);
  const elementRef = useRef(element);
  elementRef.current = element;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt) => {
        return evt.nativeEvent.touches?.length >= 1;
      },
      onPanResponderGrant: (evt) => {
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
      borderColor: '#6366f1',
      borderRadius: element.type === 'face' ? 60 : 4,
      overflow: 'hidden',
      transform: [{ rotate: `${element.rotation || 0}deg` }],
    };
  }, [element.x, element.y, element.scale, element.zIndex, element.rotation, element.type, isSelected]);

  return (
    <View {...panResponder.panHandlers} style={elStyle}>
      <Image
        source={{ uri: element.image }}
        style={styles.elementImage}
        resizeMode="contain"
      />
    </View>
  );
});

const OutfitCanvas = forwardRef(({ elements, background, selectedId, onSelect, onUpdateElement }, ref) => {
  const canvasRef = useRef(null);

  const setCanvasNodeRef = useCallback((node) => {
    canvasRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  }, [ref]);

  const sortedElements = useMemo(() => {
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
