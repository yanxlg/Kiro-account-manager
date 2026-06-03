import { SkillsManagerConfig, UpdateHistoryEntry } from './types'

const MAX_HISTORY_ENTRIES = 200

export interface HistoryStore {
  /** 追加一条记录，自动裁剪到 200 条 */
  append(entry: UpdateHistoryEntry): void

  /** 按 skillName 查询，按 timestamp 降序 */
  query(skillName: string): UpdateHistoryEntry[]

  /** 获取全部记录 */
  getAll(): UpdateHistoryEntry[]
}

export function createHistoryStore(
  getConfig: () => SkillsManagerConfig,
  saveConfig: (config: SkillsManagerConfig) => void
): HistoryStore {
  return {
    append(entry: UpdateHistoryEntry): void {
      const config = getConfig()
      const history = [...(config.updateHistory || []), entry]

      // Sort by timestamp ascending, then keep the newest 200
      history.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

      const trimmed = history.length > MAX_HISTORY_ENTRIES
        ? history.slice(history.length - MAX_HISTORY_ENTRIES)
        : history

      saveConfig({ ...config, updateHistory: trimmed })
    },

    query(skillName: string): UpdateHistoryEntry[] {
      const config = getConfig()
      const history = config.updateHistory || []

      return history
        .filter((entry) => entry.skillName === skillName)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    },

    getAll(): UpdateHistoryEntry[] {
      const config = getConfig()
      return config.updateHistory || []
    }
  }
}
