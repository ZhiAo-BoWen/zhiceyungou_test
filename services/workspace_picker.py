import threading


def pick_workspace_folder() -> str | None:
    """通过本地原生对话框选择文件夹（仅本地 Flask 应用可用）。"""
    result: list[str | None] = [None]
    error: list[Exception | None] = [None]

    def _run():
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            folder = filedialog.askdirectory(title="选择工作空间文件夹")
            root.destroy()
            result[0] = folder or None
        except Exception as exc:
            error[0] = exc

    thread = threading.Thread(target=_run)
    thread.start()
    thread.join(timeout=120)
    if error[0]:
        raise error[0]
    return result[0]
