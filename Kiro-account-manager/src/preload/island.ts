// 灵动岛专用 preload：仅暴露最小化的 islandApi
// 设计参考：.kiro/specs/dynamic-island/design.md (Requirement 7.4)

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface IslandAccountSnapshot {
  id: string
  email: string
  idp: string
  status: string
  subscription?: string
  usage?: { usedCredits: number; totalCredits: number }
}

export interface IslandProxySnapshot {
  running: boolean
  port: number
  totalRequests: number
  successRequests: number
  failedRequests: number
}

export type IslandAppMode = 'window' | 'island'

export interface IslandPrefs {
  privacyMode: boolean
  isDark: boolean
  primary: string
  gradientTo: string
  foreground: string
  mutedForeground: string
  border: string
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const islandApi = {
  onAccountUpdate: (cb: (a: IslandAccountSnapshot | null) => void) =>
    subscribe<IslandAccountSnapshot | null>('island:account-update', cb),
  onProxyUpdate: (cb: (p: IslandProxySnapshot | null) => void) =>
    subscribe<IslandProxySnapshot | null>('island:proxy-update', cb),
  onModeChanged: (cb: (mode: IslandAppMode) => void) =>
    subscribe<IslandAppMode>('island:mode-changed', cb),
  onLanguageChanged: (cb: (lang: 'en' | 'zh') => void) =>
    subscribe<'en' | 'zh'>('island:language-changed', cb),
  onPrefsChanged: (cb: (prefs: IslandPrefs) => void) =>
    subscribe<IslandPrefs>('island:prefs-changed', cb),

  restoreMain: (): void => ipcRenderer.send('island:restore-main'),
  switchAccount: (): void => ipcRenderer.send('island:switch-account'),
  refreshAccount: (): void => ipcRenderer.send('island:refresh-account'),
  savePosition: (x: number, y: number): void => ipcRenderer.send('island:save-position', { x, y }),
  dragMove: (x: number, y: number): void => ipcRenderer.send('island:drag-move', { x, y }),
  openContextMenu: (): void => ipcRenderer.send('island:open-context-menu'),
  quit: (): void => ipcRenderer.send('island:quit')
}

export type IslandApi = typeof islandApi

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('islandApi', islandApi)
} else {
  // @ts-ignore (fallback when context isolation disabled)
  window.islandApi = islandApi
}
