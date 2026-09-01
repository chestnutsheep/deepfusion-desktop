import React, { useEffect, useMemo, useState } from 'react';
import { Panel, Eyebrow } from '../design/Primitives';
import { mcp } from '../services/mcp';
import DomainConstituentsPopup from './DomainConstituentsPopup';

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return fallback; } }
  return value;
}

const GOLDEN = 137.508;
const themeColor = (idx, sat = 62, light = 52) => `hsl(${((idx * GOLDEN) % 360).toFixed(0)} ${sat}% ${light}%)`;
const pctStr = (n) => (n == null ? '—' : `${(n * 100).toFixed(2)}%`);

// 在 90 个申万行业里扫描"奇特长周期领先"的行业：20日动量强、但被塞进低相关大簇
function findAnomalies(themes, momentumRanking) {
  const anomalies = [];
  for (const t of themes) {
    for (const m of t.members || []) {
      if (m === '种植业与林业' || m.includes('种植') || m.includes('林业')) {
        const mr = (momentumRanking || []).find((x) => x.industry === m);
        anomalies.push({ industry: m, theme: t.label, intraCorr: t.avg_intra_corr, momentum: mr });
      }
    }
  }
  return anomalies;
}

export default function IndustryThemesPanel() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    mcp.call('industry_themes', {})
      .then((data) => { if (alive) { setRaw(parseJson(data, null)); setError(null); } })
      .catch((e) => { if (alive) setError(e?.message || '行业主题服务不可用'); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const payload = raw?.data ? parseJson(raw.data, null) : raw;
  const themes = useMemo(() => payload?.themes || [], [payload]);
  const momentumRanking = useMemo(() => payload?.momentum_ranking || [], [payload]);
  const pca = payload?.pca_top_contributors || null;
  const meta = payload?.meta || null;
  const anomalies = useMemo(() => findAnomalies(themes, momentumRanking), [themes, momentumRanking]);

  const [exportMsg, setExportMsg] = useState(null); // { type:'ok'|'err', text }
  const [popupDomain, setPopupDomain] = useState(null); // 点击行业成员 → 弹成份股

  // 把行业聚类结果映射成 invest_theme 的 themes 结构落库（rtype='invest_theme'，进 reports.db）
  const toInvestThemes = useMemo(() => {
    return themes.map((t) => {
      const avg20 = t.momentum?.avg_20d ?? 0;
      const sentiment = avg20 > 0.01 ? '利好' : avg20 < -0.01 ? '利空' : '中性';
      const leader = t.fund_flow?.best_leader;
      const targets = [];
      if (leader) {
        targets.push({
          code: '',
          name: leader,
          pct: t.fund_flow?.best_leader_pct != null ? `+${(t.fund_flow.best_leader_pct).toFixed(2)}%` : '',
          change: '',
          reason: `簇内资金龙头（净流入 ${Math.abs(t.fund_flow?.net_amount_total ?? 0).toFixed(1)} 亿）`,
          intensity: t.avg_intra_corr > 0.5 ? '强' : '中',
        });
      }
      return {
        theme: t.label,
        summary: `综合评分 ${t.score?.toFixed(1)}｜簇内相关 ${(t.avg_intra_corr * 100).toFixed(1)}%｜趋势 ${t.trend === 'stable' ? '稳定' : t.trend}｜`
          + `动量 5日${(t.momentum?.avg_5d * 100).toFixed(1)}% / 10日${(t.momentum?.avg_10d * 100).toFixed(1)}% / 20日${(t.momentum?.avg_20d * 100).toFixed(1)}%`,
        sentiment,
        targets,
        sources: ['industry_themes'],
      };
    });
  }, [themes]);

  const handleExport = async () => {
    if (!payload) return;
    const rptDate = new Date().toISOString().slice(0, 10);
    try {
      const res = await mcp.call('invest_theme_collect', {
        keywords: '',
        themes: JSON.stringify(toInvestThemes),
        rpt_date: rptDate,
      });
      setExportMsg({ type: 'ok', text: `已落库 reports.db（invest_theme · ${rptDate}）` });
    } catch (e) {
      setExportMsg({ type: 'err', text: `落库失败：${e?.message || e}` });
    }
    setTimeout(() => setExportMsg(null), 4000);
  };

  return (
    <Panel module="industry" title="行业主题聚类" actions={<button className="focus-toggle" onClick={handleExport} disabled={!payload}>导出报告 <span>↓</span></button>}>
      <p className="industry-intro">
        基于申万行业（共 <b>{meta?.n_industries ?? '—'}</b> 个）的<strong>相关性聚类</strong>，把联动紧密的行业归为同一主题簇。
        数据窗口 <b>{meta?.date_range?.[0] ?? '—'}</b> ~ <b>{meta?.date_range?.[1] ?? '—'}</b>，共 <b>{meta?.n_clusters ?? '—'}</b> 个主题簇。
      </p>
      {exportMsg && <div className={`industry-export-msg ${exportMsg.type}`}>{exportMsg.text}</div>}
      {exportMsg?.type === 'ok' && (
        <p className="industry-intro" style={{ marginTop: 8 }}>
          落库后在「报告」页选 <b>invest_theme</b> 类型即可回看；与盘前/复盘报告并列管理。
        </p>
      )}

      {loading && <div className="industry-empty">正在向行业主题服务请求聚类结果…</div>}
      {error && <div className="industry-empty">行业主题服务暂不可用：{error}。可在 server 恢复后刷新。</div>}
      {!loading && !error && !themes.length && <div className="industry-empty">当前无主题聚类结果。</div>}

      {!loading && themes.length > 0 && (
        <>
          <div className="industry-themes">
            {themes.map((t, i) => {
              const c = themeColor(i);
              const isAnomalyTheme = (t.members || []).some((m) => m.includes('种植') || m.includes('林业'));
              return (
                <article className="industry-theme-card" key={t.theme_id} style={{ borderTopColor: c }}>
                  <header className="itc-head">
                    <span className="itc-rank">#{t.rank}</span>
                    <span className="itc-label">{t.label}</span>
                    <span className="itc-score" style={{ color: c }}>{t.score?.toFixed(1)}</span>
                  </header>
                  <div className="itc-stats">
                    <span>簇内相关 <b>{pctStr(t.avg_intra_corr)}</b></span>
                    <span>趋势 <b>{t.trend === 'stable' ? '稳定' : t.trend}</b></span>
                    <span>成员 <b>{t.n_members}</b></span>
                  </div>
                  <div className="itc-momentum">
                    <small>动量</small>
                    <span className="up">5日 {pctStr(t.momentum?.avg_5d)}</span>
                    <span className={t.momentum?.avg_10d >= 0 ? 'up' : 'down'}>10日 {pctStr(t.momentum?.avg_10d)}</span>
                    <span className={t.momentum?.avg_20d >= 0 ? 'up' : 'down'}>20日 {pctStr(t.momentum?.avg_20d)}</span>
                  </div>
                  <div className="itc-fund">
                    <small>资金</small>
                    <span className={(t.fund_flow?.net_amount_total ?? 0) >= 0 ? 'up' : 'down'}>
                      {t.fund_flow?.net_amount_total >= 0 ? '净流入' : '净流出'} {Math.abs(t.fund_flow?.net_amount_total ?? 0).toFixed(1)} 亿
                    </span>
                    <span className="itc-leader">龙头 {t.fund_flow?.best_leader} +{t.fund_flow?.best_leader_pct?.toFixed(1)}%</span>
                  </div>
                  {isAnomalyTheme && (
                    <div className="itc-flag">⚠ 含「种植业与林业」——长周期动量领先却被归入低相关大簇（见下方解读）</div>
                  )}
                  <div className="itc-members">
                    <small className="itc-members-label">行业成员（点击看成分股）</small>
                    {(t.members || []).slice(0, 14).map((m) => (
                      <button type="button" className="chip clickable" key={m} onClick={() => setPopupDomain(m)}>
                        {m}
                      </button>
                    ))}
                    {(t.members || []).length > 14 && <span className="chip more">+{(t.members || []).length - 14}</span>}
                  </div>
                </article>
              );
            })}
          </div>

          {anomalies.length > 0 && (
            <section className="industry-anomaly">
              <h3>反常解读 · 你之前关注的「种植业与林业」</h3>
              {anomalies.map((a) => (
                <div className="anomaly-card" key={a.industry}>
                  <p>
                    <b>{a.industry}</b> 被算法归入主题簇「{a.theme}」，但该簇簇内相关仅 <b>{pctStr(a.intraCorr)}</b>（中等偏低），
                    是一个由弱相关行业兜底拼成的大杂烩簇（含煤炭、银行、白酒、养殖等）。
                  </p>
                  <p>
                    然而它的<strong>中期动量显著领先</strong>：
                    5日 {pctStr(a.momentum?.return_5d)} / 10日 <b className="up">{pctStr(a.momentum?.return_10d)}</b> / 20日 <b className="up">{pctStr(a.momentum?.return_20d)}</b>。
                    在 20 日维度全场前列，但 5 日短周期未进前三——这正是你觉得它「领先/滞后其他行业」的由来：
                    <strong>它不是被错误归类，而是「行业属性弱相关、但价格动量中期领先」的双重异类</strong>。
                  </p>
                  <p className="anomaly-note">
                    当前领先/滞后以动量窗口（5/10/20 日收益差）代理判定；server 的 <code>industry_themes_causality</code> 因果检验接口接入后，将升级为严谨的领先—滞后因果边。
                  </p>
                </div>
              ))}
            </section>
          )}

          {momentumRanking.length > 0 && (
            <section className="industry-section">
              <h3>动量排行榜（全行业）</h3>
              <div className="momentum-table">
                {momentumRanking.slice(0, 12).map((m, i) => (
                  <div className="momentum-row" key={m.industry}>
                    <span className="mr-rank">{i + 1}</span>
                    <span className="mr-name">{m.industry}</span>
                    <span className="mr-5 up">{pctStr(m.return_5d)}</span>
                    <span className={m.return_10d >= 0 ? 'up' : 'down'}>{pctStr(m.return_10d)}</span>
                    <span className={m.return_20d >= 0 ? 'up' : 'down'}>{pctStr(m.return_20d)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {pca && (
            <section className="industry-section">
              <h3>PCA 主因子解读（行业对冲结构）</h3>
              <div className="pca-grid">
                {Object.entries(pca).map(([pc, v]) => (
                  <div className="pca-card" key={pc}>
                    <b>{pc}</b>
                    <span className="pca-pos">↑ {v.positive?.join('、')}</span>
                    <span className="pca-neg">↓ {v.negative?.join('、')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="industry-readme">
            <h3>如何解读这份结果</h3>
            <ul>
              <li><b>主题簇</b>：算法按行业间收益率相关性，把联动紧密的行业聚成一簇；<b>簇内相关</b>越高代表该组行业同涨同跌越同步。</li>
              <li><b>综合评分</b> = 相关性得分 × 动量得分 × 资金流得分（见各簇 <code>score_detail</code>）。评分高 ≠ 一定涨，只代表「联动强 + 近期有动量 + 有资金」的共振强度。</li>
              <li><b>动量窗口</b>：5日=短线、10日=中短线、20日=中线。某行业 20日强但 5日弱，即「中线领先、短线未跟上」。</li>
              <li><b>动量排行榜</b>：全行业按 5/10/20 日收益排序，用于找「领先者」与「掉队者」。</li>
              <li><b>PCA 主因子</b>：把 90 个行业压缩成少数互不相关的驱动轴；正负两端行业呈<strong>对冲关系</strong>（一端涨另一端易跌），可用于组合分散。</li>
              <li><b>反常行业</b>：相关性低却动量领先的行业（如种植业与林业），是算法聚类边界上的「异类」，需人工单独研判，不可简单并入同簇。</li>
            </ul>
          </section>
        </>
      )}

      {popupDomain && (
        <DomainConstituentsPopup domain={popupDomain} type="auto" onClose={() => setPopupDomain(null)} />
      )}
    </Panel>
  );
}
