export function readLocalValue(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 本地存储不可用时保持当前会话状态，不阻断桌面主屏。
  }
}

// 开发者模式：开启后显示底层路径、MCP/agent 等技术术语，默认关闭（普通用户视图）。
export function readDeveloperMode() {
  return readLocalValue('df_developer_mode', 'off') === 'on';
}

export function writeDeveloperMode(on) {
  writeLocalValue('df_developer_mode', on ? 'on' : 'off');
}
