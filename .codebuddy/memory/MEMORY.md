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

## 数据源与接口经验
- **美股指数数据源（2026-09-02 修复）**：akshare `index_global_spot_em`（东方财富）在 sandbox 环境连不上（RemoteDisconnected）。
  - 修复：后端 `_fetch_global_indices` 加新浪财经 `hq.sinajs.cn/list=gb_xxx` fallback，核心指数代码：道琼斯 `gb_dji`、纳斯达克 `gb_ixic`、标普500 `gb_inx`、纳斯达克100 `gb_ndx`、费城半导体 `gb_sox`。
  - 教训：海外/美股实时数据源在大陆环境不稳定，必须有新浪/其他 fallback；不要依赖单一 akshare 接口。

## 工作习惯 / 构建规范（用户明确要求）
- **清理旧产物、保证版本唯一**：每次重新构建前/后，删除旧的打包产物，避免老旧缓存被误用。
  - deepfusion-desktop：删 `src-tauri/target/release/bundle/deb/*.deb` 及解包目录，再 `npm run desktop:build` 生成全新唯一包。
  - **不要手动删整个 `target/`**（会丢失 Rust 依赖编译缓存，下次 build 极慢）；只清 `bundle/deb/` 下的旧包。
  - 前端 `dist/` 由 `vite build` 自动整体覆盖，天然唯一，无需手动清。
- 用户强调：持仓数据不能被更新版本删掉（构建/更新动作不得触碰数据层）。

## desktop 前端交互 / 视觉规范（长期）
- **反馈型按钮禁止用 `setNote(...)` 做唯一反馈**：note 面板只在概览页"工作备注"block 显示，别的页点了看不到 → 表现为"点击无反应"。正确做法：跳页面(`setActive`) / 弹浮层 / `flash` 提示条。
- **重要操作（备份/导出/恢复）必须有可见成功/失败反馈**（2026-09-02 持仓备份加了绿色 `watchlist-flash` 提示）。
- **视觉 token 体系**：所有新面板必须用 `design/tokens.css` 的 `--df-glass-bg` / `--df-accent` / `--df-sent-pos|neg|neu|routine` / `--df-radius-*` / `--df-space-*`，与现有玻璃拟态风格统一，不要写死颜色。
- **红涨绿跌**：中国市场惯例，涨=红 `#ff5a5a`、跌=绿 `#4ade80`（市场脉冲已应用）。
- **独立模块接入方式**：侧边栏 `navItems`（main.jsx 顶部数组）+ 新建 `components/XxxPanel.jsx` + App 渲染分支 `active==='xxx'`。后端 MCP 工具用 `mcp.call('tool_name', args)`。

## 已建独立模块（截至 2026-09-02）
- `CalendarPanel.jsx`（侧边栏「◷ 日历」）：周/月视图、语义色事件、埋伏窗口脉冲。数据 `calendar_range`。
- `NewsWire.jsx`（侧边栏「⊚ 快讯」）：LIVE 脉冲、频道 chip 筛选、时间线。数据 `stock_news_global`。
- `butler-overlay`（管家浮层）、`watchlist-flash`（备份提示）。

## 后端环境变量陷阱（重要）
- `serve.py` 不读 docker-compose.yml，只继承启动它的 shell 环境。`start-deepfusion-server.sh` 已注入 `NEWSNOW_BASE_URL=https://newsnow.busiyi.world` + `NEWSNOW_CHANNELS`。改环境变量必须改启动脚本，不能只改 docker-compose。
- 7×24 快讯 = 新浪全球(免配) + newsnow HTTP 实时拉取；**不走 reports.db 定时任务**。日历/日报类才走 reports.db 定时采集。

## easy_tdx 后备源接入（2026-09-02，方案 A）
- 用户拍板**方案 A**：easy_tdx 作为 Python 后备直接接；cn-funds-mcp 是 Node.js MCP，不嵌入 Python 后端，由本机 MCP 客户端挂载。
- `easy_tdx` 已 `uv pip install`（无需 API Key，通达信协议直连，当前环境实测能连 `MacClient.from_best_host()`）。
- 封装层：`deep_fusion/data_backends/easy_tdx_backend.py`（懒加载+静默降级）。**真实 API 踩坑记录**：
  - K 线列名是 `vol` 不是 `volume`；`get_stock_kline` 返回 datetime 列
  - 指标计算：`from easy_tdx.indicator import compute_indicators(df, indicators=names, keep_ohlcv=False)`，ohlcv 列名必须 `open/high/low/close/vol`，names 不能是 None（需明确列表，全量用 `list_indicators()` 取名字）
  - 缠论：`ChanlunAnalyser(code, frequency)` → `process_klines(df)`（df 含 datetime/open/high/low/close/volume/amount）→ `result` 是**属性**（不是方法）→ `.to_dict()` 序列化
- 接入点：`stocks.py` 的 `_stock_a_daily_robust()` 末尾加 easy_tdx 第三后备；`tech_indicators.py` 新增 `stock_tech_indicators_easytdx`（34指标）和 `stock_chanlun_analyze`（缠论）两个 MCP 工具。
- **数据源版本标记**：`scheduler.py` 顶部 `DATA_SOURCE_VERSION="2026-09-02+easy_tdx"`，每次 `deep-fusion-collect` 运行打印，让后续定时任务知晓。`DATA_SOURCES.md` 文档记录全链路。
- cn-funds-mcp：东方财富免费基金 API（Node.js stdio MCP），由 Cursor/CodeBuddy 等 MCP 客户端直接挂，不进 Python 后端。

## 前端 QuantPanel（2026-09-02）
- desktop 侧边栏新增「量化」入口（`⚇`），`dashboard/src/components/QuantPanel.jsx` 是**具体的交互 panel**（输入代码+市场切换+Tab 切 技术指标/缠论），非速览卡。
- 调 `stock_tech_indicators_easytdx`（34 指标，实际返回 30 个前缀列如 MACD_DIF/BOLL_UPPER/RSI）+ `stock_chanlun_analyze`（笔/中枢/买卖点/背驰）。
- 指标分组用**前缀匹配**实际输出列名（easy_tdx 返回带后缀：MACD_DIF/BOLL_UPPER/KDJ_K…），不要硬编码基础名。
- 样式在 `styles.css` 末尾 `.df-select/.df-input/.df-btn/.df-seg/.quant-*` 段；语义色用 `:root` 的 `--signal-positive/negative/neutral`（红涨绿跌同体系）。
- build：`cd deepfusion-desktop && npx vite build`（工具会误判为 watch，看 dist/ 产物即可）。

## 性能 / 内存（重要，防回归）
- **内存爆的真凶不是 desktop panel，是 IDE 客户端 `buddycn`**（十几个进程各 250~520MB，合计 ~5GB）。deepfusion 后端是轻量单进程 MCP，RSS 很小。
- **前端必须限制请求迸发**：后端是 uv 单进程，过多在飞 `mcp.call` 会堆积 Promise、放大内存。已在 `services/mcp.js` 加并发信号量（默认最多 4 个在飞，可用 `VITE_DEEPFUSION_MAX_CONCURRENT` 调）。所有面板（MarketPulse/NewsWire/CalendarPanel）共用此限制。
- **面板轮询已克制**：MarketPulse 60s、NewsWire 60s，均有 `alive` 守卫，组件卸载即停。WatchlistPanel **已取消 30s 轮询**（曾因后端慢堆积挂起 Promise 导致 WebKit OOM）。
- NewsWire 时间解析：`stock_news_global` 的 newsnow 段格式是 `HH:MM:SS,内容`，首行有 `时间,内容` 表头需过滤；`enrich()` 已支持此格式 + `【频道】` 前缀。

## 桌面入口状态（截至 2026-09-01）

## 桌面入口状态（截至 2026-09-01）
- DF Web 应用菜单入口：`~/.local/share/applications/deepfusion-web.desktop`（已建）。
- DF Web 桌面图标：`/home/scapegoat/桌面/df-web.desktop`（已建，需 chmod+x + gio trusted）。
- Tauri desktop：autostart `~/.config/autostart/deepfusion-desktop.desktop`（未启用）。
