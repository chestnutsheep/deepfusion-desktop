export const REPORT_TYPES = ['全部', '盘前简报', '午间新闻驱动', '优质股推送', '每日复盘'];

// 开发阶段的明确演示数据；接入 DeepFusion 后替换为 report_history/report_by_date 适配结果。
export const REPORT_FIXTURES = [
  { id: 'dailyreview:2026-08-21', type: '每日复盘', key: 'dailyreview', date: '2026-08-21', createdAt: '昨晚 21:03', unread: true, status: '已送达', title: '分歧后的承接仍在，明日观察强势题材的回流质量', summary: '复盘已生成 · 含决策预演与风险观察清单。' },
  { id: 'qualitystock:2026-08-21', type: '优质股推送', key: 'qualitystock', date: '2026-08-21', createdAt: '昨晚 16:32', unread: true, status: '已送达', title: '三组中期候选：低位修复与现金流质量优先', summary: '筛选已完成 · 5 个候选标的，按持有周期标注。' },
  { id: 'noonnews:2026-08-21', type: '午间新闻驱动', key: 'noonnews', date: '2026-08-21', createdAt: '昨日 12:51', unread: true, status: '已送达', title: '午后催化聚焦：产业消息与资金流的交叉确认', summary: '新闻驱动扫描已完成 · 可查看候选板块。' },
  { id: 'premarket:2026-08-21', type: '盘前简报', key: 'premarket', date: '2026-08-21', createdAt: '昨日 09:02', unread: false, status: '已读', title: '隔夜市场与开盘前催化：保持对高低切换的耐心', summary: '盘前简报归档 · 包含宏观、行业与个股事件。' },
  { id: 'dailyreview:2026-08-20', type: '每日复盘', key: 'dailyreview', date: '2026-08-20', createdAt: '8 月 20 日 21:05', unread: false, status: '已读', title: '市场维持轮动，仓位管理优先于追逐涨幅', summary: '复盘历史档案 · 数据截至 15:30。' },
  { id: 'premarket:2026-08-20', type: '盘前简报', key: 'premarket', date: '2026-08-20', createdAt: '8 月 20 日 09:01', unread: false, status: '已读', title: '开盘前观察：政策预期与外盘波动的边际变化', summary: '盘前简报历史档案 · 数据截至 08:58。' },
];
