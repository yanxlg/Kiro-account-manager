// 灵动岛管理器：窗口生命周期、模式切换、数据转发
// 设计参考：.kiro/specs/dynamic-island/design.md

import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { computeBounds, ISLAND_WINDOW_SIZE, type Rect } from './geometry'
import type { AccountSnapshot, AppMode, IslandPrefs, IslandSettings, ProxySnapshot } from './types'

export interface IslandManagerDeps {
  getSettings: () => IslandSettings
  saveSettings: (patch: Partial<IslandSettings>) => void
  getMainWindow: () => BrowserWindow | null
  /** 复用 index.ts 既有的"显示主窗口"逻辑（含 dock.show） */
  showMainWindow: () => void
  /** 复用托盘"切换到下一个账户"逻辑 */
  onSwitchAccount: () => void
  /** 复用托盘"刷新账户信息"逻辑 */
  onRefreshAccount: () => void
  onQuit: () => void
  isQuitting: () => boolean
  getLanguage: () => 'en' | 'zh'
}

export class IslandManager {
  private window: BrowserWindow | null = null
  private mode: AppMode = 'window'
  private lastAccount: AccountSnapshot | null = null
  private lastProxy: ProxySnapshot | null = null
  private lastPrefs: IslandPrefs | null = null
  private metricsHandler: (() => void) | null = null

  constructor(private deps: IslandManagerDeps) {
    this.registerIpcHandlers()
  }

  getMode(): AppMode {
    return this.mode
  }

  // ============ 窗口生命周期 ============

  private createWindowWithTransparency(transparent: boolean): BrowserWindow {
    const win = new BrowserWindow({
      width: ISLAND_WINDOW_SIZE.width,
      height: ISLAND_WINDOW_SIZE.height,
      show: false,
      frame: false,
      transparent,
      backgroundColor: transparent ? '#00000000' : '#1a1a1a',
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      webPreferences: {
        preload: join(__dirname, '../preload/island.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    return win
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window

    let win: BrowserWindow
    try {
      win = this.createWindowWithTransparency(true)
    } catch (error) {
      // 透明窗口创建失败 → 降级为不透明（Requirement 8.4）
      console.error('[Island] transparent window failed, falling back to opaque:', error)
      win = this.createWindowWithTransparency(false)
    }

    this.window = win

    // 置顶 + 全屏 Space 可见
    win.setAlwaysOnTop(true, 'screen-saver')
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }

    // 加载 island.html
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/island.html`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/island.html'))
    }

    // 首屏：加载完成后立即重推缓存（Requirement 7.5）
    win.webContents.on('did-finish-load', () => {
      this.pushLanguage(this.deps.getLanguage())
      if (this.lastPrefs) this.send('island:prefs-changed', this.lastPrefs)
      this.send('island:account-update', this.lastAccount)
      if (this.lastProxy) this.send('island:proxy-update', this.lastProxy)
      this.send('island:mode-changed', this.mode)
    })

    win.on('closed', () => {
      this.window = null
    })

    // 显示器布局变化时重新校正位置（Requirement 8.5）
    if (!this.metricsHandler) {
      this.metricsHandler = (): void => this.repositionWindow()
      screen.on('display-metrics-changed', this.metricsHandler)
    }

    return win
  }

  private toRect(area: Electron.Rectangle): Rect {
    return { x: area.x, y: area.y, width: area.width, height: area.height }
  }

  private repositionWindow(): void {
    if (!this.window || this.window.isDestroyed()) return
    const primary = this.toRect(screen.getPrimaryDisplay().workArea)
    const all = screen.getAllDisplays().map((d) => this.toRect(d.workArea))
    const bounds = computeBounds(primary, all, this.deps.getSettings().position)
    this.window.setBounds(bounds)
  }

  // ============ 模式切换 ============

  enterIslandMode(): void {
    const settings = this.deps.getSettings()
    if (!settings.enabled) return

    const win = this.ensureWindow()
    const main = this.deps.getMainWindow()
    if (main && !main.isDestroyed()) main.hide()
    if (process.platform === 'darwin' && app.dock) void app.dock.hide()

    this.repositionWindow()
    win.show()
    this.mode = 'island'

    // 进入模式时重推一次缓存（Requirement 7.3）
    if (this.lastPrefs) this.send('island:prefs-changed', this.lastPrefs)
    this.send('island:account-update', this.lastAccount)
    if (this.lastProxy) this.send('island:proxy-update', this.lastProxy)
    this.send('island:mode-changed', this.mode)
  }

  exitIslandMode(): void {
    // 退出前保存窗口的实际位置（而非依赖拖拽时的计算值，确保恢复精准）
    if (this.window && !this.window.isDestroyed()) {
      const [wx, wy] = this.window.getPosition()
      this.deps.saveSettings({ position: { x: wx, y: wy } })
      this.window.hide()
    }
    this.mode = 'window'
    this.send('island:mode-changed', this.mode)
    // 主窗口显示与 dock 恢复由 deps.showMainWindow 统一负责
  }

  /** 由灵动岛单击 / 右键"显示主窗口"触发 */
  restoreMain(): void {
    // showMainWindow 内部会调用 exitIslandMode 并显示主窗口
    this.deps.showMainWindow()
  }

  // ============ 数据转发 ============

  private send(channel: string, payload: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload)
    }
  }

  pushAccount(snapshot: AccountSnapshot | null): void {
    this.lastAccount = snapshot
    this.send('island:account-update', snapshot)
  }

  pushProxy(snapshot: ProxySnapshot): void {
    this.lastProxy = snapshot
    if (this.deps.getSettings().showProxyStatus) {
      this.send('island:proxy-update', snapshot)
    }
  }

  pushLanguage(lang: 'en' | 'zh'): void {
    this.send('island:language-changed', lang)
  }

  pushPrefs(prefs: IslandPrefs): void {
    this.lastPrefs = prefs
    this.send('island:prefs-changed', prefs)
  }

  // ============ 设置变化 ============

  applySettings(next: IslandSettings): void {
    if (!next.enabled && this.mode === 'island') {
      // 关闭灵动岛 → 退出灵动岛模式并恢复主窗口（Requirement 6.4）
      this.restoreMain()
    }
    // showProxyStatus 即时生效：重推最新反代状态或通知隐藏
    if (this.lastProxy) {
      if (next.showProxyStatus) this.send('island:proxy-update', this.lastProxy)
      else this.send('island:proxy-update', null)
    }
  }

  // ============ 交互 IPC ============

  private registerIpcHandlers(): void {
    ipcMain.on('island:restore-main', () => this.restoreMain())
    ipcMain.on('island:switch-account', () => this.deps.onSwitchAccount())
    ipcMain.on('island:refresh-account', () => this.deps.onRefreshAccount())
    ipcMain.on('island:quit', () => this.deps.onQuit())

    ipcMain.on('island:save-position', (_e, pos: { x: number; y: number }) => {
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        this.deps.saveSettings({ position: { x: Math.round(pos.x), y: Math.round(pos.y) } })
      }
    })

    ipcMain.on('island:drag-move', (_e, pos: { x: number; y: number }) => {
      if (this.window && !this.window.isDestroyed() && pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        this.window.setPosition(Math.round(pos.x), Math.round(pos.y))
      }
    })

    ipcMain.on('island:open-context-menu', () => this.popupContextMenu())
  }

  private popupContextMenu(): void {
    if (!this.window || this.window.isDestroyed()) return
    const isEn = this.deps.getLanguage() === 'en'
    const menu = Menu.buildFromTemplate([
      { label: isEn ? 'Show Main Window' : '显示主窗口', click: () => this.restoreMain() },
      { label: isEn ? 'Switch to Next Account' : '切换到下一个账户', click: () => this.deps.onSwitchAccount() },
      { label: isEn ? 'Refresh Account Info' : '刷新账户信息', click: () => this.deps.onRefreshAccount() },
      { type: 'separator' },
      { label: isEn ? 'Exit Island Mode' : '退出灵动岛模式', click: () => this.restoreMain() },
      { label: isEn ? 'Quit' : '退出程序', click: () => this.deps.onQuit() }
    ])
    menu.popup({ window: this.window })
  }

  // ============ 销毁 ============

  destroy(): void {
    if (this.metricsHandler) {
      screen.removeListener('display-metrics-changed', this.metricsHandler)
      this.metricsHandler = null
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }
}
