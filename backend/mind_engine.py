import json
import os
import uuid
import time
import threading
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

# 内存缓存角色人格数据，避免重复读文件
_personas_cache = None
_personas_cache_time = 0
_persona_prompts_cache = {}
_persona_prompts_cache_time = {}

# 缓存过期时间（1小时）
CACHE_TTL_SECONDS = 3600

# 线程锁，避免多线程竞态条件
_cache_lock = threading.Lock()


def load_personas():
    """加载 personas.json（首次读取后缓存到内存，1小时过期）"""
    global _personas_cache, _personas_cache_time

    # 快速路径：检查缓存是否有效
    now = time.time()
    if _personas_cache is not None and (now - _personas_cache_time) < CACHE_TTL_SECONDS:
        return _personas_cache

    # 加锁加载文件，避免多线程竞态
    with _cache_lock:
        # 双重检查：在等待锁的过程中其他线程可能已加载
        if _personas_cache is not None and (now - _personas_cache_time) < CACHE_TTL_SECONDS:
            return _personas_cache

        filepath = os.path.join(os.path.dirname(__file__), "personas.json")
        with open(filepath, "r", encoding="utf-8") as f:
            _personas_cache = json.load(f)
        _personas_cache_time = now
        return _personas_cache


def match_personas(clothing_tag, clothing_category):
    """
    双层匹配策略：
    1. 第一层：用 associated_tags 精确匹配衣物小标签
    2. 第二层：用 associated_categories 大类兜底匹配
    3. 兜底：无匹配时返回全部角色
    """
    personas = load_personas()
    tag_matches = []
    category_matches = []

    for persona in personas:
        if clothing_tag in persona.get("associated_tags", []):
            tag_matches.append(persona["id"])
        elif clothing_category in persona.get("associated_categories", []):
            category_matches.append(persona["id"])

    # 优先：标签精确匹配 → 兜底：大类匹配
    matched_ids = tag_matches if tag_matches else category_matches

    # 仍无匹配：返回全部角色
    if not matched_ids:
        matched_ids = [p["id"] for p in personas]

    matched_personas = [p for p in personas if p["id"] in matched_ids]
    return {
        "matches": matched_ids,
        "matched_by": "tag" if tag_matches else ("category" if category_matches else "all"),
        "personas": matched_personas
    }


def build_system_prompt(persona, clothing_tag):
    """根据角色人格 + 当前衣物构建中文 System Prompt"""
    return (
        f"你是「{persona['name']}」，一位{persona['style']}风格的穿搭顾问。\n\n"
        f"{persona['bio']}\n\n"
        f"当前用户关注或穿着的是「{clothing_tag}」类衣物。\n\n"
        "请以第一人称「我」的口吻回复，代入这个角色的性格、品味和表达习惯。"
        "用中文回复，保持专业但不失亲切感。"
        "回复控制在200字以内，重点突出你的穿搭哲学和具体建议。"
    )


def call_llm(system_prompt, user_message):
    """调用 DeepSeek Chat API（OpenAI 兼容接口）
    返回: dict 包含 success, content, error 字段
    """
    if not DEEPSEEK_API_KEY:
        return {
            "success": False,
            "content": None,
            "error": "DeepSeek API Key 未配置，请在项目根目录的 .env 文件中设置 DEEPSEEK_API_KEY。"
        }

    url = f"{DEEPSEEK_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.8,
        "max_tokens": 600,
        "stream": False
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return {
            "success": True,
            "content": data["choices"][0]["message"]["content"],
            "error": None
        }
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "content": None,
            "error": "AI 服务响应超时，请稍后重试。"
        }
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "content": None,
            "error": f"AI 服务调用失败：{str(e)}"
        }
    except (KeyError, IndexError) as e:
        return {
            "success": False,
            "content": None,
            "error": f"AI 响应解析失败，返回格式异常：{str(e)}"
        }


def persona_think(persona_id, user_problem, clothing_tag, history=None):
    """
    完整角色推理流程：
    1. 根据 persona_id 查找对应角色人格
    2. 构建该角色的 System Prompt（穿搭模式或思维训练模式）
    3. 如果有对话历史，追加到 prompt
    4. 调用 DeepSeek LLM 获取角色化回复
    """
    personas = load_personas()
    persona = next((p for p in personas if p["id"] == persona_id), None)

    if not persona:
        return {
            "persona_name": "",
            "response_text": f"未找到角色人格: {persona_id}",
            "error": f"角色ID '{persona_id}' 不存在"
        }

    # 如果没有穿搭标签（即思维训练室模式），使用房间 System Prompt
    if not clothing_tag:
        system_prompt = build_room_system_prompt(persona, user_problem)
    else:
        system_prompt = build_system_prompt(persona, clothing_tag)

    # 追加对话历史
    if history and len(history) > 0:
        history_text = "\n\n对话历史：\n"
        for msg in history[-10:]:  # 最多保留最近10轮
            speaker = msg.get('speaker', '')
            content = msg.get('content', '')
            history_text += f"【{speaker}】: {content}\n"
        system_prompt += history_text

    result = call_llm(system_prompt, user_problem)

    return {
        "persona_name": persona["name"],
        "response_text": result["content"] or result["error"],
        "error": None if result["success"] else result["error"]
    }


def load_persona_prompt(persona_id):
    """从 backend/personas/ 目录加载角色的思维框架 .md 文件（1小时缓存过期）"""
    global _persona_prompts_cache, _persona_prompts_cache_time

    # 快速路径：检查缓存是否有效
    now = time.time()
    if persona_id in _persona_prompts_cache:
        cache_time = _persona_prompts_cache_time.get(persona_id, 0)
        if (now - cache_time) < CACHE_TTL_SECONDS:
            return _persona_prompts_cache[persona_id]

    # 加锁加载文件
    with _cache_lock:
        # 双重检查
        if persona_id in _persona_prompts_cache:
            cache_time = _persona_prompts_cache_time.get(persona_id, 0)
            if (now - cache_time) < CACHE_TTL_SECONDS:
                return _persona_prompts_cache[persona_id]

        # 尝试多个可能的文件名
        personas_dir = os.path.join(os.path.dirname(__file__), "personas")
        possible_names = [
            f"{persona_id}.md",
            f"{persona_id.replace('_', '-')}.md",
        ]
        prompt_path = None
        for name in possible_names:
            candidate = os.path.join(personas_dir, name)
            if os.path.exists(candidate):
                prompt_path = candidate
                break

        if not prompt_path:
            # 如果找不到 .md 文件，回退到用 personas.json 中的简短描述
            return None

        with open(prompt_path, "r", encoding="utf-8") as f:
            content = f.read()

        _persona_prompts_cache[persona_id] = content
        _persona_prompts_cache_time[persona_id] = now
        return content


def build_room_system_prompt(persona, question):
    """为思维训练室构建角色 System Prompt，优先使用蒸馏产物 .md 文件"""
    persona_id = persona["id"]
    persona_prompt_md = load_persona_prompt(persona_id)

    if persona_prompt_md:
        # 使用蒸馏产物构建 prompt
        return (
            f"{persona_prompt_md}\n\n"
            f"---\n\n"
            f"现在有人向你提出了一个问题。请以第一人称「我」的口吻回复，"
            f"完全代入你的人物设定、思维方式和表达风格。"
            f"用中文回复，控制在300字以内。"
            f"可以引用你的人物经历和名言来支撑观点。\n\n"
            f"当前问题：{question}"
        )
    else:
        # 回退到用 personas.json 中的简短描述
        return (
            f"你是「{persona['name']}」，{persona['bio']}\n\n"
            f"现在有人向你提出了一个问题。请以第一人称「我」的口吻回复，"
            f"完全代入你的人物设定、思维方式和表达风格。"
            f"用中文回复，控制在300字以内。\n\n"
            f"当前问题：{question}"
        )


def broadcast_think(persona_ids, question):
    """
    广播模式：一个问题同时抛给 N 位高人
    使用 ThreadPoolExecutor 并行调用 DeepSeek
    """
    personas = load_personas()
    results = []

    def ask_one(pid):
        persona = next((p for p in personas if p["id"] == pid), None)
        if not persona:
            return {"persona_id": pid, "persona_name": "", "response_text": f"未找到角色: {pid}", "success": False}

        system_prompt = build_room_system_prompt(persona, question)
        result = call_llm(system_prompt, question)
        return {
            "persona_id": pid,
            "persona_name": persona["name"],
            "persona_style": persona.get("style", ""),
            "response_text": result["content"] or result["error"],
            "success": result["success"],
            "error": result["error"]
        }

    with ThreadPoolExecutor(max_workers=min(len(persona_ids), 6)) as executor:
        futures = {executor.submit(ask_one, pid): pid for pid in persona_ids}
        for future in as_completed(futures):
            try:
                results.append(future.result(timeout=30))
            except Exception as e:
                pid = futures[future]
                results.append({
                    "persona_id": pid,
                    "persona_name": pid,
                    "response_text": f"该角色回复超时：{e}"
                })

    # 保持原始顺序
    results.sort(key=lambda r: persona_ids.index(r["persona_id"]) if r["persona_id"] in persona_ids else 999)
    return results


def debate_send(room_id, persona_ids, current_speaker_id, user_message, history, topic):
    """
    群聊辩论模式：下一位高人发言

    参数:
        room_id: 会话ID
        persona_ids: 当前群聊成员ID列表
        current_speaker_id: 指定谁发言（空字符串则自动选择下一位）
        user_message: 用户最新消息（可能为空）
        history: 群聊历史 [{speaker, speakerName, content}, ...]
        topic: 辩论议题
    """
    personas = load_personas()

    # 如果未指定发言人，自动选择下一位
    if not current_speaker_id:
        # 找历史中发言次数最少的人
        speak_count = {pid: 0 for pid in persona_ids}
        for msg in history:
            if msg.get("speaker") in speak_count:
                speak_count[msg["speaker"]] += 1

        # 排除用户
        speak_count.pop("user", None)
        if not speak_count:
            return {"speaker_id": "", "speaker_name": "", "response_text": "无可用发言人"}

        # 选发言次数最少的（如果有并列，随机选）
        min_count = min(speak_count.values())
        candidates = [pid for pid, cnt in speak_count.items() if cnt == min_count]
        import random
        current_speaker_id = random.choice(candidates)

    persona = next((p for p in personas if p["id"] == current_speaker_id), None)
    if not persona:
        return {"speaker_id": current_speaker_id, "speaker_name": "", "response_text": f"未找到角色: {current_speaker_id}"}

    # 构建群聊历史文本
    history_text = ""
    for msg in history[-10:]:  # 只保留最近10条
        sp_name = msg.get("speakerName", msg.get("speaker", ""))
        history_text += f"【{sp_name}】: {msg.get('content', '')}\n"

    # 获取该角色的思维框架
    persona_prompt_md = load_persona_prompt(current_speaker_id)

    if persona_prompt_md:
        system_prompt = (
            f"{persona_prompt_md}\n\n"
            f"---\n\n"
            f"你正在参加一场多人辩论。辩论议题是：「{topic}」\n\n"
            f"辩论参与者：\n"
        )
    else:
        system_prompt = (
            f"你是「{persona['name']}」，{persona['bio']}\n\n"
            f"你正在参加一场多人辩论。辩论议题是：「{topic}」\n\n"
            f"辩论参与者：\n"
        )

    # 列出所有参与者
    for pid in persona_ids:
        p = next((pp for pp in personas if pp["id"] == pid), None)
        if p:
            system_prompt += f"- {p['name']}（{p.get('style', '')}）\n"

    system_prompt += f"\n对话历史：\n{history_text}\n" if history_text else "\n目前还没有人发言。\n"

    system_prompt += (
        f"\n现在轮到「{persona['name']}」发言。"
        f"请以第一人称「我」的口吻，完全代入你的角色设定来发言。"
        f"你可以回应、反驳、补充前面的人说的话，也可以提出全新的观点。"
        f"保持你的人物风格和语言特色。如果前人的观点和你冲突，大胆反驳。"
        f"用中文回复，控制在250字以内。"
    )

    user_msg = ""
    if user_message:
        user_msg = f"用户刚刚说：{user_message}"

    result = call_llm(system_prompt, user_msg if user_msg else "请发言")

    return {
        "speaker_id": current_speaker_id,
        "speaker_name": persona["name"],
        "response_text": result["content"] or result["error"],
        "success": result["success"],
        "error": result["error"]
    }


def build_wardrobe_butler_prompt(question, wardrobe_items, misc_items):
    """构建衣柜管家的 System Prompt，包含全部衣物和杂物数据"""
    # 衣物清单表格
    wardrobe_lines = []
    for item in wardrobe_items:
        row = f"| {item['id']} | {item.get('sub_tag','')} | {item.get('category','')} | {item.get('color','')} | {item.get('purchase_amount',0)}元 | 穿{item.get('wear_count',0)}次 | {'脏' if item.get('is_dirty') else '净'} | {'不想要' if item.get('is_unwanted') else '正常'} | {item.get('notes','')} |"
        wardrobe_lines.append(row)

    wardrobe_table = "\n".join(wardrobe_lines) if wardrobe_lines else "暂无衣物"

    # 杂物清单表格
    misc_lines = []
    for item in misc_items:
        row = f"| {item['id']} | {item.get('name','')} | {item.get('location','')} | {'已丢失' if item.get('is_lost') else '正常'} | {item.get('notes','')} |"
        misc_lines.append(row)

    misc_table = "\n".join(misc_lines) if misc_lines else "暂无杂物"

    prompt = f"""你是衣柜智能管家，一个亲切、体贴的助手。你的语气温暖友好，像一位细心的家人在帮你整理生活。

【数据】
## 衣物清单（共 {len(wardrobe_items)} 件）
| ID | 名称 | 分类 | 颜色 | 价格 | 穿着次数 | 状态 | 不想要 | 备注 |
|---|---|---|---|---|---|---|---|---|
{wardrobe_table}

## 杂物清单（共 {len(misc_items)} 件）
| ID | 名称 | 存放位置 | 状态 | 备注 |
|---|---|---|---|---|
{misc_table}

【你的能力】
1. 回答关于物品位置、数量、金额、穿着情况的问题
2. 当用户表达"物品位置变更"意图时（如"我把XX放到了YY"），返回 update_misc_location 操作
3. 当用户表达"某衣物不想要了"意图时（如"XX不想要了"、"XX我不要了"），返回 update_wardrobe_unwanted 操作
4. 当用户表达"取消不想要/想要了"意图时（如"XX我还要"、"取消XX的不想要"、"别把XX卖了"、"XX还是留着吧"），返回 update_wardrobe_keep 操作
5. 当用户表达"衣物脏了"意图时（如"XX脏了"、"XX该洗了"），返回 update_wardrobe_dirty 操作
6. 当用户表达"衣物洗干净了/洗好了"意图时（如"XX洗好了"、"XX洗干净了"、"把XX标记为干净"、"XX洗完了"），返回 update_wardrobe_clean 操作
7. 当用户表达"记录/记下来/帮我记/同步日记"意图时（如"记一下今天XX""帮我记个事"），返回 create_diary 操作，date用当天日期或用户指定的日期
8. 当用户询问"有没有/谁/什么时候/查一下/检索"等需要查历史记录的问题时，返回 search_diary 操作，keyword为用户问题中的关键词
9. 当用户要求"删除/删掉"某条日记时，返回 delete_diary 操作，需要提供diary_id
10. 当用户提供衣物的补充信息或纠正时（如"XX是多少钱买的""XX其实是蓝色的""XX的购买日期是去年""XX是XX牌子的"），返回 update_wardrobe_info 操作。可更新字段：purchase_amount(价格数字), purchase_date(日期), sub_tag(名称), color(颜色), category(分类), notes(备注)
11. 当用户提供杂物的补充信息时（如"那把剪刀其实是张小泉牌的"），返回 update_misc_info 操作。可更新字段：name(名称), notes(备注)
12. 当用户在杂物中找不到某物品时，诚实告知。不要编造不存在于清单中的物品。

【回复风格】你的回复必须亲切自然，像朋友聊天一样。每次只回答一个核心问题，不要堆砌信息。适当使用语气词（哦、呢、呀、哈）。

【输出格式】必须输出纯 JSON（不要包裹在 markdown 代码块或引号中）：
{{"answer": "自然口语回复（200字以内）", "actions": [], "related_items": []}}

操作类型参考（仅在用户明确意图时使用）：
- update_misc_location: {{"type":"update_misc_location","misc_id":5,"name":"剪刀","new_location":"书房"}}
- update_wardrobe_unwanted: {{"type":"update_wardrobe_unwanted","item_id":12,"name":"粉色豹纹裤子"}}
- update_wardrobe_keep: {{"type":"update_wardrobe_keep","item_id":12,"name":"粉色豹纹裤子"}}
- update_wardrobe_dirty: {{"type":"update_wardrobe_dirty","item_id":3,"name":"白衬衫"}}
- update_wardrobe_clean: {{"type":"update_wardrobe_clean","item_id":3,"name":"白衬衫"}}
- create_diary: {{"type":"create_diary","content":"日记内容","date":"2026-06-09"}}
- search_diary: {{"type":"search_diary","keyword":"关键词"}}
- delete_diary: {{"type":"delete_diary","diary_id":1}}
- update_wardrobe_info: {{"type":"update_wardrobe_info","item_id":5,"name":"睡裤","updates":{{"purchase_amount":800,"purchase_date":"2025"}}}}
- update_misc_info: {{"type":"update_misc_info","misc_id":3,"name":"剪刀","updates":{{"notes":"小泉牌"}}}}

【规则】
- 如果用户只是询问信息，actions 返回空数组 []
- 如果用户表达位置变更意图且清单中存在该物品，才返回 update_misc_location
- 如果清单中不存在该物品，在 answer 中告知用户，不要执行操作
- 如果用户明确指定了某件衣物名称说"洗好了""不想要了"等，且清单中存在，才返回对应的操作
- related_items 列举回答中涉及的物品。衣物需包含 id, type:"wardrobe", name, category, color, wear_count, purchase_amount；杂物需包含 id, type:"misc", name, location。图片由系统自动补充，无需你填写。
- 衣物ID和杂物ID是两个独立的体系！衣物ID对应衣物清单表格，杂物ID对应杂物清单表格，绝对不能混淆
- search_diary 的 keyword 为用户问题中提取的核心关键词（1-3个词），不要整句搜索
- create_diary 的 date 默认用当天日期，除非用户指定了其他日期
- update_wardrobe_info 的 updates 只包含用户明确提到的字段。purchase_amount用纯数字（如800），不要带元/¥。purchase_date用自然描述即可（如"2025"或"去年"）。
- update_misc_info 同理，updates 只包含用户明确提到的字段
- 当用户同时表达了物品补充信息和想记录，可以同时返回 update_wardrobe_info/update_misc_info 和 create_diary 两个 action"""
    return prompt


def ask_wardrobe_butler(question, wardrobe_items, misc_items, history=None):
    """
    衣柜智能管家推理：
    1. 构建包含所有衣物和杂物数据的 System Prompt
    2. 如果有对话历史，追加到 prompt
    3. 调用 DeepSeek LLM 获取结构化 JSON 回复
    4. 解析返回 JSON
    """
    system_prompt = build_wardrobe_butler_prompt(question, wardrobe_items, misc_items)

    # 追加对话历史（最近5轮）
    if history and len(history) > 0:
        history_text = "\n【对话历史】\n"
        for msg in history[-10:]:
            role = "用户" if msg.get('role') == 'user' else "管家"
            history_text += f"{role}: {msg.get('content', '')}\n"
        history_text += "\n请结合对话历史回复用户的最新提问，保持上下文连贯。\n"
        # 把历史插入到 prompt 末尾（在输出格式说明之前）
        idx = system_prompt.rfind("【输出格式】")
        if idx > 0:
            system_prompt = system_prompt[:idx] + history_text + "\n" + system_prompt[idx:]
        else:
            system_prompt += "\n" + history_text

    result = call_llm_long(system_prompt, question)
    if not result["success"]:
        return {
            "answer": result["error"] or "抱歉，AI 服务暂时不可用，请稍后重试。",
            "actions": [],
            "related_items": [],
        }

    response_text = result["content"]

    # 解析 JSON 回复
    try:
        text = response_text.strip()
        # 去除可能的 markdown 代码块包裹
        if text.startswith("```"):
            lines = text.split("\n")
            # 跳过第一行（可能是 ```json 或 ```)，去掉最后一行 ```
            text = "\n".join(lines[1:-1]) if len(lines) > 2 and lines[-1].strip() == "```" else text
            text = text.strip()

        # 寻找 JSON 对象边界
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start:end+1]

        # 替换中文引号（这些字符在 JSON 中非法）
        text = text.replace('\u201c', '"').replace('\u201d', '"')
        text = text.replace('\u2018', "'").replace('\u2019', "'")

        # 先尝试直接解析
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            # 如果失败，尝试修复 value 中的未转义双引号（LLM 常在中文回复里夹带英文引号）
            # 策略：把前后都是中文字符的 " 换成 '
            fixed = re.sub(r'([\u4e00-\u9fff])"([\u4e00-\u9fff])', r"\1'\2", text)
            # 以及 value 值中间、前后有空格的 "（常见于引用对话）
            fixed = re.sub(r'(?<=[\u4e00-\u9fff\s])"(?=[\u4e00-\u9fff\s])', "'", fixed)
            try:
                parsed = json.loads(fixed)
            except json.JSONDecodeError:
                # 最后尝试：把 value 内部的 " 全替换为 '
                # 但只替换不在关键 JSON 结构位置（:, {}[]）旁边的 "
                fixed2 = re.sub(r'(?<=[^\\{,:\s\[\]}])"(?=[^,:}\]\s])', "'", text)
                try:
                    parsed = json.loads(fixed2)
                except json.JSONDecodeError:
                    raise  # 三种策略都失败，抛出异常

        result = parsed

        # 验证必要字段
        if "answer" not in result:
            result["answer"] = "抱歉，AI 未能生成有效回复。"
        if "actions" not in result:
            result["actions"] = []
        if "related_items" not in result:
            result["related_items"] = []

        return result
    except json.JSONDecodeError as e:
        print(f"[管家] JSON 解析失败: {e}, 原始回复: {response_text[:300]}")
        return {
            "answer": response_text[:300] if response_text else "抱歉，AI 未能生成有效回复。",
            "actions": [],
            "related_items": [],
        }


def call_llm_long(system_prompt, user_message):
    """调用 DeepSeek API（长文本版，更高 token 限制）
    返回: dict 包含 success, content, error 字段
    """
    if not DEEPSEEK_API_KEY:
        return {
            "success": False,
            "content": None,
            "error": "DeepSeek API Key 未配置，智能管家暂时不可用。"
        }

    url = f"{DEEPSEEK_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.3,
        "max_tokens": 1200,
        "stream": False
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        return {
            "success": True,
            "content": data["choices"][0]["message"]["content"],
            "error": None
        }
    except requests.exceptions.Timeout:
        return {"success": False, "content": None, "error": "AI 服务响应超时，请稍后重试。"}
    except requests.exceptions.RequestException as e:
        print(f"[管家] API 调用失败: {e}")
        return {"success": False, "content": None, "error": f"AI 服务调用失败：{str(e)}"}
    except (KeyError, IndexError) as e:
        print(f"[管家] 响应解析失败: {e}")
        return {"success": False, "content": None, "error": f"AI 响应解析失败：{str(e)}"}


# ========== 每日金句 ==========

def extract_quotes(persona_id):
    """
    从角色的 .md 蒸馏产物中提取金句
    优先级：
    1. New Skill 文件顶部 `> 「金句」` 块引用
    2. ## 身份 / ## 身份卡 段落中引号或书名号内的句子
    3. ## 核心心智模型 小节中 "..." 引用的句子

    返回: {persona_id, persona_name, quotes: ["...", "..."]}
    """
    personas = load_personas()
    persona = next((p for p in personas if p["id"] == persona_id), None)

    if not persona:
        return {"persona_id": persona_id, "persona_name": "", "quotes": []}

    md_content = load_persona_prompt(persona_id)
    if not md_content:
        return {"persona_id": persona_id, "persona_name": persona["name"], "quotes": []}

    quotes = []

    # 优先级1：New Skill 格式顶部的 `> 「金句」` 块引用
    import re
    top_blockquote = re.search(r'^>\s*「([^」]+)」', md_content, re.MULTILINE)
    if top_blockquote:
        quotes.append(top_blockquote.group(1))

    # 优先级1补充：文件头 YAML frontmatter 之后的 > 块引用
    if not quotes:
        # 跳过 frontmatter 之后找块引用
        after_frontmatter = re.split(r'^---\s*$', md_content, maxsplit=2, flags=re.MULTILINE)
        if len(after_frontmatter) >= 3:
            search_area = after_frontmatter[2]
        else:
            search_area = md_content

        blockquote_lines = re.findall(r'^>\s*(.+)$', search_area, re.MULTILINE)
        for line in blockquote_lines[:3]:
            line = line.strip()
            if line and not line.startswith('本Skill由') and not line.startswith('免责声明'):
                quotes.append(line)
                if len(quotes) >= 2:
                    break

    # 优先级2：## 身份 / ## 身份卡 段落中的引号内容
    identity_section = re.search(
        r'##\s+身份[卡]?\s*\n(.*?)(?=\n##\s|\Z)',
        md_content, re.DOTALL
    )
    if identity_section:
        identity_text = identity_section.group(1)
        # 提取中文双引号内的句子
        quoted = re.findall(r'[「"]([^」"]+)[」"]', identity_text)
        for q in quoted:
            q = q.strip()
            if len(q) > 3 and q not in quotes:
                quotes.append(q)

    # 优先级3：## 核心心智模型 小节中的引号内容
    mental_section = re.search(
        r'##\s+核心心智模型\s*\n(.*?)(?=\n##\s|\Z)',
        md_content, re.DOTALL
    )
    if mental_section:
        mental_text = mental_section.group(1)
        quoted = re.findall(r'[「"]([^」"]+)[」"]', mental_text)
        for q in quoted:
            q = q.strip()
            if len(q) > 5 and q not in quotes:
                quotes.append(q)
                if len(quotes) >= 4:
                    break

    # 去重、取前3条
    seen = set()
    unique = []
    for q in quotes:
        if q not in seen:
            seen.add(q)
            unique.append(q)
    quotes = unique[:3]

    # 如果什么都没提取到，返回 persona bio 作为兜底
    if not quotes:
        quotes = [persona.get("bio", "")[:100]]

    return {
        "persona_id": persona_id,
        "persona_name": persona["name"],
        "persona_style": persona.get("style", ""),
        "quotes": quotes
    }


def daily_quote():
    """
    随机选1位高人，提取金句
    返回: {persona_id, persona_name, persona_style, quotes: [...]}
    """
    import random
    personas = load_personas()
    # 优先选有 .md 文件的
    candidates = [p for p in personas if load_persona_prompt(p["id"])]
    if not candidates:
        candidates = personas
    chosen = random.choice(candidates)
    return extract_quotes(chosen["id"])


# ========== 跨人物对比 ==========

def extract_methodology(persona_ids, question):
    """
    解析多位高人的 .md 文件，提取核心心智模型 + 决策启发式

    返回: [
      {
        persona_id, persona_name, persona_style,
        mental_models: [{title, content}],
        heuristics: [str],
        relevant_quotes: [str]
      }
    ]
    """
    import re
    personas = load_personas()
    results = []

    for pid in persona_ids:
        persona = next((p for p in personas if p["id"] == pid), None)
        if not persona:
            results.append({
                "persona_id": pid, "persona_name": pid, "persona_style": "",
                "mental_models": [], "heuristics": [], "relevant_quotes": []
            })
            continue

        md_content = load_persona_prompt(pid)
        entry = {
            "persona_id": pid,
            "persona_name": persona["name"],
            "persona_style": persona.get("style", ""),
            "mental_models": [],
            "heuristics": [],
            "relevant_quotes": []
        }

        if not md_content:
            results.append(entry)
            continue

        # 提取 ## 核心心智模型 各小节
        mental_section = re.search(
            r'##\s+核心心智模型\s*\n(.*?)(?=\n##\s|\Z)',
            md_content, re.DOTALL
        )
        if mental_section:
            mental_text = mental_section.group(1)
            # 匹配 ### N. 标题 / ### N. 标题 的段落
            models = re.split(r'\n###\s+\d+\.\s+', mental_text)
            for m in models[1:]:  # 第一个是空的（分割结果前面的内容）
                lines = m.strip().split('\n', 1)
                title = lines[0].strip() if lines else ""
                body = lines[1].strip()[:200] if len(lines) > 1 else ""
                # 只取前200字作为摘要
                if title:
                    entry["mental_models"].append({
                        "title": title,
                        "content": body[:200]
                    })

        # 提取 ## 决策启发式
        heuristic_section = re.search(
            r'##\s+决策启发式\s*\n(.*?)(?=\n##\s|\Z)',
            md_content, re.DOTALL
        )
        if heuristic_section:
            heur_text = heuristic_section.group(1)
            # 匹配编号条目
            heuristics = re.findall(r'\d+\.\s+\*\*(.+?)\*\*', heur_text)
            if not heuristics:
                heuristics = re.findall(r'\d+\.\s+(.+?)(?:\n|$)', heur_text)
            entry["heuristics"] = [h.strip()[:120] for h in heuristics[:8]]

        # 提取金句（复用 extract_quotes 逻辑）
        quote_result = extract_quotes(pid)
        entry["relevant_quotes"] = quote_result.get("quotes", [])[:2]

        results.append(entry)

    return results


# ========== 天才视角周报 (The Genius Lens) ==========

def genius_lens(topics):
    """
    接收话题列表，自动匹配最合适的角色（必须有 .md 蒸馏产物），生成跨时空点评
    topics: [{"title": "...", "summary": "...", "keywords": ["..."]}, ...]
    最多3个话题
    """
    if not topics:
        return {"error": "请提供至少1个话题", "lens": []}
    if len(topics) > 3:
        return {"error": "最多支持3个话题", "lens": []}

    personas = load_personas()

    # 只保留有 .md 蒸馏产物的角色
    valid_personas = [p for p in personas if load_persona_prompt(p["id"])]

    if not valid_personas:
        return {"error": "没有找到已蒸馏的角色，请先在 backend/personas/ 下放置 .md 文件", "lens": []}

    # 角色匹配：每个话题根据 keywords + title + summary 匹配角色
    used_ids = set()
    matched_pairs = []

    for topic in topics:
        title = topic.get("title", "")
        summary = topic.get("summary", "")
        keywords = topic.get("keywords", [])

        best_score = -1
        best_persona = None

        for p in valid_personas:
            if p["id"] in used_ids:
                continue

            score = 0
            # 匹配搜索范围：style + name（不用 bio，那是角色扮演档案）
            search_text = f"{p.get('style', '')} {p['name']}".lower()

            for word in title.replace("，", " ").replace("、", " ").split():
                if len(word) >= 2 and word.lower() in search_text:
                    score += 2

            for word in summary.replace("，", " ").replace("、", " ").split():
                if len(word) >= 2 and word.lower() in search_text:
                    score += 1

            for kw in keywords:
                if len(kw) >= 2 and kw.lower() in search_text:
                    score += 3

            if score > best_score:
                best_score = score
                best_persona = p

        if best_persona and best_score > 0:
            matched_pairs.append({"topic": topic, "persona": best_persona, "score": best_score})
            used_ids.add(best_persona["id"])
        else:
            for p in valid_personas:
                if p["id"] not in used_ids:
                    matched_pairs.append({"topic": topic, "persona": p, "score": 0})
                    used_ids.add(p["id"])
                    break

    # 并行生成点评（强制使用 .md 蒸馏产物，不回退到 personas.json）
    def generate_one(m):
        persona = m["persona"]
        topic = m["topic"]

        persona_prompt_md = load_persona_prompt(persona["id"])
        # 此时 .md 一定存在，因为 valid_personas 已经过滤过

        system_prompt = f"""{persona_prompt_md}

---
你是「天才视角周报」的特约点评人。以下是一则全球/社会热点，请以你{persona['name']}的第一视角发表点评。

热点话题：{topic['title']}
背景：{topic.get('summary', '')}

要求：
1. 必须鲜明地表达你的立场和态度
2. 引用你的思维框架或经历来支撑观点
3. 控制在250字以内
4. 用中文回复

请输出严格JSON格式（不要再包一层markdown代码块）：
{{
  "commentary": "你的点评内容",
  "soul_question": "一个引导读者深入思考的提问"
}}
"""
        result = call_llm(system_prompt, f"请以第一视角点评这个热点：{topic['title']}")

        commentary = ""
        soul_question = ""

        if result["success"]:
            try:
                text = result["content"].strip()
                start = text.find("{")
                end = text.rfind("}")
                if start != -1 and end != -1 and end > start:
                    parsed = json.loads(text[start:end+1])
                    commentary = parsed.get("commentary", result["content"])
                    soul_question = parsed.get("soul_question", "")
                else:
                    commentary = result["content"]
            except (json.JSONDecodeError, KeyError, ValueError):
                commentary = result["content"]
        else:
            commentary = result.get("error", "点评生成失败")

        return {
            "topic_title": topic["title"],
            "matched_persona_id": persona["id"],
            "matched_persona_name": persona["name"],
            "matched_persona_style": persona.get("style", ""),
            "commentary": commentary,
            "soul_question": soul_question
        }

    lens_results = []
    with ThreadPoolExecutor(max_workers=min(len(matched_pairs), 3)) as executor:
        futures = [executor.submit(generate_one, m) for m in matched_pairs]
        for future in as_completed(futures):
            try:
                lens_results.append(future.result(timeout=60))
            except Exception as e:
                print(f"[天才周报] 点评生成超时: {e}")

    # 恢复原始顺序
    topic_titles = [t.get("title", "") for t in topics]
    lens_results.sort(key=lambda r: topic_titles.index(r["topic_title"]) if r["topic_title"] in topic_titles else 99)

    return {"lens": lens_results}


# ========== 热搜抓取 ==========

# 缓存热搜（避免频繁请求外部 API）
_trending_cache = None
_trending_cache_time = 0

def fetch_trending_topics():
    """
    获取微博热搜，主源 tenapi，备源 vvhan。
    缓存5分钟。
    返回: [{title, rank}, ...] 前15条
    """
    global _trending_cache, _trending_cache_time

    now = time.time()
    if _trending_cache is not None and (now - _trending_cache_time) < 300:
        return {"topics": _trending_cache, "source": "cache"}

    topics = []
    source = ""

    # 主源：tenapi
    try:
        resp = requests.get("https://tenapi.cn/v2/weibohot", timeout=8)
        if resp.status_code == 200:
            raw_text = resp.text[:500]
            print(f"[热搜][DEBUG] tenapi 原始响应(500字): {raw_text}")
            data = resp.json()
            print(f"[热搜][DEBUG] tenapi keys: {list(data.keys())[:10]}")
            if "data" in data:
                raw_list = data["data"]
                print(f"[热搜][DEBUG] tenapi data type={type(raw_list).__name__}, len={len(raw_list) if isinstance(raw_list, (list, dict)) else 'N/A'}")
                if isinstance(raw_list, list):
                    if len(raw_list) > 0:
                        print(f"[热搜][DEBUG] 第一条样本: {json.dumps(raw_list[0], ensure_ascii=False)[:200]}")
                    for item in raw_list[:15]:
                        topics.append({
                            "title": item.get("name", item.get("title", "")),
                            "rank": item.get("rank", len(topics) + 1),
                            "hot": item.get("hot", item.get("raw_hot", ""))
                        })
                    if topics:
                        source = "tenapi"
                else:
                    print(f"[热搜] tenapi data 不是数组: {type(raw_list)}")
            else:
                print(f"[热搜] tenapi 返回格式不匹配，keys: {list(data.keys())[:5]}")
    except Exception as e:
        print(f"[热搜] 主源 tenapi 失败: {e}")

    # 备源：vvhan
    if not topics:
        try:
            resp = requests.get("https://api.vvhan.com/api/hotlist?type=wbHot", timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and "data" in data:
                    for i, item in enumerate(data["data"][:15]):
                        topics.append({
                            "title": item.get("title", item.get("name", "")),
                            "rank": i + 1,
                            "hot": item.get("hot", item.get("desc", ""))
                        })
                    source = "vvhan"
        except Exception as e:
            print(f"[热搜] 备源 vvhan 失败: {e}")

    if topics:
        _trending_cache = topics
        _trending_cache_time = now

    return {"topics": topics, "source": source}
