"""协作房间管理 — 纯内存存储，服务重启丢失"""

import random
import time

# ── Room State ──
# rooms = { room_code: { "owner_id", "owner_nickname", "members": { user_id: { "nickname", "sid" } }, "created_at" } }
rooms = {}

# ── Shared Wardrobes ──
# shared_wardrobes = { owner_user_id: [item_ids] }
shared_wardrobes = {}


def _generate_code():
    return ''.join(str(random.randint(0, 9)) for _ in range(6))


def create_room(owner_id, owner_nickname):
    code = _generate_code()
    # Prevent collision (extremely unlikely but safe)
    while code in rooms:
        code = _generate_code()
    rooms[code] = {
        "owner_id": owner_id,
        "owner_nickname": owner_nickname,
        "members": {
            owner_id: {"nickname": owner_nickname, "sid": None},
        },
        "created_at": time.time(),
    }
    return code


def join_room(code, user_id, nickname):
    if code not in rooms:
        return None
    room = rooms[code]
    room["members"][user_id] = {"nickname": nickname, "sid": None}
    return {
        "room_code": code,
        "owner_id": room["owner_id"],
        "owner_nickname": room["owner_nickname"],
        "members": {
            uid: {"nickname": m["nickname"], "user_id": uid}
            for uid, m in room["members"].items()
        },
    }


def leave_room(code, user_id):
    if code not in rooms:
        return
    room = rooms[code]
    if user_id in room["members"]:
        del room["members"][user_id]
    # Clean up empty rooms
    if len(room["members"]) == 0:
        del rooms[code]
        return None
    return room


def get_room(code):
    if code not in rooms:
        return None
    room = rooms[code]
    return {
        "room_code": code,
        "owner_id": room["owner_id"],
        "owner_nickname": room["owner_nickname"],
        "members": {
            uid: {"nickname": m["nickname"], "user_id": uid}
            for uid, m in room["members"].items()
        },
        "created_at": room["created_at"],
    }


def get_partner(room_code, user_id):
    """Get the other member in a room (for 1-on-1 collab)"""
    if room_code not in rooms:
        return None
    room = rooms[room_code]
    for uid, member in room["members"].items():
        if uid != user_id:
            return {"user_id": uid, "nickname": member["nickname"], "sid": member["sid"]}
    return None


def set_member_sid(room_code, user_id, sid):
    if room_code in rooms and user_id in rooms[room_code]["members"]:
        rooms[room_code]["members"][user_id]["sid"] = sid


def remove_member_sid(room_code, user_id):
    if room_code in rooms and user_id in rooms[room_code]["members"]:
        rooms[room_code]["members"][user_id]["sid"] = None


# ── Wardrobe Sharing ──

def share_wardrobe(user_id, item_ids):
    shared_wardrobes[user_id] = item_ids
    return True


def get_shared_wardrobe(user_id):
    return shared_wardrobes.get(user_id, [])


def unshare_wardrobe(user_id):
    if user_id in shared_wardrobes:
        del shared_wardrobes[user_id]
    return True
