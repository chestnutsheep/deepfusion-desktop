import React, { useMemo, useState } from 'react';

const PER_PAGE = 20; // 5 列 × 4 行

// Routine 类事件：对资金风险偏好有明确影响的固定/半固定节点
const ROUTINE_KEYWORDS = [
  '议息', '议息会议', '美联储', 'fomc', 'fed',
  '交割', '交割日', '期货交割',
  '调仓', '公募', '基金', '再平衡',
  '指标发布', '数据发布', 'cpi', 'ppi', 'gdp', '非农', 'pmi', '发布日',
  '季报', '中报', '年报', '披露',
];

/** 判断事件是否为 Routine 类（后端无 kind 字段时的兜底） */
function isRoutine(ev) {
  if (ev.kind === 'routine') return true;
  if (ev.kind && ev.kind !== 'routine') return false;
  const hay = `${ev.name || ''} ${ev.category || ''} ${ev.sector || ''}`.toLowerCase();
  return ROUTINE_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
}

const SENTIMENT_TONE = {
  '利好': 'var(--df-sent-pos)',
  '利空': 'var(--df-sent-neg)',
  '中性': 'var(--df-sent-neu)',
  'routine': 'var(--df-sent-routine)',
};

/** 事件语义色：利好红 / 利空绿 / 中性黄 / Routine 浅蓝 */
function sentimentTone(ev) {
  if (isRoutine(ev)) return 'routine';
  const s = (ev.sentiment || '中性');
  if (s === '利好') return '利好';
  if (s === '利空') return '利空';
  return '中性';
}

export default function EventGrid({ events = [] }) {
  const [page, setPage] = useState(0);

  const pages = useMemo(() => {
    const out = [];
    for (let i = 0; i < events.length; i += PER_PAGE) out.push(events.slice(i, i + PER_PAGE));
    return out.length ? out : [[]];
  }, [events]);

  const total = pages.length;
  const current = Math.min(page, total - 1);
  const slice = pages[current] || [];

  if (!events.length) {
    return <div className="daily-empty">未来 14 天暂无已归档事件。</div>;
  }

  return (
    <div className="event-grid-wrap">
      <div className="event-grid">
        {slice.map((ev, i) => {
          const tone = sentimentTone(ev);
          const color = SENTIMENT_TONE[tone];
          const label = tone === 'routine' ? 'Routine' : (ev.sentiment || '中性');
          return (
            <article
              className={`event-cell tone-${tone}`}
              key={ev.id || `${ev.date}-${i}`}
              style={{ '--cell-accent': color }}
            >
              <time>{String(ev.date || '—').slice(5)}</time>
              <strong>{ev.name || '未命名事件'}</strong>
              <span className="event-cell-cat">{ev.category || ev.sector || '市场事件'}</span>
              <b className="event-cell-tag">{label}</b>
            </article>
          );
        })}
        {/* 补齐本页空格，保持 5×4 视觉稳定 */}
        {Array.from({ length: PER_PAGE - slice.length }).map((_, i) => (
          <div className="event-cell event-cell-empty" key={`pad-${i}`} />
        ))}
      </div>

      <div className="event-pager">
        <button
          className="event-page-btn"
          disabled={current === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >← 上一页</button>
        <span className="event-page-info">
          {total > 1 ? `第 ${current + 1} / ${total} 页 · 共 ${events.length} 项` : `${events.length} 项事件`}
        </span>
        <button
          className="event-page-btn"
          disabled={current >= total - 1}
          onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
        >下一页 →</button>
      </div>

      <div className="event-legend">
        <span><i style={{ background: 'var(--df-sent-pos)' }} />利好</span>
        <span><i style={{ background: 'var(--df-sent-neg)' }} />利空</span>
        <span><i style={{ background: 'var(--df-sent-neu)' }} />中性</span>
        <span><i style={{ background: 'var(--df-sent-routine)' }} />Routine·资金情绪节点</span>
      </div>
    </div>
  );
}
