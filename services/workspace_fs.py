import shutil
from pathlib import Path


def _resolve_in_workspace(workspace: str, rel_path: str = "") -> tuple[Path, Path]:
    root = Path(workspace).resolve()
    root = _assert_root(root)
    if not root.exists() or not root.is_dir():
        raise ValueError("工作空间路径无效")

    rel = rel_path.replace("\\", "/").strip("/")
    target = root if not rel else _assert_in_root(root, (root / rel).resolve())
    return root, target


def _assert_root(root: Path) -> Path:
    resolved = root.resolve()
    return resolved


def _assert_in_root(root: Path, target: Path) -> Path:
    if target != root and root not in target.parents:
        raise ValueError("非法路径，不能访问工作空间之外")
    return target


def create_folder(workspace: str, parent: str, name: str) -> str:
    name = name.strip()
    if not name or "/" in name or "\\" in name:
        raise ValueError("名称无效")
    _, parent_path = _resolve_in_workspace(workspace, parent)
    new_path = parent_path / name
    if new_path.exists():
        raise ValueError("文件夹已存在")
    new_path.mkdir(parents=False, exist_ok=False)
    rel = str(new_path.relative_to(_resolve_in_workspace(workspace)[0]))
    return rel


def create_file(workspace: str, parent: str, name: str) -> str:
    name = name.strip()
    if not name or "/" in name or "\\" in name:
        raise ValueError("名称无效")
    _, parent_path = _resolve_in_workspace(workspace, parent)
    if not parent_path.is_dir():
        raise ValueError("父路径不是文件夹")
    new_path = parent_path / name
    if new_path.exists():
        raise ValueError("文件已存在")
    new_path.write_text("", encoding="utf-8")
    root = _resolve_in_workspace(workspace)[0]
    return str(new_path.relative_to(root))


def rename_item(workspace: str, rel_path: str, new_name: str) -> str:
    new_name = new_name.strip()
    if not new_name or "/" in new_name or "\\" in new_name:
        raise ValueError("名称无效")
    root, target = _resolve_in_workspace(workspace, rel_path)
    if target == root:
        raise ValueError("不能重命名工作空间根目录")
    if not target.exists():
        raise ValueError("目标不存在")
    new_path = target.parent / new_name
    if new_path.exists():
        raise ValueError("目标名称已存在")
    target.rename(new_path)
    return str(new_path.relative_to(root))


def delete_item(workspace: str, rel_path: str) -> None:
    root, target = _resolve_in_workspace(workspace, rel_path)
    if target == root:
        raise ValueError("不能删除工作空间根目录")
    if not target.exists():
        raise ValueError("目标不存在")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
