import uuid
from pathlib import Path

from werkzeug.utils import secure_filename

import config

ALLOWED_EXTENSIONS = {"txt", "md", "doc", "docx", "pdf", "json", "csv"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def save_upload(file_storage) -> tuple[str, str]:
    """保存上传文件，返回 (文件路径, 文本内容)。"""
    original = secure_filename(file_storage.filename or "upload.txt")
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else "txt"
    saved_name = f"{uuid.uuid4().hex[:8]}_{original}"
    path = config.UPLOADS_DIR / saved_name
    file_storage.save(path)

    text = _read_text(path, ext)
    return str(path), text


def read_saved_upload(path: str) -> str:
    """读取已保存的上传文件文本。"""
    file_path = Path(path)
    ext = file_path.suffix.lstrip(".").lower() or "txt"
    return _read_text(file_path, ext)


def _read_text(path: Path, ext: str) -> str:
    if ext in {"txt", "md", "csv", "json"}:
        return path.read_text(encoding="utf-8", errors="ignore")

    if ext == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            return path.read_bytes().decode("utf-8", errors="ignore")

    if ext in {"doc", "docx"}:
        try:
            from docx import Document
            doc = Document(str(path))
            return "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            return path.read_bytes().decode("utf-8", errors="ignore")

    return path.read_text(encoding="utf-8", errors="ignore")
