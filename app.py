import json
import traceback

from flask import Flask, jsonify, render_template, request

import config
from agents.analyzer import analyze_business_form, parse_text_to_form
from services.api_key_store import get_api_key_status, save_api_key
from services.file_parser import allowed_file, read_saved_upload, save_upload
from services.model_probe import check_models_health
from services.project_writer import write_project_structure
from services.task_store import (
    STATUS_RUNNING,
    complete_task,
    create_task,
    delete_task,
    fail_task,
    get_task,
    list_tasks,
    update_task_workspace,
)
from services.workspace_fs import create_file, create_folder, delete_item, rename_item
from services.workspace_picker import pick_workspace_folder
from services.workspace_sync import get_workspace_info

app = Flask(__name__)
app.secret_key = config.SECRET_KEY


@app.route("/")
def index():
    return render_template(
        "index.html",
        form_fields=config.FORM_FIELDS,
        models=config.AVAILABLE_MODELS,
        default_model=config.DEFAULT_MODEL,
        app_name=config.APP_NAME,
        app_tagline=config.APP_TAGLINE,
        app_badge=config.APP_BADGE,
        app_icon=config.APP_ICON,
        app_version=config.APP_VERSION,
        author=config.AUTHOR_INFO,
    )


@app.route("/api/config/api-key", methods=["GET"])
def api_key_status():
    return jsonify(get_api_key_status())


@app.route("/api/config/api-key", methods=["PUT"])
def api_key_update():
    try:
        data = request.get_json(force=True) or {}
        status = save_api_key(data.get("api_key", ""))
        return jsonify({"success": True, **status})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"保存失败：{exc}"}), 500


@app.route("/api/models/health", methods=["POST"])
def models_health():
    try:
        data = request.get_json(silent=True) or {}
        model_ids = data.get("model_ids")
        return jsonify(check_models_health(model_ids))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"检查失败：{exc}"}), 500


def _parse_submit_payload():
    model = request.form.get("model", config.DEFAULT_MODEL)
    input_type = request.form.get("input_type", "form")

    if input_type == "file":
        uploaded = request.files.get("file")
        if not uploaded or not uploaded.filename:
            raise ValueError("请上传业务文件")
        if not allowed_file(uploaded.filename):
            raise ValueError("不支持的文件格式")
        upload_path, _ = save_upload(uploaded)
        title = (uploaded.filename or "上传文档").rsplit(".", 1)[0] or "上传文档"
        form_data = {"project_name": title}
        return create_task(form_data, model, "file", upload_path=upload_path)

    form_data = {}
    for field in config.FORM_FIELDS:
        value = request.form.get(field["key"], "").strip()
        if field["required"] and not value:
            raise ValueError(f"请填写必填项：{field['label']}")
        form_data[field["key"]] = value
    return create_task(form_data, model, "form")


def _run_task_analysis(task_id: str) -> dict:
    task = get_task(task_id)
    if not task:
        raise ValueError("任务不存在")
    if task.get("status") == STATUS_RUNNING and task.get("result"):
        return task

    model = task.get("model") or config.DEFAULT_MODEL
    try:
        if task.get("source") == "file":
            upload_path = task.get("upload_path", "")
            if not upload_path:
                raise ValueError("上传文件丢失，请重新提交")
            text = read_saved_upload(upload_path)
            if not text.strip():
                raise ValueError("文件内容为空或无法解析")
            form_data = parse_text_to_form(text, model)
        else:
            form_data = task.get("form_data") or {}

        result = analyze_business_form(form_data, model)
        updated = complete_task(task_id, result, form_data)
        if not updated:
            raise ValueError("任务更新失败")
        return updated
    except Exception as exc:
        fail_task(task_id, str(exc))
        raise


@app.route("/api/tasks/submit", methods=["POST"])
def task_submit():
    try:
        task = _parse_submit_payload()
        return jsonify({"success": True, "task": task})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"创建任务失败：{exc}"}), 500


@app.route("/api/tasks/<task_id>/run", methods=["POST"])
def task_run(task_id):
    try:
        task = _run_task_analysis(task_id)
        return jsonify({"success": True, "task": task})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"分析失败：{exc}"}), 500


@app.route("/api/analyze", methods=["POST"])
def analyze():
    """兼容旧接口：创建任务并同步执行分析。"""
    try:
        task = _parse_submit_payload()
        task = _run_task_analysis(task["id"])
        return jsonify({"success": True, "task": task})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"分析失败：{exc}"}), 500


@app.route("/api/tasks", methods=["GET"])
def tasks():
    return jsonify(list_tasks())


@app.route("/api/tasks/<task_id>", methods=["GET"])
def task_detail(task_id):
    task = get_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404
    return jsonify(task)


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def task_remove(task_id):
    if delete_task(task_id):
        return jsonify({"success": True})
    return jsonify({"error": "任务不存在"}), 404


@app.route("/api/tasks/<task_id>/workspace", methods=["PUT"])
def task_workspace(task_id):
    data = request.get_json(force=True) or {}
    path = (data.get("path") or "").strip()
    task = update_task_workspace(task_id, path)
    if not task:
        return jsonify({"error": "任务不存在"}), 404
    return jsonify({"success": True, "task": task})


@app.route("/api/select-workspace", methods=["POST"])
def select_workspace():
    try:
        folder = pick_workspace_folder()
        if not folder:
            return jsonify({"cancelled": True})
        return jsonify({"path": folder})
    except Exception as exc:
        return jsonify({"error": f"选择文件夹失败：{exc}"}), 500


@app.route("/api/write-project", methods=["POST"])
def write_project():
    try:
        data = request.get_json(force=True)
        workspace = (data.get("workspace") or "").strip()
        task_id = data.get("task_id", "")
        if not workspace:
            return jsonify({"error": "请先选择工作空间"}), 400

        tree = data.get("tree")
        if not tree and task_id:
            task = get_task(task_id)
            if not task:
                return jsonify({"error": "任务不存在"}), 404
            tree = task.get("result", {}).get("project_structure", {}).get("tree", [])
        if not tree:
            return jsonify({"error": "项目结构为空"}), 400

        result = write_project_structure(workspace, tree)
        if task_id:
            update_task_workspace(task_id, workspace)
        return jsonify({"success": True, **result})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"写入失败：{exc}"}), 500


@app.route("/api/workspace-sync", methods=["POST"])
def workspace_sync():
    try:
        data = request.get_json(force=True) or {}
        path = (data.get("path") or "").strip()
        if not path:
            return jsonify({"error": "缺少工作空间路径"}), 400
        return jsonify(get_workspace_info(path))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"同步失败：{exc}"}), 500


@app.route("/api/workspace/mkdir", methods=["POST"])
def workspace_mkdir():
    try:
        data = request.get_json(force=True) or {}
        path = create_folder(data.get("workspace", ""), data.get("parent", ""), data.get("name", ""))
        return jsonify({"success": True, "path": path})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"创建失败：{exc}"}), 500


@app.route("/api/workspace/create-file", methods=["POST"])
def workspace_create_file():
    try:
        data = request.get_json(force=True) or {}
        path = create_file(data.get("workspace", ""), data.get("parent", ""), data.get("name", ""))
        return jsonify({"success": True, "path": path})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"创建失败：{exc}"}), 500


@app.route("/api/workspace/rename", methods=["POST"])
def workspace_rename():
    try:
        data = request.get_json(force=True) or {}
        path = rename_item(data.get("workspace", ""), data.get("path", ""), data.get("new_name", ""))
        return jsonify({"success": True, "path": path})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"重命名失败：{exc}"}), 500


@app.route("/api/workspace/delete", methods=["POST"])
def workspace_delete():
    try:
        data = request.get_json(force=True) or {}
        delete_item(data.get("workspace", ""), data.get("path", ""))
        return jsonify({"success": True})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"删除失败：{exc}"}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
