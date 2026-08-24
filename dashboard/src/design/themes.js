export const WATER_LILY_THEMES = [
  {
    id: 'matin',
    name: '晨光',
    file: 'matin.JPEG',
    tone: '青黛 / 金',
    deep: '#102520',
    mid: 'rgba(28, 61, 54, .48)',
    glow: '#c9a853',
    accent: '#d8c978',
  },
  {
    id: 'crepuscule',
    name: '暮色',
    file: 'crepuscule.JPEG',
    tone: '靛蓝 / 铜',
    deep: '#0c1830',
    mid: 'rgba(30, 54, 96, .46)',
    glow: '#b97858',
    accent: '#d6a56b',
  },
  {
    id: 'eclat',
    name: '绽放',
    file: 'eclat.JPEG',
    tone: '松绿 / 金',
    deep: '#122718',
    mid: 'rgba(38, 82, 48, .45)',
    glow: '#c6a44b',
    accent: '#d4c16d',
  },
  {
    id: 'reve',
    name: '梦境',
    file: 'reve.JPEG',
    tone: '紫灰 / 银',
    deep: '#1d1830',
    mid: 'rgba(71, 55, 96, .45)',
    glow: '#a891c3',
    accent: '#d0bee4',
  },
  {
    id: 'lumiere',
    name: '微光',
    file: 'lumiere.JPEG',
    tone: '深蓝 / 月白',
    deep: '#10243a',
    mid: 'rgba(47, 78, 108, .44)',
    glow: '#9bbbd0',
    accent: '#c6d9e7',
  },
  {
    id: 'bleu',
    name: '蓝调',
    file: 'bleu.JPEG',
    tone: '墨蓝 / 雾蓝',
    deep: '#0c1b34',
    mid: 'rgba(31, 55, 96, .46)',
    glow: '#829fc9',
    accent: '#adc5df',
  },
  {
    id: 'pont',
    name: '桥畔',
    file: 'pont.JPEG',
    tone: '苔绿 / 雾白',
    deep: '#17291e',
    mid: 'rgba(48, 77, 55, .45)',
    glow: '#9fac87',
    accent: '#c7d5b3',
  },
];

export const DEFAULT_THEME_ID = WATER_LILY_THEMES[0].id;

export function getTheme(themeId) {
  return WATER_LILY_THEMES.find((theme) => theme.id === themeId) ?? WATER_LILY_THEMES[0];
}

export function getNextThemeId(themeId) {
  const index = WATER_LILY_THEMES.findIndex((theme) => theme.id === themeId);
  return WATER_LILY_THEMES[(index + 1) % WATER_LILY_THEMES.length].id;
}
