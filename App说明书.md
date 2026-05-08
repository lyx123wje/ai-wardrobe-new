# AI 衣橱 v4.0 App 说明书（Expo / React Native）

## 一、项目概述

本项目是 AI 衣橱的 React Native App，基于 Expo SDK 52 构建。与 Web 前端（Vite）共享同一套 Flask 后端 API，但全部组件使用原生渲染（View / Text / Image），动画由 react-native-reanimated 在 UI 线程驱动。

**与 Web 版本的关系：**

```
Desktop/
├── clothes-backend/   # Flask 后端（Web 和 App 共享）
├── frontend/          # React Web 版本（保留，不变）
└── app/               # Expo / React Native App（本项目）
```

Web 版本通过 Vite 代理访问 Flask，App 版本直接通过 IP 地址访问 Flask。两个前端共用 `database.py` → SQLite 中的数据。

## 二、Web → RN 技术选型映射

| 需求 | Web 方案 | App 方案 | 替换原理 |
|------|---------|---------|---------|
| UI 容器 | `<div>` | `<View>` | `<View>` 等价 RN 的 div，仅有的区别是不支持直接放文本 |
| 文字 | `<span>` / `<p>` | `<Text>` | 所有文字必须包裹在 `<Text>` 里 |
| 图片 | `<img src="...">` | `<Image source={require(...)}>` | RN 图片必须用 require 或 uri |
| 列表 | `div.grid` → CSS grid | `<FlatList>` / `flexWrap: 'wrap'` | RN 没有 CSS grid，用 flexbox 模拟 |
| 手势 | `onClick` / `whileHover` | `GestureDetector` + `Gesture.Tap()` | RN 没有 hover，用 Press 替代 |
| 动画引擎 | Framer Motion (JS 线程) | react-native-reanimated (UI 线程) | 避免 JS 线程阻塞，60fps 保证 |
| 路由 | React Router v6 | Expo Router (file-based) | 文件即路由：`app/xxx.jsx` → `/xxx` |
| 导航栈 | `useNavigate()` | `router.push()` | expo-router 的 imperative API |
| HTTP | Axios → Vite proxy → Flask | Axios 直连 Flask IP | App 没有 Vite 中间层，直接 TCP |
| CSS | CSS 变量 + 全局样式 | `StyleSheet.create()` | RN 不支持 CSS 文件，用 JS 对象 |
| 图表 | Recharts (SVG) | 同 Web，或 react-native-svg-charts | Recharts 在 RN 中需要 react-native-svg 底层 |
| Toast | Context + 固定定位 div | React Context 同 Web | 通知可以用 Alert.alert() 或 SnackBar |

## 三、环境搭建

### 3.1 前置条件

- Node.js >= 18
- 手机安装 Expo Go（iOS App Store / Android 应用商店搜索 "Expo Go"）
- 电脑和手机连接同一 WiFi
- Python 后端已启动（Flask 监听 `0.0.0.0:5000`）

### 3.2 项目依赖

```bash
cd Desktop/app
npm install
```

核心依赖及作用：

| 包 | 版本 | 作用 |
|---|---|---|
| `expo` | ~52.0.0 | Expo SDK 基础框架，打包构建 |
| `expo-router` | ~4.0.0 | 文件系统路由，`app/xxx.jsx` → `/xxx` |
| `react-native` | 0.76.6 | React Native 核心 |
| `react-native-reanimated` | ~3.16.0 | UI 线程动画引擎，替代 Framer Motion |
| `react-native-gesture-handler` | ~2.20.0 | 原生手势识别，替代 onClick/onHover |
| `react-native-safe-area-context` | 4.12.0 | 安全区域适配（刘海屏/底部导航条） |
| `react-native-screens` | ~4.4.0 | 原生导航栈，替代 Web 的 History API |
| `react-native-svg` | ~15.9.0 | SVG 渲染（供 Recharts 图表使用） |
| `axios` | ^1.7.0 | HTTP 客户端，直连 Flask |
| `date-fns` | ^4.1.0 | 日期计算（与 Web 版本一致） |
| `recharts` | ^2.15.0 | 数据图表（需搭配 react-native-svg） |

### 3.3 babel.config.js

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],  // 必须最后！！！
  };
};
```

**关键**：`react-native-reanimated/plugin` 必须放在 plugins 数组的最后一项。Babel 插件执行顺序是反的（后写的先执行），reanimated 需要看到所有转译后的代码才能正确注入 worklet。

### 3.4 app.json 配置

```json
{
  "expo": {
    "name": "AI衣橱",
    "slug": "ai-wardrobe",
    "scheme": "ai-wardrobe",
    "newArchEnabled": true,        // 启用新架构（Fabric + TurboModules）
    "plugins": ["expo-router"],
    "extra": {
      "apiBaseUrl": "http://10.29.137.80:5000"   // Flask 后端地址
    }
  }
}
```

**apiBaseUrl 配置说明：**

App 不像 Web 有 Vite 代理，需要直连 Flask 的 IP 地址。获取方式：

```bash
# Windows 终端
ipconfig | findstr "IPv4"
# 找到你的 WLAN IP（如 10.29.137.80）
# 修改 app.json 中 extra.apiBaseUrl 的值
```

如果 IP 地址变了，更新这里后重新 `npx expo start`。

### 3.5 启动

```bash
npx expo start
```

终端输出示例：
```
Starting Metro Bundler
› Metro waiting on exp://10.29.137.80:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Web is waiting on http://localhost:8081

› Using Expo Go
› Press s │ switch to development build
› Press a │ open Android
› Press i │ open iOS
› Press w │ open web
```

用 Expo Go 扫码二维码即可。

## 四、核心架构实现

### 4.1 项目结构

```
app/
├── package.json              # Expo SDK 52 依赖
├── app.json                  # Expo 配置 + API 地址
├── babel.config.js           # reanimated/plugin
│
├── app/                      # Expo Router 文件路由
│   ├── _layout.jsx           # 根布局（GestureHandlerRootView + Stack）
│   └── index.jsx             # 首页（/ 路由）
│
└── src/
    ├── api/                  # API 请求层（与 Web 版本镜像）
    │   ├── client.js         # Axios 实例（baseURL 从 app.json 读取）
    │   ├── wardrobe.js       # 衣柜 CRUD（7 个接口）
    │   ├── outfits.js        # 穿搭 CRUD（4 个接口）
    │   ├── personas.js       # 角色匹配 + LLM（3 个接口）
    │   └── portraits.js      # 抠图 + 发型列表（3 个接口）
    │
    ├── components/           # 可复用组件
    │   └── FloatingButton.jsx  # 首页浮动按钮（reanimated 版）
    │
    └── utils/
        └── constants.js      # 分类/颜色/页面链接常量
```

### 4.2 Expo Router 路由系统

**与 React Router 的对比：**

```jsx
// Web (React Router): 集中式路由表
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/wardrobe" element={<Wardrobe />} />
</Routes>

// App (Expo Router): 文件即路由
app/
├── _layout.jsx      → 全局布局（Stack Navigator）
├── index.jsx        → / 首页
└── wardrobe.jsx    → /wardrobe
```

**根布局 `app/_layout.jsx`：**

```jsx
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* 全局手势处理器：所有页面共享单例，避免手势冲突 */}
      <Stack screenOptions={{ headerShown: false }}>
        {/* 每个 app/ 下的文件自动成为一个屏幕 */}
      </Stack>
    </GestureHandlerRootView>
  );
}
```

`GestureHandlerRootView` 必须包裹整个应用，否则所有手势识别失效。

### 4.3 API 客户端（直连 Flask）

**与 Web 版本的区别：**

```js
// Web: Vite 代理
const api = axios.create({ baseURL: '/api' });
// 浏览器请求 /api/wardrobe → Vite 转发 → localhost:5000/api/wardrobe

// App: 直连 IP
import Constants from 'expo-constants';
const API_BASE = Constants.expoConfig?.extra?.apiBaseUrl;  // http://10.29.137.80:5000
const api = axios.create({ baseURL: `${API_BASE}/api` });
// App 请求 http://10.29.137.80:5000/api/wardrobe → Flask 直接处理
```

**为什么不用 Vite 代理：** App 运行在手机上，没有 Vite 开发服务器。所有 HTTP 请求从手机直接走 WiFi 到电脑的 Flask 端口。

### 4.4 FloatingButton 动画实现（reanimated 版）

**需求映射：**

| Web 需求 | Web 实现 | App 实现 |
|----------|---------|---------|
| 7 个按钮独立浮动 | `animate={{ y: [0,-12,0] }}` + 错开 delay | `withDelay(index*400)` + `withRepeat(withTiming(-12))` |
| 周期错开 | `duration: 3+index*0.5` | `duration: 1500+index*250` |
| 悬停放大 1.15x | `whileHover={{ scale: 1.15 }}` | 不存在 hover，改为「按压缩小 0.92x」 |
| 点击缩小 + 跳转 | `whileTap={{ scale: 0.95 }}` + `navigate()` | `Gesture.Tap()` → `onBegin` 缩小 + `onFinalize` 跳转 |
| 回弹动画 | Framer Motion spring | `withSpring(1, { damping: 12 })` |

**核心代码：**

```js
// ── 1. 共享值（Shared Value）──
// reanimated 的核心：数值变化在 UI 线程执行，不经过 JS 线程
const floatY = useSharedValue(0);    // 浮动偏移量
const scale = useSharedValue(1);    // 缩放比例

// ── 2. 循环浮动动画 ──
// 等价于 Framer Motion 的 animate={{ y: [0, -12, 0] }}
floatY.value = withDelay(
  index * 400,                          // 每个按钮延时 400ms 依次启动
  withRepeat(
    withSequence(
      withTiming(-12, { duration: 1500 + index * 250 }),  // 上浮
      withTiming(0, { duration: 1500 + index * 250 }),    // 回落
    ),
    -1,                                 // 无限循环
    true,                               // 往返（不跳回起点）
  ),
);

// ── 3. 按压手势 ──
// 替代 Web 的 onClick + whileHover + whileTap
const tapGesture = Gesture.Tap()
  .onBegin(() => {
    scale.value = withSpring(0.92, { damping: 12 });  // 按下缩小
  })
  .onFinalize(() => {
    scale.value = withSpring(1, { damping: 12 });     // 松开回弹
    router.push(path);                                 // 跳转页面
  });

// ── 4. 动画样式绑定 ──
const floatStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: floatY.value }],
}));
const pressStyle = useAnimatedStyle(() => ({
  transform: [{ scale: scale.value }],
}));

// ── 5. 渲染 ──
return (
  <GestureDetector gesture={tapGesture}>
    <Animated.View style={[floatStyle, pressStyle]}>
      <View style={styles.button} />
    </Animated.View>
  </GestureDetector>
);
```

**reanimated 动画生命周期图解：**

```
JS 线程                            UI 线程
───────                            ────────
useSharedValue(0)  ──注册──→      SharedValue { value: 0 }
                                      │
floatY.value = withDelay(...) ──┐    │
                                │   ↓
                      ┌─── 工作线程 (worklet) ───┐
                      │ withDelay(400ms)         │
                      │   → withRepeat           │
                      │     → withSequence       │
                      │       → withTiming(-12)  │ ← 插值计算在 UI 线程
                      │       → withTiming(0)    │
                      │     (无限循环)            │
                      │                          │
                      │ useAnimatedStyle()       │
                      │   → transform 每帧更新   │ ← 60fps 渲染
                      └──────────────────────────┘
```

**关键点：** `withTiming` 的插值计算发生在 UI 线程的 worklet 中，完全不经过 JS Bridge。即使 JS 线程被阻塞（比如网络请求），动画依然 60fps 流畅。

## 五、从 Web 到 App 的组件翻译规则

构建剩余组件时，遵循以下一致规则：

### 5.1 基础元素

```
Web                     →   App
──────────────────────      ──────────────────────
<div>                   →   <View>
<span> / <p>            →   <Text>
<img src={url}>         →   <Image source={{ uri: url }} />
<input>                 →   <TextInput>
<button onClick>        →   <Pressable onPress> 或 <TouchableOpacity>
<select>                →   <Picker> 或 <Modal> + FlatList
onClick                 →   onPress
onChange                →   onChangeText
style="..."             →   style={StyleSheet.create({...})}
```

### 5.2 动画

```
Web (Framer Motion)            →   App (reanimated)
──────────────────────             ──────────────────────
animate = {{ y: [0,-12,0] }}   →   useSharedValue + withRepeat(withTiming())
whileHover = {{ scale: 1.15 }} →   Gesture.Tap().onBegin() 或删掉（无 hover）
whileTap = {{ scale: 0.95 }}   →   Gesture.Tap().onBegin/onFinalize
initial / exit                  →   entering / exiting (expo-router 内置)
transition = {{ delay }}        →   withDelay()
transition = {{ duration }}     →   withTiming(_, { duration })
transition = {{ type:'spring'}}→   withSpring()
```

### 5.3 布局

```
Web (CSS)                    →   App (StyleSheet)
──────────────────────           ──────────────────────
display: grid                 →   flexWrap: 'wrap'（没有原生 grid）
display: flex                 →   flexDirection: 'row' / 'column'
position: fixed               →   无法固定（RN 的 absolute 是相对于父元素）
:hover                        →   不存在（用 Pressable 替代）
::-webkit-scrollbar           →   不存在（iOS/Android 自带滚动条）
box-shadow                    →   shadowColor/Offset/Opacity/Radius + elevation
backdrop-filter / blur        →   BlurView (expo-blur)
```

### 5.4 路由

```
Web (React Router)         →   App (Expo Router)
──────────────────────         ──────────────────────
useNavigate()              →   useRouter().push()
useParams()                →   useLocalSearchParams()
<Link to="/xxx">           →   <Link href="/xxx">
<Routes>                   →   文件系统自动生成
<Route path="/:id">        →   app/[id].jsx
```

## 六、API 接口文档

所有 API 与 Web 版本共享同一后端，接口完全一致：

| 方法 | 路径 | 功能 | 对应 Web 页面 |
|------|------|------|-------------|
| POST | `/api/process` | 衣物抠图 + AI 分类（base64） | 衣柜批量导入 |
| POST | `/api/process_portrait` | 人像抠图（base64） | 穿搭实验室 |
| GET | `/api/hairstyles/list` | 发型文件列表 | 穿搭实验室 |
| GET | `/api/personas/list` | 角色人格列表 | 穿着认知 |
| POST | `/api/personas/match` | 衣物 → 角色匹配 | 穿着认知 |
| POST | `/api/persona_think` | 角色思维推理（DeepSeek LLM） | 穿着认知 |
| POST | `/api/wardrobe` | 创建衣物 | 衣柜 |
| GET | `/api/wardrobe` | 衣物列表（?category=&search=&color=&is_dirty=&is_unwanted=） | 衣柜/脏衣篓 |
| GET | `/api/wardrobe/:id` | 衣物详情 | 衣柜 |
| PUT | `/api/wardrobe/:id` | 更新衣物 | 衣柜 |
| DELETE | `/api/wardrobe/:id` | 删除衣物 | 衣柜 |
| POST | `/api/wardrobe/batch` | 批量导入 | 衣柜 |
| GET | `/api/wardrobe/stats` | 统计数据 | 统计 |
| POST | `/api/wardrobe/mark_all_clean` | 一键全清 | 脏衣篓 |
| POST | `/api/outfits` | 创建穿搭日志 | 穿搭日历 |
| GET | `/api/outfits` | 按日期范围查询 | 穿搭日历 |
| GET | `/api/outfits/date/:date` | 查询某天穿搭 | 穿搭日历 |
| DELETE | `/api/outfits/:id` | 删除穿搭日志 | 穿搭日历 |

## 七、常见问题与解决方案

### 7.1 Expo Go 扫码后白屏 / 超时

**可能原因 1：** 组件 require 了不存在的文件

`require('./xxx.png')` 在 RN 中是静态分析，如果文件不存在会导致模块加载失败。

**排查方法：** 检查终端 Metro Bundler 输出有没有红色报错。

**可能原因 2：** `apiBaseUrl` IP 地址不通

手机和电脑不在同一 WiFi，或者 IP 变了。

**排查方法：**
1. 手机浏览器访问 `http://10.29.137.80:5000/api/hairstyles/list`
2. 如果能打开（返回 JSON），说明网络通
3. 如果打不开，检查 Flask 是否在用 `0.0.0.0` 启动

### 7.2 Android 上动画卡顿

**原因：** 没有启用新架构（Fabric）

**解决方案：** 确保 `app.json` 中 `"newArchEnabled": true`

### 7.3 reanimated 动画不生效 / 报错

**原因 1：** babel.config.js 的 `react-native-reanimated/plugin` 不在最后

**解决：** 确认插件在 plugins 数组最后一项

**原因 2：** 忘记包裹 `GestureHandlerRootView`

**解决：** 确认 `app/_layout.jsx` 最外层是 `GestureHandlerRootView`

### 7.4 API 请求返回 Network Error

**可能原因：** iOS 的 ATS（App Transport Security）阻止 HTTP 请求

**解决方案：** 在 `app.json` 中允许 HTTP：

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSAppTransportSecurity": {
          "NSAllowsArbitraryLoads": true
        }
      }
    }
  }
}
```

### 7.5 手机打不开开发服务器

**可能原因：** Windows 防火墙阻止了 5000/8081 端口的入站连接

**解决方案：**
1. Windows 搜索 → "防火墙" → "允许应用通过防火墙"
2. 添加 Node.js 和 Python 的入站规则
3. 或者临时关闭防火墙测试

### 7.6 SVG 图标不显示

**原因：** React Native 不原生支持 `.svg` 文件

**当前方案：** FloatingButton 使用 emoji 文字作为图标

**未来方案：**
1. 将 SVG 转换为 PNG（用 Inkscape / Figma 导出 96x96 PNG）
2. 放入 `src/assets/svg/` 目录
3. 用 `<Image source={require('../assets/svg/穿着认知.png')} />` 替换 emoji

## 八、版本更新记录

### v4.0 App — Expo/React Native 奠基（2026-05-08）

- ✅ **项目架构**：Expo SDK 52 + expo-router 文件路由
- ✅ **动画引擎**：react-native-reanimated 3.16（UI 线程动画）
- ✅ **手势系统**：react-native-gesture-handler 2.20
- ✅ **API 层**：Axios 直连 Flask（从 app.json 读取 IP）
- ✅ **首页组件**：FloatingButton（reanimated 版：循环浮动 + 点击缩放 + 路由跳转）
- ✅ **基础架构**：GestureHandlerRootView + SafeAreaView + Stack Navigator
- ✅ **代码复用**：API 模块（wardrobe/outfits/personas/portraits）与 Web 版本镜像

## 九、后续开发路线

- [ ] 修复 FloatingButton 的 require() 崩溃问题（删除不存在 PNG 的引用）
- [ ] SVG 图标转 PNG 放入 assets/svg/
- [ ] 逐个页面从 Web 翻译到 RN：
  - [ ] 穿着认知（TextArea + PersonaSelector + 打字机效果→TypeWriter）
  - [ ] 衣柜（SearchBar + 分类Tab + FlatList + Modal）
  - [ ] 脏衣篓（FlatList + 标记已清洗按钮）
  - [ ] 穿搭日历（Month Picker + Grid + 穿搭编辑 Sheet）
  - [ ] 穿搭实验室（三面板 + 画布拖拽→PanResponder）
  - [ ] 统计（Recharts 饼图 + 柱状图）
  - [ ] 卖了还钱（FlatList + Modal）
- [ ] 适配 iOS 安全区域 + Android 导航栏
- [ ] 添加下拉刷新（RefreshControl）
- [ ] 触觉反馈（expo-haptics）
