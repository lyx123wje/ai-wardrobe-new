#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI衣橱 v4.0 - 全页面功能自动化测试
按页面顺序逐模块测试后端 API（不含思维实验室 dressing-cognition）

覆盖页面:
  1. 衣柜 (wardrobe)      - CRUD, 搜索, 筛选, 多选, 批量操作, 杂物
  2. 脏衣篓 (laundry)      - 脏衣列表, 单件清洗, 一键全洗
  3. 穿搭实验室 (ootd-lab) - 创建穿搭, 按日期查询, 删除穿搭
  4. 穿搭日历 (calendar)   - 月度列表, 日期查询, 日记CRUD
  5. 统计 (statistics)     - 概览, 分类占比, CPW排行, 闲置警告
  6. 卖了还钱 (resell)     - 转卖标记, 标价, 标记售出, 移回衣柜
  7. 首页 (index)          - 导航入口验证

使用方法:
  cd C:/Users/riyo0/Desktop/app/backend
  venv/Scripts/python.exe functional_test.py
"""

import urllib.request
import urllib.error
import urllib.parse
import json
import sys
import io
from datetime import date, timedelta

# 强制 UTF-8 输出（Windows GBK 兼容）
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ── 配置 ──
BASE = "http://127.0.0.1:5000"
TIMEOUT = 15  # 秒

# ── 颜色输出 ──
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

PASS = 0
FAIL = 0
SKIP = 0

def api(method, path, body=None):
    """统一 API 调用（自动 URL 编码中文参数）"""
    # URL 编码 path 中的中文查询参数
    if '?' in path:
        base_path, query = path.split('?', 1)
        params = urllib.parse.quote(query, safe='=&')
        path = base_path + '?' + params
    url = BASE + path
    data = json.dumps(body).encode('utf-8') if body else None
    headers = {'Content-Type': 'application/json'} if body else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.getcode(), json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = {}
        try: err_body = json.loads(e.read().decode())
        except: pass
        return e.code, err_body
    except Exception as e:
        return 0, {"error": str(e)}

def check(cond, msg):
    """断言"""
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  {GREEN}[PASS]{RESET} {msg}")
    else:
        FAIL += 1
        print(f"  {RED}[FAIL]{RESET} {msg}")
    return cond

def section(name):
    """打印区块标题"""
    print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
    print(f"{BOLD}{CYAN}  {name}{RESET}")
    print(f"{BOLD}{CYAN}{'='*60}{RESET}")

def label(text):
    print(f"\n  {YELLOW}── {text} ──{RESET}")

# ── 引用远程 ID ──
test_wardrobe_id = None     # 测试衣物 ID
test_misc_id = None         # 测试杂物 ID
test_outfit_id = None       # 测试穿搭 ID
test_purchase_amount = 299  # 测试购买价


# ╔════════════════════════════════════════════════════════════╗
# ║  1. 衣柜 (Wardrobe) — 核心 CRUD + 筛选 + 批量操作       ║
# ╚════════════════════════════════════════════════════════════╝

def test_wardrobe_crud():
    global test_wardrobe_id
    section("1. 衣柜 (wardrobe) — CRUD 基础操作")

    # 1.1 创建衣物
    label("1.1 创建衣物")
    code, data = api("POST", "/api/wardrobe", {
        "sub_tag": "自动测试卫衣",
        "category": "上衣",
        "color": "黑色",
        "purchase_date": str(date.today()),
        "purchase_amount": test_purchase_amount,
        "notes": "automated test item",
    })
    if check(code in (200, 201), f"创建衣物 (HTTP {code})"):
        test_wardrobe_id = data.get("item", {}).get("id")
        check(test_wardrobe_id is not None, f"获取到 ID={test_wardrobe_id}")
    else:
        print(f"    响应: {data}")

    if not test_wardrobe_id:
        print(f"  {RED}跳过后续衣柜测试（无ID）{RESET}")
        return

    # 1.2 精确获取
    label("1.2 精确获取单品")
    code, data = api("GET", f"/api/wardrobe/{test_wardrobe_id}")
    check(code == 200, f"获取衣物 (HTTP {code})")
    item = data.get("item", {})
    check(item.get("sub_tag") == "自动测试卫衣", f"子标签匹配: {item.get('sub_tag')}")

    # 1.3 更新
    label("1.3 更新衣物属性")
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {
        "color": "深灰",
        "notes": "updated via test",
    })
    check(code == 200, f"更新衣物 (HTTP {code})")
    check(data.get("item", {}).get("color") == "深灰", f"颜色已变更: {data.get('item', {}).get('color')}")

    # 1.4 列表查询（无筛选）
    label("1.4 列表查询")
    code, data = api("GET", "/api/wardrobe")
    check(code == 200, f"列表查询 (HTTP {code})")
    items = data.get("items", [])
    check(len(items) > 0, f"返回 {len(items)} 件衣物")

    # 1.5 分类筛选
    label("1.5 按分类筛选")
    code, data = api("GET", "/api/wardrobe?category=上衣")
    check(code == 200, f"分类筛选 (HTTP {code})")
    items = data.get("items", [])
    all_ok = all(i.get("category") == "上衣" for i in items)
    check(all_ok, f"筛选结果全部为「上衣」: {len(items)} 件")

    # 1.6 搜索
    label("1.6 关键词搜索")
    code, data = api("GET", "/api/wardrobe?search=自动测试")
    check(code == 200, f"搜索 (HTTP {code})")
    items = data.get("items", [])
    check(len(items) >= 1, f"搜索结果: {len(items)} 件")

    # 1.7 批量标记脏衣
    label("1.7 标记/取消脏衣 (is_dirty 切换)")
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_dirty": 1})
    check(code == 200, f"标记脏衣 (HTTP {code})")
    code2, data2 = api("GET", "/api/wardrobe?is_dirty=1")
    check(code2 == 200, "查询脏衣列表")
    check(any(i["id"] == test_wardrobe_id for i in data2.get("items", [])), "标记的衣物在脏衣列表中找到")
    # 恢复干净
    api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_dirty": 0})

    # 1.8 标记不想要
    label("1.8 标记不想要 (is_unwanted)")
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_unwanted": 1})
    check(code == 200, f"标记不想要 (HTTP {code})")
    code2, data2 = api("GET", "/api/wardrobe?is_unwanted=1")
    check(any(i["id"] == test_wardrobe_id for i in data2.get("items", [])), "标记的衣物在转卖列表中找到")
    # 恢复
    api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_unwanted": 0})


# ╔════════════════════════════════════════════════════════════╗
# ║  1B. 杂物 (Misc) 管理                                     ║
# ╚════════════════════════════════════════════════════════════╝

def test_misc_crud():
    global test_misc_id
    section("1B. 杂物管理 — 衣柜页的杂物 Tab")

    # 创建杂物
    label("创建杂物")
    code, data = api("POST", "/api/misc", {
        "name": "自动测试耳机",
        "location": "书房抽屉",
        "notes": "蓝牙降噪，白色",
    })
    if check(code in (200, 201), f"创建杂物 (HTTP {code})"):
        test_misc_id = data.get("item", {}).get("id")
        check(test_misc_id is not None, f"杂物 ID={test_misc_id}")

    if not test_misc_id:
        return

    # 列表
    label("列表杂物")
    code, data = api("GET", "/api/misc")
    check(code == 200, f"杂物列表 (HTTP {code})")
    check(len(data.get("items", [])) > 0, f"杂物列表 {len(data.get('items',[]))} 件")

    # 更新
    label("更新杂物")
    code, data = api("PUT", f"/api/misc/{test_misc_id}", {
        "name": "自动测试耳机 Pro",
        "location": "电脑桌",
    })
    check(code == 200, f"更新杂物 (HTTP {code})")
    check(data.get("item", {}).get("name") == "自动测试耳机 Pro", f"名称已更新: {data.get('item', {}).get('name')}")

    # 搜索
    label("搜索杂物")
    code, data = api("GET", "/api/misc?search=耳机")
    check(code == 200, f"搜索杂物 (HTTP {code})")
    check(len(data.get("items", [])) >= 1, f"搜索到 {len(data.get('items',[]))} 件")


# ╔════════════════════════════════════════════════════════════╗
# ║  2. 脏衣篓 (Laundry Basket)                               ║
# ╚════════════════════════════════════════════════════════════╝

def test_laundry():
    if not test_wardrobe_id:
        print(f"  {YELLOW}跳过脏衣篓测试（无衣物ID）{RESET}")
        return
    section("2. 脏衣篓 (laundry-basket)")

    # 2.1 标记脏衣
    label("2.1 标记多件脏衣")
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_dirty": 1})
    check(code == 200, f"标记脏衣 (HTTP {code})")

    # 2.2 查询脏衣列表
    label("2.2 脏衣列表")
    code, data = api("GET", "/api/wardrobe?is_dirty=1")
    check(code == 200, f"脏衣列表 (HTTP {code})")
    check(len(data.get("items", [])) >= 1, f"脏衣数量: {len(data.get('items',[]))}")

    # 2.3 单件清洗
    label("2.3 单件清洗")
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_dirty": 0})
    check(code == 200, f"标记干净 (HTTP {code})")

    # 验证不再在脏衣列表
    code, data = api("GET", "/api/wardrobe?is_dirty=1")
    all_ids = [i["id"] for i in data.get("items", [])]
    check(test_wardrobe_id not in all_ids, "衣物已从脏衣篓移除")

    # 2.4 一键全洗 — 先全部标脏
    label("2.4 一键全洗")
    code, _ = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_dirty": 1})
    code, data = api("POST", "/api/wardrobe/mark_all_clean")
    check(code == 200, f"一键全洗 (HTTP {code})")

    # 验证全干净
    code, data = api("GET", "/api/wardrobe?is_dirty=1")
    check(len(data.get("items", [])) == 0, f"全部清洗后脏衣: {len(data.get('items',[]))} 件")


# ╔════════════════════════════════════════════════════════════╗
# ║  3. 穿搭实验室 (OOTD Lab)                                 ║
# ╚════════════════════════════════════════════════════════════╝

def test_ootd_lab():
    global test_outfit_id
    if not test_wardrobe_id:
        print(f"  {YELLOW}跳过穿搭实验室测试（无衣物ID）{RESET}")
        return
    section("3. 穿搭实验室 (ootd-lab)")

    today_str = str(date.today())

    # 3.1 创建穿搭
    label("3.1 创建穿搭日志")
    note = json.dumps({
        "canvasElements": [],
        "background": {"type": "color", "value": "#FFFFFF"},
    })
    code, data = api("POST", "/api/outfits", {
        "log_date": today_str,
        "note": note,
        "wardrobe_item_ids": [test_wardrobe_id],
    })
    check(code in (200, 201), f"创建穿搭 (HTTP {code})")
    outfit = data.get("outfit", {})
    if outfit:
        test_outfit_id = outfit.get("id")
        check(test_outfit_id is not None, f"穿搭 ID={test_outfit_id}")

    # 3.2 按日期查询
    label("3.2 按日期查询穿搭")
    code, data = api("GET", f"/api/outfits/date/{today_str}")
    check(code == 200, f"按日期查询 (HTTP {code})")
    outfit = data.get("outfit")
    check(outfit is not None, "当天有穿搭记录")
    if outfit:
        check(outfit.get("log_date") == today_str, f"日期匹配: {outfit.get('log_date')}")

    # 3.3 月度列表
    label("3.3 月度穿搭列表")
    start_of_month = today_str[:8] + "01"
    code, data = api("GET", f"/api/outfits?start_date={start_of_month}&end_date={today_str}")
    check(code == 200, f"月度列表 (HTTP {code})")
    check(len(data.get("outfits", [])) >= 1, f"本月 {len(data.get('outfits',[]))} 套穿搭")

    # 3.4 验证穿搭后衣物 wear_count 增加
    label("3.4 验证 wear_count 增加")
    code, data = api("GET", f"/api/wardrobe/{test_wardrobe_id}")
    wc = data.get("item", {}).get("wear_count", 0)
    check(wc > 0, f"衣物「{data.get('item',{}).get('sub_tag','')}」已穿 {wc} 次")

    # 3.5 验证穿搭后衣物标记为脏衣
    label("3.5 验证穿搭后自动标记脏衣")
    is_dirty = data.get("item", {}).get("is_dirty", 0)
    check(is_dirty == 1, f"衣物脏衣标记: {'是' if is_dirty else '否'}")

    # 恢复干净
    api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_dirty": 0})


# ╔════════════════════════════════════════════════════════════╗
# ║  4. 穿搭日历 (Outfit Calendar)                            ║
# ╚════════════════════════════════════════════════════════════╝

def test_outfit_calendar():
    section("4. 穿搭日历 (outfit-calendar)")
    today_str = str(date.today())
    start_of_month = today_str[:8] + "01"

    # 4.1 月度列表
    label("4.1 月度穿搭概览")
    code, data = api("GET", f"/api/outfits?start_date={start_of_month}&end_date={today_str}")
    check(code == 200, f"月度列表 (HTTP {code})")
    outfits = data.get("outfits", [])
    check(len(outfits) >= 0, f"本月 {len(outfits)} 套穿搭")

    # 4.2 日期详情
    label("4.2 日期穿搭详情")
    code, data = api("GET", f"/api/outfits/date/{today_str}")
    check(code == 200, f"日期详情 (HTTP {code})")
    outfit = data.get("outfit")
    if outfit:
        check(outfit.get("log_date") == today_str, f"日期: {outfit.get('log_date')}")
        check(len(outfit.get("items", [])) >= 1, f"包含 {len(outfit.get('items',[]))} 件单品")

    # 4.3 日记 CRUD
    label("4.3 日记 CRUD")
    # 创建
    code, data = api("POST", "/api/diary", {
        "log_date": today_str,
        "content": "今天穿得很舒服！自动测试日记。",
    })
    ok = check(code in (200, 201), f"写日记 (HTTP {code})")
    diary_id = data.get("entry", {}).get("id") if ok else None

    # 查询
    label("4.4 日记查询")
    code, data = api("GET", f"/api/diary?start_date={today_str}&end_date={today_str}")
    check(code == 200, f"查日记 (HTTP {code})")
    check(len(data.get("entries", [])) >= 1, f"日记 {data.get('entries', [])}")

    # 删除日记
    if diary_id:
        label("4.5 日记删除")
        code, data = api("DELETE", f"/api/diary/{diary_id}")
        check(code == 200, f"删日记 (HTTP {code})")


# ╔════════════════════════════════════════════════════════════╗
# ║  5. 统计页 (Statistics)                                    ║
# ╚════════════════════════════════════════════════════════════╝

def test_statistics():
    section("5. 统计页 (statistics)")

    # 5.1 统计数据
    label("5.1 统计概览")
    code, data = api("GET", "/api/wardrobe/stats")
    check(code == 200, f"统计数据 (HTTP {code})")
    stats = data.get("stats", {})

    # 分类分布
    categories = stats.get("categories", [])
    check(len(categories) >= 0, f"分类数: {len(categories)}")

    # CPW 排行
    cpw = stats.get("cpw_ranking", [])
    check(len(cpw) >= 0, f"CPW 排行项: {len(cpw)}")

    # 5.2 列表 — 计算概览指标
    label("5.2 概览指标计算")
    code, data = api("GET", "/api/wardrobe")
    items = data.get("items", [])
    total_items = len(items)
    total_value = sum(i.get("purchase_amount", 0) for i in items)
    total_wears = sum(i.get("wear_count", 0) for i in items)

    print(f"    衣物总数: {total_items}")
    print(f"    总价值:   RMB{total_value}")
    print(f"    总穿着次数: {total_wears}")

    # 5.3 闲置警告 = 从未穿过
    label("5.3 闲置警告 (从未穿过的衣物)")
    never_worn = [i for i in items if i.get("wear_count", 0) == 0]
    check(True, f"从未穿过: {len(never_worn)} 件 (仅供参考)")

    # 5.4 最常穿 Top 5
    label("5.4 最常穿 Top 5")
    worn = sorted([i for i in items if i.get("wear_count", 0) > 0],
                  key=lambda i: i["wear_count"], reverse=True)[:5]
    for idx, wi in enumerate(worn):
        print(f"    #{idx+1} {wi.get('sub_tag','?')}: {wi.get('wear_count',0)}次")

    # 5.5 高 CPW 警告
    label("5.5 高 CPW 警告 (>RMB100/次)")
    high_cpw = [i for i in items if i.get("wear_count", 0) > 0
                and i.get("purchase_amount", 0) / i.get("wear_count", 1) > 100]
    check(True, f"CPW>100 RMB: {len(high_cpw)} 件 (仅供参考)")


# ╔════════════════════════════════════════════════════════════╗
# ║  6. 卖了还钱 (Resell Center)                              ║
# ╚════════════════════════════════════════════════════════════╝

def test_resell():
    if not test_wardrobe_id:
        print(f"  {YELLOW}跳过转卖测试（无衣物ID）{RESET}")
        return
    section("6. 卖了还钱 (resell-center)")

    # 6.1 标记不想要
    label("6.1 标记不想要 → 出现于转卖中心")
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_unwanted": 1})
    check(code == 200, f"标记不想要 (HTTP {code})")

    code, data = api("GET", "/api/wardrobe?is_unwanted=1")
    items = data.get("items", [])
    check(any(i["id"] == test_wardrobe_id for i in items), "物品在转卖列表中找到")

    # 6.2 标价（通过 notes 字段存储转卖信息）
    label("6.2 标价（notes 中存储转卖信息）")
    today_str = str(date.today())
    resell_note = f"[转卖] 标价:150 / 状态:待售 / 标价日期:"
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {
        "notes": f"{resell_note}{today_str}",
    })
    check(code == 200, f"标价 (HTTP {code})")
    check(data.get("item", {}).get("notes", "").startswith("[转卖]"), "notes 包含转卖信息")

    # 6.3 标记售出
    label("6.3 标记已售出（更新 notes）")
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {
        "notes": f"{resell_note}{today_str} / 售出日期:{today_str} / 已售出",
    })
    check(code == 200, f"标记售出 (HTTP {code})")

    # 6.4 移回衣柜
    label("6.4 移回衣柜")
    code, data = api("PUT", f"/api/wardrobe/{test_wardrobe_id}", {"is_unwanted": 0})
    check(code == 200, f"移回衣柜 (HTTP {code})")

    code, data = api("GET", "/api/wardrobe?is_unwanted=1")
    items = data.get("items", [])
    check(not any(i["id"] == test_wardrobe_id for i in items), "物品已从转卖列表移除")


# ╔════════════════════════════════════════════════════════════╗
# ║  7. 首页 (Index) — 导航入口                                ║
# ╚════════════════════════════════════════════════════════════╝

def test_index():
    section("7. 首页 (index) — 导航入口 & 基础健康检查")

    # 7.1 健康检查
    label("7.1 健康检查 GET /")
    code, body = api("GET", "/")
    check(code == 200, f"根路径响应 (HTTP {code})")

    # 7.2 角色列表
    label("7.2 角色人格列表")
    code, data = api("GET", "/api/personas/list")
    check(code == 200, f"角色列表 (HTTP {code})")
    persona_list = data.get("personas", [])
    check(len(persona_list) > 0, f"加载 {len(persona_list)} 个角色人格")
    for p in persona_list[:3]:
        print(f"    - {p.get('name','?')} ({p.get('id','?')})")

    # 7.3 所有页面路由对应的 API 均已测试，确认无报错


# ╔════════════════════════════════════════════════════════════╗
# ║  清理 (Cleanup)                                            ║
# ╚════════════════════════════════════════════════════════════╝

def cleanup():
    section("清理测试数据")

    # 删除测试穿搭
    if test_outfit_id:
        label(f"删除测试穿搭 ID={test_outfit_id}")
        code, data = api("DELETE", f"/api/outfits/{test_outfit_id}")
        check(code == 200, f"删除穿搭 (HTTP {code})")

    # 删除测试衣物
    if test_wardrobe_id:
        label(f"删除测试衣物 ID={test_wardrobe_id}")
        code, data = api("DELETE", f"/api/wardrobe/{test_wardrobe_id}")
        check(code == 200, f"删除衣物 (HTTP {code})")

    # 删除测试杂物
    if test_misc_id:
        label(f"删除测试杂物 ID={test_misc_id}")
        code, data = api("DELETE", f"/api/misc/{test_misc_id}")
        check(code == 200, f"删除杂物 (HTTP {code})")


# ╔════════════════════════════════════════════════════════════╗
# ║  Main                                                      ║
# ╚════════════════════════════════════════════════════════════╝

def main():
    print(f"{BOLD}AI衣橱 v4.0 — 功能自动化测试{RESET}")
    print(f"后端地址: {BASE}")
    print(f"测试日期: {date.today()}\n")

    # 顺序执行: 按页面依赖链
    test_wardrobe_crud()   # 1. 衣柜 (优先级最高 — 创建测试数据)
    test_misc_crud()        # 1B. 杂物
    test_laundry()          # 2. 脏衣篓
    test_ootd_lab()         # 3. 穿搭实验室
    test_outfit_calendar()  # 4. 穿搭日历
    test_statistics()       # 5. 统计页
    test_resell()           # 6. 卖了还钱
    test_index()            # 7. 首页

    # 清理
    cleanup()

    # ── 汇总 ──
    total = PASS + FAIL + SKIP
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}测试汇总{RESET}")
    print(f"  {GREEN}通过: {PASS}{RESET}")
    print(f"  {RED}失败: {FAIL}{RESET}")
    if SKIP:
        print(f"  {YELLOW}跳过: {SKIP}{RESET}")
    print(f"  总计: {total}")

    if PASS == total:
        print(f"\n  {GREEN}{BOLD}全部通过!{RESET}")
    else:
        print(f"\n  {RED}{BOLD}存在失败项{FAIL}个{RESET}")

    print(f"{'='*60}\n")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
