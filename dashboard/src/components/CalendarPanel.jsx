import React, { useEffect, useMemo, useState } from 'react';
import { mcp } from '../services/mcp';

function parseJson(value, fallback) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || fallback; } catch { return fallback; }
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

const SENTIMENT_TONE = {
  '利好': 'pos',
  '利空': 'neg',
  '中性': 'neu',
  'routine': 'routine',
};

// 把后端事件映射到网格：识别埋伏窗口(bury_window)与 Routine 类
function normalizeEvent(ev) {
  const sentiment = ev.sentiment || '中性';
  const tone = SENTIMENT_TONE[sentiment] || 'neu';
  return {
    id: ev.id,
    date: ev.date,
    name: ev.name || '未命名事件',
    sector: ev.sector || ev.category || '市场事件',
    sentiment,
    tone,
    rating: ev.rating,
    bury: ev.bury_window === true || ev.bury_window === 1 || ev.bury_window === '1',
  };
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 周一=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CalendarPanel() {
  const [mode, setMode] = useState('month'); // month | week
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const base = startOfWeek(anchor);
    let start, end;
    if (mode === 'week') {
      start = fmt(base);
      const e = new Date(base);
      e.setDate(e.getDate() + 7);
      end = fmt(e);
    } else {
      const y = anchor.getFullYear();
      const m = anchor.getMonth();
      start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const next = m === 11 ? new Date(y + 1, 0, 1) : new Date(y, m + 1, 1);
      end = fmt(next);
    }
    mcp.call('calendar_range', { start, end })
      .then((data) => {
        if (!alive) return;
        const rows = parseJson(data, {}).events || [];
        setEvents(rows.map(normalizeEvent));
      })
      .catch(() => alive && setEvents([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mode, anchor]);

  // 构建网格日期
  const grid = useMemo(() => {
    const base = startOfWeek(anchor);
    const cells = [];
    const total = mode === 'week' ? 7 : 42;
    for (let i = 0; i < total; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [anchor, mode]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      (map[ev.date] = map[ev.date] || []).push(ev);
    }
    return map;
  }, [events]);

  const todayStr = fmt(new Date());
  const monthLabel = `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`;

  const shift = (dir) => {
    const d = new Date(anchor);
    if (mode === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const goToday = () => setAnchor(new Date());

  return (
    <section className="panel calendar-panel enter-one">
      <div className="panel-head">
        <div><p className="eyebrow">DEEPFUSION / CALENDAR</p><h2>金融日历</h2></div>
        <div className="calendar-controls">
          <div className="seg">
            <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>月</button>
            <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>周</button>
          </div>
          <button className="cal-nav" onClick={() => shift(-1)} aria-label="上一页">←</button>
          <span className="cal-label">{mode === 'week' ? `本周` : monthLabel}</span>
          <button className="cal-nav" onClick={() => shift(1)} aria-label="下一页">→</button>
          <button className="cal-today" onClick={goToday}>今天</button>
        </div>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>

      <div className={`calendar-grid ${mode === 'week' ? 'week' : 'month'}`}>
        {grid.map((d, i) => {
          const ds = fmt(d);
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = ds === todayStr;
          const dayEvents = eventsByDate[ds] || [];
          return (
            <div className={`cal-cell ${inMonth ? '' : 'muted'} ${isToday ? 'today' : ''}`} key={ds}>
              <span className="cal-day">{d.getDate()}</span>
              <div className="cal-events">
                {dayEvents.slice(0, mode === 'week' ? 4 : 3).map((ev) => (
                  <span className={`cal-event tone-${ev.tone}`} key={ev.id || ev.name} title={`${ev.name} · ${ev.sentiment}`}>
                    {ev.bury && <i className="bury-dot" title="埋伏窗口" />}
                    {ev.name}
                  </span>
                ))}
                {dayEvents.length > (mode === 'week' ? 4 : 3) && (
                  <span className="cal-more">+{dayEvents.length - (mode === 'week' ? 4 : 3)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="event-legend">
        <span><i style={{ background: 'var(--df-sent-pos)' }} />利好</span>
        <span><i style={{ background: 'var(--df-sent-neg)' }} />利空</span>
        <span><i style={{ background: 'var(--df-sent-neu)' }} />中性</span>
        <span><i style={{ background: 'var(--df-sent-routine)' }} />Routine·资金情绪节点</span>
        <span><i className="bury-dot" />埋伏窗口</span>
      </div>
      {loading && <div className="cal-loading">同步中…</div>}
    </section>
  );
}
