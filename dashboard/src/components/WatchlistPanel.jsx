import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzePortfolio,
  createWatch,
  enrichWatch,
  fetchDailyK,
  getCachedQuote,
  loadWatchlist,
  loadWatchlistSync,
  loadBackup,
  mcpTool,
  resolveType,
  saveWatchlist,
  splitPortfolio,
  validateWatch,
} from '../services/watchlist';
import { setPortfolio } from '../shared/portfolioStore';
import { applyOps } from '../services/watchlist';
import PositionOpsModal from './PositionOpsModal';

const CASH_KEY = 'deepfusion.availableCash.v1';
const loadCash = () => { try { return Number(localStorage.getItem(CASH_KEY)) || 0; } catch { return 0; } };
const saveCash = (v) => { try { localStorage.setItem(CASH_KEY, String(v)); } catch {} };

const TAGS = ['持仓', '形态', '突破', '低吸', '趋势', '异动'];
const VIEWS = [
  { id: 'cards', label: '卡片' },
  { id: 'list', label: '列表' },
  { id: 'big', label: '大卡' },
  { id: 'cluster', label: '簇视图' },
];

/**
 * 概念相关性聚类（纯前端，数据源 = 已有 sector / concepts，无需后端）。
 * 思路：把每只标的的特征集合 = {sector} ∪ {concepts...}，用 Jaccard 相似度
 * 度量两两关联度；sector 命中额外加权。再用并查集把关联度 > 0 的标的归到一个簇。
 * 输出：[{ id, hue, members: [{ w, sim }] }]，sim 为组内相对锚点的关联度（0–1）。
 * 同簇同色相、组内深浅由 sim 决定；簇间用色相区分。
 */
function buildClusters(rows) {
  const feats = rows.map((w) => {
    const set = new Set();
    if (w.sector) set.add(`S:${w.sector}`);
    (w.concepts || []).forEach((c) => set.add(`C:${c}`));
    return set;
  });
  const n = rows.length;
  if (n === 0) return [];
  const simOf = (i, j) => {
    const a = feats[i], b = feats[j];
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const k of a) if (b.has(k)) inter += 1;
    const uni = a.size + b.size - inter;
    if (uni === 0) return 0;
    let jac = inter / uni;
    // sector 完全命中额外加权（行业归属是最强相关信号）
    if (rows[i].sector && rows[i].sector === rows[j].sector) jac = Math.min(1, jac + 0.25);
    return jac;
  };
  // 并查集归簇
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (simOf(i, j) > 0) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  const list = [...groups.values()];
  // 色相分配：golden-ratio 步进，保证簇间区分度
  const GOLDEN = 137.508;
  return list.map((idxs, gi) => {
    // 锚点 = 簇内特征最丰富的标的（集合最大），作为组内基准
    const anchor = idxs.reduce((best, i) => (feats[i].size > feats[best].size ? i : best), idxs[0]);
    const members = idxs.map((i) => ({
      w: rows[i],
      sim: i === anchor ? 1 : simOf(anchor, i),
    }));
    // 锚点排前
    members.sort((a, b) => b.sim - a.sim);
    const hue = (gi * GOLDEN) % 360;
    return { id: gi, hue, members };
  });
}

const fmt = (n, d = 2) =>
  n == null || isNaN(n) ? '—' : n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => (n == null || isNaN(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

/** 簇色：同色相 hue，明度/饱和度随关联度 sim（0–1）变化——关联度越高越深越亮 */
const clusterColor = (hue, sim) => {
  const s = 38 + sim * 34;          // 38%–72%
  const l = 66 - sim * 26;          // 66%–40%（sim 高 → 更深）
  return `hsl(${hue.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
};
const clusterColorSoft = (hue, sim) => {
  const s = 38 + sim * 34;
  const l = 66 - sim * 26;
  return `hsla(${hue.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}% / .18)`;
};

/** 分时走势 sparkline：未开盘/无数据时返回 null */
function Sparkline({ data = [], color }) {
  if (!data || data.length < 2) return null;
  const prices = data.map((d) => d.price).filter((p) => typeof p === 'number' && !Number.isNaN(p));
  if (prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const width = 160;
  const height = 36;
  const padding = 2;
  const usableH = height - padding * 2;
  const step = width / (prices.length - 1);
  const points = prices.map((p, i) => {
    const x = i * step;
    const y = padding + usableH - ((p - min) / range) * usableH;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 大卡背景日 K 衬垫：面积图，半透明置于底层 */
function DailyKBackground({ data = [], color, colorSoft }) {
  if (!data || data.length < 2) return null;
  const prices = data.map((d) => d.price).filter((p) => typeof p === 'number' && !Number.isNaN(p));
  if (prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const W = 300, H = 160, pad = 4;
  const usableH = H - pad * 2;
  const step = W / (prices.length - 1);
  const pts = prices.map((p, i) => {
    const x = i * step;
    const y = pad + usableH - ((p - min) / range) * usableH;
    return [x, y];
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  const gid = `kbg-${color ? color.replace(/[^a-z0-9]/gi, '') : 'd'}`;
  return (
    <svg className="k-bg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: colorSoft }} />
          <stop offset="100%" style={{ stopColor: colorSoft, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.7" />
    </svg>
  );
}

export default function WatchlistPanel({ extraClass = '', running = true }) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);

  // 异步初始化：先读 WebView 内存，空则从磁盘备份恢复（防清缓存丢失）
  useEffect(() => {
    loadWatchlist().then((list) => { setRows(list); setReady(true); });
  }, []);

  // 只在「数据就绪」且「后端在线」时刷新一次，绝不自动轮询。
  // 去掉 30s setInterval：轮询会在后端慢/挂时堆积挂起 Promise，曾导致 WebKit OOM 卡死。
  // 后续刷新由用户手动操作（如切回面板/点击刷新）或后端状态从 false→true 时触发。
  useEffect(() => {
    if (!ready || rows.length === 0 || !running) return;
    refresh();
  }, [ready, rows.length, running]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [cost, setCost] = useState('');
  const [shares, setShares] = useState('');
  const [sector, setSector] = useState('');
  const [tag, setTag] = useState('持仓');
  const [entryType, setEntryType] = useState('stock');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quoted, setQuoted] = useState(() => {
    // 首屏先从本地行情缓存填充，立即显示收盘价/涨跌，避免空白等待
    const init = new Map();
    for (const r of loadWatchlistSync()) {
      const q = getCachedQuote(r.code);
      if (q) init.set(r.code, { quote: q, meta: null, name: q.name || '' });
    }
    return init;
  });
  const [view, setView] = useState('cards');
  const [availableCash, setAvailableCash] = useState(loadCash);
  const [dailyK, setDailyK] = useState(() => new Map());

  // 技术分析详情面板（点击卡片/列表行打开）
  const [tech, setTech] = useState(null); // { code, name, data, loading }

  // 持仓操作跟踪弹窗（点击「操作」打开）
  const [opsItem, setOpsItem] = useState(null);

  const inferMarketLocal = (code) => {
    if (/^(60|68|9)/.test(code)) return 'sh';
    if (/^(00|30)/.test(code)) return 'sz';
    if (/^8/.test(code)) return 'bj';
    return 'sh';
  };

  const openTech = async (w) => {
    setTech({ code: w.code, name: w.name || w.code, data: null, loading: true });
    try {
      const res = await mcpTool('stock_tech_indicators', {
        symbol: w.code,
        market: inferMarketLocal(w.code),
        period: 'daily',
        return_series: true,
        window: 60,
      });
      setTech((prev) => (prev && prev.code === w.code ? { ...prev, data: res, loading: false } : prev));
    } catch {
      setTech((prev) => (prev && prev.code === w.code ? { ...prev, data: null, loading: false, error: true } : prev));
    }
  };
  const closeTech = () => setTech(null);

  const { holdings, watches } = useMemo(() => splitPortfolio(rows), [rows]);
  const analysis = useMemo(() => analyzePortfolio(holdings, quoted, availableCash), [holdings, quoted, availableCash]);
  const clusters = useMemo(() => buildClusters(rows), [rows]);

  const update = (next) => { setRows(next); saveWatchlist(next); };

  const submit = (event) => {
    event.preventDefault();
    const normalized = code.trim();
    const message = validateWatch(normalized, reason);
    if (message) { setError(message); return; }
    const payload = { code: normalized, name, reason, tag, cost, shares, sector, type: entryType };
    const duplicate = rows.find((r) => r.code === normalized);
    if (duplicate) {
      update(rows.map((r) => (r.code === normalized
        ? { ...r, name: name.trim(), reason: reason.trim(), tag, cost: cost || null, shares: shares || null, sector: sector.trim(), type: entryType }
        : r)));
    } else {
      update([createWatch(payload), ...rows]);
    }
    setCode(''); setName(''); setReason(''); setCost(''); setShares(''); setSector(''); setEntryType('stock'); setError('');
  };

  // 刷新并发锁：避免 noticer 事件高频触发时叠加多轮 Promise.all，导致请求风暴打满主线程
  const refreshingRef = useRef(false);

  const refresh = async () => {
    if (refreshingRef.current) return; // 上一轮未完成则跳过，不叠加
    refreshingRef.current = true;
    setBusy(true);
    try {
    // 并发拉取持仓行情（原串行 await 逐只 → N×T 延迟，改为 Promise.all 一次性发出）
    const enrichedRows = await Promise.all(
      rows.map(async (w) => {
        const e = await enrichWatch(w);
        return { code: w.code, e };
      })
    );
    const enriched = new Map(enrichedRows.map((x) => [x.code, x.e]));
    update((prev) => prev.map((r) => {
      const found = enrichedRows.find((x) => x.code === r.code);
      if (!found) return r;
      const { e } = found;
      return {
        ...r,
        name: r.name || e.name || '',
        sector: r.sector || e.sector || '',
        concepts: r.concepts?.length ? r.concepts : (e.concepts || []),
      };
    }));
    setQuoted(enriched);
    // 大卡视图所需的日 K 走势（背景衬垫），并发拉取避免阻塞主线
    await Promise.all(
      rows.map(async (w) => {
        const k = await fetchDailyK(w.code, 60);
        if (k) setDailyK((prev) => new Map(prev).set(w.code, k));
      })
    );
    // 把总持仓市值与可用资金写进全局 store，供资产配置器联动
    setPortfolio({ equity: analysis.totalMarketValue, cash: availableCash });
    } catch (err) {
      // 后端不可用时 enrichWatch/fetchDailyK 会抛错，静默跳过，不让 Promise 风暴拖垮 UI
      console.warn('[WatchlistPanel] refresh skipped (backend likely unavailable):', err?.message || err);
    } finally {
      setBusy(false);
      refreshingRef.current = false; // 无论成败都释放并发锁
    }
  };

  const remove = (code) => update(rows.filter((r) => r.code !== code));

  // 导出持仓到磁盘备份（~/.config/deepfusion/watchlist.json）
  const onExport = async () => {
    try {
      const raw = await loadBackup();
      if (raw) {
        // 已有备份文件则不动，仅提示；这里直接覆盖为当前列表
      }
      await saveWatchlist(rows); // saveWatchlist 内部已 persistBackup
      setError('');
    } catch (e) {
      setError('导出失败：' + e.message);
    }
  };

  // 从磁盘备份恢复（覆盖当前列表）
  const onImport = async () => {
    try {
      const backup = await loadBackup();
      if (!backup || !backup.length) { setError('没有找到备份文件'); return; }
      update(backup);
      setError('');
    } catch (e) {
      setError('导入失败：' + e.message);
    }
  };

  const renderRow = (w, pos, live, intraday, big = false) => {
    const trendColor = live?.changePct > 0 ? '#ef5b5b' : live?.changePct < 0 ? '#50b889' : '#aeb8aa';
  const trendColorSoft = live?.changePct > 0 ? 'rgba(239,91,91,.22)' : live?.changePct < 0 ? 'rgba(80,184,137,.22)' : 'rgba(174,184,170,.2)';
    const dailySeries = dailyK.get(w.code) || [];
    const t = resolveType(w);
    const typeLabel = t === 'stock' ? '个股' : t === 'etf' ? 'ETF' : '基金';
    const el = (
      <article
        className={`watch-row type-${t}${pos ? ' holding' : ''}${big ? ' big' : ''}`}
        key={w.code}
        role="button"
        tabIndex={0}
        title="点击查看技术分析"
        onClick={() => openTech(w)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTech(w); } }}
      >
        <DailyKBackground data={dailySeries} color={trendColor} colorSoft={trendColorSoft} />
        <div className="watch-main">
          <strong>{w.name || w.code}</strong>
          {w.name && <span className="watch-code">{w.code}</span>}
          <span className={`watch-type-badge ${t}`}>{typeLabel}</span>
          {w.sector && <span className="watch-sector">{w.sector}</span>}
          {!big && w.tag && <span className="watch-tagmini">{w.tag}</span>}
        </div>
        {w.concepts?.length > 0 && (
          <div className="watch-concepts">
            {w.concepts.map((c) => <span className="chip" key={c}>{c}</span>)}
          </div>
        )}
        {w.reason && <div className="watch-reason">{w.reason}</div>}
        <div className="watch-quote">
          <b className={`q-price ${cls(live?.changePct)}`}>{live?.lastPrice != null ? live.lastPrice.toFixed(2) : '—'}</b>
          <span className={`q-pct ${cls(live?.changePct)}`}>{pct(live?.changePct)}</span>
        </div>
        <Sparkline data={intraday} color={trendColor} />
        {pos && (
          <div className={`hold-metrics${big ? ' big' : ''}`}>
            <div className="hold-stats">
              <div><span>市值</span><b>{fmt(pos.marketValue)}</b></div>
              <div><span>盈亏</span><b className={cls(pos.profit)}>{pos.profit >= 0 ? '+' : ''}{fmt(pos.profit)}</b></div>
              <div><span>收益率</span><b className={cls(pos.profit)}>{pct(pos.profitPct)}</b></div>
            </div>
            <div className="hold-weight">
              <div className="weight-label">
                <span>仓位</span>
                <b>{pos.weight.toFixed(1)}%</b>
              </div>
              <div className="weight-track">
                <div className="weight-fill" style={{ width: `${Math.min(Math.max(pos.weight, 0), 100)}%` }} />
              </div>
            </div>
          </div>
        )}
        <div className="watch-actions">
          {pos && (
            <button className="lr-ops-btn" onClick={(e) => { e.stopPropagation(); setOpsItem(w); }}>操作跟踪</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); remove(w.code); }}>删除</button>
        </div>
      </article>
    );
    return el;
  };

  return (
    <section className={`watchlist-panel panel${extraClass ? ' ' + extraClass : ''}`} aria-labelledby="watchlist-title">
      <div className="panel-head">
        <div>
          <p className="eyebrow">PORTFOLIO TRACKER / LOCAL</p>
          <h2 id="watchlist-title">持仓追踪</h2>
        </div>
        <div className="wl-head-actions">
          <div className="view-switch" role="tablist" aria-label="展示方式">
            {VIEWS.map((v) => (
              <button key={v.id} role="tab" aria-selected={view === v.id}
                className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
          <button onClick={refresh} disabled={busy || !ready}>{busy ? '刷新中…' : '刷新行情 ↻'}</button>
          <button onClick={onExport}>备份</button>
          <button onClick={onImport}>恢复</button>
        </div>
      </div>
      <p className="watchlist-intro">记录持仓成本与股数，面板按实时行情计算盈亏与占比。数据存本地，不上传。</p>

      {holdings.length > 0 && (
        <div className="portfolio-summary">
          <div className="ps-cell">
            <span className="ps-label">总市值</span>
            <b>{fmt(analysis.totalMarketValue)}</b>
          </div>
          <div className="ps-cell">
            <span className="ps-label">累计盈亏</span>
            <b className={cls(analysis.totalProfit)}>{pct(analysis.totalProfitPct)}</b>
            <small className={cls(analysis.totalProfit)}>{analysis.totalProfit >= 0 ? '+' : ''}{fmt(analysis.totalProfit)}</small>
          </div>
          <div className="ps-cell">
            <span className="ps-label">当日浮动</span>
            <b className={cls(analysis.dayProfit)}>{analysis.dayProfit >= 0 ? '+' : ''}{fmt(analysis.dayProfit)}</b>
          </div>
        </div>
      )}

        <div className="cash-bar">
          <label className="cash-input">
            <span>可用资金</span>
            <input
              type="number"
              min="0"
              placeholder="如 500000"
              value={availableCash || ''}
              onChange={(e) => { const v = Number(e.target.value) || 0; setAvailableCash(v); saveCash(v); }}
            />
          </label>
          <div className="cash-stat">
            <span>账户总览</span>
            <b>{fmt(analysis.totalMarketValue + availableCash)}</b>
          </div>
          <div className="cash-stat">
            <span>整体仓位</span>
            <b className={analysis.totalMarketValue / (analysis.totalMarketValue + availableCash) > 0.8 ? 'down' : 'up'}>
              {((analysis.totalMarketValue / (analysis.totalMarketValue + availableCash)) * 100 || 0).toFixed(1)}%
            </b>
          </div>
        </div>

      {analysis.tags.length > 0 && (
        <div className="portfolio-tags">
          {analysis.tags.map((t) => (
            <div className="pt-bar" key={t.tag}>
              <span className="pt-name">{t.tag}</span>
              <div className="pt-track"><div className="pt-fill" style={{ width: `${t.weight}%` }} /></div>
              <span className="pt-pct">{t.weight.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      <form className="watchlist-form" onSubmit={submit}>
        <div className="entry-type">
          <button type="button" className={entryType === 'stock' ? 'active' : ''} onClick={() => setEntryType('stock')}>个股</button>
          <button type="button" className={entryType === 'fund' ? 'active' : ''} onClick={() => setEntryType('fund')}>基金 / ETF</button>
        </div>
        <label>代码<input value={code} onChange={(e) => setCode(e.target.value.replace(/[^\dA-Za-z]/g, '').slice(0, 6))} inputMode="text" maxLength={6} placeholder={entryType === 'stock' ? '600519' : '510300'} /></label>
        <label>名称<input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder={entryType === 'fund' ? '沪深300ETF（可不填）' : '茅台（可不填）'} /></label>
        <label>原因<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={80} placeholder="日线回踩支撑" /></label>
        <label>分类<input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={20} placeholder={entryType === 'fund' ? '宽基 / 行业 / 债基 …' : '白酒 / 半导体 …'} /></label>
        <div className="cost-row">
          <label>{entryType === 'fund' ? '单位净值' : '成本价'}<input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="可选" /></label>
          <label>{entryType === 'fund' ? '份额' : '股数'}<input value={shares} onChange={(e) => setShares(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="可选" /></label>
        </div>
        <div className="watchlist-tags" aria-label="标签">
          {TAGS.map((t) => (
            <button type="button" className={tag === t ? 'selected' : ''} key={t} onClick={() => setTag(t)}>{t}</button>
          ))}
        </div>
        <button className="watchlist-submit" type="submit">加入 <span>＋</span></button>
      </form>

      {error && <div className="watchlist-error" role="alert">{error}</div>}

      <div className={`watchlist-list view-${view}`}>
        {rows.length === 0 && <div className="watchlist-empty">还没有标的。填代码 + 成本/股数即可开始追踪持仓盈亏。</div>}
        {view === 'list' ? (
          <>
            <div className="watch-listhead">
              <span className="lr-name">名称 / 代码</span>
              <span className="lr-sector">行业</span>
              <span className="lr-concepts">概念</span>
              <span className="lr-pct">涨跌幅</span>
              <span className="lr-price">现价</span>
              <span className="lr-profit">盈亏</span>
              <span className="lr-act" />
            </div>
            {[...holdings, ...watches].map((w) => {
              const pos = analysis.positions.find((p) => p.code === w.code);
              const live = quoted.get(w.code)?.quote;
              return (
                <div
                  className="watch-listrow"
                  key={w.code}
                  role="button"
                  tabIndex={0}
                  title="点击查看技术分析"
                  onClick={() => openTech(w)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTech(w); } }}
                >
                  <span className="lr-name"><b>{w.name || w.code}</b>{w.name && <i>{w.code}</i>}</span>
                  <span className="lr-sector">{w.sector || '—'}</span>
                  <span className="lr-concepts">{w.concepts?.length > 0 ? w.concepts.join(' · ') : '—'}</span>
                  <span className={`lr-pct ${cls(live?.changePct)}`}>{pct(live?.changePct)}</span>
                  <span className="lr-price">{live?.lastPrice != null ? live.lastPrice.toFixed(2) : '—'}</span>
                  {pos && <span className={`lr-profit ${cls(pos.profit)}`}>{pos.profit >= 0 ? '+' : ''}{fmt(pos.profit)}</span>}
                  <span className="lr-act">
                    {w.type === 'hold' && (
                      <button
                        className="lr-ops-btn"
                        title="操作跟踪（做T/加减仓/分红）"
                        onClick={(e) => { e.stopPropagation(); setOpsItem(w); }}
                      >操作</button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); remove(w.code); }}>✕</button>
                  </span>
                </div>
              );
            })}
          </>
        ) : view === 'cluster' ? (
          <ClusterView clusters={clusters} analysis={analysis} quoted={quoted} onOpen={openTech} onRemove={remove} />
        ) : (
          <>
            {holdings.map((w) => {
              const item = quoted.get(w.code) || {};
              return renderRow(w, analysis.positions.find((p) => p.code === w.code), item.quote, item.intraday, view === 'big');
            })}
            {watches.map((w) => {
              const item = quoted.get(w.code) || {};
              return renderRow(w, null, item.quote, item.intraday, view === 'big');
            })}
          </>
        )}
      </div>
      {tech && (
        <TechDetailModal
          code={tech.code}
          name={tech.name}
          data={tech.data}
          loading={tech.loading}
          error={tech.error}
          onClose={closeTech}
        />
      )}
      {opsItem && (
        <PositionOpsModal
          item={opsItem}
          onClose={() => setOpsItem(null)}
          onCloseout={(code, proceeds) => {
            setAvailableCash((prev) => { const v = Math.round((prev + proceeds) * 100) / 100; saveCash(v); return v; });
            setOpsItem(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * 簇视图：把本地持仓/关注按 sector + concepts 的相关性聚类成组。
 * 同组同色相、组内深浅由关联度决定；组间用色相区分。不依赖后端。
 */
function ClusterView({ clusters, analysis, quoted, onOpen, onRemove }) {
  if (!clusters.length) {
    return <div className="watchlist-empty">还没有标的。填代码 + 成本/股数即可开始追踪持仓盈亏。</div>;
  }
  return (
    <div className="cluster-view">
      <p className="cluster-hint">按行业 / 概念相关性自动聚类 · 同组同色相，深浅表示与组内锚点的关联强度 · 数据源为本地 tags / concepts</p>
      {clusters.map((grp) => {
        const barColor = clusterColor(grp.hue, 1);
        return (
          <section className="cluster-group" key={grp.id}>
            <header className="cluster-group-head" style={{ borderColor: barColor }}>
              <span className="cluster-swatch" style={{ background: barColor }} />
              <span className="cluster-group-name">
                {grp.members[0].w.sector || (grp.members[0].w.concepts?.[0] || '混合')}
              </span>
              <span className="cluster-count">{grp.members.length} 只</span>
            </header>
            <div className="cluster-grid">
              {grp.members.map(({ w, sim }) => {
                const t = resolveType(w);
                const live = quoted.get(w.code)?.quote;
                const pos = analysis.positions.find((p) => p.code === w.code);
                const c = clusterColor(grp.hue, sim);
                const cSoft = clusterColorSoft(grp.hue, sim);
                return (
                  <article
                    key={w.code}
                    className={`cluster-card type-${t}`}
                    style={{ borderLeftColor: c, background: cSoft, boxShadow: `inset 3px 0 0 ${c}` }}
                    role="button"
                    tabIndex={0}
                    title="点击查看技术分析"
                    onClick={() => onOpen(w)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(w); } }}
                  >
                    <div className="cc-top">
                      <strong>{w.name || w.code}</strong>
                      {w.name && <span className="cc-code">{w.code}</span>}
                      <span className="cc-sim" title="与组内锚点的关联度">{Math.round(sim * 100)}%</span>
                    </div>
                    <div className="cc-meta">
                      {w.sector && <span className="cc-sector">{w.sector}</span>}
                      {w.concepts?.slice(0, 4).map((cpt) => <span className="chip" key={cpt}>{cpt}</span>)}
                    </div>
                    <div className="cc-foot">
                      <span className={`cc-pct ${cls(live?.changePct)}`}>{pct(live?.changePct)}</span>
                      {pos && <span className={`cc-profit ${cls(pos.profit)}`}>{pos.profit >= 0 ? '+' : ''}{fmt(pos.profit)}</span>}
                      <button className="cc-del" onClick={(e) => { e.stopPropagation(); onRemove(w.code); }}>✕</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * 技术分析详情面板：点击持仓卡片/列表行打开。
 * 拉取 server 的 stock_tech_indicators（最新标量 + 60 期序列），
 * 重点呈现用户的实战框架：MACD 加速度/动能衰减、量五等级、波动率/乖离等。
 */
function TechDetailModal({ code, name, data, loading, error, onClose }) {
  // ESC 关闭
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // server 返回结构：return_series=true → { symbol, period, series:[{列:值}, ...] }
  // 最新一期为 series 末项；各指标序列需从 series 每行按列提取
  const seriesArr = data?.series && Array.isArray(data.series) ? data.series : [];
  const latest = seriesArr.length ? seriesArr[seriesArr.length - 1] : (data || {});
  const seriesOf = (col) => seriesArr.map((r) => r[col]).filter((v) => v !== undefined && v !== null);
  const series = {
    MACD: seriesOf('MACD'),
    MACD_ACCEL: seriesOf('MACD_ACCEL'),
    RSI: seriesOf('RSI'),
    'KDJ.J': seriesOf('KDJ.J'),
    CCI: seriesOf('CCI'),
  };

  // 指标卡片：标签 + 数值 + 语义着色
  const Item = ({ label, value, tone = 'n', hint }) => (
    <div className={`td-item td-${tone}`}>
      <span className="td-label">{label}</span>
      <b className="td-value">{value}</b>
      {hint && <span className="td-hint">{hint}</span>}
    </div>
  );

  // 把序列画成迷你走势（MACD 加速度、RSI、KDJ 等）
  const MiniChart = ({ arr, color = '#d6df9e', zero = false }) => {
    if (!arr || arr.length < 2) return <div className="td-chart empty">无序列数据</div>;
    const vals = arr.map((v) => (typeof v === 'number' ? v : Number(v))).filter((v) => !Number.isNaN(v));
    if (vals.length < 2) return <div className="td-chart empty">无序列数据</div>;
    const min = Math.min(...vals, zero ? 0 : Math.min(...vals));
    const max = Math.max(...vals, zero ? 0 : Math.max(...vals));
    const range = max - min || 1;
    const W = 280, H = 64, pad = 4;
    const step = (W - pad * 2) / (vals.length - 1);
    const pts = vals.map((v, i) => `${pad + i * step},${pad + (H - pad * 2) - ((v - min) / range) * (H - pad * 2)}`).join(' ');
    return (
      <svg className="td-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {zero && <line x1={pad} y1={pad + (H - pad * 2) - ((0 - min) / range) * (H - pad * 2)} x2={W - pad} y2={pad + (H - pad * 2) - ((0 - min) / range) * (H - pad * 2)} stroke="rgba(255,255,255,.18)" strokeWidth="1" />}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };

  // 信号判读（基于用户实战框架）
  const momentumFade = latest.MACD_MOMENTUM_FADE;
  const accelPeak = latest.MACD_ACCEL_PEAK;
  const volLevel = latest.VOL_LEVEL;
  const weakUp = latest.PRICE_UP_VOL_WEAK;

  // 五星卡：超卖(绿)/超买(红)/正常(黄) + 多空 + 布林带
  const StarCell = ({ label, value, state, text }) => {
    const cls = state === 'hot' ? 'td-star-hot' : state === 'cold' ? 'td-star-cold' : 'td-star-neutral';
    return (
      <div className={`td-star ${cls}`}>
        <span className="td-star-label">{label}</span>
        <b className="td-star-value">{value}</b>
        <span className="td-star-text">{text}</span>
      </div>
    );
  };

  const diPlus = latest['DI+'] ?? NaN;
  const diMinus = latest['DI-'] ?? NaN;
  const dmiDiff = !isNaN(diPlus) && !isNaN(diMinus) ? diPlus - diMinus : 0;
  const dmiState = dmiDiff >= 5 ? 'hot' : dmiDiff <= -5 ? 'cold' : 'neutral';
  const dmiText = dmiDiff >= 5 ? '多头优' : dmiDiff <= -5 ? '空头优' : '均衡';

  const bollU = latest['BOLL.U'] ?? NaN;
  const bollL = latest['BOLL.L'] ?? NaN;
  const close = latest.close ?? NaN;
  const bollState =
    !isNaN(bollU) && !isNaN(close) && close >= bollU
      ? 'hot'
      : !isNaN(bollL) && !isNaN(close) && close <= bollL
      ? 'cold'
      : 'neutral';
  const bollText = bollState === 'hot' ? '突破上轨' : bollState === 'cold' ? '跌破下轨' : '中轨震荡';

  return (
    <div className="td-overlay" onClick={onClose}>
      <div className="td-modal" onClick={(e) => e.stopPropagation()}>
        <div className="td-head">
          <div>
            <p className="eyebrow">TECHNICAL ANALYSIS · {code}</p>
            <h3>{name} <span className="td-code">{code}</span></h3>
          </div>
          <button className="td-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        {loading && <div className="td-loading">正在拉取技术指标…</div>}
        {error && !loading && <div className="td-error">指标拉取失败，请确认后端服务已启动。</div>}

        {!loading && !error && data && (
          <div className="td-body">
            {/* 关键信号：MACD 加速度 / 量五等级 */}
            <div className="td-signal-row">
              <div className={`td-signal ${momentumFade ? 'warn' : 'ok'}`}>
                <span className="td-signal-label">MACD 动能</span>
                <b>{momentumFade ? '衰减预警' : '正常'}</b>
                <small>{momentumFade ? '加速度转负·柱仍正·利润侵蚀前离场窗口' : accelPeak ? '加速度见顶' : '动能累积中'}</small>
              </div>
              <div className={`td-signal ${weakUp ? 'warn' : 'ok'}`}>
                <span className="td-signal-label">量能</span>
                <b>{volLevel || '—'}</b>
                <small>{weakUp ? '价涨量不成比例·警惕' : '量价配合'}</small>
              </div>
            </div>

            {/* 五星卡：玻璃质感综合判断 */}
            <div className="td-five-star">
              <StarCell label="RSI" value={fmt(latest.RSI)} state={latest.RSI > 70 ? 'hot' : latest.RSI < 30 ? 'cold' : 'neutral'} text={latest.RSI > 70 ? '超买' : latest.RSI < 30 ? '超卖' : '正常'} />
              <StarCell label="KDJ J" value={fmt(latest['KDJ.J'])} state={latest['KDJ.J'] > 100 ? 'hot' : latest['KDJ.J'] < 0 ? 'cold' : 'neutral'} text={latest['KDJ.J'] > 100 ? '超买' : latest['KDJ.J'] < 0 ? '超卖' : '正常'} />
              <StarCell label="CCI" value={fmt(latest.CCI)} state={latest.CCI > 100 ? 'hot' : latest.CCI < -100 ? 'cold' : 'neutral'} text={latest.CCI > 100 ? '极端强' : latest.CCI < -100 ? '极端弱' : '正常'} />
              <StarCell label="DMI 多空" value={`${fmt(diPlus)} / ${fmt(diMinus)}`} state={dmiState} text={dmiText} />
              <StarCell label="布林带" value={fmt(close)} state={bollState} text={bollText} />
            </div>

            {/* 指标网格 */}
            <div className="td-grid">
              <Item label="MACD 柱" value={fmt(latest.MACD)} tone={latest.MACD > 0 ? 'up' : 'down'} />
              <Item label="MACD 加速度" value={fmt(latest.MACD_ACCEL)} tone={latest.MACD_ACCEL > 0 ? 'up' : 'down'} hint="柱的二阶导" />
              <Item label="DIF" value={fmt(latest.DIF)} tone={latest.DIF > 0 ? 'up' : 'down'} />
              <Item label="DEA" value={fmt(latest.DEA)} tone={latest.DEA > 0 ? 'up' : 'down'} />
              <Item label="ADX" value={fmt(latest.ADX)} hint={latest.ADX > 25 ? '趋势市' : '震荡市·KDJ 慎用'} />
              <Item label="ATR(14)" value={fmt(latest.ATR14)} hint="波动幅度" />
              <Item label="SAR" value={fmt(latest.SAR)} tone="n" />
              <Item label="ROC(12)" value={fmt(latest.ROC)} tone={latest.ROC > 0 ? 'up' : 'down'} />
              <Item label="PSY(12)" value={fmt(latest.PSY)} hint="心理线" />
              <Item label="BIAS 6/12/24" value={`${fmt(latest['BIAS.6'])}/${fmt(latest['BIAS.12'])}/${fmt(latest['BIAS.24'])}`} />
              <Item label="MTM(12)" value={fmt(latest.MTM)} tone={latest.MTM > 0 ? 'up' : 'down'} />
            </div>

            {/* 序列图 */}
            <div className="td-charts">
              <div className="td-chart-block">
                <span className="td-chart-title">MACD 柱 & 加速度</span>
                <MiniChart arr={series.MACD} color="#d6df9e" zero />
                <MiniChart arr={series.MACD_ACCEL} color="#ef8b6b" zero />
              </div>
              <div className="td-chart-block">
                <span className="td-chart-title">RSI(14)</span>
                <MiniChart arr={series.RSI} color="#7fc8a9" />
              </div>
              <div className="td-chart-block">
                <span className="td-chart-title">KDJ_J</span>
                <MiniChart arr={series['KDJ.J']} color="#c9a6ef" />
              </div>
              <div className="td-chart-block">
                <span className="td-chart-title">CCI</span>
                <MiniChart arr={series.CCI} color="#e0b15a" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
