import React, { useState } from 'react';
import { Panel, Eyebrow } from '../design/Primitives';

const LAYERS = [
  { key: 'L1', title: '概念定义层', desc: '技术本质、背景动因、核心价值、成熟度（TRL）' },
  { key: 'L2', title: '系统架构层', desc: '核心子系统、接口关系、关键数据流/能量流' },
  { key: 'L3', title: '组件模块层', desc: '组件清单、协同机制、关键组件识别（成本>5%或高壁垒）' },
  { key: 'L4', title: '元部件层', desc: 'BOM 清单、材料规格、制造工艺、供应链依赖' },
  { key: 'L5', title: '性能参数层', desc: '核心指标、容差范围、行业基准、壁垒等级' },
];

// 示范性解构：固态电池（演示五层结构，真实数据需后端检索补充）
const DEMO = {
  concept: '固态电池',
  layers: [
    { key: 'L1', nodes: ['能量密度 > 400Wh/kg 的下一代锂电', '用固态电解质替代易燃液态电解液', '解决热失控与里程焦虑', 'TRL ≈ 6-7（中试放大阶段）'] },
    { key: 'L2', nodes: ['正极 / 固态电解质 / 负极 三明治结构', '界面阻抗管理子系统', '多层叠片电芯封装架构'] },
    { key: 'L3', nodes: ['高镍/富锂正极', '硫化物/氧化物电解质膜', '锂金属负极', '界面缓冲层'] },
    { key: 'L4', nodes: ['Li₂S-P₂S₅ 硫化物电解质粉体', '锂箔（20μm 以下）', '复合集流体', '等静压设备'] },
    { key: 'L5', nodes: ['离子电导率 ≥ 1 mS/cm', '界面阻抗 < 30 Ω·cm²', '循环寿命 > 1000 次', '热稳定性 > 200℃'] },
  ],
};

function Layer({ layer, index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = LAYERS.find((l) => l.key === layer.key);
  return (
    <div className={`concept-layer ${open ? 'open' : ''}`}>
      <button className="concept-layer-head" onClick={() => setOpen((o) => !o)}>
        <span className="concept-layer-key">{layer.key}</span>
        <span className="concept-layer-title">{meta?.title}</span>
        <span className="concept-layer-desc">{meta?.desc}</span>
        <i className="concept-layer-caret">{open ? '−' : '+'}</i>
      </button>
      {open && (
        <ul className="concept-layer-nodes">
          {layer.nodes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function ConceptDeconstructPanel() {
  const [concept, setConcept] = useState('');
  const [data, setData] = useState(DEMO);
  const [noted, setNoted] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const name = concept.trim();
    if (!name) return;
    // 本地骨架：保留五层结构，节点由后端检索后填充；此处先给空骨架
    setData({
      concept: name,
      layers: LAYERS.map((l) => ({ key: l.key, nodes: [`待检索：${name} 的${l.title}拆解…`] })),
    });
    setNoted(true);
  };

  return (
    <Panel module="concept" title="概念解构" actions={null}>
      <p className="concept-intro">以「技术解构五层模型」拆解任一技术概念：从<strong>概念（L1）</strong>逐层下探至<strong>性能参数（L5）</strong>。当前为演示骨架，提交概念后由管家检索补全。</p>
      <form className="concept-form" onSubmit={submit}>
        <input
          className="alloc-input"
          placeholder="输入技术概念，如：固态电池 / HBM / 钙钛矿"
          value={concept}
          onChange={(e) => { setConcept(e.target.value); setNoted(false); }}
        />
        <button className="focus-toggle" type="submit">解构</button>
      </form>
      <div className="concept-target">解构对象：<b>{data.concept}</b></div>
      <div className="concept-tree">
        {data.layers.map((layer, i) => <Layer key={layer.key} layer={layer} index={i} defaultOpen={i === 0} />)}
      </div>
      {noted && <p className="concept-note">已生成解构骨架；接入检索后将自动回填各层节点与来源依据。</p>}
    </Panel>
  );
}
