import { useEffect, useState } from 'react';
import { mcp } from '../services/mcp';

const TYPE_LABEL = { auto: '自动', industry: '行业', concept: '概念', sector: '板块' };

export default function DomainConstituentsPopup({ domain, type = 'auto', onClose }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    mcp
      .call('domain_constituents', { domain, dtype: type, limit: 30 })
      .then((res) => {
        if (!alive) return;
        try {
          const data = typeof res === 'string' ? JSON.parse(res) : res;
          if (!data?.ok && data?.error) {
            setErr(data.error);
            setRows([]);
          } else {
            setRows(data.constituents || []);
            setMode(data.mode || '');
          }
        } catch (e) {
          setErr('解析失败：' + e.message);
          setRows([]);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message || String(e));
        setRows([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [domain, type]);

  return (
    <div className="td-overlay" onClick={onClose}>
      <div className="dc-popup" onClick={(e) => e.stopPropagation()}>
        <header className="dc-popup-head">
          <div>
            <span className="dc-popup-domain">{domain}</span>
            <span className="dc-popup-type">{TYPE_LABEL[type] || type}</span>
          </div>
          <button className="dc-popup-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        {mode && <div className="dc-popup-mode">行情口径：{mode}</div>}
        <div className="dc-popup-body">
          {loading && <div className="dc-popup-loading">加载中…</div>}
          {err && <div className="dc-popup-error">{err}</div>}
          {!loading && !err && rows && rows.length === 0 && (
            <div className="dc-popup-empty">未解析到成分股（领域名可能不匹配申万/概念/板块）</div>
          )}
          {!loading &&
            !err &&
            rows?.map((r) => (
              <div className="dc-row" key={r.code || r.name}>
                <span className="dc-name">{r.name}</span>
                <span className="dc-code">{r.code}</span>
                <span className="dc-price">{r.price != null ? r.price : '—'}</span>
                <span className={`dc-chg ${Number(r.change_pct) >= 0 ? 'up' : 'down'}`}>
                  {r.change_pct != null ? `${Number(r.change_pct) >= 0 ? '+' : ''}${r.change_pct}%` : '—'}
                </span>
                <span className="dc-meta">换手 {r.turnover ?? '—'}</span>
                <span className="dc-meta">PE {r.pe ?? '—'}</span>
                <span className="dc-meta">PB {r.pb ?? '—'}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
