import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

import config

FORM_SCHEMA_DESC = """
表单字段说明（JSON 键名必须使用英文 key）：
- project_name: 项目名称
- business_domain: 业务领域（如：智能制造、电商、医疗等）
- business_description: 业务描述（详细说明业务场景与目标）
- user_scale: 用户规模（如：1000日活、10万并发等）
- performance_requirements: 性能要求（可选）
- budget_range: 预算范围（可选）
- deployment_env: 部署环境（可选，如：本地部署/私有云/公有云/混合云/边缘计算）
- special_requirements: 特殊需求（可选）
"""


def _get_llm(model: str | None = None) -> ChatOpenAI:
    return ChatOpenAI(
        model=model or config.DEFAULT_MODEL,
        api_key=config.DASHSCOPE_API_KEY,
        base_url=config.DASHSCOPE_BASE_URL,
        temperature=0.3,
        max_retries=2,
    )


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return json.loads(text[start : end + 1])
        raise


def parse_text_to_form(text: str, model: str | None = None) -> dict[str, Any]:
    """将上传的文本文件内容解析为结构化表单数据。"""
    llm = _get_llm(model)
    messages = [
        SystemMessage(
            content=(
                "你是业务需求分析专家。请从用户提供的业务文本中提取信息，"
                "输出严格的 JSON 对象，不要包含任何其他文字。"
                + FORM_SCHEMA_DESC
                + "\n缺失的可选字段用空字符串表示，必填字段尽量合理推断。"
            )
        ),
        HumanMessage(content=f"请解析以下业务文本：\n\n{text}"),
    ]
    response = llm.invoke(messages)
    return _extract_json(response.content)


def analyze_business_form(form_data: dict[str, Any], model: str | None = None) -> dict[str, Any]:
    """基于表单内容生成技术栈、硬件选型与项目结构。"""
    llm = _get_llm(model)
    form_json = json.dumps(form_data, ensure_ascii=False, indent=2)

    prompt = f"""你是一位资深系统架构师。请根据以下业务需求表单，生成完整的技术选型与项目规划方案。

业务需求表单：
{form_json}

请严格输出 JSON，结构如下：
{{
  "tech_stack": {{
    "items": [
      {{
        "category": "分类（如：前端/后端/数据库/中间件/运维等）",
        "technology": "技术名称",
        "version": "推荐版本",
        "reason": "选型理由",
        "priority": "高/中/低"
      }}
    ],
    "architecture_mermaid": "项目技术架构 Mermaid 图（graph TD 或 flowchart TD 格式，节点用中文）"
  }},
  "hardware": {{
    "items": [
      {{
        "name": "硬件名称（如：应用服务器）",
        "spec": "规格配置",
        "quantity": 数量整数,
        "unit_price": "单价估算",
        "total_price": "总价估算",
        "reason": "选型理由",
        "metrics": {{
          "performance": 0-100的性能评分,
          "cost_efficiency": 0-100的性价比评分,
          "scalability": 0-100的可扩展性评分,
          "reliability": 0-100的可靠性评分
        }}
      }}
    ],
    "summary": "硬件方案总结"
  }},
  "project_structure": {{
    "tree": [
      {{
        "name": "目录或文件名",
        "type": "folder 或 file",
        "description": "说明",
        "children": []
      }}
    ],
    "mermaid": "项目结构 Mermaid 图（graph TD 格式）",
    "readme_summary": "项目结构说明摘要"
  }}
}}

要求：
1. 技术栈至少 6 项，覆盖前后端、数据层、部署运维
2. 硬件方案至少 3 项，metrics 数值为整数
3. 项目结构 tree 至少 3 层深度，体现实际工程目录
4. 所有 Mermaid 图语法正确，节点 ID 用英文，显示文字用中文
5. 只输出 JSON，不要有其他内容"""

    messages = [
        SystemMessage(content="你是资深系统架构师，擅长软硬件选型与项目结构设计。只输出合法 JSON。"),
        HumanMessage(content=prompt),
    ]
    response = llm.invoke(messages)
    return _extract_json(response.content)
