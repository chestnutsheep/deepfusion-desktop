import { useSyncExternalStore } from 'react';

// 轻量跨组件共享：持仓总市值(equity) 与 可用资金(cash)
// WatchlistPanel 在行情刷新后写入；AssetAllocationPanel 读取并联动配置器。

// —— 硬性监听数量限制 ——
// 防止组件反复重挂载导致 listeners 无限增长，拖爆 Tauri WebView 进程。
// 行为对标 Node EventEmitter.setMaxListeners：超出上限直接拒绝并报警。
const MAX_LISTENERS = 64;

const EMPTY = { equity: 0, cash: 0 };
let state = { ...EMPTY };
const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

export function setPortfolio(next) {
  const equity = Number(next?.equity) || 0;
  const cash = Number(next?.cash) || 0;
  if (equity === state.equity && cash === state.cash) return;
  state = { equity, cash };
  emit();
}

function subscribe(cb) {
  // 去重：同一回调重复订阅不重复添加，直接复用已有退订器，避免泄漏。
  if (listeners.has(cb)) {
    return () => listeners.delete(cb);
  }
  if (listeners.size >= MAX_LISTENERS) {
    console.error(
      `[portfolioStore] 监听数量已达硬性上限 ${MAX_LISTENERS}，拒绝新订阅。`,
      '请检查组件是否在重挂载时未退订（导致 listeners 累积）。'
    );
    return () => {};
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

/** 在任意组件外读取当前值（非响应式） */
export function getPortfolio() {
  return state;
}

/** 响应式 hook：返回 { equity, cash } */
export function usePortfolio() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
