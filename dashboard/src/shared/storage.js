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
