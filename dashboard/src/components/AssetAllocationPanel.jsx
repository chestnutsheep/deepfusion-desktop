import React, { useEffect, useMemo, useState } from 'react';
import { Panel, Eyebrow, Metric } from '../design/Primitives';
import { usePortfolio } from '../shared/portfolioStore';

const KEY = 'deepfusion.allocation.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

const PRESET = [
  { name: '权益（A股）', target: 35 },
  { name: '权益（港股/美股）', target: 15 },
  { name: '债券', target: 25 },
  { name: '现金/货基', target: 10 },
  { name: '黄金/商品', target: 10 },
  { name: '另类/REITs', target: 5 },
];

export default function AssetAllocationPanel() {
  const [rows, setRows] = useState(load);
  const [editing, setEditing] = useState(null);
  const { equity, cash } = usePortfolio();
  const [draftName, setDraftName] = useState('');
  const [draftCur, setDraftCur] = useState('');
  const [draftTgt, setDraftTgt] = useState('');

  useEffect(() => { save(rows); }, [rows]);

  // 联动：把全局持仓市值注入「权益」类、可用资金注入「现金/货基」类，自动参与配置统计
  const linkedRows = useMemo(() => rows.map((r) => {
    const n = (r.name || '').replace(/[（）()\s]/g, '');
    if (/权益|股票/.test(n)) return { ...r, current: equity, linked: true };
    if (/现金|货基/.test(n)) return { ...r, current: cash, linked: true };
    return r;
  }), [rows, equity, cash]);

  const stats = useMemo(() => {
    const total = linkedRows.reduce((s, r) => s + (Number(r.current) || 0), 0) || 1;
    const enriched = linkedRows.map((r) => {
      const cur = Number(r.current) || 0;
      const tgt = Number(r.target) || 0;
      const curPct = (cur / total) * 100;
      const dev = curPct - tgt;
      return { ...r, curPct, dev };
    });
    const sumTarget = linkedRows.reduce((s, r) => s + (Number(r.target) || 0), 0);
    return { enriched, total, sumTarget };
  }, [linkedRows]);

  const addRow = () => {
    if (!draftName.trim()) return;
    setRows((rs) => [...rs, { name: draftName.trim(), current: Number(draftCur) || 0, target: Number(draftTgt) || 0 }]);
    setDraftName(''); setDraftCur(''); setDraftTgt('');
  };

  const updateRow = (idx, patch) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const fillPreset = () => setRows(PRESET.map((p) => ({ ...p, current: 0 })));

  return (
    <Panel
      module="allocation"
      title="资产组合配置"
      actions={<button className="focus-toggle" onClick={fillPreset}>套用基准模板 <span>↧</span></button>}
    >
      <p className="alloc-intro">录入各资产当前市值与<strong>目标占比</strong>，系统自动计算实时占比、偏离度与再平衡方向。纯本地保存，断网可用。</p>

      <div className="alloc-table">
        <div className="alloc-row alloc-head">
          <span>资产类别</span><span>当前市值</span><span>实时占比</span><span>目标%</span><span>偏离</span><span></span>
        </div>
        {stats.enriched.map((r, idx) => (
          <div className="alloc-row" key={idx}>
            {editing === idx ? (
              <>
                <input className="alloc-input" value={r.name} onChange={(e) => updateRow(idx, { name: e.target.value })} />
                <input className="alloc-input" type="number" value={r.current} onChange={(e) => updateRow(idx, { current: e.target.value })} />
                <span>—</span>
                <input className="alloc-input" type="number" value={r.target} onChange={(e) => updateRow(idx, { target: e.target.value })} />
                <span>—</span>
                <button className="focus-toggle" onClick={() => setEditing(null)}>完成</button>
              </>
            ) : (
              <>
                <b>{r.name}</b>
                <span>{r.current.toLocaleString()}</span>
                <span>{r.curPct.toFixed(1)}%</span>
                <span>{r.target}%</span>
                <b className={r.dev >= 0 ? 'up' : 'down'}>{r.dev >= 0 ? '+' : ''}{r.dev.toFixed(1)}%</b>
                <span className="alloc-ops">
                  {r.linked ? (
                    <span className="alloc-linked" title="由持仓/可用资金自动同步">自动</span>
                  ) : (
                    <>
                      <button className="focus-toggle" onClick={() => setEditing(idx)}>改</button>
                      <button className="focus-toggle" onClick={() => removeRow(idx)}>删</button>
                    </>
                  )}
                </span>
              </>
            )}
          </div>
        ))}
        {stats.enriched.length === 0 && <div className="capability-empty">尚未录入任何资产；点「套用基准模板」快速起步。</div>}
      </div>

      <div className="alloc-add">
        <input className="alloc-input" placeholder="类别名" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        <input className="alloc-input" type="number" placeholder="当前市值" value={draftCur} onChange={(e) => setDraftCur(e.target.value)} />
        <input className="alloc-input" type="number" placeholder="目标%" value={draftTgt} onChange={(e) => setDraftTgt(e.target.value)} />
        <button className="focus-toggle" onClick={addRow}>添加</button>
      </div>

      <div className="alloc-footer">
        <Metric label="组合总市值" value={stats.total.toLocaleString()} tone="accent" />
        <Metric label="目标占比合计" value={`${stats.sumTarget}%`} tone={stats.sumTarget === 100 ? 'down' : 'up'} />
        <Metric label="最大偏离" value={`${(Math.max(...stats.enriched.map((r) => Math.abs(r.dev)), 0)).toFixed(1)}%`} />
      </div>
    </Panel>
  );
}
