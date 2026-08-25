import { useMemo, useState } from 'react';
import { createWatch, loadWatchlist, normalizeCode, refreshWatchlist, saveWatchlist, validateWatch } from '../services/watchlist';

const TAGS = ['形态', '突破', '低吸', '趋势', '异动'];

export default function WatchlistPanel() {
  const [rows, setRows] = useState(() => loadWatchlist());
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [tags, setTags] = useState(['形态']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const activeRows = useMemo(() => rows.filter((row) => row.status !== '已失效'), [rows]);

  const update = (next) => { setRows(next); saveWatchlist(next); };
  const submit = (event) => {
    event.preventDefault();
    const normalized = normalizeCode(code);
    const message = validateWatch(normalized, reason);
    if (message) { setError(message); return; }
    const duplicate = rows.find((row) => row.code === normalized && row.status !== '已失效');
    if (duplicate) {
      update(rows.map((row) => row.id === duplicate.id ? { ...row, reason: reason.trim(), tags, status: '关注中' } : row));
    } else {
      update([createWatch({ code: normalized, reason, tags }), ...rows]);
    }
    setCode(''); setReason(''); setError('');
  };
  const refresh = async () => {
    setBusy(true);
    update(await refreshWatchlist(activeRows).then((fresh) => rows.map((row) => fresh.find((item) => item.id === row.id) || row)));
    setBusy(false);
  };
  const remove = (id) => update(rows.filter((row) => row.id !== id));
  const toggleStatus = (id) => update(rows.map((row) => row.id === id ? { ...row, status: row.status === '关注中' ? '已失效' : '关注中', triggered: false } : row));

  return <section className="watchlist-panel panel enter-four" aria-labelledby="watchlist-title">
    <div className="panel-head"><div><p className="eyebrow">PATTERN WATCH / LOCAL LIST</p><h2 id="watchlist-title">形态关注</h2></div><button onClick={refresh} disabled={busy}>{busy ? '检查中…' : '检查行情 ↻'}</button></div>
    <p className="watchlist-intro">复盘时记下看得顺眼的形态，后续按真实行情检查；提醒只提示异动，不替代你的判断。</p>
    <form className="watchlist-form" onSubmit={submit}>
      <label>股票代码<input value={code} onChange={(event) => setCode(normalizeCode(event.target.value))} inputMode="numeric" maxLength={6} placeholder="例如 600519" /></label>
      <label>关注原因<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={80} placeholder="例如 日线缩量回踩支撑" /></label>
      <div className="watchlist-tags" aria-label="关注标签">{TAGS.map((tag) => <button type="button" className={tags.includes(tag) ? 'selected' : ''} key={tag} onClick={() => setTags(tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag])}>{tag}</button>)}</div>
      <button className="watchlist-submit" type="submit">加入关注 <span>＋</span></button>
    </form>
    {error && <div className="watchlist-error" role="alert">{error}</div>}
    <div className="watchlist-list">{activeRows.length ? activeRows.map((row) => <article className={row.triggered ? 'watch-row triggered' : 'watch-row'} key={row.id}>
      <div className="watch-main"><strong>{row.name || row.code}</strong><span>{row.code} · {row.tags?.join(' / ') || '形态'}</span></div>
      <div className="watch-reason">{row.reason}<small>{row.source} · {row.checkedAt ? `检查 ${new Date(row.checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '尚未检查'}</small></div>
      <div className="watch-quote"><b>{row.lastPrice == null ? '—' : row.lastPrice.toFixed(2)}</b><span className={row.changePct > 0 ? 'up' : row.changePct < 0 ? 'down' : 'flat'}>{row.changePct == null ? '—' : `${row.changePct > 0 ? '+' : ''}${row.changePct.toFixed(2)}%`}</span></div>
      <div className="watch-signal">{row.quoteError || row.signal}</div>
      <div className="watch-actions"><button onClick={() => toggleStatus(row.id)}>{row.status === '关注中' ? '失效' : '恢复'}</button><button onClick={() => remove(row.id)}>删除</button></div>
    </article>) : <div className="watchlist-empty">还没有关注标的。把复盘时第一眼看中的形态记下来。</div>}</div>
  </section>;
}
