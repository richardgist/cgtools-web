---
name: svn-paths-server-persistence
overview: 将 SVN Patch 页面的路径设置从浏览器 localStorage 改为服务器端文件持久化，新增 settings API 端点，确保任何浏览器打开都能恢复上次设置。
---

## 用户需求

SVN Patch 页面中的路径 A（源/基准）和路径 B（目标）需要在服务器端持久化保存，使得无论用户使用哪个浏览器访问，都能自动恢复上次输入的路径和复选框设置，无需每次服务器重启或切换浏览器后重新手动设置。

## 产品概述

当前 SVN Patch 页面（Vue 新版前端 `web-ui/app/pages/svn.vue`）已有基于浏览器 localStorage 的持久化逻辑，但 localStorage 数据仅存在于单个浏览器中，换浏览器后数据丢失。需要将持久化方式从客户端 localStorage 迁移到服务器端文件存储，实现跨浏览器的路径设置共享。旧前端（`frontend/`）将被删除，无需修改。

## 核心功能

- 服务器端提供 SVN 设置的读取和写入 API
- 页面加载时从服务器端读取已保存的路径 

[User Cancelled]