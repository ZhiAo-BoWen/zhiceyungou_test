import io
import re
import zipfile
from pathlib import Path


def _safe_zip_basename(name: str) -> str:
    safe = re.sub(r"[^\w.\-]", "_", name.strip()).strip("._")[:64]
    return safe or "workspace"


def _is_under_root(root: Path, target: Path) -> bool:
    try:
        resolved = target.resolve()
    except OSError:
        return False
    return resolved == root or root in resolved.parents


def build_workspace_zip(folder: str) -> tuple[bytes, str]:
    """将工作空间文件夹打包为 ZIP（保留完整目录结构与文件）。"""
    root = Path(folder).resolve()
    if not root.exists():
        raise ValueError("工作空间路径不存在")
    if not root.is_dir():
        raise ValueError("工作空间必须是文件夹")

    arc_base = _safe_zip_basename(root.name)
    buffer = io.BytesIO()
    dir_entries: set[str] = set()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:

        def add_dir(rel_dir: Path) -> None:
            rel = rel_dir.as_posix()
            if rel in (".", ""):
                rel = ""
            arc = f"{arc_base}/{rel}/" if rel else f"{arc_base}/"
            if arc not in dir_entries:
                zf.writestr(arc, "")
                dir_entries.add(arc)

        add_dir(Path())

        for item in sorted(root.rglob("*"), key=lambda p: p.as_posix()):
            if not _is_under_root(root, item):
                continue
            rel = item.relative_to(root)
            if item.is_dir():
                add_dir(rel)
                continue
            if not item.is_file():
                continue
            for i in range(len(rel.parts)):
                add_dir(Path(*rel.parts[:i]))
            zf.write(item, arcname=f"{arc_base}/{rel.as_posix()}")

    filename = f"{arc_base}.zip"
    return buffer.getvalue(), filename
