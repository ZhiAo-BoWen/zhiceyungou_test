#!/bin/bash
# 智策云构 — systemd 启动脚本（由 zhiceyungou.service 调用）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

# 优先使用项目内 venv；否则尝试 conda（可通过环境变量 CONDA_ENV 指定，默认 agent）
if [[ -f "$APP_DIR/venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$APP_DIR/venv/bin/activate"
elif [[ -f "${CONDA_SH:-$HOME/miniconda3/etc/profile.d/conda.sh}" ]]; then
  # shellcheck disable=SC1091
  source "${CONDA_SH:-$HOME/miniconda3/etc/profile.d/conda.sh}"
  conda activate "${CONDA_ENV:-agent}"
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
