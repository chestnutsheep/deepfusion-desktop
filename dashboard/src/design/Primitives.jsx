import React from 'react';
import { getMaxim } from '../data/maxims';

/** 玻璃面板：统一容器。className 可追加修饰。 */
export function Panel({ title, eyebrow, module, actions, children, className = '', style }) {
  return (
    <section className={`panel df-glass ${className}`} style={style}>
      {(title || eyebrow || actions) && (
        <div className="panel-head">
          <div>
            {eyebrow && <Eyebrow module={module || eyebrow}>{eyebrow}</Eyebrow>}
            {title && <h2 className="df-ghost-title">{title}</h2>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** 箴言小标题：若不传 children，按 module 自动取引经据典名句。 */
export function Eyebrow({ module, children, className = '' }) {
  const text = children || getMaxim(module);
  if (!text) return null;
  return <p className={`eyebrow ${className}`}>{text}</p>;
}

/** 指标数：大数字 + 标签 + 语义色。 */
export function Metric({ label, value, sub, tone, style }) {
  const color = tone ? `var(--df-${tone})` : undefined;
  return (
    <div className="df-metric" style={style}>
      <span className="df-metric-label">{label}</span>
      <b className="df-metric-value df-ghost-title" style={{ color }}>{value}</b>
      {sub && <span className="df-metric-sub">{sub}</span>}
    </div>
  );
}

/** 卡片：统一圆角/边框/玻璃。 */
export function Card({ children, className = '', onClick, style }) {
  return (
    <article
      className={`df-card ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </article>
  );
}
