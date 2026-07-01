# 智策云构 Pro

> 版本 1.0.0 · 基于业务场景的软硬件选型与项目结构生成引擎

基于 Flask + LangChain 的本地 Web 应用。输入业务需求后，自动生成技术栈选型、硬件推荐方案与项目目录结构。

---

## 环境要求

- Python 3.11+
- Conda 环境：`agent`
- 通义千问 [DashScope API Key](https://bailian.console.aliyun.com/)（需自行申请）

---

## 快速启动

```bash
# 1. 安装和激活 conda 环境
conda create --name zhiceyungou_test python=3.11
conda activate zhiceyungou_test

# 2. 安装依赖
pip install -r requirements.txt

# 3. （可选）复制环境变量模板
cp .env.example .env

# 4. 启动应用
python app.py
```

浏览器访问：**http://127.0.0.1:5000**

---

## 配置 API Key（必做）

系统依赖大模型 API 才能进行业务解析与分析。**首次启动后，请先配置您自己的 API Key**，再进行任务提交。

### 方式一：界面配置（推荐）

1. 启动应用并打开 http://127.0.0.1:5000
2. 点击左侧边栏底部的 **「API Key」** 按钮
3. 填入您的 DashScope API Key，点击 **保存**
4. Key 将写入本地 `.env` 并立即生效，无需重启

可通过同一弹窗查看当前是否已配置（显示脱敏后的 Key 前缀/后缀）。

### 方式二：手动编辑 `.env`

在项目根目录创建或编辑 `.env` 文件：

```env
DASHSCOPE_API_KEY=your-api-key-here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DEFAULT_MODEL=qwen3.7-plus
FLASK_SECRET_KEY=change-me
```

保存后重启应用，或在界面中再次保存以热更新 Key。

> **安全提示**：`.env` 已加入 `.gitignore`，请勿将 API Key 提交到 Git 仓库或分享给他人。

---

## 功能说明

| 功能 | 说明 |
|------|------|
| 表单输入 | 填写业务需求表单，必填项标红星 |
| 文件上传 | 支持 txt / md / pdf / doc 等，AI 自动解析为表单 |
| 大模型选择 | 默认 qwen3.7-plus，可切换其他有免费额度的模型 |
| 智能分析 | 生成技术选型、硬件方案、项目结构 |
| 结果展示 | 技术选型 / 硬件推荐 / 项目结构 三模块 Tab 切换 |
| 图表全屏 | 架构图与结构图支持缩放、平移、导出 PNG |
| 工作空间 | 选择本地文件夹，实时同步并写入项目结构 |
| 任务历史 | 左侧导航保存历史任务，支持回看 |
| 健康检查 | 检测各模型 API 连通性与延迟 |
| 主题切换 | 支持浅色 / 深色模式 |

---

## 技术栈

- **后端**：Flask
- **Agent**：LangChain + OpenAI 兼容 API（通义千问 DashScope）
- **前端**：原生 HTML / CSS / JavaScript + Mermaid + Chart.js + Lucide Icons
- **本地能力**：tkinter 文件夹选择、项目结构写入、工作空间文件管理

---

## 目录结构

```
agent/
├── app.py                 # Flask 入口
├── config.py              # 应用配置（品牌、模型、版本等）
├── agents/analyzer.py     # LangChain 解析与分析 Agent
├── services/              # 任务存储、文件解析、工作空间、健康检查等
├── templates/             # 页面模板
├── static/                # CSS / JS / 图标 / 头像
├── data/                  # 任务历史与上传文件（运行时生成）
├── examples/              # 业务需求示例
├── .env.example           # 环境变量模板
├── requirements.txt     # Python 依赖
└── 项目需求.md             # 详细需求文档
```

---

## 常见问题

**Q：启动后提交任务报错？**  
A：请先按上文配置 API Key，可通过侧边栏「健康检查」确认模型连通性。

**Q：API Key 存在哪里？**  
A：保存在项目根目录的 `.env` 文件中，仅本地存储。

**Q：如何更换模型？**  
A：在「新建任务」页面的「大模型选择」下拉框中切换；也可修改 `.env` 中的 `DEFAULT_MODEL`。

---

## 相关链接

- [阿里云百炼控制台](https://bailian.console.aliyun.com/) — 申请与管理 API Key
- 详细需求说明见 [`项目需求.md`](项目需求.md)
