import { mcp } from './mcp';

export const REPORT_KINDS = [
  ['premarket', '盘前简报'],
  ['noonnews', '午间新闻驱动'],
  ['qualitystock', '优质股推送'],
  ['dailyreview', '每日复盘'],
];

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function textValue(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join('；');
  if (typeof value === 'object') return value.summary || value.overview || value.title || value.name || fallback;
  return fallback;
}

export function reportLabel(type) {
  return REPORT_KINDS.find(([key]) => key === type)?.[1] || type;
}

export function normalizeReport(item, type) {
  const payload = parsePayload(item?.payload);
  const stocks = Array.isArray(payload.stocks) ? payload.stocks : [];
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const items = Array.isArray(payload.items) ? payload.items : [];
  const symbols = Array.isArray(payload.symbols) ? payload.symbols : [];
  const label = reportLabel(type);
  const title = type === 'premarket'
    ? textValue(payload.mainline_view?.title || payload.market_sentiment, `${label} · ${payload.trade_date || payload.date || item?.date || '—'}`)
    : type === 'noonnews'
      ? textValue(payload.headline, `${label} · ${payload.date || item?.date || '—'}`)
      : type === 'qualitystock'
        ? `${label} · ${stocks.length} 只候选`
        : `${label} · ${symbols.length || '市场'} 项观察`;
  const summary = type === 'premarket'
    ? textValue(payload.overview?.sentiment || payload.overview?.overseas_summary || payload.mainline_view?.summary || payload.risk_hint || payload.data_caveat, '海外、政策、行业与公告催化已归档。')
    : type === 'noonnews'
      ? textValue(payload.summary || items[0]?.summary || items[0]?.logic || candidates[0]?.reason, `${items.length || candidates.length} 条午间催化已归档。`)
      : type === 'qualitystock'
        ? textValue(payload.summary, `${stocks.filter((stock) => stock.selected !== false).length} 只标的通过多维筛选。`)
        : textValue(payload.overview || payload['今日复盘结论'] || payload['📌 今日复盘结论'], `${symbols.length} 项标的与市场信号已完成复盘。`);
  return {
    id: `${type}:${item?.date || item?.created_at || Date.now()}`,
    type: label,
    key: type,
    date: item?.date || '—',
    createdAt: item?.created_at || '—',
    unread: false,
    status: item?.payload ? '已入库' : '暂无数据',
    title,
    summary,
    payload,
  };
}

export async function fetchReportHistory(type, limit = 8) {
  const data = parsePayload(await mcp.call('report_history', { rtype: type, limit }));
  return (data.history || []).map((item) => normalizeReport(item, type));
}

export async function fetchLatestReports(limit = 8) {
  const groups = await Promise.all(REPORT_KINDS.map(async ([type]) => {
    try {
      return await fetchReportHistory(type, limit);
    } catch (error) {
      console.warn(`[reports] ${type} 读取失败`, error);
      return [];
    }
  }));
  return groups.flat().sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`));
}

export async function fetchReportHealth(limit = 8) {
  const results = await Promise.all(REPORT_KINDS.map(async ([type, label]) => {
    try {
      const data = parsePayload(await mcp.call('report_history', { rtype: type, limit }));
      const history = Array.isArray(data.history) ? data.history : [];
      return { type, label, count: history.length, latestDate: history[0]?.date || '' };
    } catch (error) {
      return { type, label, count: 0, latestDate: '', error: error?.message || '读取失败' };
    }
  }));
  const failed = results.filter((row) => row.error);
  const count = results.reduce((total, row) => total + row.count, 0);
  return {
    state: failed.length === results.length ? 'error' : count === 0 ? 'empty' : 'ready',
    message: failed.length === results.length
      ? '报告服务不可用'
      : count === 0
        ? '服务已连接，但数据库暂无报告'
        : `报告数据已接入 · ${count} 份可追溯记录`,
    rows: results,
  };
}
