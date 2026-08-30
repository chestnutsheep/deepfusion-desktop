/**
 * 箴言库 — 引经据典，绝不现编。
 * 按模块 key 匹配；外文名句附英文。
 * 用于替代原本尴尬的自编英文 eyebrow。
 */

const MAXIMS = {
  // 概览 / 主屏
  overview: [
    { zh: '以铜为鉴，可以正衣冠；以人为镜，可以明得失；以史为镜，可以知兴替。', source: '《旧唐书·魏徵传》' },
  ],
  // 持仓 / 自选
  watchlist: [
    { zh: '以史为镜，可以知兴替。', source: '《旧唐书·魏徵传》' },
    { zh: '太阳底下无新事。', en: 'There is nothing new under the sun.', source: '《传道书》 1:9' },
  ],
  // 市场 / 行情
  market: [
    { zh: '太阳底下无新事。', en: 'There is nothing new under the sun.', source: '《传道书》 1:9' },
    { zh: '他人即地狱。', en: 'Hell is other people.', source: '萨特《禁闭》' },
  ],
  // 事件 / 日历
  events: [
    { zh: '宜未雨而绸缪，毋临渴而掘井。', source: '《朱子家训》' },
    { zh: '凡事豫则立，不豫则废。', source: '《礼记·中庸》' },
  ],
  // 备注 / 工作
  note: [
    { zh: '吾日三省吾身。', source: '《论语·学而》' },
    { zh: '知者不惑，仁者不忧，勇者不惧。', source: '《论语·子罕》' },
  ],
  // 任务 / 自动化
  agenda: [
    { zh: '不积跬步，无以至千里。', source: '《荀子·劝学》' },
    { zh: '工欲善其事，必先利其器。', source: '《论语·卫灵公》' },
  ],
  // 状态 / 系统
  system: [
    { zh: '治大国若烹小鲜。', source: '《道德经》 第六十章' },
    { zh: '致虚极，守静笃。', source: '《道德经》 第十六章' },
  ],
  // AI 管家 / 记忆纠偏
  butler: [
    { zh: '他人即地狱。', en: 'Hell is other people.', source: '萨特《禁闭》' },
    { zh: '认识你自己。', en: 'Know thyself.', source: '德尔斐神谕 / 苏格拉底' },
  ],
  // 资产组合
  allocation: [
    { zh: '不把鸡蛋放在同一个篮子里。', source: '谚语（托宾投资组合理论隐喻）' },
    { zh: '权衡损益，斟酌浓淡。', source: '《文心雕龙·熔裁》' },
  ],
  // 概念解构
  concept: [
    { zh: '格物致知。', source: '《大学》' },
    { zh: '剖毫析芒。', source: '《文心雕龙》' },
  ],
  // 方法论 / 知识库
  methodology: [
    { zh: '授人以鱼，不如授人以渔。', source: '《淮南子·说林训》' },
    { zh: '操千曲而后晓声，观千剑而后识器。', source: '《文心雕龙·知音》' },
  ],
};

// 兜底：未匹配模块时用这一组
const FALLBACK = [
  { zh: '以铜为鉴，可以正衣冠。', source: '《旧唐书·魏徵传》' },
  { zh: '太阳底下无新事。', en: 'There is nothing new under the sun.', source: '《传道书》 1:9' },
];

/** 按模块 key 取一句箴言（带英文则拼接）。 */
export function getMaxim(moduleKey) {
  const list = MAXIMS[moduleKey] || FALLBACK;
  const pick = list[Math.floor(Date.now() / 1000) % list.length]; // 随时间轻微轮换
  let text = pick.zh;
  if (pick.en) text += ` · ${pick.en}`;
  return text;
}

/** 返回完整对象（含 source），供需要展示出处处使用。 */
export function getMaximFull(moduleKey) {
  const list = MAXIMS[moduleKey] || FALLBACK;
  return list[Math.floor(Date.now() / 1000) % list.length];
}

export default MAXIMS;
