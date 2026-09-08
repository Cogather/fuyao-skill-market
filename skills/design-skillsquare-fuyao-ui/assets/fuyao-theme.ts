export const fuyaoTheme = {
  color: {
    canvasStart: '#f2f7ff',
    canvas: '#fbfcff',
    canvasEnd: '#ffffff',
    surface: '#ffffff',
    surfaceMuted: '#f8fafc',
    surfaceTranslucent: 'rgba(255, 255, 255, 0.88)',
    heading: '#07172f',
    text: '#52647d',
    readableMuted: '#667085',
    muted: '#94a3b8',
    line: '#e2e8f0',
    primary: '#2f7df6',
    primaryStrong: '#2563eb',
    onPrimary: '#ffffff',
    accent: '#7552ff',
    accentSecondary: '#2ecdd3',
    primaryGlow: 'rgba(47, 125, 246, 0.14)',
    accentGlow: 'rgba(117, 82, 255, 0.11)',
    success: '#16a34a',
    warning: '#f59e0b',
    danger: '#dc2626',
  },
  font: {
    sans: "'HarmonyOS Sans SC', 'MiSans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', system-ui, sans-serif",
    size: {
      xs: 10,
      sm: 12,
      compact: 13,
      body: 15,
      title: 18,
      section: 24,
      page: 34,
      display: 42,
      hero: 52,
    },
  },
  space: [0, 4, 6, 8, 10, 12, 14, 16, 18, 24, 28, 32],
  radius: { control: 6, comfortable: 8, panel: 12, feature: 20, pill: 999 },
  shadow: {
    soft: '0 10px 28px rgba(35, 52, 84, 0.06)',
    raised: '0 18px 48px rgba(35, 52, 84, 0.08)',
    floating: '0 24px 70px rgba(15, 23, 42, 0.18)',
    focus: '0 0 0 3px rgba(47, 125, 246, 0.14)',
  },
  motion: { fast: 160, standard: 180, easing: 'ease' },
  breakpoint: { compact: 640, medium: 1040, wide: 1320 },
  layout: { contentMax: 1320 },
} as const;

export type FuyaoTheme = typeof fuyaoTheme;
export type FuyaoColorToken = keyof typeof fuyaoTheme.color;
export type FuyaoDensity = 'relaxed' | 'standard' | 'compact';
