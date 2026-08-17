export const colors = {
  indigo: '#675CF6',
  indigoDeep: '#4338CA',
  blue: '#3478F6',
  mint: '#16B98C',
  coral: '#FF6B7A',
  amber: '#F6A723',
  ink: '#101828',
  cloud: '#F5F7FB',
  midnight: '#070B1B',
} as const

export const typography = {
  hero: { min: 32, max: 36, lineHeight: 1.16 },
  pageTitle: { min: 28, max: 32, lineHeight: 1.2 },
  cardTitle: { min: 20, max: 22, lineHeight: 1.3 },
  body: { min: 17, max: 18, lineHeight: 1.6 },
  supporting: { min: 15, max: 16, lineHeight: 1.5 },
  minimum: 14,
} as const

export const dimensions = {
  pageGutter: 20,
  cardRadius: 24,
  buttonHeight: 56,
  minimumTouchTarget: 48,
} as const

export const appThemes = {
  consumer: ['indigo', 'blue', 'mint'],
  merchant: ['mint', 'blue'],
  sales: ['indigo', 'coral'],
  provider: ['blue', 'indigo'],
  hq: ['midnight', 'indigo'],
  skill: ['indigo', 'blue'],
} as const

export type AppTheme = keyof typeof appThemes
