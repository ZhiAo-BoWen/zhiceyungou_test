from datetime import datetime
from pathlib import Path


def _scan_dir(path: Path, root: Path, rel: str = "", depth: int = 0, max_depth: int = 8) -> list[dict]:
    if depth > max_depth:
        return []
    items = []
    try:
        entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return [{"name": "[无访问权限]", "type": "error", "path": rel, "children": []}]

    for entry in entries[:80]:
        entry_rel = f"{rel}/{entry.name}" if rel else entry.name
        node = {
            "name": entry.name,
            "path": entry_rel,
            "type": "folder" if entry.is_dir() else "file",
            "modified": datetime.fromtimestamp(entry.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
            "children": [],
        }
        if entry.is_dir() and depth < max_depth:
            node["children"] = _scan_dir(entry, root, entry_rel, depth + 1, max_depth)
        items.append(node)
    return items


def get_workspace_info(workspace: str) -> dict:
    root = Path(workspace).resolve()
    if not root.exists():
        raise ValueError("工作空间路径不存在")
    if not root.is_dir():
        raise ValueError("工作空间必须是文件夹")

    return {
        "path": str(root),
        "name": root.name,
        "synced_at": datetime.now().strftime("%H:%M:%S"),
        "tree": _scan_dir(root, root),
    }
