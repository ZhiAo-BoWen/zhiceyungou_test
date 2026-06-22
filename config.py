import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
DASHSCOPE_BASE_URL = os.getenv(
    "DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
)
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen3.7-plus")
SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-key")

# 产品品牌
APP_NAME = "智策云构"
APP_TAGLINE = "企业级选型与架构规划"
APP_BADGE = "Pro"
APP_ICON = "blocks"
APP_VERSION = "1.0.0"

# 作者信息（可在 config.py 中修改）
AUTHOR_INFO = {
    "name": "ZhiAo-BoWen",
    "avatar": "img/avatar.png",
    "role": "python程序开发 · 2026级应届生",
    "bio": (
        "实习阶段积累了丰富的 AI 应用开发与架构设计实践经验。\n"
        "具备扎实的 Python 与 Web 全栈能力，熟悉数据库设计与 DevOps 流程，能对接大模型 API 并基于 LangChain 构建智能应用。\n"
        "毕业设计为基于神经网络的钢材表面缺陷检测系统，擅长将深度学习与工程实践相结合，把智能能力转化为可交付的方案。"
    ),
    "motto": "智见需求，构筑可行；以架构理清边界，以实践兑现价值。",
    "email": "1913774864@qq.com",
    "github": "ZhiAo-BoWen",
}

DATA_DIR = BASE_DIR / "data"
TASKS_DIR = DATA_DIR / "tasks"
UPLOADS_DIR = DATA_DIR / "uploads"

for directory in (DATA_DIR, TASKS_DIR, UPLOADS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

AVAILABLE_MODELS = [
    {"id": "qwen3.7-plus", "name": "Qwen3.7-Plus（默认，均衡）"},
    {"id": "qwen3.6-flash", "name": "Qwen3.6-Flash（快速）"},
    {"id": "qwen3.7-max", "name": "Qwen3.7-Max（高质量）"},
    {"id": "deepseek-v4-flash", "name": "DeepSeek-V4-Flash（快速）"},
]

FORM_FIELDS = [
    {"key": "project_name", "label": "项目名称", "required": True, "type": "text"},
    {"key": "business_domain", "label": "业务领域", "required": True, "type": "text"},
    {"key": "business_description", "label": "业务描述", "required": True, "type": "textarea"},
    {"key": "user_scale", "label": "用户规模", "required": True, "type": "text"},
    {"key": "performance_requirements", "label": "性能要求", "required": False, "type": "textarea"},
    {"key": "budget_range", "label": "预算范围", "required": False, "type": "text"},
    {"key": "deployment_env", "label": "部署环境", "required": False, "type": "select",
     "options": ["本地部署", "私有云", "公有云", "混合云", "边缘计算"]},
    {"key": "special_requirements", "label": "特殊需求", "required": False, "type": "textarea"},
]
