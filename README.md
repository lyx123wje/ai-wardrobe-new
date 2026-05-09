# AI衣橱 (AI Wardrobe)

> 智能衣物管理系统 — 拍照识别、衣柜管理、AI穿搭顾问

---

## 项目结构

```
ai-wardrobe-new/
├── README.md                     # 本文件
├── frontend/                     # Expo React Native 移动端
│   ├── app/                      # 页面（Expo Router）
│   │   ├── index.jsx             # 首页 — SVG浮动导航
│   │   ├── wardrobe.jsx          # 衣柜 + 杂物栏 + 智能管家
│   │   ├── laundry-basket.jsx    # 脏衣篓
│   │   ├── dressing-cognition.jsx
│   │   ├── ootd-lab.jsx
│   │   ├── outfit-calendar.jsx
│   │   ├── statistics.jsx
│   │   └── resell-center.jsx
│   ├── src/
│   │   ├── api/                  # API 请求层
│   │   │   ├── client.js         # Axios 实例
│   │   │   ├── wardrobe.js       # 衣物 CRUD + 管家问答
│   │   │   ├── misc.js           # 杂物 CRUD
│   │   │   ├── outfits.js        # 穿搭日志
│   │   │   ├── personas.js       # 角色匹配
│   │   │   └── portraits.js      # 抠图
│   │   ├── components/           # 可复用组件
│   │   │   ├── AddItemModal.jsx  # 批量添加衣物（AI识别）
│   │   │   ├── ClothingCard.jsx  # 衣物网格卡片
│   │   │   ├── DetailModal.jsx   # 衣物详情/编辑
│   │   │   ├── MiscItemCard.jsx  # 杂物网格卡片
│   │   │   ├── MiscAddModal.jsx  # 添加杂物
│   │   │   ├── ButlerChat.jsx    # 衣柜智能管家对话
│   │   │   └── FloatingButton.jsx
│   │   ├── assets/svg/           # SVG 图标
│   │   └── utils/constants.js    # 常量（分类、颜色）
│   ├── assets/                   # 图片资源
│   ├── test-docs/                # 测试文档
│   ├── app.json                  # Expo 配置
│   └── package.json
│
└── backend/                      # Flask 后端 API
    ├── app.py                    # 主入口 + 全部路由
    ├── database.py               # SQLite 数据库层
    ├── mind_engine.py            # DeepSeek AI 引擎（管家+角色）
    ├── clothing_engine.py        # MobileNetV2 衣物分类
    ├── portrait_engine.py        # rembg 人像抠图
    ├── config.py                 # 环境配置读取
    ├── personas.json             # 6种穿搭角色人格
    ├── requirements.txt          # Python 依赖
    └── .env.example              # 环境变量模板
```

---

## 功能概览

| 页面 | 功能 | 状态 |
|------|------|------|
| 🏠 首页 | SVG 浮动导航 | ✅ |
| 👔 衣柜 | 衣物CRUD、AI识别添加、搜索/分类筛选、多选批量操作 | ✅ |
| 📦 杂物栏 | 杂物CRUD、拍照添加、位置管理、分类Tab切换 | ✅ |
| 🤖 智能管家 | DeepSeek对话、物品查询/更新、标记脏衣/干净/不要 | ✅ |
| 🧺 脏衣篓 | 脏衣列表、单件/全洗干净 | ✅ |
| 🧠 穿着认知 | AI穿搭顾问（角色人格） | 🚧 |
| 🧪 穿搭实验室 | 自由搭配画布 | 🚧 |
| 📅 穿搭日历 | 每日穿搭记录 + CPW | 🚧 |
| 📊 统计 | CPW排行、分类占比 | 🚧 |
| 💰 卖了还钱 | 转卖管理 | 🚧 |

✅ = 已完成 | 🚧 = 开发中

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Expo SDK 54 / React Native 0.81 / Expo Router |
| 后端 | Flask 3.x / SQLite |
| AI | rembg (抠图) / MobileNetV2 (分类) / DeepSeek API (对话) |

---

## 启动

### 后端

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

监听 `http://0.0.0.0:5000`

### 前端

```powershell
cd frontend
npm install
npx expo start
```

> 修改 `frontend/app.json` → `extra.apiBaseUrl` 为后端 IP

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/process` | 衣物抠图+分类 |
| POST | `/api/process_portrait` | 人像抠图 |
| POST | `/api/wardrobe` | 创建衣物 |
| GET | `/api/wardrobe` | 查询衣物（支持筛选） |
| PUT | `/api/wardrobe/<id>` | 更新衣物 |
| DELETE | `/api/wardrobe/<id>` | 删除衣物 |
| POST | `/api/wardrobe/batch` | 批量导入 |
| POST | `/api/wardrobe/mark_all_clean` | 全部洗干净 |
| POST | `/api/wardrobe/ask` | 智能管家问答 |
| POST | `/api/misc` | 创建杂物 |
| GET | `/api/misc` | 查询杂物 |
| PUT | `/api/misc/<id>` | 更新杂物 |
| DELETE | `/api/misc/<id>` | 删除杂物 |
| POST | `/api/outfits` | 创建穿搭日志 |
| GET | `/api/outfits` | 查询穿搭日志 |
| GET | `/api/personas/list` | 角色人格列表 |
| POST | `/api/personas/match` | 衣物→角色匹配 |
| POST | `/api/persona_think` | 角色思维推理 |
