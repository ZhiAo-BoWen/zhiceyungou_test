from pathlib import Path
from typing import Any


def _write_node(base: Path, node: dict[str, Any]) -> list[str]:
    created: list[str] = []
    name = node.get("name", "").strip()
    if not name or name in {".", ".."}:
        return created

    path = base / name
    node_type = node.get("type", "file")

    if node_type == "folder":
        path.mkdir(parents=True, exist_ok=True)
        created.append(str(path))
        for child in node.get("children") or []:
            created.extend(_write_node(path, child))
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        description = node.get("description", "")
        content = f"# {name}\n\n{description}\n" if description else ""
        if not path.exists():
            path.write_text(content, encoding="utf-8")
            created.append(str(path))
    return created


def write_project_structure(workspace: str, tree: list[dict[str, Any]]) -> dict[str, Any]:
    root = Path(workspace).resolve()
    if not root.exists():
        raise ValueError("工作空间路径不存在")
    if not root.is_dir():
        raise ValueError("工作空间必须是文件夹")
    if not tree:
        raise ValueError("项目结构为空")

    created = []
    for node in tree:
        created.extend(_write_node(root, node))

    return {"workspace": str(root), "created_count": len(created), "created": created}
