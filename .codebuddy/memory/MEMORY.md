# MEMORY

## 用户环境（稳定事实）
- **桌面目录是中文 `~/桌面`**（`/home/scapegoat/桌面`），不是英文 `~/Desktop`。写桌面快捷方式/图标必须放 `~/桌面`，`~/Desktop` 是空目录、不显示。
- `/home/AI/` 与 `/home/scapegoat/` 是同一份数据（早期 Linux 分区分错），两者无区别。项目真实路径：`/home/AI/workspace/Mcp Server/...`。
- 用户：代码端由 AI 负责，用户只负责金融部分（代码基础弱）。
- 用户偏好：保持版本唯一、不要老旧缓存；持仓数据不能被更新版本删掉。

## 项目结构
- `deepfusion-webui`（8080）= "DF Web" Web 看板。
- `deepfusion-server`（端口 5173，FastAPI/uv）= 后端。
- `deepfusion-desktop`（Tauri 桌面壳，5188，自带 dashboard/）= 独立于 webui 的桌面应用。

## Tauri 本质（用户曾混淆）
- Tauri = 把网页(React/Vite)打包成本地桌面程序：系统 WebView 渲染前端 + Rust 干系统级脏活(文件/托盘/快捷键)。
- `deepfusion-desktop` 前端 = `dashboard/src/main.jsx` 那套，跑在本地 WebView 窗口里，不是网站。
- 正确本地运行：`npm run desktop:dev`(开发窗口) 或 `npm run desktop:build`(打包 deb)。
- `npm run dev -- --port 5188` 只是前端 dev server，缺少 Tauri Rust 外壳，**仅用于纯前端渲染验证，验证完应关掉**，不是给用户访问的网站。

## 启动脚本（在用户机器 `/home/scapegoat/.local/bin/`）
- `launch-deepfusion-web.sh`：起 webui(8080)，已改为自动开浏览器+失败报错。
- `launch-deepfusion.sh`：起 Tauri desktop 应用。
- `start-deepfusion-server.sh`：起后端(5173)，uv run。
- `start-all.sh`：一键全起。

## 已知 bug 修复（防止回归）
- **导航跳转失效 bug（2026-09-01 修复）**：概览页 hero + dashboard-grid（持仓追踪+研究台摘要）原本在每个 `active` 下都无条件渲染，导致点击侧边栏其他模块时被常驻概览页叠加，表现成"怎么跳转都是主页持仓+研究台"。
  - 修复：用 `{active === '概览' && <>` 包裹整段概览区块（`main.jsx` renderView 的 else 分支）。
  - 教训：desktop 的视图切换必须用 `active` 条件包裹各自区块，绝不可常驻渲染某视图导致叠加。

## 工作习惯 / 构建规范（用户明确要求）
- **清理旧产物、保证版本唯一**：每次重新构建前/后，删除旧的打包产物，避免老旧缓存被误用。
  - deepfusion-desktop：删 `src-tauri/target/release/bundle/deb/*.deb` 及解包目录，再 `npm run desktop:build` 生成全新唯一包。
  - **不要手动删整个 `target/`**（会丢失 Rust 依赖编译缓存，下次 build 极慢）；只清 `bundle/deb/` 下的旧包。
  - 前端 `dist/` 由 `vite build` 自动整体覆盖，天然唯一，无需手动清。
- 用户强调：持仓数据不能被更新版本删掉（构建/更新动作不得触碰数据层）。

## 桌面入口状态（截至 2026-09-01）
- DF Web 应用菜单入口：`~/.local/share/applications/deepfusion-web.desktop`（已建）。
- DF Web 桌面图标：`/home/scapegoat/桌面/df-web.desktop`（已建，需 chmod+x + gio trusted）。
- Tauri desktop：autostart `~/.config/autostart/deepfusion-desktop.desktop`（未启用）。
