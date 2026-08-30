import { useEffect, useMemo, useState } from 'react';
import {
  analyzePortfolio,
  createWatch,
  enrichWatch,
  loadWatchlist,
  loadBackup,
  saveWatchlist,
  splitPortfolio,
  validateWatch,
} from '../services/watchlist';

const TAGS = ['持仓', '形态', '突破', '低吸', '趋势', '异动'];
const VIEWS = [
  { id: 'cards', label: '卡片' },
  { id: 'list', label: '列表' },
  { id: 'big', label: '大卡' },
];

const fmt = (n, d = 2) =>
  n == null || isNaN(n) ? '—' : n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => (n == null || isNaN(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

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

export default function WatchlistPanel({ extraClass = '' }) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);

  // 异步初始化：先读 WebView 内存，空则从磁盘备份恢复（防清缓存丢失）
  useEffect(() => {
    loadWatchlist().then((list) => { setRows(list); setReady(true); });
  }, []);

  // 数据就绪后自动刷新一次；之后每 30 秒轮询行情
  useEffect(() => {
    if (!ready || rows.length === 0) return;
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [ready, rows.length]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [cost, setCost] = useState('');
  const [shares, setShares] = useState('');
  const [sector, setSector] = useState('');
  const [tag, setTag] = useState('持仓');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quoted, setQuoted] = useState(() => new Map());
  const [view, setView] = useState('cards');

  const { holdings, watches } = useMemo(() => splitPortfolio(rows), [rows]);
  const analysis = useMemo(() => analyzePortfolio(holdings, quoted), [holdings, quoted]);

  const update = (next) => { setRows(next); saveWatchlist(next); };

  const submit = (event) => {
    event.preventDefault();
    const normalized = code.trim();
    const message = validateWatch(normalized, reason);
    if (message) { setError(message); return; }
    const payload = { code: normalized, name, reason, tag, cost, shares, sector };
    const duplicate = rows.find((r) => r.code === normalized);
    if (duplicate) {
      update(rows.map((r) => (r.code === normalized
        ? { ...r, name: name.trim(), reason: reason.trim(), tag, cost: cost || null, shares: shares || null, sector: sector.trim() }
        : r)));
    } else {
      update([createWatch(payload), ...rows]);
    }
    setCode(''); setName(''); setReason(''); setCost(''); setShares(''); setSector(''); setError('');
  };

  const refresh = async () => {
    setBusy(true);
    const enriched = new Map();
    // 先全部拉完，再一次性更新本地存储，避免循环中 state 覆盖
    const enrichedRows = [];
    for (const w of rows) {
      const e = await enrichWatch(w);
      enriched.set(w.code, e);
      enrichedRows.push({ code: w.code, e });
    }
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
    setBusy(false);
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
    const trendColor = live?.changePct > 0 ? 'var(--up)' : live?.changePct < 0 ? 'var(--down)' : 'var(--text-3)';
    const el = (
      <article className={`watch-row${pos ? ' holding' : ''}${big ? ' big' : ''}`} key={w.code}>
        <div className="watch-main">
          <strong>{w.name || w.code}</strong>
          {w.name && <span className="watch-code">{w.code}</span>}
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
          <b className="q-price">{live?.lastPrice != null ? live.lastPrice.toFixed(2) : '—'}</b>
          <span className={`q-pct ${cls(live?.changePct)}`}>{pct(live?.changePct)}</span>
        </div>
        <Sparkline data={intraday} color={trendColor} />
        {pos && (
          <div className={`hold-metrics${big ? ' big' : ''}`}>
            <div><span>市值</span><b>{fmt(pos.marketValue)}</b></div>
            <div><span>盈亏</span><b className={cls(pos.profit)}>{pos.profit >= 0 ? '+' : ''}{fmt(pos.profit)}</b></div>
            <div><span>收益率</span><b className={cls(pos.profit)}>{pct(pos.profitPct)}</b></div>
            <div><span>仓位</span><b>{pos.weight.toFixed(0)}%</b></div>
          </div>
        )}
        <div className="watch-actions"><button onClick={() => remove(w.code)}>删除</button></div>
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
        <label>代码<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="600519" /></label>
        <label>名称<input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="茅台（可不填）" /></label>
        <label>原因<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={80} placeholder="日线回踩支撑" /></label>
        <label>行业<input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={20} placeholder="白酒 / 半导体 …" /></label>
        <div className="cost-row">
          <label>成本价<input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="可选" /></label>
          <label>股数<input value={shares} onChange={(e) => setShares(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="可选" /></label>
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
          [...holdings, ...watches].map((w) => {
            const pos = analysis.positions.find((p) => p.code === w.code);
            const live = quoted.get(w.code)?.quote;
            return (
              <div className="watch-listrow" key={w.code}>
                <span className="lr-name"><b>{w.name || w.code}</b>{w.name && <i>{w.code}</i>}</span>
                {w.sector && <span className="lr-sector">{w.sector}</span>}
                {w.concepts?.length > 0 && <span className="lr-concepts">{w.concepts.join(' · ')}</span>}
                <span className={`lr-pct ${cls(live?.changePct)}`}>{pct(live?.changePct)}</span>
                <span className="lr-price">{live?.lastPrice != null ? live.lastPrice.toFixed(2) : '—'}</span>
                {pos && <span className={`lr-profit ${cls(pos.profit)}`}>{pos.profit >= 0 ? '+' : ''}{fmt(pos.profit)}</span>}
                <button onClick={() => remove(w.code)}>✕</button>
              </div>
            );
          })
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
    </section>
  );
}
