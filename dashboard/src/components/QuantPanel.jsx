import { useState, useCallback } from 'react';
import { Panel, Eyebrow, Card } from '../design/Primitives';
import { mcp } from '../services/mcp';

// easy_tdx 34 指标分组（按常见技术分类，用前缀匹配实际输出列名如 MACD_DIF/BOLL_UP/KDJ_K）。
const IND_GROUPS = [
  { key: 'trend', name: '趋势', prefix: ['MACD', 'DMI', 'EXPMA', 'BBI', 'DFMA', 'QACD', 'MA', 'EMA'] },
  { key: 'momentum', name: '动量/摆动', prefix: ['KDJ', 'RSI', 'WR', 'CCI', 'BIAS', 'PSY', 'MTM', 'ROC', 'TRIX', 'DPO', 'CR'] },
  { key: 'volatility', name: '波动/量能', prefix: ['BOLL', 'ATR', 'ENV', 'MIKE', 'PBX', 'VOL', 'VMA', 'VEM', 'VOSC', 'VMACD', 'VRSI', 'VSTD', 'BBIC', 'BC', 'CHANNEL'] },
  { key: 'energy', name: '能量/特色', prefix: ['WD', 'JS', 'ZYD'] },
];

function parseJson(str) {
  if (str == null) return null;
  if (typeof str !== 'string') return str;
  try { return JSON.parse(str); } catch { return null; }
}

// 摆动类指标语义色：超买(高)/超卖(低)/中性
function oscTone(name, v) {
  if (v == null || Number.isNaN(v)) return 'neutral';
  const n = Number(v);
  if (['RSI', 'KDJ', 'WR', 'CCI', 'BIAS', 'ROC', 'MTM'].includes(name)) {
    if (name === 'WR') {
      if (n >= 80) return 'bear';
      if (n <= 20) return 'bull';
    } else if (name === 'CCI') {
      if (n >= 100) return 'bear';
      if (n <= -100) return 'bull';
    } else if (name === 'BIAS') {
      if (n >= 6) return 'bear';
      if (n <= -6) return 'bull';
    } else {
      // RSI/KDJ/ROC/MTM 等 0-100 区间
      if (n >= 70) return 'bear';
      if (n <= 30) return 'bull';
    }
  }
  return 'neutral';
}
const TONE_LABEL = { bull: '超卖/低位', bear: '超买/高位', neutral: '中性' };

export default function QuantPanel() {
  const [market, setMarket] = useState('SH');
  const [symbol, setSymbol] = useState('600519');
  const [tab, setTab] = useState('ind'); // 'ind' | 'chan'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [indData, setIndData] = useState(null);
  const [chanData, setChanData] = useState(null);

  const run = useCallback(async () => {
    const code = symbol.trim();
    if (!/^\d{4,6}$/.test(code)) {
      setError('请输入 4-6 位股票代码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (tab === 'ind') {
        const raw = await mcp.call('stock_tech_indicators_easytdx', {
          symbol: code, market, count: 400, indicator_names: '',
        });
        const data = parseJson(raw);
        if (!data || data.error) {
          setError(data?.error || 'easy_tdx 指标计算失败');
          setIndData(null);
        } else {
          setIndData(data);
        }
      } else {
        const raw = await mcp.call('stock_chanlun_analyze', {
          symbol: code, market, count: 400,
        });
        const data = parseJson(raw);
        if (!data || data.error) {
          setError(data?.error || 'easy_tdx 缠论分析失败');
          setChanData(null);
        } else {
          setChanData(data);
        }
      }
    } catch (e) {
      setError(e?.message || '请求失败');
      if (tab === 'ind') setIndData(null); else setChanData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, market, tab]);

  // 切换 tab 时若已有数据则不清空，否则自动跑一次
  const switchTab = (t) => {
    setTab(t);
    if (t === 'ind' && !indData) run();
    if (t === 'chan' && !chanData) run();
  };

  return (
    <Panel
      eyebrow="量化"
      title="easy_tdx 量化分析"
      module="quant"
      actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="df-select"
            aria-label="市场"
          >
            <option value="SH">上交所</option>
            <option value="SZ">深交所</option>
            <option value="BJ">北交所</option>
          </select>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="代码 如 600519"
            className="df-input"
            style={{ width: 140 }}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <button className="df-btn" onClick={run} disabled={loading}>
            {loading ? '分析中…' : '分析'}
          </button>
          <div className="df-seg" role="tablist">
            <button
              className={`df-seg-btn ${tab === 'ind' ? 'active' : ''}`}
              onClick={() => switchTab('ind')}
            >技术指标</button>
            <button
              className={`df-seg-btn ${tab === 'chan' ? 'active' : ''}`}
              onClick={() => switchTab('chan')}
            >缠论</button>
          </div>
        </div>
      }
    >
      <Eyebrow module="quant">通达信协议直连 · 无需 API Key · 34 指标 + 缠论</Eyebrow>

      {error && <div className="df-error">{error}</div>}

      {tab === 'ind' && (
        <IndicatorsView data={indData} loading={loading} />
      )}
      {tab === 'chan' && (
        <ChanlunView data={chanData} loading={loading} />
      )}
    </Panel>
  );
}

function IndicatorsView({ data, loading }) {
  if (loading && !data) return <div className="df-loading">指标计算中…</div>;
  if (!data) return <div className="df-hint">输入代码后点「分析」查看 34 个技术指标最新值</div>;
  const latest = data.latest || {};
  // 集合：基础名 → 实际输出 key（如 RSI → RSI, MACD → MACD_DIF/DEA/HIST）
  const matchKeys = (prefixes) => {
    const out = [];
    for (const key of Object.keys(latest)) {
      if (prefixes.some((p) => key === p || key.startsWith(p + '_') || key.startsWith(p))) {
        out.push(key);
      }
    }
    return out;
  };
  return (
    <div className="quant-ind-grid">
      {IND_GROUPS.map((g) => {
        const rows = matchKeys(g.prefix);
        if (rows.length === 0) return null;
        return (
          <Card key={g.key} className="quant-ind-card">
            <h4 className="quant-ind-group">{g.name}</h4>
            <ul className="quant-ind-list">
              {rows.map((name) => {
                const v = latest[name];
                const tone = oscTone(name, v);
                return (
                  <li key={name} className={`quant-ind-row tone-${tone}`}>
                    <span className="quant-ind-name">{name}</span>
                    <span className="quant-ind-val">{Number(v).toFixed(2)}</span>
                    <span className="quant-ind-tone">{TONE_LABEL[tone]}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
      <p className="quant-foot">
        共 {Object.keys(latest).length} 个指标输出 · 数据源：easy_tdx（2026-09-02 接入）
      </p>
    </div>
  );
}

function ChanlunView({ data, loading }) {
  if (loading && !data) return <div className="df-loading">缠论分析中…</div>;
  if (!data) return <div className="df-hint">输入代码后点「分析」查看笔/中枢/买卖点/背驰</div>;
  const c = data.chanlun || {};
  const bis = Array.isArray(c.bis) ? c.bis : [];
  const zss = Array.isArray(c.zss) ? c.zss : [];
  const mmds = Array.isArray(c.mmds) ? c.mmds : [];
  const bcs = Array.isArray(c.bcs) ? c.bcs : [];
  const xds = Array.isArray(c.xds) ? c.xds : [];

  return (
    <div className="quant-chan">
      <div className="quant-chan-stats">
        <Stat label="笔" value={bis.length} />
        <Stat label="线段" value={xds.length} />
        <Stat label="中枢" value={zss.length} />
        <Stat label="买卖点" value={mmds.length} />
        <Stat label="背驰" value={bcs.length} tone={bcs.length > 0 ? 'bear' : 'neutral'} />
      </div>

      {mmds.length > 0 && (
        <Card className="quant-chan-card">
          <h4 className="quant-ind-group">买卖点（{mmds.length}）</h4>
          <div className="quant-chip-row">
            {mmds.slice(0, 24).map((m, i) => (
              <span key={i} className={`quant-chip tone-${m.type?.includes('1') ? 'bull' : m.type?.includes('2') ? 'neutral' : 'bear'}`}>
                {m.type} @ {m.index ?? m.date}
              </span>
            ))}
          </div>
        </Card>
      )}

      {bcs.length > 0 && (
        <Card className="quant-chan-card">
          <h4 className="quant-ind-group">背驰信号（{bcs.length}）</h4>
          <div className="quant-chip-row">
            {bcs.slice(0, 24).map((b, i) => (
              <span key={i} className="quant-chip tone-bear">
                {b.type || b.name || b} @ {b.index ?? b.date}
              </span>
            ))}
          </div>
        </Card>
      )}

      {bis.length > 0 && (
        <Card className="quant-chan-card">
          <h4 className="quant-ind-group">笔（最近 {Math.min(bis.length, 30)} 条）</h4>
          <ul className="quant-bi-list">
            {bis.slice(-30).map((bi, i) => (
              <li key={i} className={`quant-bi tone-${bi.direction === 'up' || bi.type === 'up' ? 'bull' : 'bear'}`}>
                <span>{bi.start_date || bi.start} → {bi.end_date || bi.end}</span>
                <span className="quant-bi-dir">{bi.direction || bi.type}</span>
                {bi.energy != null && <span className="quant-bi-energy">力度 {bi.energy}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {zss.length > 0 && (
        <Card className="quant-chan-card">
          <h4 className="quant-ind-group">中枢（{zss.length}）</h4>
          <ul className="quant-bi-list">
            {zss.slice(-12).map((zs, i) => (
              <li key={i} className="quant-bi tone-neutral">
                <span>{zs.start_date || zs.start} → {zs.end_date || zs.end}</span>
                <span className="quant-bi-energy">区间 [{zs.low ?? '—'}, {zs.high ?? '—'}]</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="quant-foot">数据来源：easy_tdx ChanlunAnalyser · {data.symbol}（{data.market}）</p>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }) {
  return (
    <div className={`df-metric tone-${tone}`}>
      <span className="df-metric-label">{label}</span>
      <b className="df-metric-value df-ghost-title">{value}</b>
    </div>
  );
}
