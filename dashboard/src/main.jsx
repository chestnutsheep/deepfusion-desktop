import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { getNextThemeId, getTheme, DEFAULT_THEME_ID } from './design/themes';
import { REPORT_TYPES } from './data/reportFixtures';
import { readLocalValue, writeLocalValue } from './shared/storage';
import { mcp } from './services/mcp';

const apiBaseUrl = mcp.apiBaseUrl;
import { fetchLatestReports } from './services/reports';
import ReportDataStatus from './components/ReportDataStatus';
import WatchlistPanel from './components/WatchlistPanel';
import EventGrid from './components/EventGrid';
import SettingsPage from './pages/SettingsPage';
import AssetAllocationPanel from './components/AssetAllocationPanel';
import FuturesPanel from './components/FuturesPanel';
import ConceptDeconstructPanel from './components/ConceptDeconstructPanel';
import MethodologyPanel from './components/MethodologyPanel';
import { Eyebrow } from './design/Primitives';
import { installGlobalLogCapture } from './services/logs';
import './styles.css';

installGlobalLogCapture();

const navItems = [['概览', '⌂'], ['日报', '✉'], ['设置', '⚙'], ['资产', '◧'], ['期货', '⬢'], ['概念', '⊞'], ['方法论', '❖'], ['任务', '◫'], ['市场', '⌁'], ['文件', '⌑'], ['专注', '◌']];
const schedule = [
  { time: '09:00', title: '盘前信息简报', meta: '本地任务 · 预计 2 分钟', state: '就绪', target: '日报' },
  { time: '12:50', title: '午间新闻驱动扫描', meta: '采集 · 分析 · 推送候选项', state: '待运行', target: '市场' },
  { time: '16:30', title: '优质股多维筛选', meta: '收盘数据完成后执行', state: '待运行', target: '市场' },
  { time: '21:00', title: '复盘与决策预演', meta: '本地报告 · 已接入日志', state: '待运行', target: '日报' },
];

const fallbackMarket = [
  { name: '上证指数', value: '3,462.37', delta: '+0.68%', positive: true },
  { name: '深证成指', value: '10,688.43', delta: '+0.41%', positive: true },
  { name: '创业板指', value: '2,156.93', delta: '−0.18%', positive: false },
  { name: '沪深300', value: '4,062.21', delta: '+0.44%', positive: true },
  { name: '上证50', value: '2,644.18', delta: '+0.21%', positive: true },
  { name: '科创50', value: '1,041.62', delta: '−0.32%', positive: false },
];

const fallbackUSMarket = [
  { name: '道琼斯', value: '44,785.12', delta: '+0.24%', positive: true },
  { name: '标普500', value: '6,370.50', delta: '+0.42%', positive: true },
  { name: '纳斯达克', value: '21,622.97', delta: '+0.83%', positive: true },
  { name: '纳斯达克100', value: '23,456.78', delta: '+0.76%', positive: true },
  { name: '费城半导体', value: '5,812.44', delta: '+1.14%', positive: true },
  { name: '科技板块', value: '—', delta: '等待开盘', positive: null },
];

function parseJson(value, fallback) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || fallback; } catch { return fallback; }
}

function parsePolicyText(value) {
  if (Array.isArray(value)) return value;
  const lines = String(value || '').split('\n').filter((line) => line.trim() && !line.startsWith('共 '));
  return lines.map((line, index) => {
    const match = line.trim().match(/^(.{10})\s+(.+?)(?:\s+(https?:\/\/\S+))?$/);
    return { id: `policy-${index}`, title: match?.[2] || line.trim(), meta: match?.[1]?.trim() || '政策库', url: match?.[3] || '' };
  });
}

function normalizeCapitalFlows(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const rows = [];
  const margin = value.margin;
  if (margin?.value_yi != null) rows.push({ name: '两融余额', meta: `${margin.date} · ${margin.value_yi.toFixed(1)} 亿 · 较前日 ${margin.delta_yi >= 0 ? '+' : ''}${margin.delta_yi.toFixed(1)} 亿` });
  const south = value.south;
  if (south?.value_yi != null) rows.push({ name: '南向资金', meta: `${south.date} · 净流入 ${south.value_yi.toFixed(1)} 亿 · 较前日 ${south.delta_yi >= 0 ? '+' : ''}${south.delta_yi.toFixed(1)} 亿` });
  const north = value.north;
  if (north?.available === false) rows.push({ name: '北向资金', meta: north.note || '官方实时净买入额不可得' });
  const fund = value.public_fund;
  if (fund) rows.push({ name: '行业资金代理', meta: `${fund.top_inflow?.[0]?.name || '—'} 流入居前；${fund.top_outflow?.[0]?.name || '—'} 流出居前` });
  if (value.nation_team) rows.push({ name: '国家队代理', meta: `${value.nation_team.total_net_yi ?? '—'} 亿 · ${value.nation_team.note || '代理指标'}` });
  return rows;
}

function getMarketSession(date) {
  const day = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  const aShare = day >= 1 && day <= 5 && ((minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900));
  const us = day >= 1 && day <= 5 && (minutes >= 21 * 60 || minutes < 4 * 60);
  if (aShare) return 'a-share-open';
  if (us) return 'us-open';
  return 'closed';
}

function schedulePhase(time, date) {
  const [hour, minute] = time.split(':').map(Number);
  const current = date.getHours() * 60 + date.getMinutes();
  const target = hour * 60 + minute;
  if (current > target + 20) return 'done';
  if (current >= target) return 'current';
  return 'upcoming';
}

function ScheduleTimeline({ now, onNavigate }) {
  return <div className="schedule-timeline">
    {schedule.map((item) => {
      const phase = schedulePhase(item.time, now);
      return <button className={`schedule-card ${phase}`} key={item.time} onClick={() => onNavigate(item.target)}>
        <span className="schedule-time">{item.time}</span>
        <span className="schedule-line"><i /></span>
        <span className="schedule-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>
        <span className="schedule-state">{phase === 'done' ? '已完成' : phase === 'current' ? '进行中' : item.state}<b>→</b></span>
      </button>;
    })}
  </div>;
}

function MarketPulse({ now, onNote }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const session = getMarketSession(now);
  const usSession = session === 'us-open';
  const aShareSession = session === 'a-share-open';
  useEffect(() => {
    let alive = true;
    setLoading(true);
    mcp.call('market_broad_snapshot', { force: false })
      .then((data) => { if (alive) setSnapshot(parseJson(data, null)); })
      .catch(() => { if (alive) setSnapshot(null); })
      .finally(() => alive && setLoading(false));
    const timer = window.setInterval(() => {
      mcp.call('market_broad_snapshot', { force: false })
        .then((data) => alive && setSnapshot(parseJson(data, null)))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    }, 60000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [usSession]);
  const sourceItems = usSession ? snapshot?.global_indices : aShareSession ? snapshot?.indices : null;
  const items = sourceItems?.length ? sourceItems.slice(0, 6).map((item) => ({
    name: item.name, value: item.price == null ? '—' : Number(item.price).toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
    delta: item.change_pct == null ? '—' : `${item.change_pct >= 0 ? '+' : ''}${item.change_pct.toFixed(2)}%`, positive: item.change_pct == null ? null : item.change_pct >= 0,
  })) : [];
  const turnover = snapshot?.turnover;
  const sessionLabel = aShareSession ? 'A股交易中' : usSession ? '美股交易中' : '市场休市';
  const freshnessLabel = loading ? '同步中' : snapshot?.snapshot_at ? `${session === 'closed' ? '最近快照' : '快照'} ${snapshot.snapshot_at.slice(11, 16)}` : '无快照';
  return <section className="panel market enter-four">
    <div className="panel-head"><div><Eyebrow module="market">市场脉冲</Eyebrow><h2>市场脉冲</h2></div><span className="source-pill">{sessionLabel} · {freshnessLabel}</span></div>
    {items.length ? <div className="market-list">{items.map((item) => <div className="market-row" key={item.name}><span>{item.name}</span><strong>{item.value}</strong><b className={item.positive === true ? 'up' : item.positive === false ? 'down' : 'flat'}>{item.delta}</b></div>)}</div> : <div className="market-empty">{usSession ? '美股指数源暂不可用，未使用旧数据冒充实时。' : session === 'closed' ? '当前休市，等待下一交易时段实时快照。' : '当前交易时段暂无有效指数数据。'}</div>}
    <div className="market-data-strip"><div><small>涨跌比例</small><strong>{sourceItems?.length ? `${sourceItems.filter((x) => x.change_pct > 0).length} / ${sourceItems.filter((x) => x.change_pct < 0).length}` : '— / —'}</strong></div><div><small>成交额</small><strong>{turnover?.today_yi ? `${turnover.today_yi} 亿` : '—'}</strong></div><div><small>较昨日</small><strong className={turnover?.delta_pct >= 0 ? 'up' : turnover?.delta_pct == null ? 'flat' : 'down'}>{turnover?.delta_pct == null ? '—' : `${turnover.delta_pct >= 0 ? '+' : ''}${turnover.delta_pct.toFixed(2)}%`}</strong></div></div>
    <div className="market-footer"><span>{aShareSession ? 'A股六大重要指数 · 红涨绿跌' : usSession ? '美股核心指数 · 数据源独立' : '休市状态 · 显示最近一次有效快照'}</span><button onClick={() => onNote('市场脉冲：指数、涨跌比例和成交额新鲜度已校验。')}>查看专区 ↗</button></div>
  </section>;
}

function textValue(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join('；');
  if (typeof value === 'object') return value.summary || value.overview || value.title || value.name || fallback;
  return fallback;
}


function ReportSection({ title, value }) {
  if (value == null || value === '') return null;
  const rows = Array.isArray(value) ? value : null;
  return <section className="report-section"><h3>{title}</h3>{rows ? <div className="report-section-list">{rows.slice(0, 8).map((row, index) => <div key={index}><b>{textValue(row.title || row.name || row.theme || row.code, `条目 ${index + 1}`)}</b><span>{textValue(row.summary || row.reason || row.note || row.detail || row.value, '已归档')}</span></div>)}</div> : <p>{textValue(value)}</p>}</section>;
}

function ReportDetailContent({ report }) {
  const payload = report.payload || {};
  if (report.key === 'qualitystock') return <div className="report-stock-grid">{(payload.stocks || []).slice(0, 12).map((stock) => <article className="report-stock-card" key={stock.code || stock.name}><div><b>{stock.name || '未命名'}</b><span>{stock.code || '—'} · {stock.sector || stock.track || '候选'}</span></div><strong>{stock.quality == null ? '—' : Number(stock.quality).toFixed(1)}<small> 综合</small></strong><p>{stock.logic || stock.reason || '多维指标已入库。'}</p><div>{(stock.tags || []).map((tag) => <i key={tag}>{tag}</i>)}</div></article>)}</div>;
  if (report.key === 'dailyreview') return <div className="report-detail-grid"><ReportSection title="市场指数" value={payload.indices} /><ReportSection title="观察标的" value={payload.symbols} /><ReportSection title="复盘结论" value={payload.overview || payload['今日复盘结论'] || payload['📌 今日复盘结论']} /></div>;
  if (report.key === 'noonnews') return <div className="report-detail-grid"><ReportSection title="午间 headline" value={payload.headline} /><ReportSection title="新闻催化" value={payload.items || payload.catalysts} /><ReportSection title="候选范围" value={payload.candidates} /></div>;
  if (report.key === 'premarket') return <div className="report-detail-grid"><ReportSection title="海外市场" value={payload.overseas || payload['海外市场速览']} /><ReportSection title="政策与产业" value={payload.policy || payload.industry || payload['五维催化归集']} /><ReportSection title="公告与业绩" value={payload.announcement || payload.earnings || payload['催化事件汇总']} /><ReportSection title="主线与风险" value={payload.mainline_view || payload.risk_hint || payload.data_caveat} /></div>;
  return <ReportSection title="报告内容" value={Object.entries(payload).map(([key, value]) => ({ name: key, summary: textValue(value) }))} />;
}

function ReportRow({ report, onOpen, compact = false }) {
  return <button className={compact ? 'report-row compact' : 'report-row'} onClick={() => onOpen(report)}>
    <span className={report.unread ? 'report-mark unread' : 'report-mark'} />
    <span className="report-type">{report.type}</span>
    <span className="report-copy"><b>{report.title}</b><small>{report.summary}</small></span>
    <span className="report-time"><b>{report.createdAt}</b><small>{report.date}</small></span>
  </button>;
}

function CapabilityPanel({ title, eyebrow, items, empty = '暂无数据' }) {
  return <section className="panel capability-panel enter-one"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><div className="capability-list">{items?.length ? items.map((item, index) => <div className="capability-row" key={item.id || item.name || index}><strong>{item.name || item.title || item.date}</strong><span>{item.meta || item.summary || item.category || item.note || '已接入'}</span></div>) : <div className="capability-empty">{empty}</div>}</div></section>;
}

function DeepFusionBrief({ reports = [], capitalFlows, derivatives = [], calendarEvents = [], onOpenReports, extraClass = '' }) {
  const latest = Array.isArray(reports) ? reports.slice(0, 4) : [];
  const flowRows = normalizeCapitalFlows(capitalFlows).slice(0, 2);
  const handleOpen = typeof onOpenReports === 'function' ? onOpenReports : () => {};
  return <section className={`panel fusion-brief enter-five${extraClass ? ' ' + extraClass : ''}`}>
    <div className="panel-head"><div><Eyebrow module="overview">研究台摘要</Eyebrow><h2>研究台摘要</h2></div><button onClick={() => handleOpen()}>打开日报 <span>→</span></button></div>
    <div className="fusion-brief-grid">
      <div className="fusion-brief-block"><small>最新判断</small>{latest.length ? latest.map((report) => <button className="fusion-brief-report" key={report.id} onClick={() => handleOpen(report)}><b>{report.type}</b><span>{report.summary}</span><i>{report.date}</i></button>) : <span className="fusion-brief-empty">暂无真实日报入库</span>}</div>
      <div className="fusion-brief-block"><small>资金、衍生品与事件</small>{flowRows.map((item) => <div className="fusion-brief-line" key={item.name}><b>{item.name}</b><span>{item.meta}</span></div>)}{derivatives.map((item) => <div className="fusion-brief-line" key={item.name}><b>{item.name}</b><span>{item.meta}</span></div>)}<div className="fusion-brief-line"><b>未来事件</b><span>{calendarEvents.length ? `${calendarEvents.length} 项已排期` : '暂无日历事件'}</span></div></div>
    </div>
  </section>;
}

function dailyNewsRows(value) {
  const lines = String(value || '').split('\\n').map((line) => line.trim()).filter(Boolean).filter((line) => line !== '[]' && line !== '—');
  if (lines.length > 1 && /[,，]/.test(lines[0])) lines.shift();
  return lines.slice(0, 8).map((line, index) => {
    const fields = line.split(/[,，]/).map((part) => part.trim()).filter(Boolean);
    const match = line.match(/^(\\d{1,2}:\\d{2}(?::\\d{2})?)\\s+(.*)$/);
    const text = match?.[2] || fields.find((field) => !/^\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}$/.test(field) && !/^\\d{1,2}:\\d{2}/.test(field)) || line;
    return { id: `news-${index}-${line}`, time: match?.[1] || fields.find((field) => /\\d{1,2}:\\d{2}/.test(field)) || 'LIVE', text: text.slice(0, 88) };
  });
}

function DailyMetric({ label, value, meta, accent = 'var(--theme-accent)' }) {
  return <div className="daily-metric"><small>{label}</small><strong style={{ color: accent }}>{value}</strong><span>{meta}</span></div>;
}

function DailyDashboard({ reports, limitUp, calendarEvents, news, loading, onOpenReport, onOpenReports }) {
  const stocks = Array.isArray(limitUp?.stocks) ? limitUp.stocks : [];
  const events = Array.isArray(calendarEvents) ? calendarEvents.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(0, 6) : [];
  const maxBoard = stocks.reduce((max, stock) => Math.max(max, Number(stock.board_height) || 0), 0);
  const topScore = stocks.reduce((max, stock) => Math.max(max, Number(stock.score) || 0), 0);
  const latestNews = news?.[0];
  const sentimentColor = (value) => value === '利好' ? '#6FA088' : value === '利空' ? '#C07C7C' : 'var(--df-web-muted)';
  return <section className="daily-dashboard enter-one">
    <div className="daily-dashboard-head">
      <div><Eyebrow module="events">今日信号台</Eyebrow><h1>Daily <i>Signal Desk</i></h1><p>把连板、日历与 7×24 快讯压缩成可扫描的今日状态。</p></div>
      <button className="focus-toggle" onClick={onOpenReports}>报告档案 <span>→</span></button>
    </div>
    <div className="daily-metrics">
      <DailyMetric label="连板池" value={loading.limitUp ? '…' : stocks.length} meta={limitUp?.date ? `数据日 ${limitUp.date}` : '暂无收盘扫描'} />
      <DailyMetric label="最高连板" value={maxBoard ? `${maxBoard}板` : '—'} meta={stocks.length ? `${stocks.filter((s) => Number(s.board_height) === maxBoard).length} 只同高度` : '等待数据'} accent="#C9A861" />
      <DailyMetric label="最高评分" value={topScore ? Math.round(topScore) : '—'} meta={topScore ? '综合评分最高标的' : '等待数据'} accent="#6FA088" />
      <DailyMetric label="未来事件" value={events.length || '—'} meta={events[0]?.date ? `最近 ${events[0].date}` : '暂无日历'} accent="#8FD6FF" />
      <DailyMetric label="7×24 快讯" value={news?.length || '—'} meta={latestNews?.time ? `最新 ${latestNews.time}` : '暂无快讯'} accent="#D5CDB8" />
    </div>
    <div className="daily-grid">
      <section className="daily-panel daily-limitup-panel"><div className="daily-panel-head"><div><small>01 / LIMIT-UP</small><h2>连板分析</h2></div><span>{stocks.length ? `${stocks.length} 个候选` : '暂无数据'}</span></div>
        {stocks.length ? <div className="daily-board-list">{stocks.slice(0, 7).map((stock, index) => <button className="daily-board-row" key={stock.code || index} onClick={() => onOpenReport({ type: '连板分析', title: `${stock.name || '标的'} · ${stock.board_height || 0}连板`, summary: stock.rationale || stock.stage || '连板数据已入库。', date: limitUp?.date || '—', status: '实时快照', key: 'limitup', payload: stock })}><b>{String(index + 1).padStart(2, '0')}</b><strong>{stock.name || '未命名'}</strong><span>{stock.board_height || 0}板 · {stock.stage || '观察'}</span><em>{stock.score == null ? '—' : Math.round(stock.score)}</em></button>)}</div> : <div className="daily-empty">暂无可回溯的连板数据。</div>}
      </section>
      <section className="daily-panel daily-calendar-panel"><div className="daily-panel-head"><div><small>02 / CALENDAR</small><h2>金融日历</h2></div><span>{events.length ? `${events.length} 项近期事件` : '暂无数据'}</span></div>
        {events.length ? <EventGrid events={events} /> : <div className="daily-empty">未来 14 天暂无已归档事件。</div>}
      </section>
      <section className="daily-panel daily-news-panel"><div className="daily-panel-head"><div><small>03 / 7×24 NEWSWIRE</small><h2>财经快讯</h2></div><span>{news?.length ? `${news.length} 条最新` : '暂无数据'}</span></div>
        {news?.length ? <div className="daily-news-list">{news.map((item) => <div className="daily-news-row" key={item.id}><time>{item.time || 'LIVE'}</time><p>{item.text}</p></div>)}</div> : <div className="daily-empty">暂无快讯，数据源恢复后自动更新。</div>}
      </section>
      <section className="daily-panel daily-reports-panel"><div className="daily-panel-head"><div><small>04 / REPORT STREAM</small><h2>今日判断</h2></div><button onClick={onOpenReports}>查看全部 <span>→</span></button></div><div className="daily-report-list">{reports.slice(0, 4).map((report) => <button className="daily-report-row" key={report.id} onClick={() => onOpenReport(report)}><b>{report.type}</b><span>{report.summary}</span><time>{report.date}</time></button>)}</div></section>
    </div>
  </section>;
}

function App() {
  const [now, setNow] = useState(new Date());
  const [active, setActive] = useState('概览');
  const [dockOpen, setDockOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [note, setNote] = useState(() => readLocalValue('deepfusion.desktop.note', '请输入需要记录的事项。'));
  const [themeId, setThemeId] = useState(() => readLocalValue('deepfusion.desktop.theme', DEFAULT_THEME_ID));
  const [inboxOpen, setInboxOpen] = useState(false);
  const [dataStatusOpen, setDataStatusOpen] = useState(false);
  const [dataStatusRefresh, setDataStatusRefresh] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportFilter, setReportFilter] = useState('全部');
  const [liveReports, setLiveReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [capitalFlows, setCapitalFlows] = useState(null);
  const [policyResults, setPolicyResults] = useState([]);
  const [modelConfig, setModelConfig] = useState(null);
  const [butlerContext, setButlerContext] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [limitUp, setLimitUp] = useState(null);
  const [dailyNews, setDailyNews] = useState([]);
  const [dailyLoading, setDailyLoading] = useState({ limitUp: true, news: true });
  // 后端服务是否处于运行态：决定面板是“已启动”还是“已关闭（需点击启动应用）”
  const [running, setRunning] = useState(true);
  const [backendBusy, setBackendBusy] = useState(false);
  const theme = getTheme(themeId);
  const reportRows = liveReports;
  const unreadCount = reportRows.filter((report) => report.unread).length;
  const visibleReports = useMemo(() => reportFilter === '全部' ? reportRows : reportRows.filter((report) => report.type === reportFilter), [reportFilter, reportRows]);

  useEffect(() => {
    let alive = true;
    setReportsLoading(true);
    fetchLatestReports(8).then((rows) => {
      if (!alive) return;
      setLiveReports(rows);
      setReportsError(!rows.length);
      setReportsLoading(false);
    });
    mcp.call('calendar_upcoming', { days: 14 }).then((data) => { if (alive) setCalendarEvents(parseJson(data, {}).events || []); }).catch(() => {});
    mcp.call('limit_up_latest', {}).then((data) => { if (alive) setLimitUp(parseJson(data, null)); }).catch(() => {}).finally(() => alive && setDailyLoading((state) => ({ ...state, limitUp: false })));
    mcp.call('stock_news_global', {}).then((data) => { if (alive) setDailyNews(dailyNewsRows(data)); }).catch(() => {}).finally(() => alive && setDailyLoading((state) => ({ ...state, news: false })));
    mcp.call('capital_flows_snapshot', { force: false }).then((data) => { if (alive) setCapitalFlows(parseJson(data, null)); }).catch(() => {});
    Promise.all([
      mcp.call('option_ivix', { limit: 1 }).then((data) => ({ name: '50ETF QVIX', meta: '最新 ' + String(data).split('\\n').filter(Boolean).slice(-1)[0]?.slice(0, 80) })).catch(() => null),
      mcp.call('futures_prices', { symbol: '原油', limit: 1 }).then((data) => ({ name: '原油主力', meta: '最新主力行情已接入' })).catch(() => null),
    ]).then((rows) => { if (alive) setDerivatives(rows.filter(Boolean)); });
    mcp.call('policy_search', { keyword: '', limit: 6 }).then((data) => { if (alive) setPolicyResults(parsePolicyText(data).slice(0, 6)); }).catch(() => {});
    fetch(`${apiBaseUrl}/api/model-config`).then((response) => response.json()).then((data) => { if (alive && data.ok) setModelConfig(data.config); }).catch(() => {});
    fetch(`${apiBaseUrl}/api/butler/context?scope=desktop&limit=5`).then((response) => response.json()).then((data) => { if (alive && data.ok) setButlerContext(data.context || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    writeLocalValue('deepfusion.desktop.note', note);
  }, [note]);

  useEffect(() => {
    writeLocalValue('deepfusion.desktop.theme', themeId);
  }, [themeId]);

  // 应用首次加载时自动拉起后端并保持活性（仅一次）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await invoke('start_backend');
        if (!cancelled) setRunning(true);
      } catch (e) {
        console.error('[desktop] init backend failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openReport = (report) => { setInboxOpen(false); setSelectedReport(report); };
  const openReportCenter = () => { setInboxOpen(false); setActive('日报'); };
  const navigateFromSchedule = (target) => {
    setActive(target);
    if (target === '市场') window.requestAnimationFrame(() => document.getElementById('market-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    if (target === '日报') window.requestAnimationFrame(() => setInboxOpen(true));
  };
  const hidePanel = async () => {
    try {
      const window = getCurrentWindow();
      await window.setFullscreen(false);
      // Wayland 下 minimize() 常被 compositor 忽略（点击无反应），
      // 直接 hide() 更可靠；restorePanel 已通过 show() 提供恢复入口。
      if (typeof window.hide === 'function') await window.hide();
      else if (typeof window.minimize === 'function') await window.minimize();
    } catch (error) {
      console.error('[desktop] hide panel failed', error);
    }
  };
  const restorePanel = async () => {
    try {
      const window = getCurrentWindow();
      await window.setFullscreen(false);
      if (await window.isMaximized()) await window.unmaximize();
      await window.show();
      await window.setFocus();
    } catch (error) {
      console.error('[desktop] restore panel failed', error);
    }
  };
  const closePanel = async () => {
    try {
      // 先结束后端服务（整个进程组），再隐藏面板。进程保留以便下次点击启动应用。
      setBackendBusy(true);
      try { await invoke('stop_backend'); } catch (e) { console.error('[desktop] stop backend failed', e); }
      const window = getCurrentWindow();
      await window.setFullscreen(false);
      await window.hide();
      setRunning(false);
    } catch (error) {
      console.error('[desktop] close panel failed', error);
    } finally {
      setBackendBusy(false);
    }
  };
  const startPanel = async () => {
    try {
      setBackendBusy(true);
      await invoke('start_backend');
      const window = getCurrentWindow();
      if (await window.isMinimized()) await window.unminimize();
      await window.show();
      await window.setFocus();
      setRunning(true);
    } catch (error) {
      console.error('[desktop] start panel failed', error);
    } finally {
      setBackendBusy(false);
    }
  };
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const timeLabel = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const showReportCenter = active === '日报';
  const showWorkbench = active === '工作台' || active === '设置';
  const taskItems = calendarEvents.map((event) => ({ id: event.id, name: event.name, meta: `${event.date} · ${event.sector || event.category || '市场事件'} · ${event.sentiment || '待研判'}` }));
  const capitalItems = normalizeCapitalFlows(capitalFlows);

  return <main className={focus ? 'desktop focus-mode' : 'desktop'} style={{
    '--theme-image': `url(/assets/${theme.file})`, '--theme-deep': theme.deep, '--theme-mid': theme.mid,
    '--theme-glow': theme.glow, '--theme-accent': theme.accent,
  }}>
    <div className="aurora aurora-one" /><div className="aurora aurora-two" /><div className="grain" />
    <header className="statusbar">
      <div className="brand"><span className="brand-mark">D</span><span>DeepFusion</span><i>DESKTOP</i></div>
      <div className="time"><strong>{timeLabel}</strong><span>{dateLabel}</span></div>
      <div className="system-status" aria-label="系统状态">
        <span className="theme-label"><span className="online-dot" /> {theme.name}主题</span>
        <button className="icon-button inbox-trigger" onClick={() => { setInboxOpen(!inboxOpen); setDataStatusOpen(false); }} aria-label="打开日报收件箱">✉{unreadCount > 0 && <b>{unreadCount}</b>}</button>
        <button className="data-link-trigger" onClick={() => { setDataStatusOpen(!dataStatusOpen); setDataStatusRefresh((value) => value + 1); setInboxOpen(false); }} aria-expanded={dataStatusOpen} aria-controls="report-data-popover">
          <span className="data-link-dot" /> 数据
        </button>
        <button className="icon-button" onClick={() => setThemeId(getNextThemeId(themeId))} aria-label="切换睡莲主题">◌</button>
        <button className="icon-button desktop-trigger" onClick={hidePanel} aria-label="最小化面板" title="最小化到任务栏（点任务栏图标可恢复）">▣</button>
        <button className="power-button" onClick={() => { setSettingsOpen(false); closePanel(); }} aria-label="关闭主屏并结束后端服务" title="关闭主屏并结束前后端服务">⏻ 关闭主屏</button>
        <div className="settings-wrap">
          <button className="icon-button" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="更多系统设置" aria-expanded={settingsOpen}>⋮</button>
          {settingsOpen && <div className="settings-popover" role="menu" aria-label="主屏设置">
            <button role="menuitem" onClick={() => { restorePanel(); setSettingsOpen(false); }}>恢复面板 <span>□</span></button>
            <button role="menuitem" onClick={() => { setSettingsOpen(false); startPanel(); }}>启动应用 <span>▶</span></button>
          </div>}
        </div>
      </div>
      {inboxOpen && <aside className="inbox-popover" aria-label="日报收件箱">
        <div className="inbox-head"><div><Eyebrow module="overview">日报收件箱</Eyebrow><h2>日报收件箱</h2></div><span>{unreadCount} 封新报告</span></div>
        <div className="inbox-list">{reportRows.slice(0, 4).map((report) => <ReportRow key={report.id} report={report} onOpen={openReport} compact />)}</div>
        <div className="inbox-foot"><span>按实际生成时间排序</span><button onClick={openReportCenter}>进入报告中心 <i>→</i></button></div>
      </aside>}
      {dataStatusOpen && <aside id="report-data-popover" className="report-data-popover" aria-label="报告数据接入状态">
        <div className="report-data-popover-head"><div><p className="eyebrow">REPORT DATA LINK</p><h2>数据接入</h2></div><button onClick={() => setDataStatusOpen(false)} aria-label="关闭数据接入面板">×</button></div>
        <ReportDataStatus refreshKey={dataStatusRefresh} />
        <div className="report-data-popover-foot"><span>检测 MCP → reports.db 实时链路</span><button onClick={() => setDataStatusRefresh((value) => value + 1)}>重新检测 ↻</button></div>
      </aside>}
    </header>

    <section className="content-shell">
      <aside className="rail" aria-label="主导航">
        {navItems.map(([label, icon]) => <button key={label} onClick={() => { setActive(label); if (label === '专注') setFocus(true); }} className={active === label ? 'nav active' : 'nav'}><span>{icon}</span><em>{label}</em></button>)}
      </aside>
      <div className="workspace">
        {showWorkbench ? <SettingsPage config={modelConfig} reports={reportRows} onOpenReports={openReportCenter} /> : showReportCenter ? <>{<DailyDashboard reports={reportRows} limitUp={limitUp} calendarEvents={calendarEvents} news={dailyNews} loading={dailyLoading} onOpenReport={openReport} onOpenReports={() => setReportFilter('全部')} />}<section className="report-center daily-archive enter-one">
          <div className="report-center-hero"><div><Eyebrow module="overview">日报档案</Eyebrow><h1>日报档案。<br /><span>把每一次判断留在时间里。</span></h1><p>四类日报直接读取 `reports.db`，按报告业务日与实际入库时间排序；不同报告采用对应的阅读结构。</p></div><button className="focus-toggle" onClick={() => setActive('概览')}>返回主屏 <span>←</span></button></div>
          <ReportDataStatus refreshKey={reportsLoading ? 0 : 1} />
          <div className="archive-toolbar"><div className="archive-tabs">{REPORT_TYPES.map((filter) => <button key={filter} className={reportFilter === filter ? 'selected' : ''} onClick={() => setReportFilter(filter)}>{filter}</button>)}</div><span>{reportsLoading ? '正在读取 SQL…' : reportsError ? '当前无日报入库' : `共 ${visibleReports.length} 份档案`}</span></div>
          <div className="archive-list">{reportsLoading ? <div className="report-empty-state">正在从 `reports.db` 读取日报…</div> : visibleReports.length ? visibleReports.map((report) => <article key={report.id} className="archive-item"><ReportRow report={report} onOpen={openReport} /><div className="report-meta"><span>{report.status}</span><span>报告日 {report.date}</span><span>实际入库 {report.createdAt}</span></div></article>) : <div className="report-empty-state">暂无符合条件的真实日报，定时任务写入后会自动出现在这里。</div>}</div>
        </section></> : <>
          {active === '任务' && <CapabilityPanel title="未来 14 天金融事件" eyebrow="DEEPFUSION / EVENT CALENDAR" items={taskItems} empty="事件日历暂无待办，点击下方刷新后端采集。" />}
          {active === '市场' && <CapabilityPanel title="资金面动向" eyebrow="DEEPFUSION / CAPITAL FLOWS" items={capitalItems} empty="资金快照暂未落盘。" />}
          {active === '文件' && <CapabilityPanel title="政策文件索引" eyebrow="DEEPFUSION / POLICY LIBRARY" items={policyResults} empty="政策库暂无结果；本机文件浏览能力尚未接入。" />}
          {active === '资产' && <AssetAllocationPanel />}
          {active === '期货' && <FuturesPanel />}
          {active === '概念' && <ConceptDeconstructPanel />}
          {active === '方法论' && <MethodologyPanel />}
          <section className="hero enter-one"><div><p className="eyebrow">TODAY / {now.toISOString().slice(0, 10)} <span className="theme-caption">· {theme.name} / {theme.tone}</span></p><h1 className="hero-motto"><span>Move with intention.</span><br /><i>Let the day unfold.</i></h1></div><button className="focus-toggle" onClick={() => setFocus(!focus)}>{focus ? '退出专注' : '进入专注'} <span>↗</span></button></section>
          {!focus && <div className="dashboard-grid">
            <div className="dashboard-main">
              <section className="content-block">
                <div className="block-head"><div><Eyebrow module="watchlist">持仓追踪</Eyebrow><h2>持仓追踪</h2></div><span className="block-hint">个股 · 基金 · 盈亏 · 仓位</span></div>
                <WatchlistPanel extraClass="panel--primary block-body" />
              </section>
              <section className="content-block">
                <div className="block-head"><div><Eyebrow module="market">盘面脉搏</Eyebrow><h2>盘面脉搏</h2></div><span className="block-hint">资金面 · 涨跌家数 · 板块强度</span></div>
                <div id="market-pulse" className="panel market panel--secondary block-body"><MarketPulse now={now} onNote={setNote} /></div>
              </section>
              <section className="content-block">
                <div className="block-head"><div><Eyebrow module="overview">研究台摘要</Eyebrow><h2>研究台摘要</h2></div><button className="focus-toggle" onClick={() => openReportCenter()}>打开日报 <span>→</span></button></div>
                <DeepFusionBrief reports={reportRows} capitalFlows={capitalFlows} derivatives={derivatives} calendarEvents={calendarEvents} extraClass="panel--secondary block-body" onOpenReports={(report) => report ? openReport(report) : openReportCenter()} />
              </section>
            </div>
            <aside className="dashboard-aside">
              <section className="content-block">
                <div className="block-head"><div><Eyebrow module="agenda">今日任务安排</Eyebrow><h2>今日任务安排</h2></div><button className="focus-toggle" onClick={() => setActive('任务')}>任务专区 <span>→</span></button></div>
                <section className="panel agenda panel--secondary enter-two block-body"><ScheduleTimeline now={now} onNavigate={navigateFromSchedule} /></section>
              </section>
              <section className="content-block">
                <div className="block-head"><div><Eyebrow module="note">工作备注</Eyebrow><h2>工作备注</h2></div></div>
                <section className="panel command panel--secondary enter-three block-body"><textarea value={note} onChange={(event) => setNote(event.target.value)} aria-label="桌面便签" /><div className="note-footer"><span><i className="tiny-dot" /> 已自动保存</span><button onClick={() => setNote('已清空。')}>清空</button></div></section>
              </section>
            </aside>
          </div>}
        </>}
      </div>
    </section>
    {selectedReport && <div className="report-overlay" role="dialog" aria-modal="true" aria-label="日报详情"><article className="report-detail"><button className="detail-close" onClick={() => setSelectedReport(null)} aria-label="关闭日报详情">×</button><p className="eyebrow">{selectedReport.key.toUpperCase()} / {selectedReport.date}</p><span className="detail-kind">{selectedReport.type} · {selectedReport.status}</span><h2>{selectedReport.title}</h2><div className="detail-time"><span>报告业务日 <b>{selectedReport.date}</b></span><span>实际生成 <b>{selectedReport.createdAt}</b></span></div><p>{selectedReport.summary}</p><div className="report-detail-divider"><span className="report-detail-label">核心要点</span><ReportDetailContent report={selectedReport} /></div></article></div>}
    <div className="watermark" aria-hidden="true"><span>WATER<br />LILY</span><i>DEEPFUSION</i></div>
    <button className="butler" onClick={() => setNote('管家入口已响应；下一阶段将接入本机 Butler 服务。')} aria-label="打开本机管家"><span>✦</span><i>管家</i></button>
    <div className={dockOpen ? 'dock open' : 'dock'} onMouseEnter={() => setDockOpen(true)} onMouseLeave={() => setDockOpen(false)}>
      <button aria-label="打开设置" onClick={() => { setActive('设置'); setDockOpen(false); }}>⚙</button>
      <button aria-label="打开文件" onClick={() => { setActive('文件'); setDockOpen(false); }}>⌑</button>
      <button aria-label="打开概览" onClick={() => { setActive('概览'); setDockOpen(false); }}>◉</button>
      <button aria-label="打开数据面板" onClick={() => { setDataStatusOpen(true); setDataStatusRefresh((value) => value + 1); setDockOpen(false); }}>›_</button>
      <button aria-label="打开设置" onClick={() => { setSettingsOpen(true); setDockOpen(false); }}>⚙</button>
    </div>
    <button className="dock-trigger" onClick={() => setDockOpen(!dockOpen)} aria-label="切换快捷启动栏">⌃</button>
    {!running && (
      <div className="app-launcher" role="dialog" aria-label="应用已关闭">
        <div className="app-launcher-card">
          <span className="brand-mark">D</span>
          <h1>DeepFusion 已停止</h1>
          <p>前后端服务均已结束。点击下方按钮拉起后端并保持活性，直到再次关闭主屏。</p>
          <button className="launch-button" onClick={startPanel} disabled={backendBusy}>
            {backendBusy ? '正在拉起服务…' : '启动应用 ▶'}
          </button>
        </div>
      </div>
    )}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
