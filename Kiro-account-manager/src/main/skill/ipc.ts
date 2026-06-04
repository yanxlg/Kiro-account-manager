import { ipcMain } from 'electron'
import {
  checkSkillUpdate,
  defaultSkillsManagerConfig,
  deletePlugin,
  deleteSkillFromAllAgents,
  deleteSkills,
  getPluginDeleteInfo,
  installSkills,
  listSkillsState,
  normalizeSkillsManagerConfig,
  saveSkillsConfigPatch,
  setSkillAutoUpdate,
  syncSkills,
  updatePlugin,
  updateSkillV2,
  type SkillsManagerConfig
} from './service'
import { validateCheckInterval, batchSetAutoUpdate } from './config'
import { normalizeSkills } from './normalizer'
import { convertAgentToSymlink } from './converter'
import { createHistoryStore } from './history'
import { MarketplaceDetector, MarketplaceManager } from './marketplace'
import type { AutoUpdateScheduler } from './scheduler'
import type { CheckResult } from './detector'
import type { MarketplaceInfo, SkillsSkillView } from './types'

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
    const scheduler = getScheduler?.()
    if (scheduler) {
      try {
        const results = await scheduler.triggerCheck(input.agent, input.skillName)
        const result = results[0]
        if (result) return { success: true, status: result.status, reason: result.reason }
        return { success: true, status: 'unknown' }
      } catch (error) {
        return { success: false, status: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
    }
    // Fallback to old logic if scheduler not available
    try {
      return await checkSkillUpdate(input, readConfig())
    } catch (error) {
      return { success: false, status: 'failed', reason: error instanceof Error ? error.message : String(error) }
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

  // --- Delete V2 Handlers ---

  ipcMain.handle('skills:delete-skill', async (_event, input: { skillName: string }) => {
    try {
      return await deleteSkillFromAllAgents(input, readConfig(), saveConfig)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:get-plugin-delete-info', async (_event, input: { skillName: string; pluginName: string; marketplace: string }) => {
    try {
      return await getPluginDeleteInfo(input)
    } catch (error) {
      return null
    }
  })

  ipcMain.handle('skills:delete-plugin', async (_event, input: { pluginKey: string; pluginName: string; marketplace: string; installPath: string; skillNames: string[] }) => {
    console.log('[Skills] deletePlugin called with:', JSON.stringify(input))
    try {
      return await deletePlugin(input, readConfig(), saveConfig)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:update-skill', async (_event, input: { skillName: string }) => {
    try {
      return await updateSkillV2(input, readConfig(), saveConfig)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:update-plugin', async (_event, input: { pluginName: string; marketplace: string }) => {
    try {
      return await updatePlugin(input, readConfig(), saveConfig)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // --- Marketplace Management IPC Handlers ---

  const detector = new MarketplaceDetector(getStore())
  const manager = new MarketplaceManager(getStore())

  /** 获取所有已安装 skill 的扁平列表（用于计算 installedSkillCount） */
  const getAllInstalledSkills = async (): Promise<SkillsSkillView[]> => {
    try {
      const result = await listSkillsState(readConfig())
      const skills: SkillsSkillView[] = []
      for (const agent of result.agents) {
        skills.push(...agent.skills)
      }
      return skills
    } catch {
      return []
    }
  }

  ipcMain.handle('marketplace:detect', async () => {
    try {
      return await detector.detect()
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('marketplace:list', async () => {
    try {
      const markets = await detector.detect()
      const allSkills = await getAllInstalledSkills()

      // Enrich each marketplace with installedSkillCount (deduplicated by skill name)
      const enriched: MarketplaceInfo[] = markets.map((market) => {
        const skills = manager.getInstalledSkillsForMarketplace(market, allSkills)
        const uniqueNames = new Set(skills.map((s) => s.name))
        return {
          ...market,
          installedSkillCount: uniqueNames.size
        }
      })

      return enriched
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('marketplace:listRemoteSkills', async (_event, marketplace: MarketplaceInfo) => {
    try {
      return await manager.listRemoteSkills(marketplace)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('marketplace:add', async (_event, input: { gitUrl: string; name?: string }) => {
    try {
      return await manager.addCustomMarketplace(input)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('marketplace:remove', async (_event, id: string) => {
    try {
      return await manager.removeCustomMarketplace(id)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('marketplace:refresh', async () => {
    try {
      // Clear manager cache to force fresh API queries
      manager.clearCache()
      // Re-run detection
      const markets = await detector.detect()
      const allSkills = await getAllInstalledSkills()

      // Enrich with installedSkillCount (deduplicated by skill name)
      const enriched: MarketplaceInfo[] = markets.map((market) => {
        const skills = manager.getInstalledSkillsForMarketplace(market, allSkills)
        const uniqueNames = new Set(skills.map((s) => s.name))
        return {
          ...market,
          installedSkillCount: uniqueNames.size
        }
      })

      return enriched
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('marketplace:getInstalledSkills', async (_event, marketplace: MarketplaceInfo) => {
    try {
      const allSkills = await getAllInstalledSkills()
      return manager.getInstalledSkillsForMarketplace(marketplace, allSkills)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
