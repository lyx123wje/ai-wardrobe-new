import os


def _parse_env_file(filepath=".env"):
    """手动解析 .env 文件，不依赖第三方库"""
    if not os.path.exists(filepath):
        return {}
    config = {}
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            # 跳过空行和注释
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                # 去除首尾引号
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                    value = value[1:-1]
                config[key] = value
    return config


# 加载 .env 并合并到 os.environ（仅设置尚不存在的环境变量）
_env_config = _parse_env_file()
for k, v in _env_config.items():
    if k not in os.environ:
        os.environ[k] = v

# --- 大语言模型配置 ---
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")

# --- Flask 服务配置 ---
FLASK_HOST = os.environ.get("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.environ.get("FLASK_PORT", "5000"))
FLASK_DEBUG = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
