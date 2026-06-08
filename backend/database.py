import sqlite3
import os
import threading

DB_PATH = os.path.join(os.path.dirname(__file__), "wardrobe.db")

# 线程本地存储连接，每个线程维护一个连接
_thread_local = threading.local()


def get_connection():
    """获取线程本地数据库连接，避免频繁创建销毁连接"""
    if hasattr(_thread_local, "conn"):
        try:
            _thread_local.conn.execute("SELECT 1")
            return _thread_local.conn
        except:
            del _thread_local.conn
    _thread_local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    _thread_local.conn.row_factory = sqlite3.Row
    _thread_local.conn.execute("PRAGMA journal_mode=WAL")
    _thread_local.conn.execute("PRAGMA foreign_keys=ON")
    return _thread_local.conn


def close_connection():
    """关闭当前线程的数据库连接"""
    if hasattr(_thread_local, "conn"):
        try:
            _thread_local.conn.close()
            del _thread_local.conn
        except:
            pass


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wardrobe_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sub_tag TEXT NOT NULL,
            category TEXT NOT NULL,
            color TEXT DEFAULT '',
            processed_image TEXT,
            original_image TEXT,
            purchase_date TEXT DEFAULT '',
            purchase_amount REAL DEFAULT 0.0,
            receipt_image TEXT,
            is_dirty INTEGER DEFAULT 0,
            wear_count INTEGER DEFAULT 0,
            is_unwanted INTEGER DEFAULT 0,
            last_worn_date TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # Backfill: add notes column if missing (for existing databases)
    try:
        cursor.execute("ALTER TABLE wardrobe_items ADD COLUMN notes TEXT DEFAULT ''")
    except:
        pass  # column already exists

    # Backfill: add user_id column for user isolation
    try:
        cursor.execute("ALTER TABLE wardrobe_items ADD COLUMN user_id TEXT DEFAULT 'legacy'")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE outfit_logs ADD COLUMN user_id TEXT DEFAULT 'legacy'")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE diary_entries ADD COLUMN user_id TEXT DEFAULT 'legacy'")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE misc_items ADD COLUMN user_id TEXT DEFAULT 'legacy'")
    except:
        pass

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS outfit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT UNIQUE NOT NULL,
            note TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS outfit_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outfit_log_id INTEGER NOT NULL,
            wardrobe_item_id INTEGER NOT NULL,
            FOREIGN KEY (outfit_log_id) REFERENCES outfit_logs(id) ON DELETE CASCADE,
            FOREIGN KEY (wardrobe_item_id) REFERENCES wardrobe_items(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS diary_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS misc_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            image TEXT,
            location TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            is_lost INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            nickname TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shared_wardrobes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            shared_with_user_id TEXT NOT NULL,
            item_ids TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    conn.commit()
    conn.close()
    print("[数据库] SQLite 初始化完成")

# ── Diary CRUD ──

def create_diary_entry(log_date, content, user_id="legacy"):
    conn = get_connection()
    c = conn.cursor()
    c.execute("INSERT INTO diary_entries (log_date, content, user_id) VALUES (?, ?, ?)", (log_date, content, user_id))
    eid = c.lastrowid
    conn.commit()
    row = c.execute("SELECT * FROM diary_entries WHERE id = ?", (eid,)).fetchone()
    conn.close()
    return dict(row)

def list_diary_entries(start_date=None, end_date=None, user_id="legacy"):
    conn = get_connection()
    if start_date and end_date:
        rows = conn.execute(
            "SELECT * FROM diary_entries WHERE user_id = ? AND log_date BETWEEN ? AND ? ORDER BY log_date DESC, id DESC",
            (user_id, start_date, end_date)
        ).fetchall()
    elif start_date:
        rows = conn.execute(
            "SELECT * FROM diary_entries WHERE user_id = ? AND log_date = ? ORDER BY id DESC", (user_id, start_date,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM diary_entries WHERE user_id = ? ORDER BY log_date DESC, id DESC LIMIT 100",
            (user_id,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def search_diary_entries(keyword, user_id="legacy"):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM diary_entries WHERE user_id = ? AND content LIKE ? ORDER BY log_date DESC LIMIT 20",
        (user_id, f"%{keyword}%",)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_diary_entry(entry_id, content, user_id="legacy"):
    conn = get_connection()
    conn.execute("UPDATE diary_entries SET content = ? WHERE id = ? AND user_id = ?", (content, entry_id, user_id))
    conn.commit()
    conn.close()

def delete_diary_entry(entry_id, user_id="legacy"):
    conn = get_connection()
    conn.execute("DELETE FROM diary_entries WHERE id = ? AND user_id = ?", (entry_id, user_id))
    conn.commit()
    conn.close()

def create_wardrobe_item(sub_tag, category, color="", processed_image=None,
                         original_image=None, purchase_date="", purchase_amount=0.0,
                         receipt_image=None, notes="", user_id="legacy"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO wardrobe_items (sub_tag, category, color, processed_image,
            original_image, purchase_date, purchase_amount, receipt_image, notes, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (sub_tag, category, color, processed_image, original_image,
          purchase_date, purchase_amount, receipt_image, notes, user_id))
    item_id = cursor.lastrowid
    conn.commit()
    item = dict(get_wardrobe_item(item_id, user_id))
    conn.close()
    return item


def get_wardrobe_item(item_id, user_id="legacy"):
    conn = get_connection()
    row = conn.execute("SELECT * FROM wardrobe_items WHERE id = ? AND user_id = ?", (item_id, user_id)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_wardrobe_items(category=None, search=None, color=None,
                        is_dirty=None, is_unwanted=None, user_id="legacy"):
    conn = get_connection()
    query = "SELECT * FROM wardrobe_items WHERE user_id = ?"
    params = [user_id]

    if category and category != "全部":
        query += " AND category = ?"
        params.append(category)

    if color:
        query += " AND color LIKE ?"
        params.append(f"%{color}%")

    if is_dirty is not None:
        query += " AND is_dirty = ?"
        params.append(int(is_dirty))

    if is_unwanted is not None:
        query += " AND is_unwanted = ?"
        params.append(int(is_unwanted))

    # Fuzzy search: match sub_tag, color, notes or category
    if search:
        query += " AND (sub_tag LIKE ? OR color LIKE ? OR notes LIKE ? OR category LIKE ?)"
        params.append(f"%{search}%")
        params.append(f"%{search}%")
        params.append(f"%{search}%")
        params.append(f"%{search}%")

    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_wardrobe_item(item_id, user_id="legacy", **kwargs):
    allowed = ["color", "purchase_date", "purchase_amount", "receipt_image",
               "is_dirty", "is_unwanted", "wear_count", "last_worn_date",
               "sub_tag", "category", "notes"]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return None

    conn = get_connection()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [item_id, user_id]
    conn.execute(f"UPDATE wardrobe_items SET {set_clause} WHERE id = ? AND user_id = ?", values)
    conn.commit()
    row = conn.execute("SELECT * FROM wardrobe_items WHERE id = ? AND user_id = ?", (item_id, user_id)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_wardrobe_item(item_id, user_id="legacy"):
    conn = get_connection()
    conn.execute("DELETE FROM outfit_items WHERE wardrobe_item_id = ?", (item_id,))
    conn.execute("DELETE FROM wardrobe_items WHERE id = ? AND user_id = ?", (item_id, user_id))
    conn.commit()
    conn.close()
    return True


def get_wardrobe_stats(user_id="legacy"):
    conn = get_connection()

    # Category distribution
    category_stats = conn.execute("""
        SELECT category, COUNT(*) as count
        FROM wardrobe_items
        WHERE user_id = ?
        GROUP BY category
        ORDER BY count DESC
    """, (user_id,)).fetchall()

    # CPW (cost per wear) ranking - only items worn at least once
    cpw_items = conn.execute("""
        SELECT id, sub_tag, category, color, purchase_amount, wear_count,
               processed_image, last_worn_date,
               CASE WHEN wear_count > 0 THEN ROUND(purchase_amount / wear_count, 2) ELSE NULL END as cpw
        FROM wardrobe_items
        WHERE purchase_amount > 0 AND user_id = ?
        ORDER BY cpw DESC
    """, (user_id,)).fetchall()

    conn.close()
    return {
        "categories": [dict(r) for r in category_stats],
        "cpw_ranking": [dict(r) for r in cpw_items]
    }


def mark_all_clean(user_id="legacy"):
    conn = get_connection()
    conn.execute("UPDATE wardrobe_items SET is_dirty = 0 WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True


def batch_create_items(items, user_id="legacy"):
    """Create multiple wardrobe items in a single transaction."""
    created = []
    conn = get_connection()
    cursor = conn.cursor()
    for item in items:
        cursor.execute("""
            INSERT INTO wardrobe_items (sub_tag, category, color, processed_image,
                original_image, purchase_date, purchase_amount, receipt_image, notes, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (item["sub_tag"], item["category"], item.get("color", ""),
              item.get("processed_image"), item.get("original_image", ""),
              item.get("purchase_date", ""), item.get("purchase_amount", 0.0),
              item.get("receipt_image"), item.get("notes", ""), user_id))
        created.append(cursor.lastrowid)
    conn.commit()
    conn.close()
    return created


# ── Outfit CRUD ──

def create_outfit(log_date, note, wardrobe_item_ids, user_id="legacy"):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Insert the outfit log (with user isolation)
        cursor.execute("""
            INSERT OR REPLACE INTO outfit_logs (log_date, note, user_id) VALUES (?, ?, ?)
        """, (log_date, note, user_id))
        outfit_id = cursor.lastrowid or cursor.execute(
            "SELECT id FROM outfit_logs WHERE log_date = ? AND user_id = ?", (log_date, user_id)
        ).fetchone()["id"]

        # Clear existing items for this log date (if replacing)
        cursor.execute("DELETE FROM outfit_items WHERE outfit_log_id = ?", (outfit_id,))

        # Insert outfit items and update wardrobe items
        for wi_id in wardrobe_item_ids:
            cursor.execute("""
                INSERT INTO outfit_items (outfit_log_id, wardrobe_item_id)
                VALUES (?, ?)
            """, (outfit_id, wi_id))

            # Update wear_count, is_dirty, last_worn_date (cross-user: shared items can be worn too)
            cursor.execute("""
                UPDATE wardrobe_items
                SET wear_count = wear_count + 1,
                    is_dirty = 1,
                    last_worn_date = ?
                WHERE id = ?
            """, (log_date, wi_id))

        conn.commit()
        outfit = get_outfit_by_date(log_date, user_id)
        return outfit
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def get_outfit(outfit_id, user_id="legacy"):
    conn = get_connection()
    row = conn.execute("SELECT * FROM outfit_logs WHERE id = ? AND user_id = ?", (outfit_id, user_id)).fetchone()
    if not row:
        conn.close()
        return None
    items = conn.execute("""
        SELECT wi.* FROM wardrobe_items wi
        JOIN outfit_items oi ON wi.id = oi.wardrobe_item_id
        WHERE oi.outfit_log_id = ?
    """, (outfit_id,)).fetchall()
    conn.close()
    return {
        "id": row["id"],
        "log_date": row["log_date"],
        "note": row["note"],
        "created_at": row["created_at"],
        "items": [dict(i) for i in items]
    }


def get_outfit_by_date(date_str, user_id="legacy"):
    conn = get_connection()
    row = conn.execute("SELECT * FROM outfit_logs WHERE log_date = ? AND user_id = ?", (date_str, user_id)).fetchone()
    if not row:
        conn.close()
        return None
    items = conn.execute("""
        SELECT wi.* FROM wardrobe_items wi
        JOIN outfit_items oi ON wi.id = oi.wardrobe_item_id
        WHERE oi.outfit_log_id = ?
    """, (row["id"],)).fetchall()
    # Look for the matching "套装" wardrobe item (canvas screenshot)
    suit_item = conn.execute(
        "SELECT processed_image FROM wardrobe_items WHERE category = '套装' AND purchase_date = ? AND user_id = ? LIMIT 1",
        (date_str, user_id)
    ).fetchone()
    conn.close()
    return {
        "id": row["id"],
        "log_date": row["log_date"],
        "note": row["note"],
        "created_at": row["created_at"],
        "items": [dict(i) for i in items],
        "screenshot": suit_item["processed_image"] if suit_item and suit_item["processed_image"] else None,
    }


def list_outfits(start_date=None, end_date=None, user_id="legacy"):
    conn = get_connection()
    query = "SELECT * FROM outfit_logs WHERE user_id = ?"
    params = [user_id]

    if start_date:
        query += " AND log_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND log_date <= ?"
        params.append(end_date)

    query += " ORDER BY log_date DESC"
    rows = conn.execute(query, params).fetchall()

    outfits = []
    for row in rows:
        items = conn.execute("""
            SELECT wi.* FROM wardrobe_items wi
            JOIN outfit_items oi ON wi.id = oi.wardrobe_item_id
            WHERE oi.outfit_log_id = ?
        """, (row["id"],)).fetchall()
        outfits.append({
            "id": row["id"],
            "log_date": row["log_date"],
            "note": row["note"],
            "created_at": row["created_at"],
            "items": [dict(i) for i in items]
        })

    conn.close()
    return outfits


def delete_outfit(outfit_id, user_id="legacy"):
    conn = get_connection()
    # Verify ownership
    row = conn.execute("SELECT id FROM outfit_logs WHERE id = ? AND user_id = ?", (outfit_id, user_id)).fetchone()
    if not row:
        conn.close()
        return False
    # Get the wardrobe items in this outfit to revert counts
    items = conn.execute("""
        SELECT wardrobe_item_id FROM outfit_items WHERE outfit_log_id = ?
    """, (outfit_id,)).fetchall()

    for item in items:
        conn.execute("""
            UPDATE wardrobe_items
            SET wear_count = MAX(0, wear_count - 1)
            WHERE id = ?
        """, (item["wardrobe_item_id"],))

    conn.execute("DELETE FROM outfit_items WHERE outfit_log_id = ?", (outfit_id,))
    conn.execute("DELETE FROM outfit_logs WHERE id = ? AND user_id = ?", (outfit_id, user_id))
    conn.commit()
    conn.close()
    return True


# ── Misc Items CRUD ──

def create_misc_item(name, image=None, location="", notes="", user_id="legacy"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO misc_items (name, image, location, notes, user_id)
        VALUES (?, ?, ?, ?, ?)
    """, (name, image, location, notes, user_id))
    item_id = cursor.lastrowid
    conn.commit()
    item = dict(get_misc_item(item_id, user_id))
    conn.close()
    return item

def get_misc_item(item_id, user_id="legacy"):
    conn = get_connection()
    row = conn.execute("SELECT * FROM misc_items WHERE id = ? AND user_id = ?", (item_id, user_id)).fetchone()
    conn.close()
    return dict(row) if row else None

def list_misc_items(search=None, user_id="legacy"):
    conn = get_connection()
    query = "SELECT * FROM misc_items WHERE user_id = ?"
    params = [user_id]

    if search:
        query += " AND (name LIKE ? OR location LIKE ? OR notes LIKE ?)"
        params.append(f"%{search}%")
        params.append(f"%{search}%")
        params.append(f"%{search}%")

    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_misc_item(item_id, user_id="legacy", **kwargs):
    allowed = ["name", "image", "location", "notes", "is_lost"]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return None

    conn = get_connection()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [item_id, user_id]
    conn.execute(f"UPDATE misc_items SET {set_clause} WHERE id = ? AND user_id = ?", values)
    conn.commit()
    row = conn.execute("SELECT * FROM misc_items WHERE id = ? AND user_id = ?", (item_id, user_id)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_misc_item(item_id, user_id="legacy"):
    conn = get_connection()
    conn.execute("DELETE FROM misc_items WHERE id = ? AND user_id = ?", (item_id, user_id))
    conn.commit()
    conn.close()
    return True


# ── User CRUD ──

def create_user(user_id, nickname, password_hash):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (id, nickname, password_hash) VALUES (?, ?, ?)",
        (user_id, nickname, password_hash)
    )
    conn.commit()
    row = cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row)

def get_user_by_id(user_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_nickname(nickname):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE nickname = ?", (nickname,)).fetchone()
    conn.close()
    return dict(row) if row else None


# ── Shared Wardrobe ──

def save_shared_wardrobe(room_code, owner_id, target_id, item_ids):
    """Upsert shared wardrobe by (owner, target) pair — keeps history across rooms."""
    conn = get_connection()
    cursor = conn.cursor()
    item_ids_str = ','.join(map(str, item_ids))
    existing = cursor.execute(
        "SELECT id FROM shared_wardrobes WHERE owner_user_id = ? AND shared_with_user_id = ?",
        (owner_id, target_id)
    ).fetchone()
    if existing:
        cursor.execute(
            "UPDATE shared_wardrobes SET item_ids = ?, room_code = ?, created_at = datetime('now','localtime') WHERE id = ?",
            (item_ids_str, room_code, existing['id'])
        )
    else:
        cursor.execute(
            "INSERT INTO shared_wardrobes (room_code, owner_user_id, shared_with_user_id, item_ids) VALUES (?, ?, ?, ?)",
            (room_code, owner_id, target_id, item_ids_str)
        )
    conn.commit()
    conn.close()
    return True


def get_shared_wardrobe_items(user_id, owner_id=None):
    """Get wardrobe items shared with this user, optionally filtered by specific owner."""
    conn = get_connection()
    if owner_id:
        rows = conn.execute("""
            SELECT sw.*, u.nickname as owner_nickname
            FROM shared_wardrobes sw
            JOIN users u ON sw.owner_user_id = u.id
            WHERE sw.shared_with_user_id = ? AND sw.owner_user_id = ?
            ORDER BY sw.created_at DESC
        """, (user_id, owner_id)).fetchall()
    else:
        rows = conn.execute("""
            SELECT sw.*, u.nickname as owner_nickname
            FROM shared_wardrobes sw
            JOIN users u ON sw.owner_user_id = u.id
            WHERE sw.shared_with_user_id = ?
            ORDER BY sw.created_at DESC
        """, (user_id,)).fetchall()
    result = []
    for row in rows:
        item_ids = [int(i) for i in row['item_ids'].split(',') if i.strip()]
        items = []
        for item_id in item_ids:
            item_row = conn.execute(
                "SELECT * FROM wardrobe_items WHERE id = ?",
                (item_id,)
            ).fetchone()
            if item_row:
                items.append(dict(item_row))
        if items:
            result.append({
                "owner_id": row['owner_user_id'],
                "owner_nickname": row['owner_nickname'],
                "room_code": row['room_code'],
                "items": items,
                "created_at": row['created_at'],
            })
    conn.close()
    return result


def delete_shared_wardrobe_for_room(room_code):
    """Delete all shared wardrobe records for a given room."""
    conn = get_connection()
    conn.execute("DELETE FROM shared_wardrobes WHERE room_code = ?", (room_code,))
    conn.commit()
    conn.close()
    return True


# ── Initialization ──
init_db()
