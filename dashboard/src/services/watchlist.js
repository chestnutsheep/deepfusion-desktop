import { invoke } from '@tauri-apps/api/core';
import { logEvent } from './logs';

const KEY = 'deepfusion.watchlist.v1';
const MAX = 30;

// —— 后端存活熔断（防止 5173 连不上时前端自杀式重试打满主线程）——
// 后端连续失败达到阈值后进入“熔断”状态，在冷却期内所有 mcpTool 调用直接短路返回，
// 不再发起网络请求；冷却结束后用一次探活请求恢复。彻底避免 ECONNREFUSED 刷屏导致卡成 PPT。
const BACKEND_OK = { alive: true, fails: 0, cooldownUntil: 0 };
const FAIL_THRESHOLD = 3;     // 连续失败几次后触发熔断
const COOLDOWN_MS = 15_000;   // 熔断冷却时长（期间直接短路）
const PROBE_NAME = 'search';  // 探活用的轻量工具

async function probeBackend() {
  try {
    const res = await fetch('/api/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: PROBE_NAME, arguments: { keyword: 'SH', market: 'sh' } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 后端不可达时返回 true，调用方应直接短路（返回缓存/null），不再发请求 */
async function backendUnavailable() {
  if (BACKEND_OK.alive) return false;
  if (Date.now() >= BACKEND_OK.cooldownUntil) {
    // 冷却结束，探活一次决定是否恢复
    const ok = await probeBackend();
    if (ok) {
      BACKEND_OK.alive = true;
      BACKEND_OK.fails = 0;
      return false;
    }
    BACKEND_OK.cooldownUntil = Date.now() + COOLDOWN_MS;
  }
  return true;
}

function recordBackendResult(ok) {
  if (ok) {
    BACKEND_OK.alive = true;
    BACKEND_OK.fails = 0;
  } else {
    BACKEND_OK.fails += 1;
    if (BACKEND_OK.fails >= FAIL_THRESHOLD) {
      BACKEND_OK.alive = false;
      BACKEND_OK.cooldownUntil = Date.now() + COOLDOWN_MS;
      logEvent('warn', 'mcpTool', `后端连续失败${BACKEND_OK.fails}次，进入熔断冷却 ${COOLDOWN_MS}ms`);
    }
  }
}

/** 自动把持仓落盘到磁盘（~/.config/deepfusion/watchlist.json，独立于 WebView 缓存） */
export async function persistBackup(list) {
  try {
    await invoke('save_watchlist_backup', { json: JSON.stringify(list.slice(0, MAX)) });
  } catch {
    /* 忽略落盘失败 */
  }
}

/** 从磁盘备份恢复（WebView 缓存为空时）；自动把 ETF 代码的旧数据 type 修正为 fund。 */
export async function loadBackup() {
  try {
    const raw = await invoke('load_watchlist_backup');
    if (!raw || typeof raw !== 'string') return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.map((w) => {
      const inferredFund = isEtfCode(w.code) ? 'fund' : 'stock';
      const type = w.type || inferredFund;
      // 旧数据若把 ETF 存成 stock，会导致 sector 是股票行业标签，清空它
      const isOldEtfMistype = isEtfCode(w.code) && w.type === 'stock';
      return {
        cost: null,
        shares: null,
        name: '',
        reason: '',
        tag: 'watch',
        type,
        sector: isOldEtfMistype ? '' : (w.sector || ''),
        concepts: isOldEtfMistype ? [] : (w.concepts || []),
        addedAt: Date.now(),
        ...w,
        type,                       // 兜底/修正后的 type 覆盖原始值
        sector: isOldEtfMistype ? '' : (w.sector || ''),
        concepts: isOldEtfMistype ? [] : (w.concepts || []),
      };
    });
  } catch {
    return null;
  }
}

export async function exportBackupToFile() {
  const list = loadWatchlistSync();
  try {
    await invoke('save_watchlist_backup', { json: JSON.stringify(list, null, 2) });
  } catch {
    /* 忽略 */
  }
}

/**
 * 持仓/关注项结构：
 * { code, name, reason, tag, cost, shares, sector, concepts, addedAt }
 * - cost:  成本价（元），留空表示纯关注、不计入盈亏
 * - shares: 持股数，留空表示纯关注
 * - sector:  所属行业（用户录入，DeepFusion 后端暂未提供行业数据）
 * - concepts: 所属概念/板块标签数组（用户录入）
 */
export function createWatch({ code, name = '', reason = '', tag = 'watch', cost, shares, sector = '', concepts = [], type = 'stock' }) {
  return {
    code: String(code).trim(),
    name: String(name || '').trim(),
    reason: String(reason || '').trim(),
    tag: tag || 'watch',
    type: type || 'stock',
    cost: cost === '' || cost == null || isNaN(Number(cost)) ? null : Number(cost),
    shares: shares === '' || shares == null || isNaN(Number(shares)) ? null : Number(shares),
    sector: String(sector || '').trim(),
    concepts: Array.isArray(concepts) ? concepts : [],
    addedAt: Date.now(),
  };
}

export function loadWatchlistSync() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((w) => {
      const inferredFund = isEtfCode(w.code) ? 'fund' : 'stock';
      const type = w.type || inferredFund;
      const isOldEtfMistype = isEtfCode(w.code) && w.type === 'stock';
      return {
        cost: null,
        shares: null,
        name: '',
        reason: '',
        tag: 'watch',
        type,
        sector: isOldEtfMistype ? '' : (w.sector || ''),
        concepts: isOldEtfMistype ? [] : (w.concepts || []),
        addedAt: Date.now(),
        ...w,
        type,
        sector: isOldEtfMistype ? '' : (w.sector || ''),
        concepts: isOldEtfMistype ? [] : (w.concepts || []),
      };
    });
  } catch {
    return [];
  }
}

/** 同步优先读 WebView；为空时尝试异步磁盘备份恢复（返回 Promise） */
export async function loadWatchlist() {
  const fromMemory = loadWatchlistSync();
  if (fromMemory.length) return fromMemory;
  const backup = await loadBackup();
  if (backup && backup.length) {
    // 回填到 WebView，保证后续读取一致
    try { localStorage.setItem(KEY, JSON.stringify(backup)); } catch {}
    return backup;
  }
  return [];
}

export function saveWatchlist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* 忽略存储异常 */
  }
  // 异步落盘备份（清缓存不丢）
  persistBackup(list);
}

export function validateWatch(code, reason) {
  if (!/^\d{6}$/.test(code)) return '请输入 6 位股票代码';
  if (!String(reason || '').trim()) return '请填写简略关注原因';
  return '';
}

/**
 * 给指定持仓追加一条操作流水（做T/加仓/减仓/分红/备注），并落盘。
 * op: { id, date, kind, price, shares, costDelta, note }
 */
export function pushOp(code, op) {
  const list = loadWatchlistSync();
  const idx = list.findIndex((w) => w.code === code);
  if (idx < 0) return;
  const w = list[idx];
  const ops = Array.isArray(w.ops) ? w.ops : [];
  ops.push(op);
  list[idx] = { ...w, ops };
  saveWatchlist(list);
}

/** 中国大陆 ETF 代码特征：沪 51/56/58/50，深 15/16/18，京 89 */
function isEtfCode(code) {
  return /^(51|56|58|50|15|16|18|89)/.test(String(code || ''));
}

/** 区分持仓项（有 cost 且 shares）与纯关注项 */
export function splitPortfolio(list) {
  const holdings = list.filter((w) => w.cost != null && w.shares != null && w.shares > 0);
  const watches = list.filter((w) => !(w.cost != null && w.shares != null && w.shares > 0));
  return { holdings, watches };
}

/**
 * 行情本地缓存（localStorage）：避免每次刷新都重新打网络，首屏/轮询先读缓存即时渲染。
 * 缓存有效期 20s，超过则视为过期、下次刷新时静默更新。
 */
const QUOTE_CACHE_KEY = 'df_quote_cache_v1';
const QUOTE_CACHE_TTL = 20_000;

function loadQuoteCache() {
  try {
    const raw = localStorage.getItem(QUOTE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveQuoteCache(code, quote) {
  try {
    const all = loadQuoteCache();
    all[code] = { quote, ts: Date.now() };
    localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(all));
  } catch {
    /* 忽略写入失败（隐私模式等） */
  }
}

/** 只读缓存（不触发网络），供首屏/初始化即时渲染 */
export function getCachedQuote(code) {
  const all = loadQuoteCache();
  const hit = all[code];
  if (hit && Date.now() - hit.ts < QUOTE_CACHE_TTL) return hit.quote;
  return null;
}

/**
 * 拉取单只股票实时行情
 * 复用 WebUI 后端的 mcp 工具 stock_quote（参数名为 symbol，返回 data 为 JSON 字符串）
 * 字段：symbol, name, price, prev_close, change, change_pct, pe, pb, total_mv, turnover ...
 * 结果写入本地缓存（带时间戳），下次刷新可即时复用。
 */
export async function fetchQuote(code) {
  // 熔断：后端不可达时直接回退缓存，不发请求
  if (await backendUnavailable()) return getCachedQuote(code);
  try {
    const res = await fetch('/api/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'stock_quote', arguments: { symbol: code, market: inferMarket(code) } }),
    });
    const json = await res.json();
    recordBackendResult(json?.ok !== false);
    if (!json?.ok) return getCachedQuote(code); // 网络失败回退缓存
    // data 可能是 JSON 字符串，也可能是对象
    const raw = typeof json.data === 'string' ? safeParse(json.data) : json.data;
    const item = Array.isArray(raw) ? raw.find((x) => String(x.symbol) === String(code)) : raw;
    if (!item) return getCachedQuote(code);
    const quote = {
      lastPrice: Number(item.price ?? item.lastPrice ?? 0),
      changePct: Number(item.change_pct ?? item.changePct ?? 0),
      change: Number(item.change ?? 0),
      name: item.name || '',
      pe: item.pe ?? null,
      pb: item.pb ?? null,
    };
    saveQuoteCache(code, quote);
    return quote;
  } catch {
    recordBackendResult(false);
    return getCachedQuote(code);
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/** 把持仓解析为可显示类型：stock / etf / fund；ETF 按代码前缀兜底识别，兼容旧数据 type 错误。 */
export function resolveType(w) {
  const code = String(w.code || '');
  if (isEtfCode(code)) return 'etf';
  if (w.type === 'fund') return 'fund';
  return 'stock';
}

/** 根据代码推断市场（沪 sh / 深 sz / 京 bj），优先识别 ETF 代码前缀 */
export function inferMarket(code) {
  const c = String(code || '');
  if (/^(51|56|58|50)/.test(c)) return 'sh';
  if (/^(15|16|18)/.test(c)) return 'sz';
  if (/^(60|68|9)/.test(c)) return 'sh';
  if (/^(00|30)/.test(c)) return 'sz';
  if (/^8/.test(c)) return 'bj';
  return 'sh';
}

const MCALL = '/api/tools/call';

async function mcpTool(name, args) {
  // 熔断：后端不可达时直接短路，不发请求（避免 ECONNREFUSED 刷屏打满主线程）
  if (await backendUnavailable()) return null;
  try {
    logEvent('info', 'mcpTool', `POST ${MCALL} name=${name}`);
    const res = await fetch(MCALL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
    });
    logEvent('info', 'mcpTool', `status=${res.status} ok=${res.ok}`, { name });
    const json = await res.json();
    if (!json?.ok) {
      logEvent('error', 'mcpTool', `后端返回 ok=false（${name}）`, json?.error || json);
      recordBackendResult(false);
      return null;
    }
    recordBackendResult(true);
    return typeof json.data === 'string' ? safeParse(json.data) : json.data;
  } catch (e) {
    logEvent('error', 'mcpTool', `请求失败（${name}）：${e.message}`, e.stack || String(e));
    recordBackendResult(false);
    return null;
  }
}

/** 供其他模块复用：直接调用 DeepFusion 后端 MCP 工具 */
export { mcpTool, parseHistCsv };

/**
 * 从 DeepFusion 后端补全元数据：
 * - 个股：search 取名称 + stock_concepts 取行业/概念
 * - 基金/ETF：只取名称，不调用 stock_concepts（避免把 ETF 当成股票行业）
 */
export async function fetchMeta(code, type = 'stock') {
  const market = inferMarket(code);
  const meta = { name: '', sector: '', concepts: [] };
  // 名称：search 工具返回对象 {code, name, market} 或数组 [{code, name, market}]
  const s = await mcpTool('search', { keyword: code, market });
  if (s) {
    const hit = Array.isArray(s)
      ? s.find((x) => String(x.code) === String(code))
      : String(s.code) === String(code) ? s : null;
    if (hit?.name) meta.name = hit.name;
  }
  // 基金/ETF 不走股票概念流程
  if (type === 'fund') return meta;
  // 概念/行业：stock_concepts 需传 market
  const c = await mcpTool('stock_concepts', { symbol: code, market });
  if (c && !Array.isArray(c)) {
    if (c.sector) meta.sector = c.sector;
    if (Array.isArray(c.tags) && c.tags.length) meta.concepts = c.tags;
    else if (Array.isArray(c.all_concepts) && c.all_concepts.length) meta.concepts = c.all_concepts;
  }
  return meta;
}

/** 解析 individual_hist 返回的 CSV 块，返回 {data: [{time, price}], type} */
function parseHistCsv(text, type) {
  if (!text || typeof text !== 'string') return null;
  const blocks = text.split(/===\s*/).filter(Boolean);
  for (let i = 0; i < blocks.length; i++) {
    const [head, ...lines] = blocks[i].trim().split('\n');
    if (!head.includes(type) || lines.length < 2) continue;
    const header = lines[0].split(',').map((h) => h.trim());
    const priceIdx = header.findIndex((h) => /收盘|close|price/i.test(h));
    const timeIdx = header.findIndex((h) => /time|day|时间|日期/i.test(h));
    if (priceIdx === -1 || timeIdx === -1) continue;
    const out = [];
    for (let j = 1; j < lines.length; j++) {
      const cols = lines[j].split(',').map((c) => c.trim());
      if (cols.length <= Math.max(priceIdx, timeIdx)) continue;
      const price = Number(cols[priceIdx]);
      if (Number.isNaN(price)) continue;
      out.push({ time: cols[timeIdx], price });
    }
    return out.length ? out : null;
  }
  return null;
}

/** 获取今日分时走势（交易时段有数据，非交易时段可能为空） */
export async function fetchIntraday(code, limit = 240) {
  try {
    const text = await mcpTool('individual_hist', {
      symbol: code,
      period: 'daily',
      limit,
    });
    // 优先用 1 分钟线/分笔数据画分时；回退用日线
    return parseHistCsv(text, '分笔数据')
      || parseHistCsv(text, '1分钟线')
      || parseHistCsv(text, '分钟线')
      || parseHistCsv(text, 'K线数据');
  } catch {
    return null;
  }
}

/** 获取最近 N 个交易日的日 K 收盘序列（用于大卡背景衬垫） */
export async function fetchDailyK(code, limit = 60) {
  try {
    const text = await mcpTool('individual_hist', {
      symbol: code,
      period: 'daily',
      limit,
    });
    const series = parseHistCsv(text, 'K线数据') || parseHistCsv(text, '日线');
    if (!series || series.length < 2) return null;
    return series.slice(-limit).map((d) => ({ time: d.time, price: d.price }));
  } catch {
    return null;
  }
}

/** 带行情的持仓项 */
export async function enrichWatch(w) {
  const q = await fetchQuote(w.code);
  if (!q) return { ...w, quote: null, meta: null };
  const [meta, intraday] = await Promise.all([
    fetchMeta(w.code, w.type),
    fetchIntraday(w.code),
  ]);
  return {
    ...w,
    quote: q,
    intraday,
    name: w.name || meta.name || q.name,
    sector: w.sector || meta.sector,
    concepts: w.concepts?.length ? w.concepts : meta.concepts,
  };
}

/**
 * 组合分析：基于持仓项 + 行情计算汇总指标
 * 返回 { totalMarketValue, totalCost, totalProfit, totalProfitPct,
 *        dayProfit, positions:[{...w, marketValue, profit, profitPct, weight}],
 *        tags:{tag, marketValue, weight}[], topGain, topLoss }
 */
export function analyzePortfolio(holdings, enrichedMap, availableCash = 0) {
  const cash = Number(availableCash) || 0;
  const positions = holdings.map((w) => {
    const q = enrichedMap.get(w.code)?.quote;
    // 叠加操作流水，得到当前真实成本与股数（做T/分红拉低成本但股数不变也计入）
    const op = applyOps(w);
    const effCost = op.curCost;
    const effShares = op.curShares;
    const last = q?.lastPrice ?? effCost ?? 0;
    const shares = effShares ?? 0;
    const marketValue = last * shares;
    const costValue = effCost * shares;
    const profit = marketValue - costValue;
    const profitPct = costValue > 0 ? (profit / costValue) * 100 : 0;
    const dayProfit = (q?.changePct ?? 0) / 100 * marketValue;
    return { ...w, last, marketValue, costValue, profit, profitPct, dayProfit, effCost, effShares, tProfit: op.totalTProfit };
  });

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalCost = positions.reduce((s, p) => s + p.costValue, 0);
  const totalProfit = totalMarketValue - totalCost;
  const totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const dayProfit = positions.reduce((s, p) => s + p.dayProfit, 0);

  // 仓位占比：持仓市值 /（持仓市值 + 可用资金），可用资金为 0 时退回纯持仓占比
  const base = totalMarketValue + cash;
  positions.forEach((p) => (p.weight = base > 0 ? (p.marketValue / base) * 100 : 0));

  // 按 tag 聚合
  const tagMap = new Map();
  positions.forEach((p) => {
    const t = tagMap.get(p.tag) || { tag: p.tag, marketValue: 0 };
    t.marketValue += p.marketValue;
    tagMap.set(p.tag, t);
  });
  const tags = [...tagMap.values()].map((t) => ({
    ...t,
    weight: totalMarketValue > 0 ? (t.marketValue / totalMarketValue) * 100 : 0,
  })).sort((a, b) => b.marketValue - a.marketValue);

  const sorted = [...positions].sort((a, b) => b.profit - a.profit);
  const topGain = sorted[0];
  const topLoss = sorted[sorted.length - 1];

  return {
    totalMarketValue,
    totalCost,
    totalProfit,
    totalProfitPct,
    dayProfit,
    positions,
    tags,
    topGain,
    topLoss,
  };
}

export { invoke };

/**
 * 持仓操作跟踪（本地）：在初始 cost/shares 之上叠加操作流水 ops，
 * 推算当前真实成本与股数。
 *
 * op 结构：{ id, date, kind, price, shares, costDelta, note }
 *   kind:
 *     'buy'      加仓：shares += op.shares；成本按加权重算
 *     'sell'     减仓：shares -= op.shares；成本不变（实现利润已反映在市价盈亏）
 *     't'        日内做 T：shares 不变，costDelta（≤0）直接摊薄成本
 *     'dividend' 分红：costDelta（≤0）降低持仓成本（对应现金增加，cash 由外部维护）
 *     'note'     纯备注：不改变任何数值
 *
 * 重点：'t' 与 'dividend' 均不改变股数，只调整成本——日内做 T 拉低成本但股数不变也计入。
 * 返回 { curCost, curShares, totalTProfit, opsCount, lastOpDate }
 */
export function applyOps(w) {
  const ops = Array.isArray(w.ops) ? w.ops : [];
  let cost = Number(w.cost) || 0;       // 每股成本（元）
  let shares = Number(w.shares) || 0;   // 持股数
  let totalTProfit = 0;                  // 做 T / 分红累计摊薄（= 成本节省额）
  ops.forEach((op) => {
    const k = op.kind;
    const opShares = Number(op.shares) || 0;
    const opPrice = Number(op.price) || 0;
    const cd = Number(op.costDelta) || 0; // 对每股成本的影响（做T/分红为负）
    if (k === 'buy' && opShares > 0 && opPrice > 0) {
      const totalCost = cost * shares + opPrice * opShares;
      shares += opShares;
      cost = shares > 0 ? totalCost / shares : 0;
    } else if (k === 'sell' && opShares > 0) {
      shares = Math.max(0, shares - opShares);
    } else if (k === 't') {
      // 股数不变；costDelta 摊薄每股成本（如做T赚 200 元 / 1000 股 = -0.20/股）
      cost = Math.max(0, cost + cd);
      totalTProfit += -cd * shares; // 每股节省 × 股数 ≈ 累计已实现摊薄
    } else if (k === 'dividend') {
      cost = Math.max(0, cost + cd);
      totalTProfit += -cd * shares;
    }
    // note：无数值变化
  });
  return {
    curCost: shares > 0 ? cost : (Number(w.cost) || 0),
    curShares: shares,
    totalTProfit,
    opsCount: ops.length,
    lastOpDate: ops.length ? ops[ops.length - 1].date : null,
  };
}

