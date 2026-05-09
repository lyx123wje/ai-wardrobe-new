import json
import os
import requests
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

# 内存缓存角色人格数据，避免重复读文件
_personas_cache = None


def load_personas():
    """加载 personas.json（首次读取后缓存到内存）"""
    global _personas_cache
    if _personas_cache is not None:
        return _personas_cache
    filepath = os.path.join(os.path.dirname(__file__), "personas.json")
    with open(filepath, "r", encoding="utf-8") as f:
        _personas_cache = json.load(f)
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
    """调用 DeepSeek Chat API（OpenAI 兼容接口）"""
    if not DEEPSEEK_API_KEY:
        return "DeepSeek API Key 未配置，请在项目根目录的 .env 文件中设置 DEEPSEEK_API_KEY。"

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
        return data["choices"][0]["message"]["content"]
    except requests.exceptions.Timeout:
        return "抱歉，AI 服务响应超时，请稍后重试。"
    except requests.exceptions.RequestException as e:
        return f"AI 服务调用失败：{e}"
    except (KeyError, IndexError) as e:
        return f"AI 响应解析失败，返回格式异常：{e}"


def persona_think(persona_id, user_problem, clothing_tag):
    """
    完整角色推理流程：
    1. 根据 persona_id 查找对应角色人格
    2. 构建该角色的 System Prompt
    3. 调用 DeepSeek LLM 获取角色化回复
    """
    personas = load_personas()
    persona = next((p for p in personas if p["id"] == persona_id), None)

    if not persona:
        return {
            "persona_name": "",
            "response_text": f"未找到角色人格: {persona_id}",
            "error": f"角色ID '{persona_id}' 不存在"
        }

    system_prompt = build_system_prompt(persona, clothing_tag)
    response_text = call_llm(system_prompt, user_problem)

    return {
        "persona_name": persona["name"],
        "response_text": response_text,
        "error": None
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

    prompt = f"""你是衣柜智能管家。你可以执行以下操作：

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
7. 当用户在杂物中找不到某物品时，诚实告知。不要编造不存在于清单中的物品。

【输出格式】必须严格输出 JSON 格式（不要包裹在 markdown 代码块中）：
{{"answer": "给用户的回复文字（200字以内，自然语言）", "actions": [{{"type": "update_misc_location", "misc_id": 5, "name": "剪刀", "new_location": "阳台"}}, {{"type": "update_wardrobe_unwanted", "item_id": 12, "name": "粉色豹纹裤子"}}, {{"type": "update_wardrobe_dirty", "item_id": 3, "name": "白衬衫"}}, {{"type": "update_wardrobe_clean", "item_id": 3, "name": "白衬衫"}}, {{"type": "update_wardrobe_keep", "item_id": 12, "name": "粉色豹纹裤子"}}], "related_items": [{{"id": 5, "type": "misc", "name": "剪刀", "location": "阳台"}}]}}

【规则】
- 如果用户只是询问信息，actions 返回空数组 []
- 如果用户表达位置变更意图且清单中存在该物品，才返回 update_misc_location
- 如果清单中不存在该物品，在 answer 中告知用户，不要执行操作
- 如果用户明确指定了某件衣物名称说"洗好了""不想要了"等，且清单中存在，才返回对应的操作
- related_items 列举回答中涉及的具体物品，方便前端展示卡片"""
    return prompt


def ask_wardrobe_butler(question, wardrobe_items, misc_items):
    """
    衣柜智能管家推理：
    1. 构建包含所有衣物和杂物数据的 System Prompt
    2. 调用 DeepSeek LLM 获取结构化 JSON 回复
    3. 解析返回 JSON
    """
    if not DEEPSEEK_API_KEY:
        return {
            "answer": "DeepSeek API Key 未配置，智能管家暂时不可用。",
            "actions": [],
            "related_items": [],
        }

    system_prompt = build_wardrobe_butler_prompt(question, wardrobe_items, misc_items)

    response_text = call_llm_long(system_prompt, question)
    if not response_text:
        return {
            "answer": "抱歉，AI 服务暂时不可用，请稍后重试。",
            "actions": [],
            "related_items": [],
        }

    # 解析 JSON 回复
    try:
        # 尝试直接从文本中提取 JSON 对象
        text = response_text.strip()
        # 去除可能的 markdown 代码块包裹
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:]) if len(lines) > 1 else text
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        # 尝试找到 JSON 对象的起止位置
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start:end+1]

        result = json.loads(text)

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
    """调用 DeepSeek API（长文本版，更高 token 限制）"""
    if not DEEPSEEK_API_KEY:
        return ""

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
        return data["choices"][0]["message"]["content"]
    except requests.exceptions.Timeout:
        return ""
    except requests.exceptions.RequestException as e:
        print(f"[管家] API 调用失败: {e}")
        return ""
    except (KeyError, IndexError) as e:
        print(f"[管家] 响应解析失败: {e}")
        return ""
