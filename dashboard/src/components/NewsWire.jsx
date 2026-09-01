import React, { useEffect, useMemo, useState } from 'react';
import { mcp } from '../services/mcp';

function dailyNewsRows(value) {
  const lines = String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== '[]' && line !== '—')
    // newsnow 段首行是表头 "时间,内容"，过滤掉；新浪段无此格式
    .filter((line) => line !== '时间,内容');
  return lines.map((text, i) => ({ id: i, text, time: '', channel: '' }));
}

// 从快讯文本里解析 时间 与 频道 标签
// 支持两种格式：
//   A) newsnow: "02:31:39,伊朗法尔斯通讯社…" 或 "• 02:31:39 内容"
//   B) 频道前缀: "【财联社】内容" / "(华尔街见闻) 内容"
function enrich(row) {
  let { text } = row;
  let time = '';
  let channel = '';
  // 时间：HH:MM:SS 在开头（后跟 , 或 空格）
  const tMatch = text.match(/^(?:•\s*)?(\d{1,2}:\d{2}:\d{2})[,\s]/);
  if (tMatch) { time = tMatch[1]; text = text.slice(tMatch[0].length); }
  // 频道：【x】 或 (x)
  const cMatch = text.match(/^(?:【(.+?)】|\((.+?)\))\s*/);
  if (cMatch) {
    channel = cMatch[1] || cMatch[2] || '';
    text = text.slice(cMatch[0].length);
  }
  return { ...row, time, channel, text };
}

export default function NewsWire() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [channelFilter, setChannelFilter] = useState('全部');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    mcp.call('stock_news_global', {})
      .then((data) => { if (alive) setRows(dailyNewsRows(data).map(enrich)); })
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    const timer = window.setInterval(() => {
      mcp.call('stock_news_global', {})
        .then((data) => alive && setRows(dailyNewsRows(data).map(enrich)))
        .catch(() => {});
    }, 60000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const channels = useMemo(() => {
    const set = new Set(rows.map((r) => r.channel).filter(Boolean));
    return ['全部', ...Array.from(set)];
  }, [rows]);

  const visible = channelFilter === '全部' ? rows : rows.filter((r) => r.channel === channelFilter);

  return (
    <section className="panel newswire-panel enter-one">
      <div className="panel-head">
        <div>
          <p className="eyebrow">DEEPFUSION / 7×24 NEWSWIRE</p>
          <h2>财经快讯</h2>
        </div>
        <span className="live-pill"><i className="live-dot" /> LIVE</span>
      </div>

      <div className="news-channels">
        {channels.map((c) => (
          <button
            key={c}
            className={`chip ${channelFilter === c ? 'on' : ''}`}
            onClick={() => setChannelFilter(c)}
          >{c}</button>
        ))}
      </div>

      <div className="news-stream">
        {visible.length ? (
          visible.map((r) => (
            <article className="news-item" key={r.id}>
              <span className="news-time">{r.time || 'LIVE'}</span>
              {r.channel && <span className="news-tag">{r.channel}</span>}
              <p className="news-text">{r.text}</p>
            </article>
          ))
        ) : (
          <div className="daily-empty">
            {loading ? '同步中…' : '暂无快讯，NEWSNOW 数据源恢复后自动更新。'}
          </div>
        )}
      </div>
      {loading && <div className="news-loading">同步中…</div>}
    </section>
  );
}
