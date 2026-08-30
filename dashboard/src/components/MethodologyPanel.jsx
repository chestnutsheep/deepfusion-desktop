import React, { useState, useEffect } from 'react';
import { Panel, Eyebrow } from '../design/Primitives';
import { invoke } from '@tauri-apps/api/core';
import { readDeveloperMode } from '../shared/storage';

// 来自 DeepFusion 项目的 SOP/workflow 文档（管家分析调度参考源）
const GROUPS = [
  {
    name: '顶层协作约束',
    items: [
      { path: 'AGENTS.md', title: 'Project Instructions', note: '量化/构建 Agent 的红线、缓存锁、模块契约与扩展 SOP，调度前必读以防越界。' },
      { path: 'AGENT_BOARD.md', title: '跨 Agent 交接留言板', note: '量化↔代码维护异步交接板，含留言格式、状态机、当前快照。' },
      { path: 'README.md', title: '系统总说明', note: '技术栈/能力边界/运维方式，理解 140 个工具范围的入口。' },
      { path: '.impeccable.md', title: 'UI 设计规范', note: '交易决策台品牌人格与视觉/交互原则，决定"呈现/汇报"风格。' },
    ],
  },
  {
    name: '投研编排工作流 (agents/skills)',
    items: [
      { path: 'agents/skills/industry-positioning', title: '行业定位', note: '个股分析第一阶段：行业定位与常态基准调取，编排起点。' },
      { path: 'agents/skills/financial-inspection', title: '财务内检', note: '盈利质量/经营风险内检，输出 E_fund 评级。' },
      { path: 'agents/skills/industry-comparison', title: '行业比较', note: '行业横向比较与反常发现，最关键的反常定位环节。' },
      { path: 'agents/skills/anomaly-detection', title: '异常检测', note: '个股 vs 行业基准偏离检测与优先级排序（1σ/2σ/3σ）。' },
      { path: 'agents/skills/hypothesis-testing', title: '假设检验', note: '对反常提竞争性假设+可检验预测，杜绝单一解释。' },
      { path: 'agents/skills/adversarial-review', title: '对抗审查', note: '对抗式辩论自检/审查清单，保障分析逻辑严谨。' },
      { path: 'agents/skills/institutional-verification', title: '机构印证', note: '北向/持仓/高管增减持/两融交叉印证财务假设。' },
      { path: 'agents/skills/cycle-positioning', title: '周期相位', note: '基钦/朱格拉周期相位判定，输出 Δ_cycle 顺风逆风。' },
      { path: 'agents/skills/evidence-fusion', title: '证据融合', note: '四模块证据矩阵融合，输出情景赔率与建议仓位（终段）。' },
      { path: 'agents/skills/confidence-calibration', title: '置信校准', note: '评分→校准概率（贝叶斯 posterior+Platt），支撑埋伏/风控仓位。' },
      { path: 'agents/skills/cycle-allocator', title: '周期配置', note: '四周期嵌套资产配置引擎，产出大类/行业配置与调仓提醒。' },
      { path: 'agents/skills/benchmark-maintenance', title: '基准维护', note: '行业常态基准库构建/刷新 SOP（30 天触发），参照系维护。' },
    ],
  },
  {
    name: '知识库与方法论',
    items: [
      { path: 'references/knowledge/cycles_calculation.md', title: '周期计算清单', note: '四周期数据采集与频谱分析 SOP，周期调度核心。' },
      { path: 'references/knowledge/policy_structure.md', title: '政策结构参考', note: '政策文件数据来源与"政策速递"布局，催化事件调度依据。' },
      { path: 'references/knowledge/missing_index.md', title: '缺失数据解包', note: '已验证可用的缺失接口清单，补数调度避坑。' },
      { path: 'references/phase_weight.md', title: '相位权重表', note: '四周期各相位权重，资产配置计算基准。' },
      { path: 'deep_fusion/reports/score_calibration_spec.md', title: '评分校准说明', note: '连板潜力评分量化校准与上游 bug 修复，评分口径权威依据。' },
    ],
  },
];

export default function MethodologyPanel() {
  const [active, setActive] = useState(null); // 当前选中文档 { path, title, note }
  const [doc, setDoc] = useState('');          // 文档正文
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => { setDevMode(readDeveloperMode()); }, []);

  useEffect(() => {
    if (!active) { setDoc(''); return; }
    let cancelled = false;
    setLoading(true);
    invoke('read_doc', { relative: active.path })
      .then((text) => { if (!cancelled) setDoc(text); })
      .catch((e) => { if (!cancelled) setDoc(`⚠ 读取失败：${e}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active]);

  return (
    <Panel module="methodology" title="方法论 · 调度参考库" actions={null}>
      <div className="method-layout">
        <div className="method-side">
          <p className="method-intro">DeepFusion 项目收录的 SOP / workflow 与知识库，作为 AI 管家给出分析建议时的<strong>调度参考</strong>。点击左侧条目，右侧加载对应文档。</p>
          <div className="method-groups">
            {GROUPS.map((g) => (
              <div className="method-group" key={g.name}>
                <h3 className="method-group-title">{g.name}</h3>
                <div className="method-list">
                  {g.items.map((it) => {
                    const sel = active && active.path === it.path;
                    return (
                      <button
                        className={`method-item ${sel ? 'active' : ''}`}
                        key={it.path}
                        onClick={() => setActive(it)}
                        title={devMode ? it.path : '点击查看文档'}
                      >
                        <b>{it.title}</b>
                        {devMode && <code>{it.path}</code>}
                        <i className="open-icon" aria-hidden>📄</i>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="method-reader">
          {!active && (
            <div className="method-empty">
              <p className="method-empty-slogan">Move with intention.<br />Let the day unfold.</p>
              <p className="method-empty-hint">从左侧选择一个条目，此处将加载对应文档内容。</p>
            </div>
          )}
          {active && (
            <>
              <div className="method-reader-head">
                <h2>{active.title}</h2>
                {devMode && <code className="method-reader-path">{active.path}</code>}
              </div>
              <p className="method-reader-note">{active.note}</p>
              {loading
                ? <div className="method-reader-loading">加载中…</div>
                : <pre className="method-reader-body">{doc}</pre>}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
