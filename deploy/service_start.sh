#!/bin/bash

# 1. 加载 systemd 传入的 Conda 初始化脚本和环境名
source $CONDA_SH
conda activate $CONDA_ENV

# 2. 进入项目根目录（确保能找到 app.py 或 wsgi.py）
cd /home/admin/zhiceyungou_test

# 3. 使用 Gunicorn 启动应用
# -b 绑定地址和端口（与 systemd 中定义的 FLASK_HOST/PORT 保持一致）
# -w 4 开启4个工作进程（根据你的服务器CPU核数调整，推荐公式：2 * CPU核数 + 1）
# app:app 表示 app.py 文件中的 app 对象
gunicorn -b ${FLASK_HOST}:${FLASK_PORT} -w 4 app:app