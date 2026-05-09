import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "wardrobe.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


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

    conn.commit()
    conn.close()
    print("[数据库] SQLite 初始化完成")


# ── Wardrobe CRUD ──

def create_wardrobe_item(sub_tag, category, color="", processed_image=None,
                         original_image=None, purchase_date="", purchase_amount=0.0,
                         receipt_image=None, notes=""):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO wardrobe_items (sub_tag, category, color, processed_image,
            original_image, purchase_date, purchase_amount, receipt_image, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (sub_tag, category, color, processed_image, original_image,
          purchase_date, purchase_amount, receipt_image, notes))
    item_id = cursor.lastrowid
    conn.commit()
    item = dict(get_wardrobe_item(item_id))
    conn.close()
    return item


def get_wardrobe_item(item_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM wardrobe_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_wardrobe_items(category=None, search=None, color=None,
                        is_dirty=None, is_unwanted=None):
    conn = get_connection()
    query = "SELECT * FROM wardrobe_items WHERE 1=1"
    params = []

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


def update_wardrobe_item(item_id, **kwargs):
    allowed = ["color", "purchase_date", "purchase_amount", "receipt_image",
               "is_dirty", "is_unwanted", "wear_count", "last_worn_date",
               "sub_tag", "category", "notes"]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return None

    conn = get_connection()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [item_id]
    conn.execute(f"UPDATE wardrobe_items SET {set_clause} WHERE id = ?", values)
    conn.commit()
    item = dict(conn.execute("SELECT * FROM wardrobe_items WHERE id = ?", (item_id,)).fetchone())
    conn.close()
    return item


def delete_wardrobe_item(item_id):
    conn = get_connection()
    conn.execute("DELETE FROM outfit_items WHERE wardrobe_item_id = ?", (item_id,))
    conn.execute("DELETE FROM wardrobe_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return True


def get_wardrobe_stats():
    conn = get_connection()

    # Category distribution
    category_stats = conn.execute("""
        SELECT category, COUNT(*) as count
        FROM wardrobe_items
        GROUP BY category
        ORDER BY count DESC
    """).fetchall()

    # CPW (cost per wear) ranking - only items worn at least once
    cpw_items = conn.execute("""
        SELECT id, sub_tag, category, color, purchase_amount, wear_count,
               processed_image, last_worn_date,
               CASE WHEN wear_count > 0 THEN ROUND(purchase_amount / wear_count, 2) ELSE NULL END as cpw
        FROM wardrobe_items
        WHERE purchase_amount > 0
        ORDER BY cpw DESC
    """).fetchall()

    conn.close()
    return {
        "categories": [dict(r) for r in category_stats],
        "cpw_ranking": [dict(r) for r in cpw_items]
    }


def mark_all_clean():
    conn = get_connection()
    conn.execute("UPDATE wardrobe_items SET is_dirty = 0")
    conn.commit()
    conn.close()
    return True


def batch_create_items(items):
    """Create multiple wardrobe items in a single transaction."""
    created = []
    conn = get_connection()
    cursor = conn.cursor()
    for item in items:
        cursor.execute("""
            INSERT INTO wardrobe_items (sub_tag, category, color, processed_image,
                original_image, purchase_date, purchase_amount, receipt_image, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (item["sub_tag"], item["category"], item.get("color", ""),
              item.get("processed_image"), item.get("original_image", ""),
              item.get("purchase_date", ""), item.get("purchase_amount", 0.0),
              item.get("receipt_image"), item.get("notes", "")))
        created.append(cursor.lastrowid)
    conn.commit()
    conn.close()
    return created


# ── Outfit CRUD ──

def create_outfit(log_date, note, wardrobe_item_ids):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Insert the outfit log
        cursor.execute("""
            INSERT OR REPLACE INTO outfit_logs (log_date, note) VALUES (?, ?)
        """, (log_date, note))
        outfit_id = cursor.lastrowid or cursor.execute(
            "SELECT id FROM outfit_logs WHERE log_date = ?", (log_date,)
        ).fetchone()["id"]

        # Clear existing items for this log date (if replacing)
        cursor.execute("DELETE FROM outfit_items WHERE outfit_log_id = ?", (outfit_id,))

        # Insert outfit items and update wardrobe items
        for wi_id in wardrobe_item_ids:
            cursor.execute("""
                INSERT INTO outfit_items (outfit_log_id, wardrobe_item_id)
                VALUES (?, ?)
            """, (outfit_id, wi_id))

            # Update wear_count, is_dirty, last_worn_date on the clothing item
            cursor.execute("""
                UPDATE wardrobe_items
                SET wear_count = wear_count + 1,
                    is_dirty = 1,
                    last_worn_date = ?
                WHERE id = ?
            """, (log_date, wi_id))

        conn.commit()
        outfit = get_outfit_by_date(log_date)
        return outfit
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def get_outfit(outfit_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM outfit_logs WHERE id = ?", (outfit_id,)).fetchone()
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


def get_outfit_by_date(date_str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM outfit_logs WHERE log_date = ?", (date_str,)).fetchone()
    if not row:
        conn.close()
        return None
    items = conn.execute("""
        SELECT wi.* FROM wardrobe_items wi
        JOIN outfit_items oi ON wi.id = oi.wardrobe_item_id
        WHERE oi.outfit_log_id = ?
    """, (row["id"],)).fetchall()
    conn.close()
    return {
        "id": row["id"],
        "log_date": row["log_date"],
        "note": row["note"],
        "created_at": row["created_at"],
        "items": [dict(i) for i in items]
    }


def list_outfits(start_date=None, end_date=None):
    conn = get_connection()
    query = "SELECT * FROM outfit_logs WHERE 1=1"
    params = []

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


def delete_outfit(outfit_id):
    conn = get_connection()
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
    conn.execute("DELETE FROM outfit_logs WHERE id = ?", (outfit_id,))
    conn.commit()
    conn.close()
    return True


# ── Misc Items CRUD ──

def create_misc_item(name, image=None, location="", notes=""):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO misc_items (name, image, location, notes)
        VALUES (?, ?, ?, ?)
    """, (name, image, location, notes))
    item_id = cursor.lastrowid
    conn.commit()
    item = dict(get_misc_item(item_id))
    conn.close()
    return item

def get_misc_item(item_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM misc_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def list_misc_items(search=None):
    conn = get_connection()
    query = "SELECT * FROM misc_items WHERE 1=1"
    params = []

    if search:
        query += " AND (name LIKE ? OR location LIKE ? OR notes LIKE ?)"
        params.append(f"%{search}%")
        params.append(f"%{search}%")
        params.append(f"%{search}%")

    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_misc_item(item_id, **kwargs):
    allowed = ["name", "image", "location", "notes", "is_lost"]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return None

    conn = get_connection()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [item_id]
    conn.execute(f"UPDATE misc_items SET {set_clause} WHERE id = ?", values)
    conn.commit()
    item = dict(conn.execute("SELECT * FROM misc_items WHERE id = ?", (item_id,)).fetchone())
    conn.close()
    return item

def delete_misc_item(item_id):
    conn = get_connection()
    conn.execute("DELETE FROM misc_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return True


# ── Initialization ──
init_db()
