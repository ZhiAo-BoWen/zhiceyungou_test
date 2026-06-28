import io
import traceback
from functools import wraps

from flask import Flask, jsonify, render_template, request, send_file, session

import config
from agents.analyzer import analyze_business_form, parse_text_to_form
from services.admin_auth import change_admin_password, verify_admin_password
from services.file_parser import allowed_file, read_saved_upload, save_upload
from services.ip_workspace import (
    allocate_workspace,
    assert_can_write,
    get_workspace_info_for_ip,
    list_selectable_folders,
    resolve_workspace,
    workspace_display_label,
)
from services.model_probe import check_models_health
from services.project_writer import write_project_structure
from services.quota_store import (
    consume_quota,
    get_client_ip,
    get_quota_status,
    list_applications,
    list_logs,
    list_users,
    require_quota,
    review_application,
    submit_application,
)
from services.task_store import (
    STATUS_COMPLETED,
    STATUS_RUNNING,
    complete_task,
    create_task,
    delete_task,
    fail_task,
    get_task,
    list_tasks,
    mark_quota_consumed,
    update_task_workspace,
)
from services.workspace_export import build_workspace_zip
from services.workspace_fs import create_file, create_folder, delete_item, rename_item
from services.workspace_picker import pick_workspace_folder
from services.workspace_sync import get_workspace_info

app = Flask(__name__)
app.secret_key = config.SECRET_KEY


def _request_ip() -> str:
    return get_client_ip(request.remote_addr, request.headers.get("X-Forwarded-For"))


def _workspace_from_request(data: dict | None = None) -> str:
    payload = data or {}
    workspace = (payload.get("workspace") or payload.get("path") or "").strip()
    return resolve_workspace(_request_ip(), workspace)


def admin_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return jsonify({"error": "未登录或会话已过期"}), 401
        return view_func(*args, **kwargs)

    return wrapper


@app.route("/api/examples/default", methods=["GET"])
def example_default_file():
    path = config.EXAMPLES_DIR / config.DEFAULT_EXAMPLE_FILE
    if not path.is_file():
        return jsonify({"error": "示例文件不存在"}), 404
    return send_file(
        path,
        mimetype="text/plain; charset=utf-8",
        download_name=config.DEFAULT_EXAMPLE_FILE,
    )


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
        deploy_mode=config.DEPLOY_MODE,
        is_server_mode=config.IS_SERVER_MODE,
    )


@app.route("/admin")
def admin_page():
    return render_template(
        "admin.html",
        app_name=config.APP_NAME,
        app_version=config.APP_VERSION,
    )


@app.route("/api/quota/status", methods=["GET"])
def quota_status():
    ip = _request_ip()
    if config.IS_SERVER_MODE:
        allocate_workspace(ip)
    return jsonify(get_quota_status(ip, record_login=True))


@app.route("/api/quota/apply", methods=["POST"])
def quota_apply():
    try:
        data = request.get_json(force=True) or {}
        application = submit_application(
            _request_ip(),
            data.get("nickname", ""),
            data.get("reason", ""),
        )
        return jsonify({"success": True, "application": application})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"提交失败：{exc}"}), 500


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    try:
        data = request.get_json(force=True) or {}
        password = data.get("password", "")
        if not verify_admin_password(password):
            return jsonify({"error": "密码错误"}), 401
        session["admin_logged_in"] = True
        return jsonify({"success": True})
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"登录失败：{exc}"}), 500


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_logged_in", None)
    return jsonify({"success": True})


@app.route("/api/admin/session", methods=["GET"])
def admin_session():
    return jsonify({"logged_in": bool(session.get("admin_logged_in"))})


@app.route("/api/admin/password", methods=["PUT"])
@admin_required
def admin_password_update():
    try:
        data = request.get_json(force=True) or {}
        change_admin_password(data.get("current_password", ""), data.get("new_password", ""))
        return jsonify({"success": True})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"修改失败：{exc}"}), 500


@app.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_users():
    return jsonify(list_users())


@app.route("/api/admin/logs", methods=["GET"])
@admin_required
def admin_logs():
    category = (request.args.get("category") or "").strip() or None
    return jsonify(list_logs(category))


@app.route("/api/admin/applications", methods=["GET"])
@admin_required
def admin_applications():
    status = (request.args.get("status") or "").strip() or None
    return jsonify(list_applications(status))


@app.route("/api/admin/applications/<application_id>/review", methods=["POST"])
@admin_required
def admin_application_review(application_id):
    try:
        data = request.get_json(force=True) or {}
        application = review_application(
            application_id,
            data.get("action", ""),
            granted=int(data.get("granted", 2)),
            review_note=data.get("review_note", ""),
        )
        return jsonify({"success": True, "application": application})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"处理失败：{exc}"}), 500


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


def _parse_submit_payload(client_ip: str):
    require_quota(client_ip)
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
        return create_task(form_data, model, "file", upload_path=upload_path, client_ip=client_ip)

    form_data = {}
    for field in config.FORM_FIELDS:
        value = request.form.get(field["key"], "").strip()
        if field["required"] and not value:
            raise ValueError(f"请填写必填项：{field['label']}")
        form_data[field["key"]] = value
    return create_task(form_data, model, "form", client_ip=client_ip)


def _run_task_analysis(task_id: str, client_ip: str | None = None) -> dict:
    task = get_task(task_id)
    if not task:
        raise ValueError("任务不存在")
    if task.get("status") == STATUS_COMPLETED and task.get("result"):
        return task
    if task.get("status") == STATUS_RUNNING and task.get("result"):
        return task

    ip = task.get("client_ip") or client_ip or _request_ip()
    if not task.get("quota_consumed"):
        require_quota(ip)

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
        if not updated.get("quota_consumed"):
            consume_quota(ip, f"任务完成：{updated.get('title', task_id)}")
            updated = mark_quota_consumed(task_id) or updated
        if config.IS_SERVER_MODE:
            ws = allocate_workspace(ip)
            updated = update_task_workspace(task_id, ws) or updated
        return updated
    except Exception as exc:
        fail_task(task_id, str(exc))
        raise


@app.route("/api/tasks/submit", methods=["POST"])
def task_submit():
    try:
        task = _parse_submit_payload(_request_ip())
        status = get_quota_status(_request_ip())
        return jsonify({"success": True, "task": task, "quota": status})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"创建任务失败：{exc}"}), 500


@app.route("/api/tasks/<task_id>/run", methods=["POST"])
def task_run(task_id):
    try:
        task = _run_task_analysis(task_id, _request_ip())
        quota = get_quota_status(_request_ip())
        workspace = get_workspace_info_for_ip(_request_ip())
        return jsonify({"success": True, "task": task, "quota": quota, "workspace": workspace})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"分析失败：{exc}"}), 500


@app.route("/api/analyze", methods=["POST"])
def analyze():
    """兼容旧接口：创建任务并同步执行分析。"""
    try:
        task = _parse_submit_payload(_request_ip())
        task = _run_task_analysis(task["id"], _request_ip())
        status = get_quota_status(_request_ip())
        return jsonify({"success": True, "task": task, "quota": status})
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


def _ensure_server_workspace(ip: str) -> None:
    if config.IS_SERVER_MODE:
        allocate_workspace(ip)


@app.route("/api/workspace/info", methods=["GET"])
def workspace_info_api():
    ip = _request_ip()
    _ensure_server_workspace(ip)
    return jsonify(get_workspace_info_for_ip(ip))


@app.route("/api/workspace/folders", methods=["GET"])
def workspace_folders_api():
    try:
        ip = _request_ip()
        _ensure_server_workspace(ip)
        return jsonify(list_selectable_folders(ip))
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"ready": False, "error": str(exc)}), 500


@app.route("/api/tasks/<task_id>/workspace", methods=["PUT"])
def task_workspace(task_id):
    data = request.get_json(force=True) or {}
    try:
        path = _workspace_from_request(data)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    task = update_task_workspace(task_id, path)
    if not task:
        return jsonify({"error": "任务不存在"}), 404
    return jsonify({"success": True, "task": task})


@app.route("/api/select-workspace", methods=["POST"])
def select_workspace():
    if config.IS_SERVER_MODE:
        data = request.get_json(silent=True) or {}
        ip = _request_ip()
        _ensure_server_workspace(ip)
        info = get_workspace_info_for_ip(ip)
        if not info.get("ready"):
            return jsonify({"error": info.get("message", "工作空间尚未分配")}), 400
        if data.get("path") or data.get("workspace"):
            try:
                folder = _workspace_from_request(data)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
            return jsonify({
                "path": folder,
                "home": info["path"],
                "label": workspace_display_label(ip, folder),
                "server_mode": True,
            })
        return jsonify({
            "path": info["path"],
            "home": info["path"],
            "label": info.get("display_name", "根目录"),
            "server_mode": True,
            "folders": list_selectable_folders(ip).get("folders", []),
        })
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
        workspace = _workspace_from_request(data)
        task_id = data.get("task_id", "")

        tree = data.get("tree")
        if not tree and task_id:
            task = get_task(task_id)
            if not task:
                return jsonify({"error": "任务不存在"}), 404
            tree = task.get("result", {}).get("project_structure", {}).get("tree", [])
        if not tree:
            return jsonify({"error": "项目结构为空"}), 400

        result = write_project_structure(workspace, tree, client_ip=_request_ip())
        if task_id:
            update_task_workspace(task_id, workspace)
        if config.IS_SERVER_MODE:
            result["usage"] = get_workspace_info_for_ip(_request_ip())
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
        path = _workspace_from_request(data)
        info = get_workspace_info(path)
        if config.IS_SERVER_MODE:
            info.update(get_workspace_info_for_ip(_request_ip()))
        return jsonify(info)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"同步失败：{exc}"}), 500


def _workspace_usage_payload() -> dict | None:
    if not config.IS_SERVER_MODE:
        return None
    return get_workspace_info_for_ip(_request_ip())


@app.route("/api/workspace/mkdir", methods=["POST"])
def workspace_mkdir():
    try:
        data = request.get_json(force=True) or {}
        workspace = _workspace_from_request(data)
        assert_can_write(workspace, 4096, ip=_request_ip())
        path = create_folder(workspace, data.get("parent", ""), data.get("name", ""))
        payload = {"success": True, "path": path}
        usage = _workspace_usage_payload()
        if usage:
            payload["usage"] = usage
        return jsonify(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"创建失败：{exc}"}), 500


@app.route("/api/workspace/create-file", methods=["POST"])
def workspace_create_file():
    try:
        data = request.get_json(force=True) or {}
        workspace = _workspace_from_request(data)
        assert_can_write(workspace, 256, ip=_request_ip())
        path = create_file(workspace, data.get("parent", ""), data.get("name", ""))
        payload = {"success": True, "path": path}
        usage = _workspace_usage_payload()
        if usage:
            payload["usage"] = usage
        return jsonify(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"创建失败：{exc}"}), 500


@app.route("/api/workspace/rename", methods=["POST"])
def workspace_rename():
    try:
        data = request.get_json(force=True) or {}
        workspace = _workspace_from_request(data)
        path = rename_item(workspace, data.get("path", ""), data.get("new_name", ""))
        return jsonify({"success": True, "path": path})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"重命名失败：{exc}"}), 500


@app.route("/api/workspace/delete", methods=["POST"])
def workspace_delete():
    try:
        data = request.get_json(force=True) or {}
        workspace = _workspace_from_request(data)
        delete_item(workspace, data.get("path", ""))
        return jsonify({"success": True})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"删除失败：{exc}"}), 500


@app.route("/api/workspace/download", methods=["POST"])
def workspace_download():
    try:
        data = request.get_json(force=True) or {}
        path = _workspace_from_request(data)
        zip_bytes, filename = build_workspace_zip(path)
        if not zip_bytes:
            raise ValueError("打包结果为空")
        return send_file(
            io.BytesIO(zip_bytes),
            mimetype="application/zip",
            as_attachment=True,
            download_name=filename,
            max_age=0,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"下载失败：{exc}"}), 500


if __name__ == "__main__":
    app.run(host=config.FLASK_HOST, port=config.FLASK_PORT, debug=True)
