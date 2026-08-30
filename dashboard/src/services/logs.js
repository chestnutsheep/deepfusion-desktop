// 轻量前端运行日志：捕获全局错误、console.error、以及关键调用失败，
// 持久化到 localStorage，供「设置 → 运行日志」排查（如 mcpTool 请求失败）。

const KEY = 'deepfusion.client.logs.v1';
const MAX = 200;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* 忽略写入失败 */
  }
}

export function logEvent(level, source, message, detail) {
  const entry = {
    t: new Date().toISOString(),
    level,
    source,
    message,
    detail: detail !== undefined ? safeDetail(detail) : undefined,
  };
  const list = read();
  list.push(entry);
  write(list);
  // 同时打到真实 console 方便 devtools 排查
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${source}] ${message}`, detail ?? '');
  return entry;
}

function safeDetail(d) {
  if (typeof d === 'string') return d.slice(0, 500);
  try {
    return JSON.stringify(d).slice(0, 500);
  } catch {
    return String(d).slice(0, 500);
  }
}

export function getLogs() {
  return read();
}

export function clearLogs() {
  write([]);
}

// 安装全局捕获（应在应用入口调用一次）
export function installGlobalLogCapture() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    logEvent('error', 'window', e.message || 'uncaught error', e.error?.stack || e.filename + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    logEvent('error', 'promise', 'unhandled rejection', reason?.message || String(reason));
  });
  const origErr = console.error;
  console.error = (...args) => {
    try {
      logEvent('error', 'console', String(args[0] ?? ''), args.slice(1));
    } catch { /* noop */ }
    origErr.apply(console, args);
  };
}
