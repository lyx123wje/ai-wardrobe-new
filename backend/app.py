import io
import base64
import uuid
import bcrypt
import jwt
import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from rembg import remove
import os

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG
print("[系统] 正在加载衣服识别模型(MobileNetV2)，首次运行需下载约14MB，请耐心等待...")
from clothing_engine import init_clothing_engine, predict_category
from portrait_engine import process_portrait_image, list_hairstyles
from mind_engine import load_personas, match_personas, persona_think, ask_wardrobe_butler, broadcast_think, debate_send, genius_lens, daily_quote, extract_quotes, extract_methodology, fetch_trending_topics

# 初始化 Flask 应用
app = Flask(__name__)
CORS(app)

# ── JWT 配置 ──
SECRET_KEY = os.environ.get('JWT_SECRET', 'ai-wardrobe-jwt-secret-key-2024')
TOKEN_EXPIRY_DAYS = 30

# 预热 Clothing Engine（MobileNetV2 模型）
init_clothing_engine()
print("[系统] 衣服引擎初始化完成")

# Portrait Engine 使用懒加载，避免启动时下载模型
# Mind Engine 的 personas.json 按需读取


# ── JWT 工具函数 ──

def generate_token(user_id, nickname):
    payload = {
        'user_id': user_id,
        'nickname': nickname,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=TOKEN_EXPIRY_DAYS),
        'iat': datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')


def decode_token(token):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def require_auth(f):
    """装饰器：从 Authorization Bearer header 解析用户身份"""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"status": "error", "message": "未登录，请先注册或登录"}), 401
        token = auth_header[7:]
        payload = decode_token(token)
        if not payload:
            return jsonify({"status": "error", "message": "Token 无效或已过期，请重新登录"}), 401
        request.user_id = payload.get('user_id')
        request.nickname = payload.get('nickname')
        return f(*args, **kwargs)
    return decorated


# --- 核心接口区 ---

@app.route('/', methods=['GET'])
def home():
    return jsonify({"status": "ok", "service": "AI Wardrobe API v4.0"})


# ========== Clothing Engine 接口 ==========

# 文件大小限制：10MB
MAX_FILE_SIZE = 10 * 1024 * 1024

@app.route('/api/process', methods=['POST'])
def process_clothing():
    try:
        img_data = None

        if 'image' in request.files:
            file = request.files['image']
            if file.filename == '':
                return jsonify({"status": "error", "message": "文件名为空"}), 400
            # 检查文件大小
            file.seek(0, 2)  # 移动到文件末尾
            file_size = file.tell()
            file.seek(0)     # 重置到文件开头
            if file_size > MAX_FILE_SIZE:
                return jsonify({"status": "error", "message": "文件过大，最大支持 10MB"}), 400
            img_data = file.read()
        elif request.is_json:
            data = request.get_json()
            if 'image_base64' not in data:
                return jsonify({"status": "error", "message": "未找到 image_base64 字段"}), 400

            b64_str = data['image_base64']
            if ',' in b64_str:
                b64_str = b64_str.split(',')[1]
            # 检查 base64 解码后的大小
            if len(b64_str) * 0.75 > MAX_FILE_SIZE:
                return jsonify({"status": "error", "message": "文件过大，最大支持 10MB"}), 400
            img_data = base64.b64decode(b64_str)
        else:
            return jsonify({"status": "error", "message": "请用 FormData 或 JSON 格式上传"}), 400

        print("[衣服引擎] 正在抠图...")
        transparent_data = remove(img_data)

        # Compress: resize large images and convert to JPEG to reduce size
        from PIL import Image as PILImage
        buf = io.BytesIO(transparent_data)
        img = PILImage.open(buf).convert('RGBA')
        # Resize if wider than 400px to keep response size down
        max_w = 400
        if img.width > max_w:
            ratio = max_w / img.width
            new_h = int(img.height * ratio)
            img = img.resize((max_w, new_h), PILImage.LANCZOS)
        # Convert RGBA to white-bg JPEG for size reduction
        bg = PILImage.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])  # use alpha as mask
        jpg_buf = io.BytesIO()
        bg.save(jpg_buf, 'JPEG', quality=75)
        compressed_data = jpg_buf.getvalue()

        print("[衣服引擎] 正在分类...")
        sub_tag, category, raw_index = predict_category(compressed_data)

        base64_encoded = base64.b64encode(compressed_data).decode('utf-8')
        base64_str = f"data:image/jpeg;base64,{base64_encoded}"

        return jsonify({
            "status": "success",
            "sub_tag": sub_tag,
            "category": category,
            "raw_index": raw_index,
            "processed_image_base64": base64_str
        })

    except Exception as e:
        print(f"[错误] 处理出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== Portrait Engine 接口 ==========

@app.route('/api/process_portrait', methods=['POST'])
def process_portrait():
    try:
        img_data = None

        if 'image' in request.files:
            file = request.files['image']
            if file.filename == '':
                return jsonify({"status": "error", "message": "文件名为空"}), 400
            # 检查文件大小
            file.seek(0, 2)
            file_size = file.tell()
            file.seek(0)
            if file_size > MAX_FILE_SIZE:
                return jsonify({"status": "error", "message": "文件过大，最大支持 10MB"}), 400
            img_data = file.read()
        elif request.is_json:
            data = request.get_json()
            if 'image_base64' not in data:
                return jsonify({"status": "error", "message": "未找到 image_base64 字段"}), 400

            b64_str = data['image_base64']
            if ',' in b64_str:
                b64_str = b64_str.split(',')[1]
            # 检查 base64 解码后的大小
            if len(b64_str) * 0.75 > MAX_FILE_SIZE:
                return jsonify({"status": "error", "message": "文件过大，最大支持 10MB"}), 400
            img_data = base64.b64decode(b64_str)
        else:
            return jsonify({"status": "error", "message": "请用 FormData 或 JSON 格式上传"}), 400

        print("[人像引擎] 正在抠图...")
        processed = process_portrait_image(img_data)

        base64_encoded = base64.b64encode(processed).decode('utf-8')
        base64_str = f"data:image/png;base64,{base64_encoded}"

        return jsonify({
            "status": "success",
            "processed_image_base64": base64_str
        })

    except Exception as e:
        print(f"[错误] 人像抠图出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/static/hairstyles/<filename>')
def serve_hairstyle(filename):
    """提供发型图片静态文件"""
    hairstyle_dir = os.path.join(os.path.dirname(__file__), "static", "hairstyles")
    return send_from_directory(hairstyle_dir, filename)


@app.route('/api/hairstyles/list', methods=['GET'])
def hairstyles_list():
    try:
        # 从请求中获取基础URL用于构建完整URL
        base_url = f"{request.scheme}://{request.host}"
        hairstyles = list_hairstyles(base_url=base_url)
        return jsonify({"hairstyles": hairstyles})
    except Exception as e:
        print(f"[错误] 发型列表出错: {e}")
        return jsonify({"hairstyles": [], "error": str(e)}), 500


# ========== Mind Engine 接口 ==========

@app.route('/api/personas/list', methods=['GET'])
def personas_list():
    try:
        personas = load_personas()
        return jsonify({"personas": personas})
    except Exception as e:
        print(f"[错误] 角色列表加载出错: {e}")
        return jsonify({"personas": [], "error": str(e)}), 500


@app.route('/api/personas/match', methods=['POST'])
def personas_match():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        clothing_tag = data.get("clothing_tag", "")
        clothing_category = data.get("clothing_category", "")

        if not clothing_tag or not clothing_category:
            return jsonify({"status": "error", "message": "缺少 clothing_tag 或 clothing_category"}), 400

        result = match_personas(clothing_tag, clothing_category)
        return jsonify({
            "status": "success",
            "matches": result["matches"],
            "matched_by": result["matched_by"],
            "personas": result["personas"]
        })

    except Exception as e:
        print(f"[错误] 角色匹配出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/persona_think', methods=['POST'])
def persona_think_api():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        persona_id = data.get("persona_id", "")
        user_problem = data.get("user_problem", "")
        clothing_tag = data.get("clothing_tag", "")
        history = data.get("history", [])

        if not persona_id or not user_problem:
            return jsonify({"status": "error", "message": "缺少 persona_id 或 user_problem"}), 400

        result = persona_think(persona_id, user_problem, clothing_tag, history)
        result["status"] = "success"
        return jsonify(result)

    except Exception as e:
        print(f"[错误] 角色推理出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 思维训练室接口 ==========

@app.route('/api/room/broadcast', methods=['POST'])
def room_broadcast():
    """
    广播模式：一个问题同时抛给多位高人
    请求体: { persona_ids: [...], question: "xxx" }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        persona_ids = data.get("persona_ids", [])
        question = data.get("question", "")

        if not persona_ids or not isinstance(persona_ids, list):
            return jsonify({"status": "error", "message": "缺少 persona_ids 数组"}), 400
        if not question:
            return jsonify({"status": "error", "message": "缺少 question"}), 400

        results = broadcast_think(persona_ids, question)
        return jsonify({
            "status": "success",
            "question": question,
            "responses": results,
            "count": len(results)
        })

    except Exception as e:
        print(f"[错误] 广播思考出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/room/debate/send', methods=['POST'])
def room_debate_send():
    """
    群聊辩论模式：下一位高人发言
    请求体: {
      room_id: "会话ID",
      persona_ids: [...],
      current_speaker_id: "",
      user_message: "xxx",
      history: [...],
      topic: "辩论议题"
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        room_id = data.get("room_id", str(uuid.uuid4()))
        persona_ids = data.get("persona_ids", [])
        current_speaker_id = data.get("current_speaker_id", "")
        user_message = data.get("user_message", "")
        history = data.get("history", [])
        topic = data.get("topic", "")

        if not persona_ids or not isinstance(persona_ids, list):
            return jsonify({"status": "error", "message": "缺少 persona_ids 数组"}), 400
        if not topic:
            return jsonify({"status": "error", "message": "缺少 topic"}), 400

        # 确保 room_id 有值
        if not room_id:
            room_id = str(uuid.uuid4())

        result = debate_send(room_id, persona_ids, current_speaker_id, user_message, history, topic)
        result["room_id"] = room_id
        result["status"] = "success"
        return jsonify(result)

    except Exception as e:
        print(f"[错误] 辩论发言出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 天才视角周报 (The Genius Lens) ==========

@app.route('/api/genius_lens', methods=['POST'])
def genius_lens_endpoint():
    """
    天才视角周报：输入话题列表 → 自动匹配角色 + 生成跨时空点评
    请求体: { topics: [{"title": "...", "summary": "...", "keywords": ["..."]}] }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        topics = data.get("topics", [])

        if not topics or not isinstance(topics, list):
            return jsonify({"status": "error", "message": "缺少 topics 数组"}), 400
        if len(topics) > 3:
            return jsonify({"status": "error", "message": "最多支持3个话题"}), 400

        result = genius_lens(topics)
        result["status"] = "success"
        return jsonify(result)

    except Exception as e:
        print(f"[错误] 天才视角周报出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 每日金句 ==========

@app.route('/api/quotes/daily', methods=['GET'])
def quotes_daily():
    """
    随机获取1位高人的金句
    返回: {persona_id, persona_name, persona_style, quotes: [...]}
    """
    try:
        result = daily_quote()
        result["status"] = "success"
        return jsonify(result)
    except Exception as e:
        print(f"[错误] 每日金句出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/quotes/<persona_id>', methods=['GET'])
def quotes_by_persona(persona_id):
    """
    获取指定高人的金句
    返回: {persona_id, persona_name, persona_style, quotes: [...]}
    """
    try:
        result = extract_quotes(persona_id)
        result["status"] = "success"
        return jsonify(result)
    except Exception as e:
        print(f"[错误] 获取金句出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 跨人物对比 ==========

@app.route('/api/methodology/compare', methods=['POST'])
def methodology_compare():
    """
    解析多位高人的 .md 文件，提取核心心智模型 + 决策启发式
    请求体: {persona_ids: [...], question: "..."}
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        persona_ids = data.get("persona_ids", [])
        question = data.get("question", "")

        if not persona_ids or not isinstance(persona_ids, list):
            return jsonify({"status": "error", "message": "缺少 persona_ids 数组"}), 400
        if len(persona_ids) < 2:
            return jsonify({"status": "error", "message": "至少需要选择2位高人"}), 400

        results = extract_methodology(persona_ids, question)
        return jsonify({
            "status": "success",
            "question": question,
            "comparisons": results,
            "count": len(results)
        })

    except Exception as e:
        print(f"[错误] 跨人物对比出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 热搜抓取 ==========

@app.route('/api/trending', methods=['GET'])
def trending_topics():
    """
    获取微博热搜排行
    返回: {topics: [{title, rank, hot}, ...], source: "tenapi"|"vvhan"|"cache"}
    """
    try:
        result = fetch_trending_topics()
        result["status"] = "success"
        return jsonify(result)
    except Exception as e:
        print(f"[错误] 热搜抓取出错: {e}")
        return jsonify({"status": "error", "message": str(e), "topics": []}), 500


# ========== 数据库 CRUD API ==========
import database as db


# ── Wardrobe ──

@app.route('/api/wardrobe', methods=['POST'])
@require_auth
def api_create_wardrobe():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        sub_tag = data.get("sub_tag", "")
        category = data.get("category", "")
        if not sub_tag or not category:
            return jsonify({"status": "error", "message": "缺少 sub_tag 或 category"}), 400

        item = db.create_wardrobe_item(
            sub_tag=sub_tag,
            category=category,
            color=data.get("color", ""),
            processed_image=data.get("processed_image"),
            original_image=data.get("original_image"),
            purchase_date=data.get("purchase_date", ""),
            purchase_amount=data.get("purchase_amount", 0.0),
            receipt_image=data.get("receipt_image"),
            notes=data.get("notes", ""),
            user_id=request.user_id,
        )
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 创建衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe', methods=['GET'])
@require_auth
def api_list_wardrobe():
    try:
        category = request.args.get("category")
        search = request.args.get("search")
        color = request.args.get("color")
        is_dirty = request.args.get("is_dirty")
        is_unwanted = request.args.get("is_unwanted")

        items = db.list_wardrobe_items(
            category=category,
            search=search,
            color=color,
            is_dirty=is_dirty,
            is_unwanted=is_unwanted,
            user_id=request.user_id,
        )
        return jsonify({"status": "success", "items": items, "count": len(items)})
    except Exception as e:
        print(f"[错误] 列表衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/<int:item_id>', methods=['GET'])
@require_auth
def api_get_wardrobe(item_id):
    try:
        item = db.get_wardrobe_item(item_id, request.user_id)
        if not item:
            return jsonify({"status": "error", "message": "衣物不存在"}), 404
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 获取衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/<int:item_id>', methods=['PUT'])
@require_auth
def api_update_wardrobe(item_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400
        item = db.update_wardrobe_item(item_id, request.user_id, **data)
        if not item:
            return jsonify({"status": "error", "message": "衣物不存在或无有效更新字段"}), 404
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 更新衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/<int:item_id>', methods=['DELETE'])
@require_auth
def api_delete_wardrobe(item_id):
    try:
        db.delete_wardrobe_item(item_id, request.user_id)
        return jsonify({"status": "success", "message": "衣物已删除"})
    except Exception as e:
        print(f"[错误] 删除衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/batch', methods=['POST'])
@require_auth
def api_batch_create():
    try:
        data = request.get_json()
        if not data or "items" not in data:
            return jsonify({"status": "error", "message": "请提供 items 数组"}), 400
        created_ids = db.batch_create_items(data["items"], request.user_id)
        return jsonify({"status": "success", "created_ids": created_ids, "count": len(created_ids)})
    except Exception as e:
        print(f"[错误] 批量创建衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/stats', methods=['GET'])
@require_auth
def api_wardrobe_stats():
    try:
        stats = db.get_wardrobe_stats(request.user_id)
        return jsonify({"status": "success", "stats": stats})
    except Exception as e:
        print(f"[错误] 统计出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/mark_all_clean', methods=['POST'])
@require_auth
def api_mark_all_clean():
    try:
        db.mark_all_clean(request.user_id)
        return jsonify({"status": "success", "message": "全部衣物已标记为干净"})
    except Exception as e:
        print(f"[错误] 标记干净出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/shared', methods=['GET'])
@require_auth
def api_get_shared_wardrobe():
    try:
        owner_id = request.args.get('owner_id')
        shares = db.get_shared_wardrobe_items(request.user_id, owner_id)
        return jsonify({"status": "success", "shared": shares})
    except Exception as e:
        print(f"[错误] 获取共享衣柜出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ── Outfits ──

@app.route('/api/outfits', methods=['POST'])
@require_auth
def api_create_outfit():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        log_date = data.get("log_date", "")
        note = data.get("note", "")
        wardrobe_item_ids = data.get("wardrobe_item_ids", [])

        if not log_date:
            return jsonify({"status": "error", "message": "缺少 log_date"}), 400
        if not wardrobe_item_ids:
            return jsonify({"status": "error", "message": "缺少 wardrobe_item_ids"}), 400

        outfit = db.create_outfit(log_date, note, wardrobe_item_ids, request.user_id)
        return jsonify({"status": "success", "outfit": outfit})
    except Exception as e:
        print(f"[错误] 创建穿搭出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/outfits', methods=['GET'])
@require_auth
def api_list_outfits():
    try:
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        outfits = db.list_outfits(start_date=start_date, end_date=end_date, user_id=request.user_id)
        return jsonify({"status": "success", "outfits": outfits, "count": len(outfits)})
    except Exception as e:
        print(f"[错误] 列表穿搭出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/outfits/date/<date_str>', methods=['GET'])
@require_auth
def api_get_outfit_by_date(date_str):
    try:
        outfit = db.get_outfit_by_date(date_str, request.user_id)
        if not outfit:
            return jsonify({"status": "success", "outfit": None})
        return jsonify({"status": "success", "outfit": outfit})
    except Exception as e:
        print(f"[错误] 获取穿搭出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/outfits/<int:outfit_id>', methods=['DELETE'])
@require_auth
def api_delete_outfit(outfit_id):
    try:
        ok = db.delete_outfit(outfit_id, request.user_id)
        if not ok:
            return jsonify({"status": "error", "message": "穿搭不存在或无权删除"}), 404
        return jsonify({"status": "success", "message": "穿搭日志已删除"})
    except Exception as e:
        print(f"[错误] 删除穿搭出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 杂物 (Misc Items) CRUD ==========

@app.route('/api/misc', methods=['POST'])
@require_auth
def api_create_misc():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        name = data.get("name", "")
        if not name:
            return jsonify({"status": "error", "message": "缺少 name"}), 400

        item = db.create_misc_item(
            name=name,
            image=data.get("image"),
            location=data.get("location", ""),
            notes=data.get("notes", ""),
            user_id=request.user_id,
        )
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 创建杂物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/misc', methods=['GET'])
@require_auth
def api_list_misc():
    try:
        search = request.args.get("search")
        items = db.list_misc_items(search=search, user_id=request.user_id)
        return jsonify({"status": "success", "items": items, "count": len(items)})
    except Exception as e:
        print(f"[错误] 列表杂物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/misc/<int:item_id>', methods=['PUT'])
@require_auth
def api_update_misc(item_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400
        item = db.update_misc_item(item_id, request.user_id, **data)
        if not item:
            return jsonify({"status": "error", "message": "杂物不存在或无有效更新字段"}), 404
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 更新杂物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/misc/<int:item_id>', methods=['DELETE'])
@require_auth
def api_delete_misc(item_id):
    try:
        db.delete_misc_item(item_id, request.user_id)
        return jsonify({"status": "success", "message": "杂物已删除"})
    except Exception as e:
        print(f"[错误] 删除杂物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 日记 API ==========

@app.route('/api/diary', methods=['POST'])
@require_auth
def api_create_diary():
    try:
        data = request.get_json()
        log_date = data.get("log_date", "")
        content = data.get("content", "")
        if not content:
            return jsonify({"status": "error", "message": "缺少 content"}), 400
        entry = db.create_diary_entry(log_date, content, request.user_id)
        return jsonify({"status": "success", "entry": entry})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/diary', methods=['GET'])
@require_auth
def api_list_diary():
    try:
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        entries = db.list_diary_entries(start_date, end_date, request.user_id)
        return jsonify({"status": "success", "entries": entries, "count": len(entries)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/diary/<int:entry_id>', methods=['PUT'])
@require_auth
def api_update_diary(entry_id):
    try:
        data = request.get_json()
        if not data or "content" not in data:
            return jsonify({"status": "error", "message": "缺少 content"}), 400
        db.update_diary_entry(entry_id, data["content"], request.user_id)
        return jsonify({"status": "success", "message": "日记已更新"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/diary/<int:entry_id>', methods=['DELETE'])
@require_auth
def api_delete_diary(entry_id):
    try:
        db.delete_diary_entry(entry_id, request.user_id)
        return jsonify({"status": "success", "message": "日记已删除"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 衣柜智能管家 ==========

@app.route('/api/wardrobe/ask', methods=['POST'])
@require_auth
def api_wardrobe_ask():
    try:
        data = request.get_json()
        if not data or "question" not in data:
            return jsonify({"status": "error", "message": "缺少 question 字段"}), 400

        question = data["question"].strip()
        if not question:
            return jsonify({"status": "error", "message": "问题不能为空"}), 400

        # 拉取当前用户的衣物和杂物数据
        wardrobe_items = db.list_wardrobe_items(user_id=request.user_id)
        misc_items = db.list_misc_items(user_id=request.user_id)
        history = data.get("history", [])

        # 调用 AI 推理
        result = ask_wardrobe_butler(question, wardrobe_items, misc_items, history)

        # 给 related_items 补上实际图片数据（LLM 在 prompt 中看不到图片）
        wardrobe_by_id = {item['id']: item for item in wardrobe_items}
        misc_by_id = {item['id']: item for item in misc_items}
        enriched_items = []
        for ri in result.get("related_items", []):
            enriched = dict(ri)
            if ri.get("type") == "wardrobe":
                actual = wardrobe_by_id.get(ri.get("id"))
                if actual:
                    enriched["image"] = actual.get("processed_image") or ""
                    enriched["name"] = ri.get("name") or actual.get("sub_tag", "")
                    enriched["category"] = ri.get("category") or actual.get("category", "")
                    enriched["color"] = ri.get("color") or actual.get("color", "")
                    enriched["wear_count"] = ri.get("wear_count", actual.get("wear_count", 0))
                    enriched["purchase_amount"] = ri.get("purchase_amount", actual.get("purchase_amount", 0))
            elif ri.get("type") == "misc":
                actual = misc_by_id.get(ri.get("id"))
                if actual:
                    enriched["image"] = actual.get("image") or ""
                    enriched["name"] = ri.get("name") or actual.get("name", "")
                    enriched["location"] = ri.get("location") or actual.get("location", "")
            enriched_items.append(enriched)
        result["related_items"] = enriched_items

        # 执行 AI 返回的 actions
        executed_actions = []
        for action in result.get("actions", []):
            try:
                action_type = action.get("type")
                if action_type == "update_misc_location":
                    misc_id = action.get("misc_id")
                    new_location = action.get("new_location", "")
                    if misc_id:
                        db.update_misc_item(misc_id, request.user_id, location=new_location)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_unwanted":
                    item_id = action.get("item_id")
                    if item_id:
                        db.update_wardrobe_item(item_id, request.user_id, is_unwanted=1)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_dirty":
                    item_id = action.get("item_id")
                    if item_id:
                        db.update_wardrobe_item(item_id, request.user_id, is_dirty=1)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_clean":
                    item_id = action.get("item_id")
                    if item_id:
                        db.update_wardrobe_item(item_id, request.user_id, is_dirty=0)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_keep":
                    item_id = action.get("item_id")
                    if item_id:
                        db.update_wardrobe_item(item_id, request.user_id, is_unwanted=0)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "create_diary":
                    content = action.get("content", "")
                    log_date = action.get("date", "")
                    if content:
                        entry = db.create_diary_entry(log_date, content, request.user_id)
                        action["diary_id"] = entry["id"]
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "search_diary":
                    keyword = action.get("keyword", "")
                    if keyword:
                        entries = db.search_diary_entries(keyword, request.user_id)
                        action["results"] = entries
                        action["count"] = len(entries)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "delete_diary":
                    diary_id = action.get("diary_id")
                    if diary_id:
                        db.delete_diary_entry(diary_id, request.user_id)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_info":
                    item_id = action.get("item_id")
                    name = action.get("name", "")
                    updates = action.get("updates", {})
                    if item_id and updates:
                        # 处理 purchase_amount：确保是数字
                        if "purchase_amount" in updates:
                            try:
                                updates["purchase_amount"] = int(float(updates["purchase_amount"]))
                            except (ValueError, TypeError):
                                pass  # 保持原样
                        db.update_wardrobe_item(item_id, request.user_id, **updates)
                        action["status"] = "done"
                        action["applied_updates"] = updates
                        executed_actions.append(action)
                elif action_type == "update_misc_info":
                    misc_id = action.get("misc_id")
                    name = action.get("name", "")
                    updates = action.get("updates", {})
                    if misc_id and updates:
                        db.update_misc_item(misc_id, request.user_id, **updates)
                        action["status"] = "done"
                        action["applied_updates"] = updates
                        executed_actions.append(action)
            except Exception as e:
                print(f"[管家] 执行 action 失败: {action}, error: {e}")
                action["status"] = "failed"
                action["error"] = str(e)
                executed_actions.append(action)

        return jsonify({
            "status": "success",
            "answer": result.get("answer", ""),
            "actions": executed_actions,
            "related_items": result.get("related_items", []),
        })
    except Exception as e:
        print(f"[错误] 管家问答出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 用户认证 API ==========

@app.route('/api/auth/register', methods=['POST'])
def api_auth_register():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        nickname = data.get("nickname", "").strip()
        password = data.get("password", "")

        if not nickname:
            return jsonify({"status": "error", "message": "缺少昵称"}), 400
        if not password or len(password) < 4:
            return jsonify({"status": "error", "message": "密码至少需要4位"}), 400

        # Check if nickname already exists
        existing = db.get_user_by_nickname(nickname)
        if existing:
            return jsonify({"status": "error", "message": "该昵称已被使用"}), 409

        user_id = str(uuid.uuid4())
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user = db.create_user(user_id, nickname, password_hash)
        token = generate_token(user_id, nickname)

        return jsonify({
            "status": "success",
            "user_id": user_id,
            "nickname": nickname,
            "token": token,
        })
    except Exception as e:
        print(f"[错误] 注册出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/auth/login', methods=['POST'])
def api_auth_login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400

        user_id = data.get("user_id", "").strip()
        password = data.get("password", "")

        if not user_id:
            return jsonify({"status": "error", "message": "缺少 user_id"}), 400
        if not password:
            return jsonify({"status": "error", "message": "缺少密码"}), 400

        # Try user_id first, then nickname
        user = db.get_user_by_id(user_id)
        if not user:
            user = db.get_user_by_nickname(user_id)
        if not user:
            return jsonify({"status": "error", "message": "用户不存在"}), 404

        if not bcrypt.checkpw(password.encode('utf-8'), user["password_hash"].encode('utf-8')):
            return jsonify({"status": "error", "message": "密码错误"}), 401

        token = generate_token(user["id"], user["nickname"])
        return jsonify({
            "status": "success",
            "user_id": user["id"],
            "nickname": user["nickname"],
            "token": token,
        })
    except Exception as e:
        print(f"[错误] 登录出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/auth/verify', methods=['GET'])
def api_auth_verify():
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"status": "success", "valid": False})
        token = auth_header[7:]
        payload = decode_token(token)
        if not payload:
            return jsonify({"status": "success", "valid": False})
        return jsonify({
            "status": "success",
            "valid": True,
            "user_id": payload.get("user_id"),
            "nickname": payload.get("nickname"),
        })
    except Exception as e:
        return jsonify({"status": "success", "valid": False, "error": str(e)}), 500


# ========== 协作 API ==========
from flask_socketio import SocketIO, emit, join_room, leave_room as sio_leave_room
import eventlet
import collab_manager

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')


# ── 协作 REST 端点 ──

@app.route('/api/collab/rooms', methods=['POST'])
@require_auth
def api_collab_create_room():
    try:
        code = collab_manager.create_room(request.user_id, request.nickname)
        return jsonify({
            "status": "success",
            "room_code": code,
            "owner_id": request.user_id,
            "owner_nickname": request.nickname,
        })
    except Exception as e:
        print(f"[错误] 创建房间出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/collab/rooms/<room_code>/join', methods=['POST'])
@require_auth
def api_collab_join_room(room_code):
    try:
        result = collab_manager.join_room(room_code, request.user_id, request.nickname)
        if not result:
            return jsonify({"status": "error", "message": "房间不存在或已关闭"}), 404
        return jsonify({"status": "success", "room": result})
    except Exception as e:
        print(f"[错误] 加入房间出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/collab/rooms/<room_code>', methods=['GET'])
@require_auth
def api_collab_get_room(room_code):
    try:
        room = collab_manager.get_room(room_code)
        if not room:
            return jsonify({"status": "error", "message": "房间不存在"}), 404
        return jsonify({"status": "success", "room": room})
    except Exception as e:
        print(f"[错误] 获取房间出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/collab/share-wardrobe', methods=['POST'])
@require_auth
def api_collab_share_wardrobe():
    try:
        data = request.get_json()
        if not data or "item_ids" not in data:
            return jsonify({"status": "error", "message": "缺少 item_ids"}), 400
        room_code = data.get("room_code", "")
        if not room_code:
            return jsonify({"status": "error", "message": "缺少 room_code"}), 400
        result = collab_manager.share_wardrobe(room_code, request.user_id, data["item_ids"])
        if not result:
            return jsonify({"status": "error", "message": "分享失败，房间不存在或对方未加入"}), 404
        return jsonify({"status": "success", "shared_count": len(data["item_ids"])})
    except Exception as e:
        print(f"[错误] 共享衣柜出错: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/collab/shared-wardrobe/<room_code>', methods=['DELETE'])
@require_auth
def api_collab_clear_shared_wardrobe(room_code):
    try:
        db.delete_shared_wardrobe_for_room(room_code)
        return jsonify({"status": "success", "message": "共享记录已清除"})
    except Exception as e:
        print(f"[错误] 清除共享衣柜出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ── WebSocket 事件处理 ──

@socketio.on('connect')
def handle_connect():
    token = request.args.get('token', '')
    room_code = request.args.get('room_code', '')

    # Also try auth header style
    if not token:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            token = auth[7:]

    if not token:
        emit('error', {'message': '缺少认证 token'})
        return False

    payload = decode_token(token)
    if not payload:
        emit('error', {'message': 'Token 无效'})
        return False

    user_id = payload.get('user_id')
    nickname = payload.get('nickname')

    if not room_code:
        emit('error', {'message': '缺少 room_code'})
        return False

    room = collab_manager.get_room(room_code)
    if not room:
        emit('error', {'message': '房间不存在'})
        return False

    # Join the SocketIO room
    join_room(room_code)
    collab_manager.set_member_sid(room_code, user_id, request.sid)

    # Notify the other member
    partner = collab_manager.get_partner(room_code, user_id)
    if partner and partner.get('sid'):
        emit('partner_joined', {
            'user_id': user_id,
            'nickname': nickname,
        }, to=partner['sid'])

    # Send room info back
    emit('room_info', {
        'room_code': room_code,
        'members': room.get('members', {}),
        'partner': partner,
    })
    print(f"[协作] {nickname}({user_id}) 加入房间 {room_code}")


@socketio.on('disconnect')
def handle_disconnect():
    # Find which room this user is in and leave them
    for code in list(collab_manager.rooms.keys()):
        room = collab_manager.rooms.get(code)
        if room:
            for uid, member in list(room.get('members', {}).items()):
                if member.get('sid') == request.sid:
                    collab_manager.leave_room(code, uid)
                    # Notify partner
                    partner = collab_manager.get_partner(code, uid)
                    if partner and partner.get('sid'):
                        emit('partner_left', {
                            'user_id': uid,
                            'nickname': member.get('nickname'),
                        }, to=partner['sid'])
                    sio_leave_room(code)
                    print(f"[协作] {member.get('nickname')} 离开房间 {code}")
                    return


# 画布同步事件
@socketio.on('canvas_element_added')
def handle_element_added(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('canvas_element_added', data, room=room_code, include_self=False)


@socketio.on('canvas_element_updated')
def handle_element_updated(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('canvas_element_updated', data, room=room_code, include_self=False)


@socketio.on('canvas_element_removed')
def handle_element_removed(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('canvas_element_removed', data, room=room_code, include_self=False)


@socketio.on('canvas_background_changed')
def handle_bg_changed(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('canvas_background_changed', data, room=room_code, include_self=False)


@socketio.on('chat_message')
def handle_chat_message(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('chat_message', {
        'from': data.get('from'),
        'nickname': data.get('nickname'),
        'text': data.get('text'),
        'timestamp': data.get('timestamp'),
    }, room=room_code, include_self=False)


@socketio.on('request_full_state')
def handle_request_full_state(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('full_state_sync', data, room=room_code, include_self=False)


# WebRTC 信令
@socketio.on('webrtc_offer')
def handle_webrtc_offer(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('webrtc_offer', {
        'from': data.get('from'),
        'sdp': data.get('sdp'),
        'candidates': data.get('candidates'),
    }, room=room_code, include_self=False)


@socketio.on('webrtc_answer')
def handle_webrtc_answer(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('webrtc_answer', {
        'from': data.get('from'),
        'sdp': data.get('sdp'),
        'candidates': data.get('candidates'),
    }, room=room_code, include_self=False)


@socketio.on('webrtc_ice_candidate')
def handle_ice_candidate(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    emit('webrtc_ice_candidate', data, room=room_code, include_self=False)


# ── 共享衣柜推送 ──
@socketio.on('share_wardrobe_broadcast')
def handle_share_wardrobe(data):
    room_code = data.get('room_code')
    if not room_code:
        return
    from_user_id = data.get('from_user_id')
    item_ids = data.get('item_ids', [])
    # Persist to DB
    collab_manager.share_wardrobe(room_code, from_user_id, item_ids)
    emit('wardrobe_shared', {
        'from_user_id': from_user_id,
        'from_nickname': data.get('from_nickname'),
        'item_ids': item_ids,
    }, room=room_code, include_self=False)


# --- 启动入口 ---
if __name__ == '__main__':
    print("[系统] AI 衣橱后端 v4.0 启动中...")
    print(f"[系统] 监听地址: http://{FLASK_HOST}:{FLASK_PORT}")
    print("[系统] 已加载引擎: 衣服 / 人像 / 思维 / 数据库 / 协作")
    print("[系统] 等待请求...")
    socketio.run(app, host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)
