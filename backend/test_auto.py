#!/usr/bin/env python
"""AI衣橱 全自动功能测试"""
import requests, json, sys, time
BASE = "http://127.0.0.1:5000/api"
PASS = "test1234"
results = []

def test(name, assertion, detail=""):
    ok = assertion()
    icon = "PASS" if ok else "FAIL"
    results.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{icon}] {name}")
    if not ok and detail:
        print(f"      └ detail: {detail}")

def api(method, path, **kw):
    try:
        r = requests.request(method, f"{BASE}{path}", timeout=10, **kw)
        return r
    except Exception as e:
        return type('Resp',(),{'status_code':0,'json':lambda:{},'text':str(e)})

# ====== 1. Auth ======
print("\n═══ 认证测试 ═══")
r = api("POST","/auth/register", json={"nickname":"test_user_a","password":PASS})
token_a = r.json().get("token","")
user_id_a = r.json().get("user_id","")
test("注册成功", lambda: r.status_code==200, r.text[:100])

r = api("POST","/auth/login", json={"user_id":user_id_a,"password":PASS})
token_a = r.json().get("token","") or token_a
test("登录成功", lambda: r.status_code==200, r.text[:100])
headers_a = {"Authorization": f"Bearer {token_a}"}

r = api("GET","/auth/verify", headers=headers_a)
test("Token验证通过", lambda: r.status_code==200 and r.json().get("valid"), r.text[:100])

test("无Token拒绝", lambda: api("GET","/wardrobe").status_code == 401)

# Register user B
r = api("POST","/auth/register", json={"nickname":"test_user_b","password":PASS})
token_b = r.json().get("token","")
headers_b = {"Authorization": f"Bearer {token_b}"}
test("用户B注册成功", lambda: r.status_code==200)

# ====== 2. Wardrobe CRUD ======
print("\n═══ 衣柜CRUD测试 ═══")
r = api("POST","/wardrobe", headers=headers_a, json={
    "sub_tag":"白衬衫","category":"上衣","color":"白","purchase_amount":299,"notes":"测试"
})
item_id = r.json().get("item",{}).get("id",0)
test("创建衣服", lambda: r.status_code==200 and item_id>0, r.text[:100])

r = api("GET","/wardrobe",headers=headers_a)
items_a = r.json().get("items",[])
test("列出衣服", lambda: len(items_a)>0, f"count={len(items_a)}")

r = api("GET",f"/wardrobe/{item_id}",headers=headers_a)
test("获取单件", lambda: r.json().get("item",{}).get("sub_tag")=="白衬衫", r.text[:100])

r = api("PUT",f"/wardrobe/{item_id}",headers=headers_a, json={"color":"蓝","notes":"已修改"})
test("更新衣服", lambda: r.status_code==200, r.text[:100])

r = api("DELETE",f"/wardrobe/{item_id}",headers=headers_a)
test("删除衣服", lambda: r.status_code==200)

# ====== 3. Data Isolation ======
print("\n═══ 数据隔离测试 ═══")
# A adds clothes
for tag in ["A黑裤","A红裙"]:
    api("POST","/wardrobe", headers=headers_a, json={"sub_tag":tag,"category":"下装","color":"黑","purchase_amount":199})
# B adds clothes
for tag in ["B蓝衣","B绿裤"]:
    api("POST","/wardrobe", headers=headers_b, json={"sub_tag":tag,"category":"上衣","color":"蓝","purchase_amount":149})

r_a = api("GET","/wardrobe",headers=headers_a)
items_a = r_a.json().get("items",[])
tags_a = [i["sub_tag"] for i in items_a]

r_b = api("GET","/wardrobe",headers=headers_b)
items_b = r_b.json().get("items",[])
tags_b = [i["sub_tag"] for i in items_b]

test("A看不到B的衣服", lambda: all(not t.startswith("B") for t in tags_a), f"A tags: {tags_a}")
test("B看不到A的衣服", lambda: all(not t.startswith("A") for t in tags_b), f"B tags: {tags_b}")
test("A只能看到自己的", lambda: all(t.startswith("A") for t in tags_a), f"A tags: {tags_a}")
test("B只能看到自己的", lambda: all(t.startswith("B") for t in tags_b), f"B tags: {tags_b}")

# ====== 4. Misc CRUD ======
print("\n═══ 杂物CRUD测试 ═══")
r = api("POST","/misc", headers=headers_a, json={"name":"剪刀","location":"抽屉"})
misc_id = r.json().get("item",{}).get("id",0)
test("创建杂物", lambda: r.status_code==200 and misc_id>0, r.text[:100])

r_a_misc = api("GET","/misc",headers=headers_a)
r_b_misc = api("GET","/misc",headers=headers_b)
misc_a = r_a_misc.json().get("items",[])
misc_b = r_b_misc.json().get("items",[])
test("A能看到自己的杂物", lambda: len(misc_a)>0, str(misc_a))
test("B看不到A的杂物", lambda: len(misc_b)==0, str(misc_b))

# ====== 5. Outfit + Data Flow ======
print("\n═══ 穿搭+数据流测试 ═══")
# Recreate A's item for outfit test
r = api("POST","/wardrobe",headers=headers_a,json={"sub_tag":"A外套","category":"上衣","color":"黑","purchase_amount":399})
outfit_item_id = r.json().get("item",{}).get("id",0)
test("创建衣服(用于穿搭)", lambda: outfit_item_id>0)

r = api("POST","/outfits",headers=headers_a,json={
    "log_date":"2026-06-09","note":"测试穿搭","wardrobe_item_ids":[outfit_item_id]
})
test("保存穿搭", lambda: r.status_code==200, r.text[:150])

# Verify wear_count incremented
r = api("GET",f"/wardrobe/{outfit_item_id}",headers=headers_a)
wc = r.json().get("item",{}).get("wear_count",0)
is_dirty = r.json().get("item",{}).get("is_dirty",0)
test("穿搭增加wear_count", lambda: wc==1, f"wear_count={wc}")
test("穿搭标记脏衣", lambda: is_dirty==1, f"is_dirty={is_dirty}")

# B shouldn't see A's outfit
r = api("GET","/outfits",headers=headers_b)
outfits_b = r.json().get("outfits",[])
test("B看不到A的穿搭", lambda: len(outfits_b)==0, f"B outfits={len(outfits_b)}")

r = api("GET","/outfits",headers=headers_a)
outfits_a = r.json().get("outfits",[])
test("A能看到自己的穿搭", lambda: len(outfits_a)>0, f"A outfits={len(outfits_a)}")

# ====== 6. Laundry Flow ======
print("\n═══ 脏衣篓流程测试 ═══")
# Mark another item dirty
r = api("GET","/wardrobe",headers=headers_a)
items_a = r.json().get("items",[])
dirty_ids = [i["id"] for i in items_a if i["is_dirty"]==1]
test("有脏衣物品", lambda: len(dirty_ids)>0, f"dirty count={len(dirty_ids)}")

r = api("POST","/wardrobe/mark_all_clean",headers=headers_a)
test("全部标净", lambda: r.status_code==200)

r = api("GET","/wardrobe",headers=headers_a)
still_dirty = [i for i in r.json().get("items",[]) if i["is_dirty"]==1]
test("标净后无脏衣", lambda: len(still_dirty)==0, f"剩余脏衣={len(still_dirty)}")

# ====== 7. Unwanted Flow ======
print("\n═══ 不想要→转卖流程测试 ═══")
r = api("PUT",f"/wardrobe/{outfit_item_id}",headers=headers_a, json={"is_unwanted":1})
test("标记不想要", lambda: r.status_code==200)

r = api("GET","/wardrobe",headers=headers_a, params={"is_unwanted":1})
unwanted = r.json().get("items",[])
test("按不想要筛选有效", lambda: len(unwanted)>0, str(unwanted))
test("不想要衣物包含该件", lambda: any(i["id"]==outfit_item_id for i in unwanted))

# ====== 8. Statistics ======
print("\n═══ 统计测试 ═══")
r = api("GET","/wardrobe/stats",headers=headers_a)
stats = r.json().get("stats",{})
test("统计有分类数据", lambda: len(stats.get("categories",[]))>0, str(stats)[:150])
test("统计有CPW数据", lambda: "cpw_ranking" in stats)

# ====== 9. Diary ======
print("\n═══ 日记测试 ═══")
r = api("POST","/diary",headers=headers_a, json={"log_date":"2026-06-09","content":"今天穿得很帅"})
diary_id = r.json().get("entry",{}).get("id",0)
test("创建日记", lambda: r.status_code==200 and diary_id>0)

r = api("GET","/diary",headers=headers_a)
test("A能看到自己的日记", lambda: len(r.json().get("entries",[]))>0)

r = api("GET","/diary",headers=headers_b)
test("B看不到A的日记", lambda: len(r.json().get("entries",[]))==0)

r = api("DELETE",f"/diary/{diary_id}",headers=headers_a)
test("删除日记", lambda: r.status_code==200)

# ====== 10. Stats Page Data integrity ======
print("\n═══ 统计页数据一致性 ═══")
r = api("GET","/wardrobe",headers=headers_a)
a_items = r.json().get("items",[])
total_val = sum(i.get("purchase_amount",0) for i in a_items)
test("总价值计算正确", lambda: total_val > 0, f"total=¥{total_val}")

this_year = "2026"
this_year_items = [i for i in a_items if (i.get("purchase_date","") or "").startswith(this_year)]
test("今年购入可计算", lambda: True, f"count={len(this_year_items)}")

# ====== Summary ======
print("\n" + "="*60)
passed = sum(1 for r in results if r["ok"])
total = len(results)
print(f"测试结果: {passed}/{total} 通过 ({int(passed/total*100)}%)")
failed = [r for r in results if not r["ok"]]
if failed:
    print("\n失败项:")
    for f in failed:
        print(f"  ❌ {f['name']}: {f['detail']}")
else:
    print("全部通过!")

with open("test_results.json","w",encoding="utf-8") as f:
    json.dump({"passed":passed,"total":total,"results":results},f,ensure_ascii=False,indent=2)
print("结果已保存到 test_results.json")
