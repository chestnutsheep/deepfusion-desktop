import { mcp } from './mcp';
import { readLocalValue, writeLocalValue } from '../shared/storage';

const STORAGE_KEY = 'deepfusion.desktop.watchlist';
const CODE_RE = /^\d{6}$/;
const INITIAL_REPORT_WATCHES = [
  { code: '600519', name: '贵州茅台', reason: '来自 2026-08-24 优质股日报候选，复盘观察风格动量与回撤后的形态变化', tags: ['日报导入', '形态'] },
  { code: '000858', name: '五粮液', reason: '来自 2026-08-24 优质股日报候选，复盘观察量价节奏与趋势修复', tags: ['日报导入', '形态'] },
  { code: '600036', name: '招商银行', reason: '来自 2026-08-24 优质股日报候选，复盘观察回撤后的支撑有效性', tags: ['日报导入', '趋势'] },
  { code: '600900', name: '长江电力', reason: '来自 2026-08-24 优质股日报候选，复盘观察趋势一致性与低吸形态', tags: ['日报导入', '低吸'] },
  { code: '600869', name: '远东股份', reason: '电网设备概念，未来概念基础设备覆盖广；老股、筹码峰漂亮且上方套牢峰少。缺点是 PE 偏高，近期经历大涨大跌，连跌原因待调查；复盘观察下探 MA20 后是否企稳，以及是否出现蓄势反弹/反抽迹象。', tags: ['手动录入', '形态', '电网设备'] },
  { code: '600977', name: '中国电影', reason: '止跌企稳后初步出现上行势头；需区分试探抛压与小碎步上行。记录量比 1.56、换手 1.70%，复盘观察底部筹码锁定与对倒做数据两种可能。', tags: ['手动录入', '形态', '量价'] },
];

export function loadWatchlist() {
  const raw = readLocalValue(STORAGE_KEY, '');
  if (!raw) {
    const seeded = INITIAL_REPORT_WATCHES.map((item, index) => createWatch({ ...item, source: '日报导入', id: `report-seed-${index}` }));
    saveWatchlist(seeded);
    return seeded;
  }
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    const userSeeds = INITIAL_REPORT_WATCHES.filter((item) => ['600869', '600977'].includes(item.code));
    const missing = userSeeds.filter((item) => !rows.some((row) => row.code === item.code));
    if (!missing.length) return rows;
    const next = [...rows, ...missing.map((item) => createWatch({ ...item, source: '手动录入', id: `user-seed-${item.code}` }))];
    saveWatchlist(next);
    return next;
  } catch {
    return [];
  }
}

export function saveWatchlist(rows) {
  writeLocalValue(STORAGE_KEY, JSON.stringify(rows));
}

export function inferMarket(code) {
  if (code.startsWith('6') || code.startsWith('9')) return 'sh';
  if (code.startsWith('4') || code.startsWith('8')) return 'bj';
  return 'sz';
}

export function normalizeCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

export function validateWatch(code, reason) {
  if (!CODE_RE.test(code)) return '请输入 6 位股票代码';
  if (!String(reason || '').trim()) return '请填写简略关注原因';
  return '';
}

function parseQuote(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export async function refreshWatch(row) {
  try {
    const raw = await mcp.call('stock_quote', { symbol: row.code, market: row.market || inferMarket(row.code) });
    const quote = parseQuote(raw);
    if (!quote || quote.error || quote.price == null) {
      return { ...row, quoteError: quote?.error || '行情暂无数据', checkedAt: new Date().toISOString() };
    }
    const changePct = Number(quote.change_pct);
    const trigger = Number.isFinite(changePct) && Math.abs(changePct) >= 3;
    return {
      ...row,
      name: quote.name || row.name || row.code,
      lastPrice: Number(quote.price),
      changePct: Number.isFinite(changePct) ? changePct : null,
      prevClose: quote.prev_close == null ? null : Number(quote.prev_close),
      source: quote.source || 'MCP行情',
      quoteError: '',
      checkedAt: new Date().toISOString(),
      signal: trigger ? `日内波动 ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%，请复核形态` : '未触发异动阈值',
      triggered: trigger,
    };
  } catch (error) {
    return { ...row, quoteError: error?.message || '行情服务不可用', checkedAt: new Date().toISOString() };
  }
}

export async function refreshWatchlist(rows) {
  return Promise.all(rows.map(refreshWatch));
}

export function createWatch({ code, reason, tags = [], name = '', source = '手动录入' }) {
  const now = new Date().toISOString();
  return {
    id: `${code}-${Date.now()}`,
    code,
    market: inferMarket(code),
    name: name || code,
    reason: reason.trim(),
    tags,
    source,
    status: '关注中',
    createdAt: now,
    checkedAt: '',
    lastPrice: null,
    changePct: null,
    quoteError: '',
    signal: '等待行情检查',
    triggered: false,
  };
}
