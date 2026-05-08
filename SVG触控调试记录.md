# SVG 按钮触控区调试记录

## 问题描述

首页 7 个 SVG 浮动按钮存在点击冲突：点击一个图标时，有时会触发另一个图标的跳转，或者点击不响应。

## 根本原因

### 边界框（Bounding Box）问题

SVG 文件本身 viewBox 为 `0 0 1320 2868`，是竖长形画布。但在代码中渲染为正方形容器（如 800×800、420×420），导致：

1. **SVG 图形只占容器的一部分** — 其余全是透明区域
2. **透明区域依然占据触摸层级** — 系统把它当作 200×200 的"透明塑料板"
3. **两块塑料板叠在一起时** — 上层透明的边角会挡住下层有图形的地方
4. **系统默认把点击交给最上层** — 即使你点的地方上层是透明的

### `pointerEvents` 机制

React Native 的 `pointerEvents` 控制在触摸事件系统中，一个 View 是否/如何响应触摸：

| 值 | 行为 |
|---|---|
| `auto` (默认) | View 和子元素都接收触摸 |
| `box-none` | View 自身不接收触摸，子元素正常接收 |
| `none` | View 和子元素都不接收触摸 |
| `box-only` | 只有 View 自身接收触摸，子元素不接收 |

## 修复步骤

### 第一步：分离视觉层和触控层（已存在）

```jsx
{/* 视觉层 — 完全不吃触摸 */}
<View pointerEvents="none">
  <SvgXml xml={svg} width={coord.size} height={coord.size} />
</View>

{/* 触控层 — 只有它能吃触摸 */}
<Pressable style={...} />
```

### 第二步：外层容器设置 `pointerEvents="box-none"`

```jsx
<Animated.View pointerEvents="box-none" style={{ ... }}>
```

**原理：** 容器（Animated.View）的大小是 `coord.size × coord.size`，如果它的 pointerEvents 是默认的 `auto`，即使里面没有视觉内容，它也会拦截整个区域的触摸，导致被它盖住的其他按钮失效。

`pointerEvents="box-none"` 的意思是："我这个容器自己不吃触摸，点击可以穿透下去给我的兄弟 View，但我里面的子元素（Pressable）正常接收触摸。"

### 第三步：触控区独立控制

**之前的错误：** Pressable 的宽高和位置是从 `coord.size` 计算出来的固定比例（40%）：
```jsx
width: coord.size * 0.4,
height: coord.size * 0.4,
left: coord.size * 0.3,
top: coord.size * 0.3,
```

这导致调整 SVG 大小时，触控区也跟着变，无法独立微调。

**修复后：** 引入独立的 `hitAreas` 状态，每个按钮的触控区有自己的 `left/top/width/height` 比值：
```jsx
// 独立配置，跟 SVG 的 size/position 解耦
const DEFAULT_HIT = [
  { left: 0.360, top: 0.320, w: 0.160, h: 0.240 },  // 穿着认知
  { left: 0.560, top: 0.180, w: 0.200, h: 0.300 },  // 衣柜
  // ...
];

// Pressable 使用独立数据
width: coord.size * hitArea.w,
height: coord.size * hitArea.h,
left: coord.size * hitArea.left,
top: coord.size * hitArea.top,
```

### 第四步：逐个锁定调试

调试时引入了 **锁机制**：
- 调到第 1 个 → 锁定（绿色） → 调到第 2 个
- 第 1 个的绿框和第 2 个的红框同时显示
- 确保第 2 个的红框不会盖到第 1 个的绿框上

### 第五步：标签溢出修复

`tagBubble`（长按文字提示）设置在容器外 (`bottom: -36`)，但 Animated.View 默认 `overflow: 'hidden'`，导致标签被裁剪。

修复：添加 `overflow: 'visible'` 到 Animated.View。

## 调试面板功能总结

| 功能 | 说明 |
|---|---|
| 选项卡切换 | 选择要调试的 SVG 图标 |
| SVG 定位 & 大小 | 调整 SVG 的坐标和尺寸 |
| 触控区独立调节 | 调整 Pressable 的宽度、高度、位置（SVG 不动） |
| 锁定/解锁 | 锁定当前触控区，切换到下一个时继续显示 |
| 全部解锁 | 一键清除所有锁定 |
| 面板折叠 | "▼ 展开" / "▲ 收起"，减少遮挡 |
| 坐标输出 | 可选中复制 SVG 坐标和触控区比例 |

## 最终触控区配置

```js
const DEFAULT_HIT = [
  { left: 0.360, top: 0.320, w: 0.160, h: 0.240 },  // 穿着认知
  { left: 0.560, top: 0.180, w: 0.200, h: 0.300 },  // 衣柜
  { left: 0.380, top: 0.500, w: 0.200, h: 0.240 },  // 脏衣篓
  { left: 0.580, top: 0.260, w: 0.140, h: 0.180 },  // 穿搭日历
  { left: 0.300, top: 0.280, w: 0.180, h: 0.400 },  // 穿搭实验室
  { left: 0.360, top: 0.200, w: 0.180, h: 0.160 },  // 统计
  { left: 0.360, top: 0.520, w: 0.140, h: 0.160 },  // 卖了还钱
];
```

所有比例为相对于对应 SVG 容器 size 的比值。
