import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mock electron (shared state via vi.hoisted so the mock factory can access it) ----
interface FakeWin {
  destroyed: boolean
  shown: boolean
  webContents: { send: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }
  on: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  isDestroyed: () => boolean
  setAlwaysOnTop: ReturnType<typeof vi.fn>
  setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
  setPosition: ReturnType<typeof vi.fn>
  getPosition: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
}

const h = vi.hoisted(() => {
  const createdWindows: FakeWin[] = []
  const makeFakeWin = (): FakeWin => {
    const win = {
      destroyed: false,
      shown: false,
      webContents: { send: vi.fn(), on: vi.fn() },
      on: vi.fn(),
      show: vi.fn(() => {
        win.shown = true
      }),
      hide: vi.fn(() => {
        win.shown = false
      }),
      destroy: vi.fn(() => {
        win.destroyed = true
      }),
      isDestroyed: () => win.destroyed,
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
      setBounds: vi.fn(),
      setPosition: vi.fn(),
      getPosition: vi.fn(() => [100, 50]),
      loadURL: vi.fn(),
      loadFile: vi.fn()
    } as FakeWin
    return win
  }
  return {
    createdWindows,
    makeFakeWin,
    dock: { hide: vi.fn(), show: vi.fn() },
    menuPopup: vi.fn()
  }
})

const createdWindows = h.createdWindows
const makeFakeWin = h.makeFakeWin
const dock = h.dock

vi.mock('electron', () => ({
  app: {
    dock: h.dock,
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false, wasOpenedAtLogin: false }))
  },
  BrowserWindow: vi.fn(function () {
    const w = h.makeFakeWin()
    h.createdWindows.push(w)
    return w
  }),
  ipcMain: { on: vi.fn() },
  Menu: { buildFromTemplate: vi.fn(() => ({ popup: h.menuPopup })) },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { IslandManager } from '../index'
import { defaultIslandSettings, type IslandSettings } from '../types'

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

const realPlatform = process.platform

function makeManager(overrides: Partial<IslandSettings> = {}) {
  let settings: IslandSettings = { ...defaultIslandSettings, ...overrides }
  const mainWin = makeFakeWin()
  const deps = {
    getSettings: () => settings,
    saveSettings: vi.fn((patch: Partial<IslandSettings>) => {
      settings = { ...settings, ...patch }
    }),
    getMainWindow: () => mainWin as unknown as Electron.BrowserWindow,
    showMainWindow: vi.fn(),
    onSwitchAccount: vi.fn(),
    onRefreshAccount: vi.fn(),
    onQuit: vi.fn(),
    isQuitting: () => false,
    getLanguage: () => 'zh' as const
  }
  const manager = new IslandManager(deps)
  return { manager, deps, mainWin, getSettings: () => settings }
}

beforeEach(() => {
  createdWindows.length = 0
  dock.hide.mockClear()
  dock.show.mockClear()
  setPlatform(realPlatform)
})

describe('IslandManager mode switching', () => {
  it('enterIslandMode creates island, hides main, sets island mode', () => {
    const { manager, mainWin } = makeManager({ enabled: true })
    manager.enterIslandMode()
    expect(manager.getMode()).toBe('island')
    expect(mainWin.hide).toHaveBeenCalled()
    expect(createdWindows.length).toBe(1)
    expect(createdWindows[0].shown).toBe(true)
  })

  it('enterIslandMode is a no-op when disabled', () => {
    const { manager } = makeManager({ enabled: false })
    manager.enterIslandMode()
    expect(manager.getMode()).toBe('window')
    expect(createdWindows.length).toBe(0)
  })

  it('reuses a single island window across repeated enters', () => {
    const { manager } = makeManager({ enabled: true })
    manager.enterIslandMode()
    manager.exitIslandMode()
    manager.enterIslandMode()
    expect(createdWindows.length).toBe(1)
  })

  it('exitIslandMode hides island and returns to window mode', () => {
    const { manager } = makeManager({ enabled: true })
    manager.enterIslandMode()
    manager.exitIslandMode()
    expect(manager.getMode()).toBe('window')
    expect(createdWindows[0].shown).toBe(false)
  })

  it('hides dock on macOS when entering island mode', () => {
    setPlatform('darwin')
    const { manager } = makeManager({ enabled: true })
    manager.enterIslandMode()
    expect(dock.hide).toHaveBeenCalled()
  })
})

describe('IslandManager data forwarding', () => {
  it('pushAccount caches and re-pushes on enter when no window yet', () => {
    const { manager } = makeManager({ enabled: true })
    const snap = { id: '1', email: 'a@b.com', idp: 'GitHub', status: 'active' }
    manager.pushAccount(snap) // no window yet -> cached, no throw
    manager.enterIslandMode()
    const sent = createdWindows[0].webContents.send.mock.calls.filter(
      (c) => c[0] === 'island:account-update'
    )
    expect(sent.length).toBeGreaterThan(0)
    expect(sent[sent.length - 1][1]).toEqual(snap)
  })

  it('pushProxy only sends when showProxyStatus enabled', () => {
    const { manager } = makeManager({ enabled: true, showProxyStatus: false })
    manager.enterIslandMode()
    createdWindows[0].webContents.send.mockClear()
    manager.pushProxy({ running: true, port: 5580, totalRequests: 1, successRequests: 1, failedRequests: 0 })
    const proxySends = createdWindows[0].webContents.send.mock.calls.filter((c) => c[0] === 'island:proxy-update')
    expect(proxySends.length).toBe(0)
  })

  it('push is safe (no throw) after destroy', () => {
    const { manager } = makeManager({ enabled: true })
    manager.enterIslandMode()
    manager.destroy()
    expect(() => manager.pushAccount({ id: '1', email: 'x@y.com', idp: 'i', status: 'active' })).not.toThrow()
    expect(() => manager.pushProxy({ running: false, port: 0, totalRequests: 0, successRequests: 0, failedRequests: 0 })).not.toThrow()
  })
})

describe('IslandManager applySettings', () => {
  it('disabling while in island mode restores main window', () => {
    const { manager, deps } = makeManager({ enabled: true })
    manager.enterIslandMode()
    manager.applySettings({ ...defaultIslandSettings, enabled: false })
    expect(deps.showMainWindow).toHaveBeenCalled()
  })
})
