export const mcp = {
  async call(toolName, args = {}) {
    const response = await fetch('http://127.0.0.1:5173/api/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: toolName, arguments: args }),
    });
    const json = await response.json();
    if (!response.ok || !json.ok) throw new Error(json.error || 'MCP call failed');
    return json.data || null;
  },
};
