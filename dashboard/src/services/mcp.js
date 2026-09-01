const API_BASE_URL = (import.meta.env.VITE_DEEPFUSION_API_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_DEEPFUSION_API_TIMEOUT_MS || 12000);
// 并发上限：后端是单进程 uv，过多在飞请求会堆积 Promise 并放大内存。限制同时最多 4 个。
const MAX_CONCURRENT = Number(import.meta.env.VITE_DEEPFUSION_MAX_CONCURRENT || 4);

export class McpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'McpError';
    this.toolName = details.toolName;
    this.status = details.status;
    this.code = details.code || 'MCP_REQUEST_FAILED';
  }
}

// 极简信号量：超过上限的请求排队，避免迸发打爆后端单进程
let activeCount = 0;
const queue = [];
function acquire() {
  return new Promise((resolve) => {
    if (activeCount < MAX_CONCURRENT) {
      activeCount += 1;
      resolve();
    } else {
      queue.push(resolve);
    }
  });
}
function release() {
  activeCount = Math.max(0, activeCount - 1);
  const next = queue.shift();
  if (next) { activeCount += 1; next(); }
}

export const mcp = {
  apiBaseUrl: API_BASE_URL,

  async call(toolName, args = {}) {
    await acquire();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName, arguments: args }),
        signal: controller.signal,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new McpError(json?.error || `MCP ${toolName} 请求失败`, {
          toolName,
          status: response.status,
          code: json?.code || 'MCP_RESPONSE_FAILED',
        });
      }
      return json.data ?? null;
    } catch (error) {
      if (error instanceof McpError) throw error;
      const message = error?.name === 'AbortError'
        ? `MCP ${toolName} 请求超时（${REQUEST_TIMEOUT_MS}ms）`
        : `MCP ${toolName} 无法连接：${error?.message || '未知网络错误'}`;
      throw new McpError(message, {
        toolName,
        code: error?.name === 'AbortError' ? 'MCP_TIMEOUT' : 'MCP_NETWORK_ERROR',
      });
    } finally {
      window.clearTimeout(timeout);
      release();
    }
  },
};
