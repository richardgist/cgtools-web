# CGTools Web

CG 工具箱 Web 版本 - 基于 FastAPI + 原生 HTML/JS 的开发者工具面板

## 功能

- 🔧 **Claude 配置管理** - 快速切换 Claude API 配置
- 📦 **SVN Patch 工具** - 生成和应用 SVN 补丁
- 📜 **脚本运行器** - 在浏览器中运行和管理脚本

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务器
python server.py
```

访问 http://localhost:8000

## 项目结构

```
cgtools-web/
├── frontend/           # 前端页面
│   └── index.html
├── scripts/            # 用户脚本目录
├── skills/             # AI 技能库
│   └── ui-ux-pro-max/
├── codebuddy_proxy/    # 代理服务
├── server.py           # FastAPI 后端
└── requirements.txt    # Python 依赖
```

## 技术栈

- **后端**: FastAPI + Uvicorn
- **前端**: 原生 HTML/CSS/JavaScript
- **设计**: UI/UX Pro Max 设计规范

## License

MIT
