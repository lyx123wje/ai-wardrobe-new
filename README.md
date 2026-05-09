# AI衣橱 (AI Wardrobe)

> 智能衣物管理系统 + 思维训练室 — 拍照识别、衣柜管理、多位高人AI对话

---

## 项目结构

```
ai-wardrobe/
├── README.md
├── skills/                        # 女娲蒸馏人物Skill（14位）
│   ├── wang-yangming-perspective/ # 王阳明 · 心学宗师
│   ├── paul-graham-perspective/   # Paul Graham · 创业教父
│   ├── zhang-yiming-perspective/  # 张一鸣 · 理性主义
│   ├── andrej-karpathy-perspective/
│   ├── ilya-sutskever-perspective/
│   ├── mrbeast-perspective/
│   ├── trump-perspective/
│   ├── steve-jobs-perspective/
│   ├── elon-musk-perspective/
│   ├── munger-perspective/
│   ├── feynman-perspective/
│   ├── naval-perspective/
│   ├── taleb-perspective/
│   └── zhangxuefeng-perspective/
├── frontend/
│   ├── app/
│   │   ├── index.jsx                   # 首页 SVG浮动导航
│   │   ├── wardrobe.jsx                # 衣柜 + 杂物栏 + 智能管家
│   │   ├── laundry-basket.jsx          # 脏衣篓
│   │   ├── dressing-cognition.jsx      # 🆕 思维训练室（重写）
│   │   ├── ootd-lab.jsx                # 穿搭实验室（可视化穿搭编辑器）
│   │   ├── outfit-calendar.jsx
│   │   ├── statistics.jsx
│   │   └── resell-center.jsx
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.js
│   │   │   ├── wardrobe.js
│   │   │   ├── misc.js
│   │   │   ├── outfits.js
│   │   │   ├── personas.js             # 角色API（含无穿搭标签的对话）
│   │   │   ├── room.js                 # 🆕 思维训练室 broadcast/debate API
│   │   │   └── portraits.js
│   │   └── components/
│   │       ├── AddItemModal.jsx
│   │       ├── ClothingCard.jsx
│   │       ├── DetailModal.jsx
│   │       ├── MiscItemCard.jsx
│   │       ├── MiscAddModal.jsx
│   │       ├── ButlerChat.jsx
│   │       ├── FloatingButton.jsx
│   │       ├── TypeWriter.jsx           # 🆕 逐字打字动画
│   │       ├── PersonaGrid.jsx          # 🆕 高人选择网格（多选）
│   │       └── ChatBubble.jsx           # 🆕 对话气泡（带打字效果）
│   └── ...
├── backend/
│   ├── app.py                          # Flask 主入口 + 全部路由
│   ├── database.py
│   ├── mind_engine.py                  # DeepSeek引擎（管家/角色/广播/辩论）
│   ├── clothing_engine.py
│   ├── portrait_engine.py
│   ├── config.py
│   ├── personas.json                   # 26位角色人格（6穿搭 + 20思维）
│   ├── personas/                       # 🆕 蒸馏产物 System Prompt 素材
│   │   ├── wang-yangming.md
│   │   ├── paul_graham.md
│   │   ├── zhang_yiming.md
│   │   └── ... (14个 .md)
│   └── requirements.txt
└── ...
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
| 🧠 **思维训练室** | 14位高人AI对话 — 倾诉/广播/辩论 | ✅ v2.0 |
| 🧪 穿搭实验室 | 自由搭配画布、可视化穿搭编辑器 | ✅ |
| 📅 穿搭日历 | 每日穿搭记录 + CPW | 🚧 |
| 📊 统计 | CPW排行、分类占比 | 🚧 |
| 💰 卖了还钱 | 转卖管理 | 🚧 |

---

## 🧠 思维训练室

> "读万卷书不如行万里路，行万里路不如高人指路"

虚拟会议室，容纳14位由女娲蒸馏出来的高人与用户对话。支持三种交互模式：

| 模式 | 描述 | 触发 |
|------|------|------|
| **倾诉模式** | 选一位高人 1v1 深度对话 | 选1人 → 输入问题 → "单独请教" |
| **广播模式** | 一个问题同时抛给N位高人，并行回答 | 选多人 → 输入问题 → "广播提问" |
| **群聊辩论** | N位高人互看发言辩论碰撞，用户可插话 | 选多人 → 输入议题 → "发起辩论" |

### 人物库（14位）

| 人物 | 领域 | 来源 |
|------|------|------|
| 王阳明 | 心学智慧 | 女娲五阶段蒸馏 |
| Paul Graham | 创业/写作 | GitHub 外部 Skill |
| 张一鸣 | 产品/组织 | GitHub 外部 Skill |
| Andrej Karpathy | AI/教育 | GitHub 外部 Skill |
| Ilya Sutskever | AI安全 | GitHub 外部 Skill |
| MrBeast | 内容创造 | GitHub 外部 Skill |
| 特朗普 | 谈判/权力 | GitHub 外部 Skill |
| 乔布斯 | 产品/设计 | GitHub 外部 Skill |
| 马斯克 | 工程/成本 | GitHub 外部 Skill |
| 芒格 | 价值投资 | GitHub 外部 Skill |
| 费曼 | 科学思维 | GitHub 外部 Skill |
| 纳瓦尔 | 自由哲学 | GitHub 外部 Skill |
| 塔勒布 | 风险管理 | GitHub 外部 Skill |
| 张雪峰 | 教育实用 | GitHub 外部 Skill |

### 蒸馏原理

人物Skill由 [女娲 · Skill造人术](https://github.com/alchaincyf/nuwa-skill) 蒸馏生成，包含五阶段流程：

1. **Phase 0.5** — 创建目录结构
2. **Phase 1** — 6 Agent 并行多源调研（著作/对话/表达/他者/决策/时间线）
3. **Phase 2** — 框架提炼：心智模型（3-7个）、决策启发式（5-10条）、表达DNA
4. **Phase 3** — 构建 SKILL.md + Agentic Protocol
5. **Phase 4-5** — 质量验证 + 双Agent精炼

蒸馏产物分两处存放：
- `skills/[name]-perspective/SKILL.md` — 完整可运行 Skill
- `backend/personas/[name].md` — 训练室 System Prompt 素材

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
| POST | `/api/persona_think` | 角色思维推理（穿搭模式 / 思维训练模式） |
| **POST** | **`/api/room/broadcast`** | **🆕 广播模式：一发多回 (ThreadPool并行)** |
| **POST** | **`/api/room/debate/send`** | **🆕 辩论模式：轮询发言** |
