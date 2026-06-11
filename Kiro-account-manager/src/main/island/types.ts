// 灵动岛（Dynamic Island）相关类型定义
// 设计参考：.kiro/specs/dynamic-island/design.md

/** 应用运行形态：普通窗口 / 灵动岛 */
export type AppMode = 'window' | 'island'

/** 灵动岛持久化配置（electron-store 键：islandSettings） */
export interface IslandSettings {
  /** 是否启用灵动岛功能 */
  enabled: boolean
  /** 开机自启动 */
  autoLaunch: boolean
  /** 用户主动启动时的初始形态 */
  startMode: AppMode
  /** 最小化到托盘时是否进入灵动岛模式 */
  minimizeToIsland: boolean
  /** 展开态是否展示反代状态 */
  showProxyStatus: boolean
  /** 持久化的窗口位置，null 表示使用顶部居中默认位置 */
  position: { x: number; y: number } | null
}

export const defaultIslandSettings: IslandSettings = {
  enabled: true,
  autoLaunch: false,
  startMode: 'window',
  minimizeToIsland: true,
  showProxyStatus: true,
  position: null
}

/** 推送给灵动岛的账号快照（与 tray.ts 的 TrayAccountInfo 同构） */
export interface AccountSnapshot {
  id: string
  email: string
  idp: string
  status: string
  subscription?: string
  usage?: { usedCredits: number; totalCredits: number }
}

/** 推送给灵动岛的反代状态快照 */
export interface ProxySnapshot {
  running: boolean
  port: number
  totalRequests: number
  successRequests: number
  failedRequests: number
}

/** 推送给灵动岛的展示偏好（隐私模式 + 已解析的主题色，保证与主窗口视觉一致） */
export interface IslandPrefs {
  privacyMode: boolean
  isDark: boolean
  primary: string
  gradientTo: string
  foreground: string
  mutedForeground: string
  border: string
}

export const defaultIslandPrefs: IslandPrefs = {
  privacyMode: false,
  isDark: false,
  primary: '#5B8CFF',
  gradientTo: '#8B5CF6',
  foreground: '#0f172a',
  mutedForeground: '#64748b',
  border: 'rgba(15,23,42,0.1)'
}

/**
 * 归一化灵动岛配置：缺失字段补默认值、非法值回退。
 * 该函数是纯函数，须满足幂等性（Property 1）。
 */
export function normalizeIslandSettings(raw: unknown): IslandSettings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

  const asBool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback

  const startMode: AppMode = input.startMode === 'island' ? 'island' : 'window'

  let position: { x: number; y: number } | null = null
  const rawPos = input.position
  if (
    typeof rawPos === 'object' &&
    rawPos !== null &&
    Number.isFinite((rawPos as { x?: unknown }).x) &&
    Number.isFinite((rawPos as { y?: unknown }).y)
  ) {
    position = {
      x: Math.round((rawPos as { x: number }).x),
      y: Math.round((rawPos as { y: number }).y)
    }
  }

  return {
    enabled: asBool(input.enabled, defaultIslandSettings.enabled),
    autoLaunch: asBool(input.autoLaunch, defaultIslandSettings.autoLaunch),
    startMode,
    minimizeToIsland: asBool(input.minimizeToIsland, defaultIslandSettings.minimizeToIsland),
    showProxyStatus: asBool(input.showProxyStatus, defaultIslandSettings.showProxyStatus),
    position
  }
}
