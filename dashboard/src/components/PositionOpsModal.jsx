import { useState } from 'react';
import { pushOp, applyOps } from '../services/watchlist';

const KIND_META = {
  buy: { label: '加仓', sign: '+' },
  sell: { label: '减仓', sign: '-' },
  t: { label: '做T', sign: '~' },
  dividend: { label: '分红', sign: '~' },
  note: { label: '备注', sign: '' },
};

export default function PositionOpsModal({ item, onClose, onCloseout }) {
  const ops = item.ops || [];
  const [kind, setKind] = useState('t');
  const [price, setPrice] = useState('');
  const [shares, setShares] = useState('');
  const [tProfit, setTProfit] = useState(''); // 做T/分红: 本次已实现利润（元，正=摊低成本）
  const [closePrice, setClosePrice] = useState(''); // 清仓价
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');

  const cur = applyOps(item);
  const curShares = cur.curShares;

  const submit = () => {
    const p = parseFloat(price) || 0;
    const s = parseFloat(shares) || 0;
    // 做T/分红：用"本次利润"反推每股 costDelta（负=拉低）
    let costDelta = 0;
    if ((kind === 't' || kind === 'dividend') && tProfit) {
      const effShares = applyOps(item).curShares || Number(item.shares) || 1;
      costDelta = -(parseFloat(tProfit) || 0) / effShares;
    }
    const op = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString().slice(0, 10),
      kind,
      price: p,
      shares: s,
      costDelta: Number(costDelta.toFixed(4)),
      note: note.trim(),
    };
    pushOp(item.code, op);
    setPrice(''); setShares(''); setTProfit(''); setNote('');
  };

  // 清仓：平掉全部持股（shares 归 0），回笼资金交回上级，标的保留为关注（不删除、不丢历史）
  const handleCloseout = () => {
    if (closing) return;
    if (curShares <= 0) return;
    const priceNum = parseFloat(closePrice) || Number(item.cost) || 0;
    const proceeds = Math.round(priceNum * curShares * 100) / 100; // 回笼资金（元）
    const op = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString().slice(0, 10),
      kind: 'sell',
      price: priceNum,
      shares: curShares, // 一次性减到 0
      costDelta: 0,
      note: `清仓（回笼 ${proceeds.toFixed(2)} 元）`,
    };
    pushOp(item.code, op);
    setClosing(false);
    setClosePrice('');
    if (onCloseout) onCloseout(item.code, proceeds); // 回笼资金加回可用资金
    onClose();
  };

  const op = applyOps(item);
  const sorted = [...ops].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="td-overlay" onClick={onClose}>
      <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ops-head">
          <div>
            <span className="ops-name">{item.name}</span>
            <span className="ops-code">{item.code}</span>
          </div>
          <button className="td-close" onClick={onClose}>×</button>
        </header>

        <div className="ops-summary">
          <div><span>初始成本</span><b>{(Number(item.cost) || 0).toFixed(2)}</b></div>
          <div><span>当前成本</span><b className={op.curCost < (Number(item.cost) || 0) ? 'down' : ''}>{op.curCost.toFixed(2)}</b></div>
          <div><span>持股数</span><b>{op.curShares}</b></div>
          <div><span>做T/分红摊薄</span><b className="down">{op.totalTProfit.toFixed(2)}</b></div>
        </div>

        <div className="ops-list">
          {sorted.length === 0 && <div className="ops-empty">暂无操作记录</div>}
          {sorted.map((o) => (
            <div className="ops-row" key={o.id}>
              <span className={`ops-kind k-${o.kind}`}>{KIND_META[o.kind]?.label || o.kind}</span>
              <span className="ops-date">{o.date}</span>
              <span className="ops-detail">
                {o.price ? `价 ${o.price}` : ''}
                {o.shares ? ` 股 ${o.shares}` : ''}
                {o.costDelta ? ` 成本${o.costDelta >= 0 ? '+' : ''}${o.costDelta}` : ''}
                {o.note ? ` · ${o.note}` : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="ops-form">
          <div className="ops-form-row">
            {Object.entries(KIND_META).map(([k, m]) => (
              <button
                key={k}
                className={`ops-kind-btn ${kind === k ? 'active' : ''}`}
                onClick={() => setKind(k)}
              >{m.label}</button>
            ))}
          </div>
          {kind === 't' || kind === 'dividend' ? (
            <div className="ops-form-row">
              <label>本次实现利润(元)<input value={tProfit} onChange={(e) => setTProfit(e.target.value)} placeholder="如做T赚200" /></label>
              <label>备注<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" /></label>
            </div>
          ) : (
            <div className="ops-form-row">
              <label>价格<input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" /></label>
              <label>股数<input value={shares} onChange={(e) => setShares(e.target.value)} placeholder="0" /></label>
              <label>备注<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" /></label>
            </div>
          )}
          <button className="ops-submit" onClick={submit}>记录操作</button>

          {curShares > 0 && (
            <div className="ops-closeout">
              <div className="ops-closeout-line">
                <span>清仓（平掉全部 {curShares} 股，回笼资金）</span>
                <label>清仓价<input value={closePrice} onChange={(e) => setClosePrice(e.target.value)} placeholder={`默认 ${item.cost || 0}`} /></label>
              </div>
              <button className="ops-closeout-btn" onClick={() => setClosing(true)}>清仓</button>
              {closing && (
                <div className="ops-confirm">
                  <p>确认清仓 <b>{item.name}({item.code})</b> 全部 {curShares} 股？回笼资金将加回可用资金，标的转为关注保留（不删除、不丢历史）。</p>
                  <div className="ops-confirm-actions">
                    <button className="ops-confirm-yes" onClick={handleCloseout}>确认清仓</button>
                    <button className="ops-confirm-no" onClick={() => setClosing(false)}>取消</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="ops-hint">
            做T / 分红：股数不变，按"本次实现利润"摊薄每股成本（成本下降，盈亏更真实）。清仓：股数归零，标的转为关注。
          </p>
        </div>
      </div>
    </div>
  );
}
