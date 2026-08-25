const API_BASE_URL = (import.meta.env.VITE_DEEPFUSION_API_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_DEEPFUSION_API_TIMEOUT_MS || 12000);

export class McpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'McpError';
    this.toolName = details.toolName;
    this.status = details.status;
    this.code = details.code || 'MCP_REQUEST_FAILED';
  }
}

export const mcp = {
  apiBaseUrl: API_BASE_URL,

  async call(toolName, args = {}) {
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
    }
  },
};
