// 开机自启动（Login Item）封装
// 设计参考：.kiro/specs/dynamic-island/design.md (Requirement 4)

import { app } from 'electron'

/** Windows / Linux 隐藏启动标识：开机自启动时附带，用于检测"被登录项拉起" */
export const HIDDEN_FLAG = '--island-hidden'

export interface AutoLaunchResult {
  success: boolean
  error?: string
}

/**
 * 设置开机自启动。
 * - macOS：openAtLogin + openAsHidden（登录后隐藏启动）
 * - Windows：openAtLogin + args 附带隐藏标识
 * - Linux：Electron 25+ 支持 setLoginItemSettings
 */
export function setAutoLaunch(enabled: boolean): AutoLaunchResult {
  try {
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: enabled })
    } else if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        args: enabled ? [HIDDEN_FLAG] : []
      })
    } else {
      // Linux 及其他平台
      app.setLoginItemSettings({ openAtLogin: enabled })
    }
    return { success: true }
  } catch (error) {
    console.error('[Island] setLoginItemSettings failed:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/** 读取系统当前的开机自启动状态（以系统为准） */
export function getAutoLaunchStatus(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin === true
  } catch (error) {
    console.error('[Island] getLoginItemSettings failed:', error)
    return false
  }
}

/** 检测本次启动是否由开机自启动拉起 */
export function wasLaunchedAtLogin(): boolean {
  try {
    if (process.platform === 'darwin') {
      return app.getLoginItemSettings().wasOpenedAtLogin === true
    }
    // Windows / Linux：检测隐藏启动参数
    return process.argv.includes(HIDDEN_FLAG)
  } catch (error) {
    console.error('[Island] wasLaunchedAtLogin check failed:', error)
    return false
  }
}
