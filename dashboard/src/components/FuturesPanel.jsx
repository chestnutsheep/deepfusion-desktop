import { useEffect, useMemo, useState } from 'react';
import { Panel, Eyebrow, Metric } from '../design/Primitives';
import {
  loadFuturesWatch, saveFuturesWatch,
  fetchFuturesQuotes, fetchFuturesK, fetchIvix,
} from '../services/futures';

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return <div className="futures-spark empty">无数据</div>;
  const prices = data.map((d) => d.price);
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const W = 220, H = 60, pad = 4;
  const step = W / (prices.length - 1);
  const pts = prices.map((p, i) => `${(i * step).toFixed(1)},${(pad + (H - pad * 2) - ((p - min) / range) * (H - pad * 2)).toFixed(1)}`).join(' ');
  return (
    <svg className="futures-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function FuturesPanel() {
  const [watch, setWatch] = useState(loadFuturesWatch);
  const [quotes, setQuotes] = useState([]);
  const [selected, setSelected] = useState(watch[0] || '');
  const [kSeries, setKSeries] = useState(null);
  const [ivix, setIvix] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    const q = await fetchFuturesQuotes(watch);
    setQuotes(q);
    const k = await fetchFuturesK(selected, 60);
    setKSeries(k);
    const iv = await fetchIvix(60);
    setIvix(iv);
    setBusy(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const onAdd = (e) => {
    e.preventDefault();
    const v = e.target.symbol.value.trim();
    if (!v || watch.includes(v)) return;
    const next = [...watch, v];
    setWatch(next); saveFuturesWatch(next);
    setSelected(v);
    e.target.reset();
  };
  const onRemove = (sym) => {
    const next = watch.filter((s) => s !== sym);
    setWatch(next); saveFuturesWatch(next);
    if (selected === sym) setSelected(next[0] || '');
  };

  const selQuote = quotes.find((q) => q.symbol === selected);
  const last = selQuote?.last ?? null;
  const chg = selQuote?.changePct ?? null;

  return (
    <Panel title="期货数据看板" extraClass="futures-panel">
      <Eyebrow>主力合约行情 · 期权波动率 · 持仓监控</Eyebrow>

      <div className="futures-toolbar">
        <form onSubmit={onAdd}>
          <input name="symbol" placeholder="加品种，如 沪镍 / 苹果" maxLength="10" />
          <button type="submit">＋</button>
        </form>
        <button className="ghost" onClick={refresh} disabled={busy}>{busy ? '刷新中…' : '刷新'}</button>
      </div>

      <div className="futures-grid">
        <div className="futures-quotes">
          <div className="fq-head">
            <span>品种</span><span>最新</span><span>涨跌</span>
          </div>
          {quotes.map((q) => (
            <div
              key={q.symbol}
              className={`fq-row${q.symbol === selected ? ' active' : ''}`}
              onClick={() => setSelected(q.symbol)}
            >
              <span className="fq-name">{q.symbol}<i onClick={(e) => { e.stopPropagation(); onRemove(q.symbol); }}>✕</i></span>
              <span className="fq-last">{q.last != null ? q.last.toFixed(1) : '—'}</span>
              <span className={`fq-chg ${q.changePct > 0 ? 'up' : q.changePct < 0 ? 'down' : 'flat'}`}>
                {q.changePct != null ? (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—'}
              </span>
            </div>
          ))}
          {quotes.length === 0 && <div className="futures-empty">暂无行情，点击刷新或添加品种</div>}
        </div>

        <div className="futures-detail">
          <div className="futures-detail-head">
            <h3>{selected || '未选择'}</h3>
            {last != null && (
              <div className="futures-price">
                <b>{last.toFixed(1)}</b>
                <span className={chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat'}>
                  {chg > 0 ? '▲' : chg < 0 ? '▼' : ''} {chg != null ? (chg > 0 ? '+' : '') + chg.toFixed(2) + '%' : ''}
                </span>
              </div>
            )}
          </div>

          <div className="futures-k">
            <span className="block-label">近 60 日主力合约走势</span>
            <Sparkline data={kSeries} color={chg >= 0 ? '#ef5b5b' : '#50b889'} />
          </div>

          <div className="futures-ivix">
            <span className="block-label">期权波动率指数 IVIX（近 60 日）</span>
            <Sparkline data={ivix} color="#c8a04a" />
            {ivix && ivix.length > 0 && (
              <div className="ivix-now">当前 IVIX：<b>{ivix[ivix.length - 1].price.toFixed(1)}</b></div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
