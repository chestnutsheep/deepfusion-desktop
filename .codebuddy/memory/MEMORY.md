# 长期记忆 MEMORY.md

## 项目边界（极重要 — 三模块拆分，2026-08-29 重构）
- **三个独立模块（用户嫌旧仓库太乱、啥都塞进去，8-29 起新建）**：
  1. **deepfusion-server**（`/home/AI/workspace/Mcp Server/deepfusion-server`）：纯后端核心引擎。Python 包 `deep_fusion/` + `serve.py` + `pyproject.toml` + `uv.lock` + Dockerfile/docker-compose + `tests/` + `agents/`。`uv run serve.py --http` 起 5173 API；`uv run deep-fusion inspect` 列工具（177 个）。
  2. **deepfusion-webui**（`/home/AI/workspace/Mcp Server/deepfusion-webui`）：官方 Web 研究台界面。`npm install` + `npm run build` 生成 `dist/`，`npm run dev` 走 8080(proxy `/api/*`→5173)。
  3. **deepfusion-desktop**（本仓库 `/home/AI/workspace/Mcp Server/deepfusion-desktop`）：桌面面板 / 浮窗应用，Tauri + React + Vite。前端代码 `dashboard/src/`，`npm run build` 生成根 `/dist`，`tauri build` 嵌入。`frontendDist: ../dist`。
- **旧仓库 `DeepFusion/` 已废弃（保留未删，待用户确认再清理）**：原 100G logs + 11993 文件大杂烩。有效源码已抽离到上面三模块。
- ⚠️ 历史教训：曾有 Agent 把面板与 Web UI 混淆。涉及面板"油画层/主题"的改动必须先确认落在 `deepfusion-desktop/dashboard/src/`，而非 webui 仓库。
- **后端位置解耦**：`deepfusion-desktop/src-tauri/src/lib.rs` 的 `spawn_backend` 与 `read_doc` 改用 `DEEP_FUSION_HOME` 环境变量（缺省 `/home/AI/workspace/Mcp Server/DeepFusion`，指向旧仓库；新部署应设成 `deepfusion-server` 路径）。前端 `dashboard/src/services/*.js` 仍直连 `127.0.0.1:5173/api`，不变。

## 油画层（底部叠加视觉）构成 — dashboard/src/styles.css
- **当前正确结构（恢复原始"前两天都好"写法）**：`.desktop::before` 单条 `background-image` 三层叠加 = 遮罩渐变(2层) + 油画图 `var(--theme-image)`；`.desktop::after` 光晕；`.aurora`/`.grain` 浮动光斑+噪点（写死在 main.jsx）。**油画图由 `::before` 直接承载，无独立 `.oil-painting` 层。**
- ⚠️ 教训：8-26 我曾把油画图拆成独立 `.oil-painting` DOM 层，结果 Tauri WebView 下背景消失（用户"前两天都好、之后没背景"的真凶）。**不要再拆分 `::before` 的油画图层**，保持原始三层写法。
- 主题图片资源：`public/assets/*.JPEG`（matin/crepuscule/eclat/reve/lumiere/bleu/pont 共 7 张），由 `dashboard/src/design/themes.js` 的 `file` 字段引用，默认主题 `DEFAULT_THEME_ID = matin`。
- `--theme-image` 由 `dashboard/src/main.jsx` 的 `<main style>` 注入 `url(${import.meta.env.BASE_URL}assets/${theme.file})`（base `./` 时等价于 `./assets/`）。
- vite.config.js 设 `base: './'`。Tauri build 用 `asset://localhost/` 协议，`frontendDist: ../dist`，JS/CSS/图片同目录可达。

## 已排查故障（2026-08-26 ~ 08-27）
- **来源**：翻 `DeepFusion/.codebuddy/memory/2026-08-26.md`（DeepFusion 与 deepfusion-desktop 同仓库两工作副本）还原那个 Agent 真实操作。
- **BUG1 按钮无响应（确定 + 我修对）**：右上角只"关闭"有用，隐藏/恢复没用。根因：`git log` 证明 `src-tauri/capabilities/default.json` 从 Initial commit 后从未改过；那个 Agent 08-26 把按钮改 `hide()/show()` 但**漏加 `allow-hide`/`allow-show`/`allow-unmaximize` 权限** → 调用静默失败；close 有权限故可用。**我 8-27 补了这三个权限**（本次唯一必要的代码修复）。**改 capabilities/Rust 配置必须 `tauri build` 重新构建才生效。**
- **BUG2 背景（油画层）消失 —— 真根因（8-27 playwright 实测突破）**：之前所有分析（环境/缓存/GNOME/变量脆弱性/误建 vite.config）都错。真正 bug：`main.jsx` 把 `--theme-image: url(./assets/${file})` 注入 `<main>` style，油画图在 `styles.css` 的 `.desktop::before` 用 `var(--theme-image)` 引用。**CSS 陷阱：`var()` 里的 `url(./assets/x)` 相对基准是"使用该变量的 CSS 文件"（`dist/assets/index-*.css`），非文档** → `::before` 解析成 `url(assets/assets/matin.JPEG)`（多一层）→ Tauri `asset://` 下 404 → 油画永不显示。这就是"他没修好"的真相（他的路径同样错）。**实证**：playwright computed style 显示修复前 `::before` 第三层=`.../assets/assets/matin.JPEG`（双），修复后=`.../assets/matin.JPEG`（单，200）。**修复**：`main.jsx:358` 改 `--theme-image: url(/assets/${theme.file})`（绝对路径，不受 CSS 基准影响）。已 build + playwright 验证通过。
- **教训（重要）**：Tauri/Vite 项目里**不要把图片 URL 放进 CSS 变量再用 `var()` 在 `::before` 等伪元素引用相对路径**（相对基准变 CSS 文件目录→双路径 404）。用绝对 `/assets/` 或把图片内联到 DOM 元素 style。
- **GNOME 方案**：面板是 **GNOME Shell 扩展 `deepfusion-home@deepfusion` + Just Perfection 36 + systemd 服务 `deepfusion-desktop.service` + Tauri** 组合。但本次油画消失是纯前端路径 bug，与 GNOME 无关。
- **当前运行（8-27 核查）**：systemd 服务 `inactive(dead)`；有 `vite` dev 进程(PID 27105)仍在。代码已修好（main.jsx 路径 + capabilities 权限）。
- **本机收尾**：杀旧进程 → 清 `WebKitCache`(`~/.local/share/com.deepfusion.desktop/WebKitCache`) → 因改了 main.jsx+capabilities 须 `tauri build` 重新打包（避免"弄混两个 build"，确保用根 `dist/` 且含新权限）→ 重启 systemd 服务 + 确认 GNOME 扩展已启用。

## 自启 / 服务生命周期（重要，8-28 重设计）
- **真实脚本路径**：`/home/scapegoat/.config/deepfusion/start-desktop.sh`（scapegoat 用户）。systemd 服务 `~/.config/systemd/user/deepfusion-desktop.service` 曾 `Restart=always` → 这是"关了面板又自启"的根因之一。
- **8-28 重新设计生命周期（解决"关不掉/自启"bug）**：
  1. **禁用 systemd 自启**：`systemctl --user disable deepfusion-desktop.service`（默认不开机自启，避免关不掉）。
  2. **`start-desktop.sh` 去掉 `while true` 守护循环**：改为一次性清场+起 5173 后端后退出，不再保活面板。
  3. **后端生命周期改由 Tauri 接管**：`src-tauri/src/lib.rs` 新增 `start_backend` / `stop_backend` / `backend_status` 命令。`start_backend` 用 `Command::new("bash").process_group(0)` spawn `cd DeepFusion && uv run serve.py`，使后端成为独立进程组组长（pgid==child.id()）；`stop_backend` 用 `libc::killpg(pgid, SIGKILL)` 整组清除后端（含 serve.py 子进程）。已加 `libc` 依赖到 Cargo.toml。
  4. **前端 `dashboard/src/main.jsx`**：
     - 加载时 `invoke('start_backend')` 自动拉起后端并保持活性。
     - "关闭主屏"按钮 → `invoke('stop_backend')` 杀后端 + `window.hide()`（不退出进程，显示"启动应用"覆盖层）。
     - 新增"启动应用"覆盖层（`app-launcher`），点击 → `invoke('start_backend')` + `window.show()`。
  5. 验证：运行二进制→5173=200、后端进程组 pgid==pid、killpg 整组清除→5173 断开。

- ⚠️ **前端根目录真相（极重要，8-29 纠正）**：真正的项目前端根 = `/home/AI/workspace/Mcp Server/deepfusion-desktop/`（这里有 `package.json`、`vite.config.js`、`index.html`、`public/`）。**`dashboard/` 只是源码子目录（仅含 `src/`），没有 package.json**，之前误在 `dashboard/` 下 build 是错的。
  - Tauri 配置 `frontendDist: "../dist"` 指向 `src-tauri/../dist` = **项目根的 `/dist`**，不是 `dashboard/dist`。
  - 正确构建链路：① 在**项目根** `npm run build`（生成根 `/dist`）；② `cargo build --release`（Tauri 嵌入根 `/dist`）。
  - 已修正 `tauri.conf.json` 的 `beforeBuildCommand` 为 `npm run build --prefix ".."`，使 `cargo build` 时能在正确根目录构建前端。
  - 验证嵌入是否成功：在二进制里 `grep -c "index.html"` 应 > 0（8 表示已嵌入）；为 0 表示没嵌对（dist 路径错）。
- ⚠️ **双重自启（8-29 重要补全）**：面板有**两道自启入口**，必须都关才不会再"开机/登录就出来"：
  1. systemd user 服务：`/home/scapegoat/.config/systemd/user/deepfusion-desktop.service` → `systemctl --user disable deepfusion-desktop.service`（现已 disabled）。
  2. **GNOME xdg-autostart**：`/home/scapegoat/.config/autostart/deepfusion-desktop.desktop`，含 `X-GNOME-Autostart-enabled=true` + `Exec=.../release/deepfusion-desktop`。这是 8-29 才发现的真正漏网入口（会生成 `app-deepfusion@autostart.service` generated scope）。已改为 `false`。
  - **教训**：禁用面板自启时，systemd 和 GNOME autostart .desktop 两处都要查、都要关，否则仍会自启。
- ⚠️ **用户身份坑（极重要）**：当前桌面会话真实用户是 **`scapegoat`**（HOME=`/home/scapegoat`），**不是 `AI`**。`/home/AI` 下没有 systemd unit 文件。所有 `systemctl --user` / 路径操作必须作用于 `scapegoat`，否则会误改或查不到。之前有失联 shell 会话把 `$HOME` 指到 `scapegoat` 导致混淆。
- ⚠️ **终端污染教训（8-28~29）**：本环境 shell 会话会 I/O 叠加/重放历史命令，曾把残留的"打开编辑器"命令重放，导致 CodeBuddy 窗口被自动拉起。验证只用"写结果文件→cat"的干净路径；绝不在命令里混 `code .`/`cursor .`/`xdg-open` 等打开窗口的副作用。
- ⚠️ **端口真相**：`5173` = 后端 API（Python `serve.py`，uvicorn，现位于 `deepfusion-server/`）。面板 `watchlist.js` 直连 `http://127.0.0.1:5173/api/tools/call`。
- ⚠️ **API 契约（验证 server 必须按此，8-30 教训）**：调用前**先看 `serve.py` 的真实返回格式**，别盲调。
  - `GET /api/tools/list` → `{"ok": true, "tools": [名字字符串...]}`（不是对象数组）。
  - `POST /api/tools/call` body `{"name":..., "arguments":{...}}` → 返回 `{"ok": true, "data": <text字符串>, "updatedAt": ...}`。**工具结果在 `data` 字段，不是 `content`/`result.content`**。之前误读 `content` 字段误判"数据空"，实为协议读错。
  - 启动：`cd deepfusion-server && uv run python serve.py`（默认 5173）。验证：list=177 工具；`report_latest({rtype:"premarket"})`/`limit_up_latest`/`cycle_nesting` 均返回真实数据（带恢复后的 data/*.db）。
- ⚠️ **环境坑（8-30 解决）**：本机 `fs.inotify.max_user_watches` 默认仅 65536，导致 `tauri dev` / vite dev 的 watcher 报 `ENOSPC: System limit for number of file watchers reached`。已用 `echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf && sudo sysctl -p` 调大到 524288（已持久化到 /etc/sysctl.conf）。**重装系统后需重设**。
- ⚠️ **desktop lib.rs 编译坑**：`read_doc` 用 `DEEP_FUSION_HOME`（默认 `/home/AI/workspace/Mcp Server/DeepFusion`），`Path::new(root)` 必须写成 `Path::new(&root)`（root 是 String）。漏 `&` 会编译失败 E0308。
- **三模块启动顺序**（dev 联调）：① 后端 `deepfusion-server` 起 5173 → ② `deepfusion-webui` `npm run dev` 起 8080（proxy→5173）→ ③ `deepfusion-desktop` `npm run desktop:dev`（tauri dev，前端 5188，窗口连 5173）。desktop 与 webui 都依赖 5173 才能取数。`deepfusion-webui` 的 `npm run dev` 起 **8080**（WebUI vite，proxy `/api/*`→5173）。面板只依赖 5173。
- **面板接 DeepFusion 数据方式**：HTTP 直连 `127.0.0.1:5173/api/tools/call`（非 Tauri mcp 插件）。
- **名称/行业/概念来源**：`stock_quote` 不含 name；名称靠 `search`、概念靠 `stock_concepts(symbol, market)`（须带 market）。`watchlist.js` 的 `fetchMeta` 已回填，后端没起时降级手填。

## DeepFusion 项目内 MCP
- `DeepFusion/server.json` 的 mcp 配置是给 Claude Desktop 用的（Windows 路径 `G:\PycharmProjects\DeepFusion` + 7897 代理，本机不可用）。真实 stdio 入口：`uv run deep-fusion`（`pyproject.toml` 的 `[project.scripts] deep-fusion = "deep_fusion:main"`），本机 uv 可用。但面板未采用此方式。
- DeepFusion 后端启动：`cd DeepFusion && uv run serve.py`（uvicorn, 端口 5173）。WebUI 前端：`cd DeepFusion/dashboard && npm run dev`（vite, 端口 8080）。

## 用户技术指标实战心得（2026-08-30 亲述，非教科书视角，务必尊重）
- **MACD**：
  - 金叉死叉看整体趋势涨跌，但弊端是 MACD 显颓势时价格**早已发生或轻或重的回落**；急庄可能直接跳水没反应时间。
  - **MACD 柱的加速度（即二阶导数）**：加速度见顶**先于** MACD 柱。传统 MACD 把"零轴"当判断标准，但二阶导数天然多一层"增速大小"概念。加速度>0 时 MACD 始终增长；加速度开始回落时动能减弱但向上趋势仍在 → **可在利润未被侵蚀前跑路**。
  - **水上/水下**：金叉与零线位置关系：水下金叉 < 二次金叉 < 水上金叉 < **三全项**（水下金叉+二次金叉+底背离）。底背离=股价近期新低而 DIF 未同步新低，形成底背离结构。
- **KDJ**：趋势市会**钝化**（>120 是常态），须先经 DMI 划分"趋势市 vs 震荡市"再决定用不用。
- **MA 系**：长线组运行在股价**下方**的上涨更持久；短线 MA 同样存在加速度概念（同 MACD 逻辑，不赘述）。
- **WR（威廉指标）**：用户明确认为**没用，建议删掉**。
- **CCI**：仅在**极端趋势市**好使，有限制。
- **量价时空（核心方法论）**：指标只是 OHLCV 的衍生，Level2 不可得时，**回到量价关系 + 日内多周期**视角常有奇效。
  - **量五等级**（以前一交易日 + VMA(5) 为参照）：倍量(天量) / 增量(放量) / 量平 / 缩量 / 腰斩(地量)。
  - **价**：一般直接反映流入资金（无狗庄前提下）；健康上涨应伴随**成交量成比例温和放大**；任何"非成比例"的成交量变化本身就是信号。
  - 更多量化细节见本机电脑中关于量化分析的文件（用户提示可检索）。

## 语言偏好（极重要，2026-08-30 明确）
- **用户母语是中文，中文最自然最好读**；偶尔切英文只是因为"中文打字成本高、懒得多敲字"，**不代表想用英文交流**。
- **硬性约定：无论用户用中文还是英文沟通，我一律用中文回复。** 不因对方用英文就跟着切英文。

## 用户习惯 / 工作约定（务必遵守）
- **改完即清残留**：每次修改后主动删除旧版本产物与缓存，避免版本混乱。清单：
  - 删 `src-tauri/target/debug/`（debug 旧二进制+缓存）、`bundle/appimage`、`bundle/appimage_deb`、`bundle/rpm`（只留最新 `deb`）。
  - 删 `WebKitCache`：`~/.local/share/com.deepfusion.desktop/WebKitCache`（面板重启自动重建）。
  - 删旧桌面图标 `~/Desktop/*.desktop`（旧 agent 建的可能指向旧路径）。
  - 项目内若新建过冗余脚本（如多余的 start-desktop.sh）一并删除，只留真实生效的那份（scapegoat 下）。
  - **保留**：`target/release/deepfusion-desktop`（唯一真源二进制）、当前运行进程（不误杀）、最新 `deb` 包。
- 用户反感反复手动批准/手动拉起命令；尽量把操作收敛成"开机/服务自启 + 自愈"，减少需要他介入的步骤。
