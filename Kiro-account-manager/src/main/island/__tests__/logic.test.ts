import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

// Mock electron before importing modules that use it
const setLoginItemSettings = vi.fn()
const getLoginItemSettings = vi.fn(() => ({ openAtLogin: false, wasOpenedAtLogin: false }))
vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: (...args: unknown[]) => setLoginItemSettings(...args),
    getLoginItemSettings: () => getLoginItemSettings()
  }
}))

import { normalizeIslandSettings, defaultIslandSettings, type IslandSettings } from '../types'
import { resolveStartupMode, computeBounds, ISLAND_WINDOW_SIZE, type Rect } from '../geometry'
import { setAutoLaunch, getAutoLaunchStatus } from '../autoLaunch'

describe('normalizeIslandSettings', () => {
  it('fills defaults for empty/invalid input', () => {
    expect(normalizeIslandSettings(undefined)).toEqual(defaultIslandSettings)
    expect(normalizeIslandSettings(null)).toEqual(defaultIslandSettings)
    expect(normalizeIslandSettings('garbage')).toEqual(defaultIslandSettings)
    expect(normalizeIslandSettings({})).toEqual(defaultIslandSettings)
  })

  it('rejects invalid startMode and falls back to window', () => {
    expect(normalizeIslandSettings({ startMode: 'nonsense' }).startMode).toBe('window')
    expect(normalizeIslandSettings({ startMode: 'island' }).startMode).toBe('island')
  })

  it('drops invalid position', () => {
    expect(normalizeIslandSettings({ position: { x: 'a', y: 2 } }).position).toBeNull()
    expect(normalizeIslandSettings({ position: { x: 10, y: 20 } }).position).toEqual({ x: 10, y: 20 })
    expect(normalizeIslandSettings({ position: { x: 10.7, y: 20.2 } }).position).toEqual({ x: 11, y: 20 })
  })

  // Property 1: 归一化幂等
  it('Property 1: normalization is idempotent', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const once = normalizeIslandSettings(raw)
        const twice = normalizeIslandSettings(once)
        expect(twice).toEqual(once)
        // 字段类型合法
        expect(typeof once.enabled).toBe('boolean')
        expect(['window', 'island']).toContain(once.startMode)
      })
    )
  })
})

describe('resolveStartupMode', () => {
  const base: IslandSettings = { ...defaultIslandSettings }

  // Property 2: 启动模式决策确定性
  it('Property 2: login launch + enabled => island, else startMode', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom<'window' | 'island'>('window', 'island'),
        (wasLogin, enabled, startMode) => {
          const settings = { ...base, enabled, startMode }
          const mode = resolveStartupMode(wasLogin, settings)
          if (wasLogin && enabled) expect(mode).toBe('island')
          else expect(mode).toBe(startMode)
        }
      )
    )
  })
})

describe('computeBounds', () => {
  const primary: Rect = { x: 0, y: 0, width: 1920, height: 1080 }

  it('centers at top when position is null', () => {
    const b = computeBounds(primary, [primary], null)
    expect(b.y).toBe(8)
    expect(b.x).toBe(Math.round((1920 - ISLAND_WINDOW_SIZE.width) / 2))
    expect(b.width).toBe(ISLAND_WINDOW_SIZE.width)
  })

  it('uses persisted position when center is inside a work area', () => {
    const b = computeBounds(primary, [primary], { x: 100, y: 50 })
    expect(b).toEqual({ x: 100, y: 50, width: ISLAND_WINDOW_SIZE.width, height: ISLAND_WINDOW_SIZE.height })
  })

  it('falls back to centered when center is completely off-screen', () => {
    const b = computeBounds(primary, [primary], { x: 5000, y: 5000 })
    expect(b.x).toBe(Math.round((1920 - ISLAND_WINDOW_SIZE.width) / 2))
    expect(b.y).toBe(8)
  })

  it('allows position near edge as long as center is still inside', () => {
    // Island at right edge of 1920-wide screen: x=1750, center.x=1750+180=1930 > 1920 → falls back
    const nearEdge = computeBounds(primary, [primary], { x: 1750, y: 50 })
    const cx = 1750 + ISLAND_WINDOW_SIZE.width / 2
    if (cx > 1920) {
      expect(nearEdge.x).toBe(Math.round((1920 - ISLAND_WINDOW_SIZE.width) / 2))
    } else {
      expect(nearEdge.x).toBe(1750)
    }
  })

  it('restores position on external monitor when that monitor exists', () => {
    const externalWA: Rect = { x: 1920, y: 0, width: 1920, height: 1080 }
    // Position on external screen
    const b = computeBounds(primary, [primary, externalWA], { x: 2200, y: 50 })
    expect(b).toEqual({ x: 2200, y: 50, width: ISLAND_WINDOW_SIZE.width, height: ISLAND_WINDOW_SIZE.height })
  })

  it('falls back when external monitor is disconnected', () => {
    // Position was on external screen, but now only primary exists
    const b = computeBounds(primary, [primary], { x: 2200, y: 50 })
    expect(b.x).toBe(Math.round((1920 - ISLAND_WINDOW_SIZE.width) / 2))
    expect(b.y).toBe(8)
  })

  // Property 3: 输出始终落在某工作区内（中心点判定）
  it('Property 3: output center always inside a work area', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -6000, max: 6000 }),
        fc.integer({ min: -6000, max: 6000 }),
        (x, y) => {
          const b = computeBounds(primary, [primary], { x, y })
          const cx = b.x + b.width / 2
          const cy = b.y + b.height / 2
          const centerInside =
            cx >= primary.x &&
            cy >= primary.y &&
            cx <= primary.x + primary.width &&
            cy <= primary.y + primary.height
          expect(centerInside).toBe(true)
        }
      )
    )
  })
})

describe('autoLaunch', () => {
  beforeEach(() => {
    setLoginItemSettings.mockClear()
    getLoginItemSettings.mockReset()
    getLoginItemSettings.mockReturnValue({ openAtLogin: false, wasOpenedAtLogin: false })
  })

  it('setAutoLaunch returns success and calls setLoginItemSettings with openAtLogin', () => {
    const r = setAutoLaunch(true)
    expect(r.success).toBe(true)
    expect(setLoginItemSettings).toHaveBeenCalledTimes(1)
    const arg = setLoginItemSettings.mock.calls[0][0] as { openAtLogin: boolean }
    expect(arg.openAtLogin).toBe(true)
  })

  it('setAutoLaunch(false) passes openAtLogin=false', () => {
    setAutoLaunch(false)
    const arg = setLoginItemSettings.mock.calls[0][0] as { openAtLogin: boolean }
    expect(arg.openAtLogin).toBe(false)
  })

  it('setAutoLaunch returns failure when electron throws', () => {
    setLoginItemSettings.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const r = setAutoLaunch(true)
    expect(r.success).toBe(false)
    expect(r.error).toBe('boom')
  })

  it('getAutoLaunchStatus reflects system value', () => {
    getLoginItemSettings.mockReturnValue({ openAtLogin: true, wasOpenedAtLogin: false })
    expect(getAutoLaunchStatus()).toBe(true)
  })
})
