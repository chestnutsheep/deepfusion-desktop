import { mcpTool, parseHistCsv } from './watchlist';

/** 期货默认关注品种（中文名，对应后端 FUTURES_SYMBOLS） */
export const DEFAULT_FUTURES = [
  '原油', '沪金', '沪银', '沪铜', '碳酸锂', '多晶硅',
  '铁矿石', '螺纹钢', '焦炭', '豆粕', '棕榈油', 'PTA',
];

const KEY = 'deepfusion.futures.watch.v1';

export function loadFuturesWatch() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) return a; }
  } catch {}
  return [...DEFAULT_FUTURES];
}

export function saveFuturesWatch(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30))); } catch {}
}

/** 拉取单个品种的主力合约日 K 序列 */
export async function fetchFuturesK(symbol, limit = 60) {
  try {
    const text = await mcpTool('futures_prices', { symbol, limit });
    const series = parseHistCsv(text, 'K线数据') || parseHistCsv(text, '日线');
    if (!series || series.length < 2) return null;
    return series.slice(-limit).map((d) => ({ time: d.time, price: d.price }));
  } catch {
    return null;
  }
}

/** 批量拉取多个品种的最新价与涨跌（用于行情表） */
export async function fetchFuturesQuotes(symbols) {
  const out = [];
  for (const sym of symbols) {
    const k = await fetchFuturesK(sym, 2);
    if (!k || k.length < 2) { out.push({ symbol: sym, last: null, changePct: null }); continue; }
    const last = k[k.length - 1].price;
    const prev = k[k.length - 2].price;
    const changePct = prev ? ((last - prev) / prev) * 100 : 0;
    out.push({ symbol: sym, last, changePct });
  }
  return out;
}

/** 期权波动率指数 IVIX 序列 */
export async function fetchIvix(limit = 60) {
  try {
    const text = await mcpTool('option_ivix', { limit });
    const series = parseHistCsv(text, 'K线数据') || parseHistCsv(text, '日线');
    if (!series || series.length < 2) return null;
    return series.slice(-limit).map((d) => ({ time: d.time, price: d.price }));
  } catch {
    return null;
  }
}
