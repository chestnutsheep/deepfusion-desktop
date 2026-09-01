# DeepFusion Desktop · WebUI

DeepFusion Desktop 的**前端界面层**。一个本地优先（local-first）的投研工作台，基于
**React + Tauri + Vite** 构建，通过 MCP 协议连接后端的 **DeepFusion 分析服务**（179 个工具），
把行情、行业、概念、周期、宏观、政策、报告等数据组织成可读、可追溯、可操作的界面。

> 本仓库是 `deepfusion-desktop` 的 WebUI 子包，前端源码位于 `dashboard/`，由 Tauri 壳（`src-tauri/`）加载为桌面应用。

---

## 架构

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  WebUI (React + Vite)        │  HTTP   │  DeepFusion Server (MCP)     │
│  dashboard/src/**            │ ──────► │  POST /api/tools/call        │
│  - 组件 / 页面 / 服务层       │  JSON   │  { name, arguments }         │
│  - 本地持仓/自选 (IndexedDB)  │ ◄────── │  179 个分析工具               │
└─────────────────────────────┘         └──────────────────────────────┘
        ▲                                        │
        │  Tauri 壳 (src-tauri) 提供桌面窗口       │ 拉取行情/行业/概念/周期/宏观/政策
        ▼                                        ▼
  原生桌面窗口 (macOS / Windows / Linux)     外部数据源 (交易所 / 财经 API / 政策库)
```

- **前端只做展示与本地状态**：自选、持仓、成本、标签等存于浏览器本地（见 `src/shared/storage.js` / `portfolioStore.js`）。
- **所有分析计算在 server 端**：前端通过 `src/services/mcp.js` 的 `mcp.call(toolName, args)` 统一调用。
- **后端地址**：默认 `http://127.0.0.1:5173`（见 `src/services/mcp.js` 的 `API_BASE_URL`）。开发模式下 Vite 也通过 `/api` 代理到同一地址（`vite.config.js`）。

---

## 目录结构

```
dashboard/
├── src/
│   ├── main.jsx                      # 应用入口：导航、每日看板、全局数据加载
│   ├── styles.css                    # 全局样式（design tokens）
│   ├── components/
│   │   ├── WatchlistPanel.jsx        # 自选 / 持仓面板（含「簇视图」cluster）
│   │   ├── AssetAllocationPanel.jsx  # 资产配置面板
│   │   ├── FuturesPanel.jsx          # 期货面板
│   │   ├── ConceptDeconstructPanel.jsx # 概念解构面板
│   │   ├── EventGrid.jsx             # 财经日历 / 事件网格
│   │   ├── MethodologyPanel.jsx      # 投研编排工作流（agents/skills 文档）
│   │   ├── ReportDataStatus.jsx      # 报告数据接入状态
│   │   └── ...
│   ├── pages/
│   │   └── SettingsPage.jsx          # 设置页（模型配置 / 记忆开关 / 报告健康）
│   ├── services/
│   │   ├── mcp.js                    # MCP 调用封装（超时 12s / 错误归一化 McpError）
│   │   ├── watchlist.js              # 自选/持仓读写、盈亏分析、聚类辅助
│   │   ├── reports.js                # 报告库读取 / 归一化（4 类 rtype）
│   │   ├── futures.js                # 期货行情服务
│   │   └── logs.js                   # 全局日志捕获
│   ├── design/
│   │   ├── Primitives.jsx            # UI 原语（Eyebrow / 按钮等）
│   │   ├── themes.js                 # 主题切换
│   │   └── tokens.css                # 设计变量
│   ├── shared/
│   │   ├── storage.js                # 本地存储封装
│   │   └── portfolioStore.js         # 持仓/自选状态
│   └── data/
│       ├── maxims.js                 # 界面箴言文案
│       └── reportFixtures.js         # 报告类型常量
├── index.html                        # Tauri 加载入口
└── README.md                         # 本文件
```

---

## 与 DeepFusion Server 的能力对照

Server 共暴露 **179 个工具**。WebUI **已接入**的只是其中一部分；大量行业 / 概念 /
周期 / 宏观能力尚待接线。

### ✅ 已接入（前端实际调用）

| 能力域        | 工具                                  | 使用位置                         |
|--------------|---------------------------------------|----------------------------------|
| 行情         | `stock_quote` `individual_hist`        | 自选/持仓、搜索结果、图表        |
| 技术指标     | `stock_tech_indicators`                | 卡片点击 → 技术分析详情          |
| 概念归属     | `stock_concepts`                       | 卡片标签、簇视图聚类源           |
| 市场宽基     | `market_broad_snapshot`                | 概览 / 每日看板                  |
| 涨停 / 资金  | `limit_up_latest` `capital_flows_snapshot` `stock_sector_fund_flow_rank` | 每日看板           |
| 快讯 / 日历  | `stock_news_global` `calendar_upcoming` | 每日看板 / 事件网格              |
| 期权 / 期货  | `option_ivix` `futures_prices`         | 概览指标                        |
| 政策         | `policy_search`                        | 政策面板                        |
| 报告         | `report_history`                       | 日报中心（盘前/午间/优质股/复盘）|

### 🔜 未接入但 server 已具备（可后续接线）

- **行业 / 概念 / Meso 层**：`industry_themes`、`industry_themes_causality`（主题因果/领先滞后）、
  `industry_themes_dcc`、`industry_classify`、`industry_sw_tree` / `industry_sw_constituents`、
  `industry_quotes` / `industry_capital_flow`、`industry_seasonal_corr`（行业季节性相关）、
  `sector_valuation`、`sector_rotation`（行业轮动）、`peer_comparison`、`fund_industry_allocation`
- **周期**：`kitchin/juglar/kuznets/kondratiev_cycle` 及 `data_*` / `chart_*` / `cycle_nesting`
- **宏观**：`macro_gdp/cpi/pmi/...`、`fred_data`、`wb_data`、`caixin_*`
- **资金 / 情绪**：`northbound_funds`、`margin_balance`、`capital_flow_monitor`、`sentiment_side`、`fear_greed_index`
- **政策深度**：`policy_collect/stats/timeline/market_link/hot_signals/topic_stocks`
- **组合 / 资产**：`portfolio_add/view/chart`、`asset_allocation`、`fund_*`、`etf_*`、`crypto_*`、`futures_*`
- **记忆**：`memory_save/search/update/archive/context/export/import`

> 注：`MethodologyPanel` 展示的 12 个投研 skill（行业定位 / 财务内检 / 行业比较 / 异常检测 /
> 假设检验 / 对抗审查 / 机构印证 / 周期相位 / 证据融合 / 置信校准 / 周期配置 / 基准维护）
> 当前**仅作为文档展示，未在 WebUI 内接入实际调用**。

---

## 特色功能

### 簇视图（Cluster View）— 相关性降维到本地持仓
自选 / 持仓面板提供四种视图切换：**卡片 / 列表 / 大卡 / 簇视图**。
- 簇视图按每只标的的 `sector` + `concepts`（来自 `stock_concepts`）做特征集合；
- 用 **Jaccard 相似度**算两两关联度（同 `sector` 额外加权），并查集归簇；
- **同组同色相、组内深浅表示与锚点的关联度**；组间用 golden-ratio 色相区分。
- 不依赖后端，纯前端，基于已有的 tags / concepts 字段。

> 当前为前端近似聚类。Server 已有真正的主题聚类能力（`industry_themes` /
> `industry_themes_causality`），后续可替换为真实主题簇与因果边（含行业领先/滞后关系）。

### 其他面板
- **每日看板**：宽基快照、涨停、资金流、7×24 快讯、财经日历、政策检索。
- **日报中心**：盘前简报 / 午间新闻驱动 / 优质股推送 / 每日复盘，可追溯。
- **资产配置 / 期货 / 概念解构 / 方法论**：分别对应 server 的 `asset_allocation`、
  `futures_*`、`industry_themes` 等能力的展示入口（部分待接线）。

---

## 本地开发

###  prerequisites
- Node.js 18+
- Rust 工具链（仅构建桌面应用时需要，纯前端开发不需要）
- 一个正在运行的 **DeepFusion Server**，监听 `127.0.0.1:5173`

### 命令（仓库根目录 `deepfusion-desktop/`）

```bash
# 仅前端开发（Vite dev server，默认 5188，/api 代理到 5173）
npm install
npm run dev

# 桌面应用开发（Tauri 窗口，需 Rust 工具链）
npm run desktop:dev

# 构建
npm run build              # 仅前端产物
npm run desktop:build      # 打包桌面应用
```

### 配置项（环境变量）

| 变量                         | 默认值                    | 说明                          |
|------------------------------|---------------------------|-------------------------------|
| `VITE_DEEPFUSION_API_URL`    | `http://127.0.0.1:5173`   | server 基地址（覆盖 mcp.js 默认）|
| `VITE_DEEPFUSION_API_TIMEOUT_MS` | `12000`              | 单次 MCP 调用超时（毫秒）       |

可在 `.env` 或构建环境中设置。

---

## 数据来源与诚实性
- **不编造数据**：所有行情 / 分析均来自 server 工具的真实返回；server 不可用时界面显示
  "数据源恢复后自动更新" 而非占位假数。
- **本地数据可信**：自选 / 持仓 / 成本由用户录入，盈亏为本地计算。
- 簇视图的关联度为前端可解释算法（Jaccard），每张卡片标注关联百分比，可溯源、可证伪。
