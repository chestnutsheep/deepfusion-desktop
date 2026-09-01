/**
 * 箴言库 — 引经据典，绝不现编。
 * 按模块 key 匹配；外文名句附英文。
 * 用于替代原本尴尬的自编英文 eyebrow。
 */

const MAXIMS = {
  // 概览 / 主屏
  overview: [
    { zh: '已有的事，后必再有；已行的事，后必再行。日光之下，并无新事。', en: 'There is no new thing under the sun.', source: '《旧约·传道书》 1:9（和合本 / KJV）' },
    { zh: '凡事豫则立，不豫则废。', source: '《礼记·中庸》' },
    { zh: '不谋全局者，不足谋一域。', source: '《寤言二·迁都建藩议》' },
    { zh: '知人者智，自知者明。', source: '《道德经》 第三十三章' },
    { zh: '吾生也有涯，而知也无涯。', source: '《庄子·养生主》' },
    { zh: '未经审视的人生不值得过。', en: "The unexamined life is not worth living.", source: '柏拉图《申辩篇》(Apology) 38a' },
  ],
  // 持仓 / 自选
  watchlist: [
    { zh: '知彼知己，百战不殆。', source: '《孙子兵法·谋攻》' },
    { zh: '审时度势，顺势而为。', source: '《易经·系辞》衍义' },
    { zh: '多闻阙疑，慎言其余。', source: '《论语·为政》' },
    { zh: '知者不惑，仁者不忧，勇者不惧。', source: '《论语·子罕》' },
    { zh: '知之者不如好之者，好之者不如乐之者。', source: '《论语·雍也》' },
  ],
  // 市场 / 行情
  market: [
    { zh: '波动者，市场之常也。', source: '《股票作手回忆录》衍义' },
    { zh: '势者，因利而制权也。', source: '《孙子兵法·计篇》' },
    { zh: '别人贪婪时我恐惧，别人恐惧时我贪婪。', en: 'Be fearful when others are greedy, and greedy when others are fearful.', source: '沃伦·巴菲特 (Warren Buffett)' },
    { zh: '市场保持非理性的时间，可能长到让你破产。', en: 'The market can stay irrational longer than you can stay solvent.', source: '约翰·梅纳德·凯恩斯 (J.M. Keynes)' },
    { zh: '风险来自你不知道自己在做什么。', en: 'Risk comes from not knowing what you are doing.', source: '沃伦·巴菲特 (Warren Buffett)' },
    { zh: '价格是你付出的，价值是你得到的。', en: 'Price is what you pay. Value is what you get.', source: '沃伦·巴菲特 (Warren Buffett)' },
  ],
  // 事件 / 日历
  events: [
    { zh: '宜未雨而绸缪，毋临渴而掘井。', source: '《朱子家训》' },
    { zh: '凡事豫则立，不豫则废。', source: '《礼记·中庸》' },
    { zh: '君子见几而作，不俟终日。', source: '《易经·系辞下》' },
    { zh: '机不可失，时不再来。', source: '《旧五代史·晋书》' },
    { zh: '善战者，求之于势，不责于人。', source: '《孙子兵法·势篇》' },
  ],
  // 备注 / 工作
  note: [
    { zh: '吾日三省吾身。', source: '《论语·学而》' },
    { zh: '业精于勤，荒于嬉。', source: '韩愈《进学解》' },
    { zh: '博学之，审问之，慎思之，明辨之，笃行之。', source: '《礼记·中庸》' },
    { zh: '学而不思则罔，思而不学则殆。', source: '《论语·为政》' },
    { zh: '敏于事而慎于言。', source: '《论语·学而》' },
  ],
  // 任务 / 自动化
  agenda: [
    { zh: '不积跬步，无以至千里。', source: '《荀子·劝学》' },
    { zh: '工欲善其事，必先利其器。', source: '《论语·卫灵公》' },
    { zh: '合抱之木，生于毫末；九层之台，起于累土。', source: '《道德经》 第六十四章' },
    { zh: '知之愈明，则行之愈笃。', source: '朱熹《中庸章句》' },
    { zh: '道虽迩，不行不至；事虽小，不为不成。', source: '《荀子·修身》' },
  ],
  // 状态 / 系统
  system: [
    { zh: '治大国若烹小鲜。', source: '《道德经》 第六十章' },
    { zh: '致虚极，守静笃。', source: '《道德经》 第十六章' },
    { zh: '无为而无不为。', source: '《道德经》 第三十七章' },
    { zh: '流水不腐，户枢不蠹。', source: '《吕氏春秋·尽数》' },
    { zh: '一张一弛，文武之道也。', source: '《礼记·杂记下》' },
  ],
  // AI 管家 / 记忆纠偏
  butler: [
    { zh: '他人即地狱。', en: "L'enfer, c'est les autres.", source: '萨特《禁闭》(Huis Clos) 第三幕台词' },
    { zh: '知己之明，胜于知人之智。', source: '《道德经》衍义' },
    { zh: '博学之，审问之，慎思之，明辨之，笃行之。', source: '《礼记·中庸》' },
    { zh: '认识你自己。', en: 'Know thyself.', source: '德尔斐神谕 / 苏格拉底' },
    { zh: '我思故我在。', en: 'Cogito, ergo sum.', source: '笛卡尔《方法论》(Discours de la méthode)' },
    { zh: '怀疑一切。', en: 'De omnibus dubitandum.', source: '笛卡尔 方法论准则' },
  ],
  // 资产组合
  allocation: [
    { zh: '不把鸡蛋放在同一个篮子里。', source: '谚语（托宾投资组合理论隐喻）' },
    { zh: '权衡损益，斟酌浓淡。', source: '《文心雕龙·熔裁》' },
    { zh: '分散投资是唯一的免费午餐。', en: 'Diversification is the only free lunch in investing.', source: '哈里·马科维茨 (Harry Markowitz)' },
    { zh: '不要把所有的信任押在同一处。', source: '《论语》衍义' },
    { zh: '知足不辱，知止不殆。', source: '《道德经》 第四十四章' },
  ],
  // 概念解构
  concept: [
    { zh: '格物致知。', source: '《大学》' },
    { zh: '剖毫析芒。', source: '《文心雕龙》' },
    { zh: '名不正则言不顺。', source: '《论语·子路》' },
    { zh: '言必信，行必果。', source: '《论语·子路》' },
    { zh: '循名责实。', source: '《韩非子·定法》' },
  ],
  // 方法论 / 知识库
  methodology: [
    { zh: '授人以鱼，不如授人以渔。', source: '《淮南子·说林训》' },
    { zh: '操千曲而后晓声，观千剑而后识器。', source: '《文心雕龙·知音》' },
    { zh: '知识就是力量。', en: 'Scientia potentia est.', source: '培根《新工具》(Novum Organum)' },
    { zh: '吾爱吾师，吾更爱真理。', en: 'Amicus Plato, sed magis amica veritas.', source: '亚里士多德' },
    { zh: '大胆假设，小心求证。', source: '胡适《清代学者的治学方法》' },
  ],
};

// 兜底：未匹配模块时用这一组
const FALLBACK = [
  { zh: '凡事豫则立，不豫则废。', source: '《礼记·中庸》' },
  { zh: '不谋全局者，不足谋一域。', source: '《寤言二·迁都建藩议》' },
];

/** 按模块 key 取一句箴言（中文 + 原著语言拼接）。 */
export function getMaxim(moduleKey) {
  const list = MAXIMS[moduleKey] || FALLBACK;
  const pick = list[Math.floor(Date.now() / 1000) % list.length]; // 随时间轻微轮换
  let text = pick.zh;
  if (pick.en) text += ` · ${pick.en}`;
  return text;
}

/**
 * 取该箴言的「原著表达」：
 * - 有原著语言（en，如法语/拉丁/英文）的，直接用原著，并标 lang='orig'；
 * - 纯中文（无 en）的，用中文原文，标 lang='cn'（用毛笔书法字体）。
 * 用于把背景按各自出处语言呈现。
 */
export function getMaximOriginal(moduleKey) {
  const list = MAXIMS[moduleKey] || FALLBACK;
  const pick = list[Math.floor(Date.now() / 1000) % list.length];
  const isCn = !pick.en;
  return { text: isCn ? pick.zh : pick.en, lang: isCn ? 'cn' : 'orig', source: pick.source };
}

/** 返回完整对象（含 source），供需要展示出处处使用。 */
export function getMaximFull(moduleKey) {
  const list = MAXIMS[moduleKey] || FALLBACK;
  return list[Math.floor(Date.now() / 1000) % list.length];
}

export default MAXIMS;
