import { useEffect, useState } from 'react';
import { fetchReportHealth } from '../services/reports';
import { mcp } from '../services/mcp';

const initialState = {
  state: 'checking',
  message: '正在检测报告数据接入…',
  rows: [],
};

export default function ReportDataStatus({ refreshKey = 0 }) {
  const [health, setHealth] = useState(initialState);

  useEffect(() => {
    let alive = true;
    setHealth(initialState);
    fetchReportHealth().then((result) => {
      if (alive) setHealth(result);
    });
    return () => { alive = false; };
  }, [refreshKey]);

  const tone = health.state === 'ready' ? 'ready' : health.state === 'empty' ? 'empty' : health.state === 'checking' ? 'checking' : 'error';
  return (
    <section className={`report-data-status ${tone}`} aria-live="polite">
      <div className="report-data-status-head">
        <div>
          <span className="report-data-kicker">REPORT DATA LINK</span>
          <strong>{health.message}</strong>
        </div>
        <span className="report-data-endpoint">{mcp.apiBaseUrl}</span>
      </div>
      <div className="report-data-status-grid">
        {health.rows.map((row) => (
          <div className="report-data-status-row" key={row.type}>
            <span>{row.label}</span>
            <b>{row.count > 0 ? `${row.count} 份` : '无记录'}</b>
            <small>{row.latestDate || row.error || '等待定时任务写入'}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
