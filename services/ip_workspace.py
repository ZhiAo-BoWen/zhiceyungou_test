import hashlib
import re
from pathlib import Path
from typing import Any

import config
from services.quota_store import (
    LOG_CATEGORY_WORKSPACE,
    _load_users,
    _now,
    _save_users,
    append_log,
    get_user,
)


def workspace_slug(ip: str) -> str:
    safe = re.sub(r"[^\w.-]", "_", ip)[:32] or "unknown"
    digest = hashlib.sha256(ip.encode("utf-8")).hexdigest()[:12]
    return f"{safe}_{digest}"


def _workspaces_root() -> Path:
    return config.WORKSPACES_DIR.resolve()


def _assert_under_workspaces(path: Path) -> Path:
    """确保路径位于服务端工作空间根目录下，防止目录穿越。"""
    resolved = path.resolve()
    root = _workspaces_root()
    if resolved != root and root not in resolved.parents:
        raise ValueError("非法工作空间路径")
    return resolved


def expected_workspace_path(ip: str) -> Path:
    return _assert_under_workspaces(_workspaces_root() / workspace_slug(ip))


def get_user_home(ip: str) -> str | None:
    """用户专属云端主目录（绝对路径）。"""
    user = get_user(ip)
    path = (user.get("workspace_path") or "").strip()
    if path:
        try:
            root = _assert_under_workspaces(Path(path))
        except ValueError:
            return None
        if root.is_dir():
            return str(root)
    return None


def get_user_workspace(ip: str) -> str | None:
    return get_user_home(ip)


def assert_under_user_home(ip: str, path: Path) -> Path:
    home = get_user_home(ip)
    if not home:
        raise ValueError("工作空间尚未分配，请刷新页面后重试")
    home_path = Path(home).resolve()
    target = _assert_under_workspaces(path.resolve())
    if target != home_path and home_path not in target.parents:
        raise ValueError("无权访问该路径，仅可选择您主目录下的文件夹")
    return target


def workspace_display_label(ip: str, folder_path: str) -> str:
    home = get_user_home(ip)
    slug = workspace_slug(ip)
    if not home or folder_path == home:
        return slug
    home_path = Path(home)
    target = Path(folder_path).resolve()
    if home_path in target.parents or target == home_path:
        rel = target.relative_to(home_path)
        return f"{slug}/{rel.as_posix()}"
    return slug


def allocate_workspace(ip: str) -> str:
    """服务器模式：为每个用户分配独立工作空间目录（幂等）。"""
    existing = get_user_workspace(ip)
    if existing:
        return existing

    root = expected_workspace_path(ip)
    root.mkdir(parents=True, exist_ok=True)

    users = _load_users()
    user = get_user(ip)
    user["workspace_path"] = str(root)
    user["workspace_allocated_at"] = _now()
    users[ip] = user
    _save_users(users)

    append_log(
        LOG_CATEGORY_WORKSPACE,
        ip,
        f"分配服务端工作空间（上限 {config.IP_WORKSPACE_QUOTA_BYTES // (1024 * 1024)}MB）",
        extra={"workspace_path": str(root)},
    )
    return str(root)


def dir_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                continue
    return total


def get_workspace_usage(workspace: str, *, ip: str | None = None) -> dict[str, Any]:
    if config.IS_SERVER_MODE and ip:
        root = Path(get_user_home(ip) or workspace).resolve()
    else:
        root = _assert_under_workspaces(Path(workspace))
    used = dir_size_bytes(root) if root.is_dir() else 0
    quota = config.IP_WORKSPACE_QUOTA_BYTES
    return {
        "used_bytes": used,
        "quota_bytes": quota,
        "used_mb": round(used / (1024 * 1024), 2),
        "quota_mb": round(quota / (1024 * 1024), 2),
        "remaining_bytes": max(0, quota - used),
        "remaining_mb": round(max(0, quota - used) / (1024 * 1024), 2),
    }


def assert_can_write(workspace: str, extra_bytes: int = 0, *, ip: str | None = None) -> None:
    if not config.IS_SERVER_MODE:
        return
    usage = get_workspace_usage(workspace, ip=ip)
    if usage["used_bytes"] + extra_bytes > usage["quota_bytes"]:
        raise ValueError(
            f"工作空间已达 {usage['quota_mb']}MB 上限（已用 {usage['used_mb']}MB），无法继续写入"
        )


def resolve_workspace(ip: str, workspace: str = "") -> str:
    if config.IS_SERVER_MODE:
        home = get_user_home(ip)
        if not home:
            raise ValueError("工作空间尚未分配，请刷新页面后重试")
        home_path = Path(home).resolve()
        ws = (workspace or "").strip()
        if not ws or ws == workspace_slug(ip):
            return str(home_path)
        candidate = Path(ws)
        target = (home_path / ws).resolve() if not candidate.is_absolute() else candidate.resolve()
        try:
            target = assert_under_user_home(ip, target)
        except ValueError as exc:
            raise ValueError("无权访问该工作空间，仅可使用您主目录下的文件夹") from exc
        if not target.exists():
            raise ValueError("目标文件夹不存在，请先创建或选择有效目录")
        if not target.is_dir():
            raise ValueError("工作空间必须是文件夹")
        return str(target)
    ws = (workspace or "").strip()
    if not ws:
        raise ValueError("请先选择工作空间")
    return ws


def _collect_folder_options(base: Path, home: Path, slug: str, prefix: str = "", depth: int = 0) -> list[dict[str, Any]]:
    if depth > 5:
        return []
    items: list[dict[str, Any]] = []
    rel = prefix
    display = "(根目录)" if not rel else base.name
    items.append(
        {
            "name": display,
            "rel": rel,
            "path": str(base),
            "depth": depth,
        }
    )
    try:
        entries = sorted(base.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        return items
    for entry in entries:
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        child_rel = f"{prefix}/{entry.name}" if prefix else entry.name
        items.extend(_collect_folder_options(entry, home, slug, child_rel, depth + 1))
    return items


def list_selectable_folders(ip: str) -> dict[str, Any]:
    home = get_user_home(ip)
    if not home:
        return {"ready": False, "folders": [], "home": "", "display_name": workspace_slug(ip)}
    home_path = Path(home)
    slug = workspace_slug(ip)
    folders = _collect_folder_options(home_path, home_path, slug)
    usage = get_workspace_usage(home, ip=ip)
    return {
        "ready": True,
        "home": home,
        "display_name": slug,
        "folders": folders,
        **usage,
    }


def get_workspace_info_for_ip(ip: str) -> dict[str, Any]:
    if not config.IS_SERVER_MODE:
        return {"mode": "local", "ready": False}

    ws = get_user_home(ip)
    if not ws:
        return {
            "mode": "server",
            "ready": False,
            "message": "正在分配您的专属云端工作空间（10MB 上限）…",
            "quota_mb": round(config.IP_WORKSPACE_QUOTA_BYTES / (1024 * 1024), 2),
        }

    usage = get_workspace_usage(ws, ip=ip)
    return {
        "mode": "server",
        "ready": True,
        "path": ws,
        "home": ws,
        "display_name": workspace_slug(ip),
        "message": f"已用 {usage['used_mb']}MB / {usage['quota_mb']}MB",
        **usage,
    }


def estimate_tree_write_bytes(tree: list[dict[str, Any]]) -> int:
    total = 0
    for node in tree:
        total += _estimate_node_bytes(node)
    return total


def _estimate_node_bytes(node: dict[str, Any]) -> int:
    name = (node.get("name") or "").strip()
    if not name:
        return 0
    if node.get("type") == "folder":
        size = 4096
        for child in node.get("children") or []:
            size += _estimate_node_bytes(child)
        return size
    description = node.get("description") or ""
    content = f"# {name}\n\n{description}\n" if description else ""
    return len(content.encode("utf-8")) + 512
