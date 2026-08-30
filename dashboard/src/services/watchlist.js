import { invoke } from '@tauri-apps/api/core';

const KEY = 'deepfusion.watchlist.v1';
const MAX = 30;

/** 自动把持仓落盘到磁盘（~/.config/deepfusion/watchlist.json，独立于 WebView 缓存） */
export async function persistBackup(list) {
  try {
    await invoke('save_watchlist_backup', { json: JSON.stringify(list.slice(0, MAX)) });
  } catch {
    /* 忽略落盘失败 */
  }
}

/** 从磁盘备份恢复（WebView 缓存为空时） */
export async function loadBackup() {
  try {
    const raw = await invoke('load_watchlist_backup');
    if (!raw || typeof raw !== 'string') return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.map((w) => ({
      cost: null,
      shares: null,
      name: '',
      reason: '',
      tag: 'watch',
      addedAt: Date.now(),
      ...w,
    }));
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
export function createWatch({ code, name = '', reason = '', tag = 'watch', cost, shares, sector = '', concepts = [] }) {
  return {
    code: String(code).trim(),
    name: String(name || '').trim(),
    reason: String(reason || '').trim(),
    tag: tag || 'watch',
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
    return arr.map((w) => ({
      cost: null,
      shares: null,
      name: '',
      reason: '',
      tag: 'watch',
      addedAt: Date.now(),
      ...w,
    }));
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

/** 区分持仓项（有 cost 且 shares）与纯关注项 */
export function splitPortfolio(list) {
  const holdings = list.filter((w) => w.cost != null && w.shares != null && w.shares > 0);
  const watches = list.filter((w) => !(w.cost != null && w.shares != null && w.shares > 0));
  return { holdings, watches };
}

/**
 * 拉取单只股票实时行情
 * 复用 WebUI 后端的 mcp 工具 stock_quote（参数名为 symbol，返回 data 为 JSON 字符串）
 * 字段：symbol, name, price, prev_close, change, change_pct, pe, pb, total_mv, turnover ...
 */
export async function fetchQuote(code) {
  try {
    const res = await fetch('http://127.0.0.1:5173/api/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'stock_quote', arguments: { symbol: code, market: inferMarket(code) } }),
    });
    const json = await res.json();
    if (!json?.ok) return null;
    // data 可能是 JSON 字符串，也可能是对象
    const raw = typeof json.data === 'string' ? safeParse(json.data) : json.data;
    const item = Array.isArray(raw) ? raw.find((x) => String(x.symbol) === String(code)) : raw;
    if (!item) return null;
    return {
      lastPrice: Number(item.price ?? item.lastPrice ?? 0),
      changePct: Number(item.change_pct ?? item.changePct ?? 0),
      change: Number(item.change ?? 0),
      name: item.name || '',
      pe: item.pe ?? null,
      pb: item.pb ?? null,
    };
  } catch {
    return null;
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/** 根据代码推断市场（沪 sh / 深 sz / 京 bj） */
export function inferMarket(code) {
  if (/^(60|68|9)/.test(code)) return 'sh';
  if (/^(00|30)/.test(code)) return 'sz';
  if (/^8/.test(code)) return 'bj';
  return 'sh';
}

const MCALL = 'http://127.0.0.1:5173/api/tools/call';

async function mcpTool(name, args) {
  try {
    const res = await fetch(MCALL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
    });
    const json = await res.json();
    if (!json?.ok) return null;
    return typeof json.data === 'string' ? safeParse(json.data) : json.data;
  } catch {
    return null;
  }
}

/**
 * 从 DeepFusion 后端补全元数据：名称（search）+ 行业/概念（stock_concepts）
 * 这些是 stock_quote 不返回、需独立工具获取的真实字段。
 */
export async function fetchMeta(code) {
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

/** 带行情的持仓项 */
export async function enrichWatch(w) {
  const q = await fetchQuote(w.code);
  if (!q) return { ...w, quote: null, meta: null };
  const [meta, intraday] = await Promise.all([
    fetchMeta(w.code),
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
export function analyzePortfolio(holdings, enrichedMap) {
  const positions = holdings.map((w) => {
    const q = enrichedMap.get(w.code)?.quote;
    const last = q?.lastPrice ?? w.cost ?? 0;
    const shares = w.shares ?? 0;
    const marketValue = last * shares;
    const costValue = (w.cost ?? 0) * shares;
    const profit = marketValue - costValue;
    const profitPct = costValue > 0 ? (profit / costValue) * 100 : 0;
    const dayProfit = (q?.changePct ?? 0) / 100 * marketValue;
    return { ...w, last, marketValue, costValue, profit, profitPct, dayProfit };
  });

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalCost = positions.reduce((s, p) => s + p.costValue, 0);
  const totalProfit = totalMarketValue - totalCost;
  const totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const dayProfit = positions.reduce((s, p) => s + p.dayProfit, 0);

  positions.forEach((p) => (p.weight = totalMarketValue > 0 ? (p.marketValue / totalMarketValue) * 100 : 0));

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
