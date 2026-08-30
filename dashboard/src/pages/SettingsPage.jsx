import React, { useEffect, useState } from 'react';
import { mcp } from '../services/mcp';
import { Panel, Eyebrow } from '../design/Primitives';
import { readDeveloperMode, writeDeveloperMode } from '../shared/storage';
import { getLogs, clearLogs } from '../services/logs';

const apiBaseUrl = mcp.apiBaseUrl;

// 记忆纠偏四类 scope（与 butler 后端对齐）
const MEMORY_KINDS = [
  { key: 'style', label: '风格', hint: 'AI 管家的语气、口吻与回答偏好的长期设定' },
  { key: 'long', label: '长期记忆', hint: '跨会话稳定保留的用户画像与偏好' },
  { key: 'short', label: '短期记忆', hint: '本次工作流内的临时上下文与待办' },
  { key: 'work', label: '工作记忆', hint: '当前任务的中间态与执行进度' },
];

async function fetchContext(scope, limit = 20) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/butler/context?scope=${scope}&limit=${limit}`);
    const json = await res.json();
    if (json?.ok) return json.context || [];
  } catch {
    /* 离线时返回空 */
  }
  return [];
}

function MemorySection({ kind }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');

  const reload = () => fetchContext(kind.key).then((rows) => { setItems(rows); setLoaded(true); });

  useEffect(() => { reload(); }, [kind.key]);

  const save = (id) => {
    // 本地纠偏：通过 butler 写回接口（不存在则仅在前端标记）
    fetch(`${apiBaseUrl}/api/butler/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: kind.key, id, content: draft }),
    }).then(reload).catch(reload);
    setEditingId(null);
  };

  return (
    <Panel
      module="butler"
      title={kind.label}
      actions={<button className="focus-toggle" onClick={reload}>刷新 <span>↻</span></button>}
    >
      <p className="memory-hint">{kind.hint}</p>
      <div className="workbench-list">
        {loaded && items.length === 0 && <div className="capability-empty">暂无该类记忆，可手动添加以纠偏。</div>}
        {items.map((item) => (
          <div className="workbench-context" key={item.id}>
            <b>{item.title}</b>
            {editingId === item.id
              ? <textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="编辑记忆" />
              : <span>{item.content}</span>}
            <div className="memory-actions">
              {editingId === item.id
                ? <><button className="focus-toggle" onClick={() => save(item.id)}>保存</button><button className="focus-toggle" onClick={() => setEditingId(null)}>取消</button></>
                : <><button className="focus-toggle" onClick={() => { setEditingId(item.id); setDraft(item.content || ''); }}>纠偏</button><button className="focus-toggle" onClick={() => fetch(`${apiBaseUrl}/api/butler/context`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: kind.key, id: item.id }) }).then(reload).catch(reload)}>删除</button></>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function LogsSection() {
  const [logs, setLogs] = useState([]);
  const refresh = () => setLogs(getLogs());
  useEffect(() => { refresh(); }, []);
  const levelClass = (lv) => (lv === 'error' ? 'lv-error' : lv === 'warn' ? 'lv-warn' : 'lv-info');
  return (
    <Panel
      module="butler"
      title="运行日志"
      actions={
        <>
          <button className="focus-toggle" onClick={refresh}>刷新 <span>↻</span></button>
          <button className="focus-toggle" onClick={() => { clearLogs(); setLogs([]); }}>清空</button>
        </>
      }
    >
      <p className="memory-hint">前端运行日志（报错 / mcpTool 失败 / 全局异常），用于排查技术分析不显示等问题。最新 200 条，存于本地。</p>
      <div className="logs-box">
        {logs.length === 0 && <div className="capability-empty">暂无日志记录。</div>}
        {logs.slice().reverse().map((e, i) => (
          <div className={`log-row ${levelClass(e.level)}`} key={i}>
            <span className="log-time">{e.t?.slice(11, 19)}</span>
            <span className="log-level">{e.level}</span>
            <span className="log-source">{e.source}</span>
            <span className="log-msg">{e.message}</span>
            {e.detail && <pre className="log-detail">{typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}</pre>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function SettingsPage({ config, reports, onOpenReports }) {
  const models = config?.models?.models || [];
  const servers = config?.mcp?.servers || [];
  const [devMode, setDevMode] = useState(false);
  useEffect(() => { setDevMode(readDeveloperMode()); }, []);
  const toggleDevMode = () => {
    const next = !devMode;
    writeDeveloperMode(next);
    setDevMode(next);
  };
  return (
    <section className="workspace-panel enter-one">
      <div className="workspace-hero">
        <div>
          <Eyebrow module="butler">AI 管家 · 设置与纠偏</Eyebrow>
          <h1>设置。<br /><span>模型、工具与记忆，放在一处。</span></h1>
          <p>采用用户级 `models.json` / `mcp.json` 配置，只展示脱敏后的运行状态；记忆可手动纠偏，避免管家突然抽风。</p>
        </div>
      </div>

      <div className="workbench-grid">
        <Panel module="butler" title="模型入口" actions={<span className="capability-count">{models.length} 个</span>}>
          <div className="workbench-list">
            {models.length ? models.map((model) => (
              <div className="workbench-row" key={model.id}>
                <b>{model.name || model.id}</b>
                <span>{model.vendor || '兼容接口'} · {model.apiKeyConfigured ? '凭证已配置' : '凭证未配置'}</span>
                <i>{model.id === config.models.defaultModel ? '默认' : model.enabled === false ? '停用' : '可用'}</i>
              </div>
            )) : <div className="capability-empty">尚未找到用户级 models.json</div>}
          </div>
        </Panel>

        <Panel module="butler" title="工具服务器 (MCP)" actions={<span className="capability-count">{servers.length} 个</span>}>
          <div className="workbench-list">
            {servers.length ? servers.map((server) => (
              <div className="workbench-row" key={server.name}>
                <b>{server.name}</b>
                <span>{server.type} · {server.command || '内置/未指定命令'} · {server.timeout}ms</span>
                <i>{server.disabled ? '停用' : '启用'}</i>
              </div>
            )) : <div className="capability-empty">尚未找到用户级 mcp.json</div>}
          </div>
        </Panel>

        {MEMORY_KINDS.map((kind) => <MemorySection key={kind.key} kind={kind} />)}

        <Panel module="butler" title="系统信息" className="workbench-actions">
          <div className="storage-transfer">
            <div className="storage-content compact">
              <div className="ring small"><span>64<small>%</small></span></div>
              <div>
                <strong>512 GB <small>/ 800 GB</small></strong>
                <p>本地工作空间</p>
                <div className="capacity"><i /></div>
              </div>
            </div>
            <div className="storage-tags compact">
              <span>Documents <b>148 GB</b></span>
              <span>Projects <b>192 GB</b></span>
            </div>
          </div>
        </Panel>

        <Panel module="butler" title="开发者模式" className="workbench-actions">
          <p className="memory-hint">开启后显示底层文件路径、MCP / agent 等技术术语；普通用户建议保持关闭。</p>
          <label className="devmode-row">
            <input type="checkbox" checked={devMode} onChange={toggleDevMode} />
            <span>显示底层路径与开发术语</span>
            <i className={devMode ? 'on' : ''}>{devMode ? '已开启' : '已关闭'}</i>
          </label>
        </Panel>

        <Panel module="butler" title="今日工作状态" className="workbench-actions">
          <div className="workbench-stats">
            <strong>{reports.length}<small>份真实日报</small></strong>
            <strong>{servers.filter((server) => !server.disabled).length}<small>个 MCP 服务</small></strong>
          </div>
          <button className="focus-toggle" onClick={onOpenReports}>进入日报中心 <span>→</span></button>
        </Panel>

        <LogsSection />
      </div>
    </section>
  );
}
