import io
import base64
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from rembg import remove

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG
from clothing_engine import init_clothing_engine, predict_category
from portrait_engine import process_portrait_image, list_hairstyles
from mind_engine import load_personas, match_personas, persona_think, ask_wardrobe_butler, broadcast_think, debate_send

# 初始化 Flask 应用
app = Flask(__name__)
CORS(app)

# 预热 Clothing Engine（MobileNetV2 模型）
init_clothing_engine()
print("[系统] 衣服引擎初始化完成")

# Portrait Engine 使用懒加载，避免启动时下载模型
# Mind Engine 的 personas.json 按需读取


# --- 核心接口区 ---

@app.route('/', methods=['GET'])
def home():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>AI 衣橱后端 v3.0 测试</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
            .upload-area { border: 2px dashed #ccc; padding: 40px; text-align: center; margin: 20px 0; }
            #result { margin-top: 20px; }
            #resultImg { max-width: 300px; margin: 20px 0; }
            .tag { display: inline-block; padding: 5px 15px; border-radius: 20px; margin: 5px; }
            .sub-tag { background-color: #e3f2fd; color: #1976d2; }
            .category { background-color: #e8f5e9; color: #388e3c; }
        </style>
    </head>
    <body>
        <h1>AI 衣橱后端服务 v3.0 已启动</h1>
        <p>可用 API:</p>
        <ul>
            <li>POST /api/process - 衣物抠图+分类</li>
            <li>POST /api/process_portrait - 人像抠图</li>
            <li>GET /api/hairstyles/list - 发型列表</li>
            <li>GET /api/personas/list - 角色人格列表</li>
            <li>POST /api/personas/match - 衣物→角色匹配</li>
            <li>POST /api/persona_think - 角色思维推理</li>
        </ul>

        <div class="upload-area">
            <h3>上传图片测试</h3>
            <input type="file" id="imageInput" accept="image/*">
            <button onclick="uploadImage()" style="margin-top: 20px; padding: 10px 20px;">上传并处理</button>
        </div>

        <div id="result"></div>

        <script>
            function uploadImage() {
                const input = document.getElementById('imageInput');
                const resultDiv = document.getElementById('result');

                if (!input.files[0]) {
                    resultDiv.innerHTML = '<p style="color: red;">请先选择一张图片</p>';
                    return;
                }

                const formData = new FormData();
                formData.append('image', input.files[0]);

                resultDiv.innerHTML = '<p>AI 正在处理中...</p>';

                fetch('/api/process', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        resultDiv.innerHTML = `
                            <h3>处理成功！</h3>
                            <p><strong>大类：</strong><span class="tag category">${data.category}</span></p>
                            <p><strong>小标签：</strong><span class="tag sub-tag">${data.sub_tag}</span></p>
                            <p><strong>原始索引：</strong>${data.raw_index}</p>
                            <img id="resultImg" src="${data.processed_image_base64}" alt="处理后的图片">
                        `;
                    } else {
                        resultDiv.innerHTML = `<p style="color: red;">错误：${data.message}</p>`;
                    }
                })
                .catch(error => {
                    resultDiv.innerHTML = `<p style="color: red;">请求失败：${error}</p>`;
                });
            }
        </script>
    </body>
    </html>
    """


# ========== Clothing Engine 接口 ==========

@app.route('/api/process', methods=['POST'])
def process_clothing():
    try:
        img_data = None

        if 'image' in request.files:
            file = request.files['image']
            if file.filename == '':
                return jsonify({"status": "error", "message": "文件名为空"}), 400
            img_data = file.read()
        elif request.is_json:
            data = request.get_json()
            if 'image_base64' not in data:
                return jsonify({"status": "error", "message": "未找到 image_base64 字段"}), 400

            b64_str = data['image_base64']
            if ',' in b64_str:
                b64_str = b64_str.split(',')[1]
            img_data = base64.b64decode(b64_str)
        else:
            return jsonify({"status": "error", "message": "请用 FormData 或 JSON 格式上传"}), 400

        print("[衣服引擎] 正在抠图...")
        transparent_data = remove(img_data)

        print("[衣服引擎] 正在分类...")
        sub_tag, category, raw_index = predict_category(transparent_data)

        base64_encoded = base64.b64encode(transparent_data).decode('utf-8')
        base64_str = f"data:image/png;base64,{base64_encoded}"

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
            img_data = file.read()
        elif request.is_json:
            data = request.get_json()
            if 'image_base64' not in data:
                return jsonify({"status": "error", "message": "未找到 image_base64 字段"}), 400

            b64_str = data['image_base64']
            if ',' in b64_str:
                b64_str = b64_str.split(',')[1]
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


@app.route('/api/hairstyles/list', methods=['GET'])
def hairstyles_list():
    try:
        hairstyles = list_hairstyles()
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

        if not persona_id or not user_problem:
            return jsonify({"status": "error", "message": "缺少 persona_id 或 user_problem"}), 400

        result = persona_think(persona_id, user_problem, clothing_tag)
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


# ========== 内嵌 API 测试页 ==========

@app.route('/test', methods=['GET'])
def test_page():
    return r"""
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <title>API 冒烟测试 - AI 衣橱 v3.0</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; background: #f0f2f5; padding: 20px; }
            h1 { text-align: center; color: #1a1a2e; margin-bottom: 8px; }
            .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 1100px; margin: 0 auto; }
            .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
            .card h3 { border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
            .method { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; color: #fff; }
            .get  { background: #27ae60; }
            .post { background: #e67e22; }
            .card p.path { color: #888; font-size: 13px; margin-bottom: 12px; }
            textarea, input[type=text] { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; font-family: 'Consolas','Courier New',monospace; margin-bottom: 8px; resize: vertical; }
            textarea { min-height: 50px; }
            button { padding: 8px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; color: #fff; background: #3b82f6; }
            button:hover { background: #2563eb; }
            button:disabled { background: #aaa; cursor: not-allowed; }
            .result { margin-top: 10px; background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; font-size: 12px; font-family: 'Consolas','Courier New',monospace; white-space: pre-wrap; word-break: break-all; max-height: 250px; overflow-y: auto; display: none; }
            .result.show { display: block; }
            .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 8px; }
            .status-ok { background: #d4edda; color: #155724; }
            .status-err { background: #f8d7da; color: #721c24; }
            .half { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .span2 { grid-column: 1 / -1; }
        </style>
    </head>
    <body>
        <h1>AI 衣橱后端 v3.0 — API 冒烟测试</h1>
        <p class="subtitle">所有接口一次性测试 / 无需 Postman</p>

        <div class="grid">
            <div class="card">
                <h3><span class="method post">POST</span> 衣物去背+分类</h3>
                <p class="path">/api/process</p>
                <input type="file" id="file1" accept="image/*"><br>
                <button onclick="testProcess()">发送测试</button>
                <div class="result" id="r1"></div>
                <img id="img1" style="max-width:100%;display:none;margin-top:8px;border-radius:8px;">
            </div>

            <div class="card">
                <h3><span class="method post">POST</span> 人像抠图</h3>
                <p class="path">/api/process_portrait</p>
                <input type="file" id="file2" accept="image/*"><br>
                <button onclick="testPortrait()">发送测试</button>
                <div class="result" id="r2"></div>
                <img id="img2" style="max-width:100%;display:none;margin-top:8px;border-radius:8px;">
            </div>

            <div class="card">
                <h3><span class="method get">GET</span> 发型列表</h3>
                <p class="path">/api/hairstyles/list</p>
                <button onclick="testHairstyles()">发送测试</button>
                <div class="result" id="r3"></div>
            </div>

            <div class="card">
                <h3><span class="method get">GET</span> 角色人格列表</h3>
                <p class="path">/api/personas/list</p>
                <button onclick="testPersonasList()">发送测试</button>
                <div class="result" id="r4"></div>
            </div>

            <div class="card">
                <h3><span class="method post">POST</span> 衣物→角色匹配</h3>
                <p class="path">/api/personas/match</p>
                <div class="half">
                    <input type="text" id="match_tag" placeholder="衣物小标签（如 卫衣）" value="卫衣">
                    <input type="text" id="match_cat" placeholder="衣物大类（如 上衣）" value="上衣">
                </div>
                <button onclick="testPersonasMatch()">发送测试</button>
                <div class="result" id="r5"></div>
            </div>

            <div class="card span2">
                <h3><span class="method post">POST</span> 角色思维推理 (LLM) ⚡ DeepSeek</h3>
                <p class="path">/api/persona_think</p>
                <div class="half">
                    <select id="think_persona" style="padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                        <option value="minimalist_master">极简大师</option>
                        <option value="avant_garde_designer">前卫设计师</option>
                        <option value="vintage_collector">古着收藏家</option>
                        <option value="streetwear_kid">街头潮人</option>
                        <option value="romantic_poet">浪漫诗人</option>
                        <option value="practical_advisor">实用顾问</option>
                    </select>
                    <input type="text" id="think_tag" placeholder="衣物标签" value="白衬衫">
                </div>
                <textarea id="think_problem" placeholder="你的穿搭问题...">今天下雨去上班，穿什么合适？</textarea>
                <button id="btnThink" onclick="testPersonaThink()">调用 DeepSeek 推理</button>
                <div class="result" id="r6"></div>
            </div>
        </div>

        <script>
            const BASE = '';

            function el(id) { return document.getElementById(id); }

            async function apiCall(method, url, body) {
                const opts = { method };
                if (body instanceof FormData) opts.body = body;
                else if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
                const t0 = Date.now();
                try {
                    const res = await fetch(BASE + url, opts);
                    const ms = Date.now() - t0;
                    const data = await res.json();
                    return { ok: res.ok, status: res.status, ms, data };
                } catch (e) {
                    return { ok: false, status: 0, ms: Date.now() - t0, error: e.message };
                }
            }

            function showResult(id, result) {
                const div = el(id);
                div.classList.add('show');
                const statusHtml = result.ok
                    ? '<span class="status-badge status-ok">' + result.status + ' OK ' + result.ms + 'ms</span>'
                    : '<span class="status-badge status-err">' + (result.status || 'NET') + ' FAIL ' + result.ms + 'ms</span>';
                div.innerHTML = statusHtml + '\n' + JSON.stringify(result.data || result.error, null, 2);
            }

            // 1. process
            async function testProcess() {
                const file = el('file1').files[0];
                if (!file) { alert('请先选择图片'); return; }
                const fd = new FormData(); fd.append('image', file);
                const r = await apiCall('POST', '/api/process', fd);
                showResult('r1', r);
                const img = el('img1');
                if (r.data && r.data.processed_image_base64) {
                    img.src = r.data.processed_image_base64; img.style.display = 'block';
                } else { img.style.display = 'none'; }
            }

            // 2. portrait
            async function testPortrait() {
                const file = el('file2').files[0];
                if (!file) { alert('请先选择图片'); return; }
                const fd = new FormData(); fd.append('image', file);
                const r = await apiCall('POST', '/api/process_portrait', fd);
                showResult('r2', r);
                const img = el('img2');
                if (r.data && r.data.processed_image_base64) {
                    img.src = r.data.processed_image_base64; img.style.display = 'block';
                } else { img.style.display = 'none'; }
            }

            // 3. hairstyles
            async function testHairstyles() {
                showResult('r3', await apiCall('GET', '/api/hairstyles/list'));
            }

            // 4. personas list
            async function testPersonasList() {
                showResult('r4', await apiCall('GET', '/api/personas/list'));
            }

            // 5. personas match
            async function testPersonasMatch() {
                const body = { clothing_tag: el('match_tag').value, clothing_category: el('match_cat').value };
                showResult('r5', await apiCall('POST', '/api/personas/match', body));
            }

            // 6. persona think
            async function testPersonaThink() {
                const btn = el('btnThink');
                btn.disabled = true; btn.textContent = '正在调用 DeepSeek 推理中...';
                const body = {
                    persona_id: el('think_persona').value,
                    user_problem: el('think_problem').value,
                    clothing_tag: el('think_tag').value
                };
                const r = await apiCall('POST', '/api/persona_think', body);
                showResult('r6', r);
                btn.disabled = false; btn.textContent = '调用 DeepSeek 推理';
            }
        </script>
    </body>
    </html>
    """


# ========== 数据库 CRUD API ==========
import database as db


# ── Wardrobe ──

@app.route('/api/wardrobe', methods=['POST'])
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
        )
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 创建衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe', methods=['GET'])
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
        )
        return jsonify({"status": "success", "items": items, "count": len(items)})
    except Exception as e:
        print(f"[错误] 列表衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/<int:item_id>', methods=['GET'])
def api_get_wardrobe(item_id):
    try:
        item = db.get_wardrobe_item(item_id)
        if not item:
            return jsonify({"status": "error", "message": "衣物不存在"}), 404
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 获取衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/<int:item_id>', methods=['PUT'])
def api_update_wardrobe(item_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400
        item = db.update_wardrobe_item(item_id, **data)
        if not item:
            return jsonify({"status": "error", "message": "衣物不存在或无有效更新字段"}), 404
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 更新衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/<int:item_id>', methods=['DELETE'])
def api_delete_wardrobe(item_id):
    try:
        db.delete_wardrobe_item(item_id)
        return jsonify({"status": "success", "message": "衣物已删除"})
    except Exception as e:
        print(f"[错误] 删除衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/batch', methods=['POST'])
def api_batch_create():
    try:
        data = request.get_json()
        if not data or "items" not in data:
            return jsonify({"status": "error", "message": "请提供 items 数组"}), 400
        created_ids = db.batch_create_items(data["items"])
        return jsonify({"status": "success", "created_ids": created_ids, "count": len(created_ids)})
    except Exception as e:
        print(f"[错误] 批量创建衣物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/stats', methods=['GET'])
def api_wardrobe_stats():
    try:
        stats = db.get_wardrobe_stats()
        return jsonify({"status": "success", "stats": stats})
    except Exception as e:
        print(f"[错误] 统计出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/wardrobe/mark_all_clean', methods=['POST'])
def api_mark_all_clean():
    try:
        db.mark_all_clean()
        return jsonify({"status": "success", "message": "全部衣物已标记为干净"})
    except Exception as e:
        print(f"[错误] 标记干净出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ── Outfits ──

@app.route('/api/outfits', methods=['POST'])
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

        outfit = db.create_outfit(log_date, note, wardrobe_item_ids)
        return jsonify({"status": "success", "outfit": outfit})
    except Exception as e:
        print(f"[错误] 创建穿搭出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/outfits', methods=['GET'])
def api_list_outfits():
    try:
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        outfits = db.list_outfits(start_date=start_date, end_date=end_date)
        return jsonify({"status": "success", "outfits": outfits, "count": len(outfits)})
    except Exception as e:
        print(f"[错误] 列表穿搭出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/outfits/date/<date_str>', methods=['GET'])
def api_get_outfit_by_date(date_str):
    try:
        outfit = db.get_outfit_by_date(date_str)
        if not outfit:
            return jsonify({"status": "success", "outfit": None})
        return jsonify({"status": "success", "outfit": outfit})
    except Exception as e:
        print(f"[错误] 获取穿搭出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/outfits/<int:outfit_id>', methods=['DELETE'])
def api_delete_outfit(outfit_id):
    try:
        db.delete_outfit(outfit_id)
        return jsonify({"status": "success", "message": "穿搭日志已删除"})
    except Exception as e:
        print(f"[错误] 删除穿搭出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 杂物 (Misc Items) CRUD ==========

@app.route('/api/misc', methods=['POST'])
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
        )
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 创建杂物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/misc', methods=['GET'])
def api_list_misc():
    try:
        search = request.args.get("search")
        items = db.list_misc_items(search=search)
        return jsonify({"status": "success", "items": items, "count": len(items)})
    except Exception as e:
        print(f"[错误] 列表杂物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/misc/<int:item_id>', methods=['PUT'])
def api_update_misc(item_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "请提供 JSON 数据"}), 400
        item = db.update_misc_item(item_id, **data)
        if not item:
            return jsonify({"status": "error", "message": "杂物不存在或无有效更新字段"}), 404
        return jsonify({"status": "success", "item": item})
    except Exception as e:
        print(f"[错误] 更新杂物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/misc/<int:item_id>', methods=['DELETE'])
def api_delete_misc(item_id):
    try:
        db.delete_misc_item(item_id)
        return jsonify({"status": "success", "message": "杂物已删除"})
    except Exception as e:
        print(f"[错误] 删除杂物出错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ========== 衣柜智能管家 ==========

@app.route('/api/wardrobe/ask', methods=['POST'])
def api_wardrobe_ask():
    try:
        data = request.get_json()
        if not data or "question" not in data:
            return jsonify({"status": "error", "message": "缺少 question 字段"}), 400

        question = data["question"].strip()
        if not question:
            return jsonify({"status": "error", "message": "问题不能为空"}), 400

        # 拉取全部衣物和杂物数据
        wardrobe_items = db.list_wardrobe_items()
        misc_items = db.list_misc_items()

        # 调用 AI 推理
        result = ask_wardrobe_butler(question, wardrobe_items, misc_items)

        # 执行 AI 返回的 actions
        executed_actions = []
        for action in result.get("actions", []):
            try:
                action_type = action.get("type")
                if action_type == "update_misc_location":
                    misc_id = action.get("misc_id")
                    new_location = action.get("new_location", "")
                    if misc_id:
                        db.update_misc_item(misc_id, location=new_location)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_unwanted":
                    item_id = action.get("item_id")
                    if item_id:
                        db.update_wardrobe_item(item_id, is_unwanted=1)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_dirty":
                    item_id = action.get("item_id")
                    if item_id:
                        db.update_wardrobe_item(item_id, is_dirty=1)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_clean":
                    item_id = action.get("item_id")
                    if item_id:
                        db.update_wardrobe_item(item_id, is_dirty=0)
                        action["status"] = "done"
                        executed_actions.append(action)
                elif action_type == "update_wardrobe_keep":
                    item_id = action.get("item_id")
                    if item_id:
                        db.update_wardrobe_item(item_id, is_unwanted=0)
                        action["status"] = "done"
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


# --- 启动入口 ---
if __name__ == '__main__':
    print("[系统] AI 衣橱后端 v4.0 启动中...")
    print(f"[系统] 监听地址: http://{FLASK_HOST}:{FLASK_PORT}")
    print("[系统] 已加载引擎: 衣服 / 人像 / 思维 / 数据库")
    print("[系统] 等待请求...")
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)
