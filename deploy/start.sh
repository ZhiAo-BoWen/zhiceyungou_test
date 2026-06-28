#!/bin/bash
# 智策云构 — systemd 启动脚本（由 zhiceyungou.service 调用）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

# 优先使用项目内 venv；否则 conda（CONDA_SH / CONDA_ENV 由 systemd 或 shell 传入）
if [[ -f "$APP_DIR/venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$APP_DIR/venv/bin/activate"
elif [[ -n "${CONDA_SH:-}" && -f "$CONDA_SH" ]]; then
  # shellcheck disable=SC1091
  source "$CONDA_SH"
  conda activate "${CONDA_ENV:-agent}"
else
  for _conda_sh in \
    "/opt/miniconda3/etc/profile.d/conda.sh" \
    "${HOME}/miniconda3/etc/profile.d/conda.sh" \
    "${HOME}/anaconda3/etc/profile.d/conda.sh"; do
    if [[ -f "$_conda_sh" ]]; then
      # shellcheck disable=SC1091
      source "$_conda_sh"
      conda activate "${CONDA_ENV:-agent}"
      break
    fi
  done
fi

if ! command -v gunicorn >/dev/null 2>&1; then
  echo "gunicorn 未找到，请确认 conda 环境已安装依赖: pip install -r requirements.txt" >&2
  exit 127
fi

# 由 nginx 反代时只监听本机；.env 中其它配置仍会自动加载
export DEPLOY_MODE="${DEPLOY_MODE:-server}"
export FLASK_HOST="${FLASK_HOST:-127.0.0.1}"
export FLASK_PORT="${FLASK_PORT:-5000}"

exec gunicorn \
  -w "${GUNICORN_WORKERS:-2}" \
  -b "${FLASK_HOST}:${FLASK_PORT}" \
  --timeout "${GUNICORN_TIMEOUT:-120}" \
  --access-logfile - \
  --error-logfile - \
  app:app
