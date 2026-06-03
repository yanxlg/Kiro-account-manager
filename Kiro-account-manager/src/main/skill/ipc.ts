import { ipcMain } from 'electron'
import {
  checkSkillUpdate,
  defaultSkillsManagerConfig,
  deleteSkills,
  installSkills,
  listSkillsState,
  normalizeSkillsManagerConfig,
  saveSkillsConfigPatch,
  setSkillAutoUpdate,
  syncSkills,
  updateSkills,
  type SkillsManagerConfig
} from './service'
import { validateCheckInterval, batchSetAutoUpdate } from './config'
import { normalizeSkills } from './normalizer'
import { convertAgentToSymlink } from './converter'
import { createHistoryStore } from './history'
import type { AutoUpdateScheduler } from './scheduler'
import type { CheckResult } from './detector'

interface StoreLike {
  get: (key: string, defaultValue?: unknown) => unknown
  set: (key: string, value: unknown) => void
}

const STORE_KEY = 'skillsManagerConfig'

export function registerSkillsManagerIpcHandlers(
  getStore: () => StoreLike | null,
  getScheduler?: () => AutoUpdateScheduler | null
): void {
  const readConfig = (): SkillsManagerConfig => {
    const store = getStore()
    return normalizeSkillsManagerConfig(store?.get(STORE_KEY, defaultSkillsManagerConfig()))
  }

  const saveConfig = (config: SkillsManagerConfig): void => {
    const store = getStore()
    if (!store) return
    store.set(STORE_KEY, normalizeSkillsManagerConfig(config))
  }

  ipcMain.handle('skills:list', async () => {
    return listSkillsState(readConfig())
  })

  ipcMain.handle('skills:get-config', async () => {
    return readConfig()
  })

  ipcMain.handle('skills:save-config', async (_event, patch: Partial<SkillsManagerConfig>) => {
    try {
      const config = await saveSkillsConfigPatch(patch, readConfig(), saveConfig)
      return { success: true, config }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:set-auto-update', async (_event, input: { agent: string; skillName: string; enabled: boolean }) => {
    try {
      return await setSkillAutoUpdate(input, readConfig(), saveConfig)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:install', async (_event, input) => {
    try {
      return await installSkills(input, readConfig(), saveConfig)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:check-update', async (_event, input: { agent: string; skillName: string }) => {
    try {
      return await checkSkillUpdate(input, readConfig())
    } catch (error) {
      return { success: false, status: 'failed', reason: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:update', async (_event, input: { agent: string; skillNames: string[] }) => {
    try {
      return await updateSkills(input, readConfig())
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:delete', async (_event, input: { agent: string; skillNames: string[]; allAgents?: boolean }) => {
    try {
      return await deleteSkills(input, readConfig(), saveConfig)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:sync', async (_event, input: { sourceAgent: string; skillNames: string[]; targetAgents: string[]; overwrite?: boolean }) => {
    try {
      return await syncSkills(input, readConfig(), saveConfig)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // --- Auto-Update IPC Handlers ---

  ipcMain.handle('skills:check-update-batch', async (_event, input: { agent?: string }): Promise<CheckResult[]> => {
    const scheduler = getScheduler?.()
    if (!scheduler) {
      return []
    }
    try {
      return await scheduler.triggerCheck(input.agent)
    } catch (error) {
      return []
    }
  })

  ipcMain.handle('skills:set-check-interval', async (_event, input: { minutes: number }) => {
    const validation = validateCheckInterval(input.minutes)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      const config = readConfig()
      const updatedConfig = { ...config, checkIntervalMinutes: input.minutes }
      saveConfig(updatedConfig)

      const scheduler = getScheduler?.()
      if (scheduler) {
        scheduler.reschedule(input.minutes)
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:batch-set-auto-update', async (_event, input: { skillKeys: string[]; enabled: boolean }) => {
    try {
      const config = readConfig()
      const updatedConfig = batchSetAutoUpdate(input.skillKeys, input.enabled, config)
      saveConfig(updatedConfig)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:normalize', async () => {
    try {
      const config = readConfig()
      return await normalizeSkills(config)
    } catch (error) {
      return { normalized: [], conflicts: [], errors: [{ skillName: '*', agent: '*', reason: error instanceof Error ? error.message : String(error) }] }
    }
  })

  ipcMain.handle('skills:convert-symlink', async (_event, input: { agentId: string }) => {
    try {
      const config = readConfig()
      return await convertAgentToSymlink(input.agentId, config)
    } catch (error) {
      return { converted: [], skipped: [], errors: [{ skillName: '*', reason: error instanceof Error ? error.message : String(error) }] }
    }
  })

  ipcMain.handle('skills:get-update-history', async (_event, input: { skillName: string }) => {
    try {
      const historyStore = createHistoryStore(readConfig, saveConfig)
      return historyStore.query(input.skillName)
    } catch (error) {
      return []
    }
  })

  ipcMain.handle('skills:get-last-batch-result', async () => {
    const scheduler = getScheduler?.()
    if (!scheduler) {
      return null
    }
    return scheduler.getLastBatchResult()
  })
}
