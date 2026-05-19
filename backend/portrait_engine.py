import os
from rembg import remove, new_session

# 懒加载：仅在首次调用时初始化 u2net_human_seg 抠图模型
_u2net_human_seg_session = None


def _get_human_session():
    """获取人像抠图模型会话（懒加载）"""
    global _u2net_human_seg_session
    if _u2net_human_seg_session is None:
        print("[人像引擎] 正在加载 u2net_human_seg 人像抠图模型（首次可能需要下载）...")
        _u2net_human_seg_session = new_session("u2net_human_seg")
        print("[人像引擎] u2net_human_seg 模型加载完成")
    return _u2net_human_seg_session


def process_portrait_image(img_data):
    """人像抠图：使用 u2net_human_seg 模型去除背景，返回透明 PNG 字节"""
    session = _get_human_session()
    return remove(img_data, session=session)


def list_hairstyles(base_url=""):
    """
    列出 static/hairstyles/ 目录下所有 .png 发型文件
    返回包含完整访问 URL 的对象列表
    """
    hairstyle_dir = os.path.join(os.path.dirname(__file__), "static", "hairstyles")
    if not os.path.isdir(hairstyle_dir):
        return []

    base = base_url.rstrip('/') if base_url else ''
    files = sorted([
        f for f in os.listdir(hairstyle_dir)
        if f.lower().endswith(".png") and os.path.isfile(os.path.join(hairstyle_dir, f))
    ])

    return [
        {
            "filename": f,
            "url": f"{base}/static/hairstyles/{f}" if base else f"/static/hairstyles/{f}",
            "name": os.path.splitext(f)[0]
        }
        for f in files
    ]
