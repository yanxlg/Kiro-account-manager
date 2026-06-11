// 灵动岛启动模式决策与位置计算（纯逻辑，便于单测）
// 设计参考：.kiro/specs/dynamic-island/design.md (Property 2, Property 3)

import type { AppMode, IslandSettings } from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 灵动岛窗口的展开态包络尺寸（窗口固定尺寸，UI 内部做形态收放） */
export const ISLAND_WINDOW_SIZE = { width: 360, height: 220 }

/** 顶部留白 */
const TOP_MARGIN = 8

/**
 * 决定应用启动时的初始形态（Property 2）。
 * - 开机自启动（wasLoginLaunch）且灵动岛启用 → island
 * - 否则取 settings.startMode
 */
export function resolveStartupMode(wasLoginLaunch: boolean, settings: IslandSettings): AppMode {
  if (wasLoginLaunch && settings.enabled) return 'island'
  return settings.startMode
}

/** 判断矩形的中心点是否落在某个工作区内（宽松检测，支持跨边缘拖放后恢复） */
function isRectCenterInsideAnyWorkArea(rect: Rect, workAreas: Rect[]): boolean {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return workAreas.some(
    (wa) =>
      cx >= wa.x &&
      cy >= wa.y &&
      cx <= wa.x + wa.width &&
      cy <= wa.y + wa.height
  )
}

/** 在主工作区顶部水平居中的默认位置 */
function centeredBounds(primaryWorkArea: Rect, size: { width: number; height: number }): Rect {
  return {
    x: Math.round(primaryWorkArea.x + (primaryWorkArea.width - size.width) / 2),
    y: primaryWorkArea.y + TOP_MARGIN,
    width: size.width,
    height: size.height
  }
}

/**
 * 计算灵动岛窗口的目标位置（Property 3）。
 * - 有持久化 position 且落在任一工作区内 → 使用该位置
 * - 否则回退到主工作区顶部居中
 * 输出矩形保证完全落在某个工作区内。
 */
export function computeBounds(
  primaryWorkArea: Rect,
  allWorkAreas: Rect[],
  position: { x: number; y: number } | null,
  size: { width: number; height: number } = ISLAND_WINDOW_SIZE
): Rect {
  const workAreas = allWorkAreas.length > 0 ? allWorkAreas : [primaryWorkArea]

  if (position) {
    const candidate: Rect = { x: position.x, y: position.y, width: size.width, height: size.height }
    if (isRectCenterInsideAnyWorkArea(candidate, workAreas)) return candidate
  }

  return centeredBounds(primaryWorkArea, size)
}
