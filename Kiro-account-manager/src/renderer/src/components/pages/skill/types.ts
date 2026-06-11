export type SkillUpdateStatus = 'unknown' | 'latest' | 'available' | 'unsupported' | 'failed' | 'updating'
export type SkillInstallMode = 'symlink' | 'copy'

export interface SkillsManagerConfig {
  version: 1
  defaultAutoUpdate: boolean
  defaultInstallMode: SkillInstallMode
  gitlabToken?: string
  githubToken?: string
  checkIntervalMinutes?: number
  skillConfigs: Record<
    string,
    {
      agent: string
      skillName: string
      autoUpdate?: boolean
      createdAt: number
      updatedAt: number
    }
  >
  lastSelectedAgent?: string
}

export interface SkillsSkillView {
  name: string
  description: string
  agent: string
  source?: string
  sourceType?: string
  sourceUrl?: string
  ref?: string
  path: string
  pluginName?: string
  installedAt?: string
  autoUpdate: boolean
  updateStatus?: SkillUpdateStatus
  updateReason?: string
  version?: string
  installType?: 'skills' | 'plugin'
}

export interface SkillsAgentView {
  id: string
  displayName: string
  installed: boolean
  universal?: boolean
  supportsSymlinkProjection?: boolean
  effectiveInstallMode?: SkillInstallMode | 'shared'
  globalSkillsDir?: string
  count: number
  skills: SkillsSkillView[]
}

export type OperationBusy = 'load' | 'install' | 'delete' | 'sync' | 'update' | 'check' | null

// --- Marketplace Management Types ---

/** 市场来源类型 */
export type MarketplaceSourceType = 'claude-plugin' | 'github-skills' | 'custom'

/** 市场信息记录 */
export interface MarketplaceInfo {
  id: string
  name: string
  gitUrl: string
  sourceType: MarketplaceSourceType
  owner?: string
  repo?: string
  ref?: string
  host?: string
  projectPath?: string
  createdAt?: string
  installedSkillCount?: number
}

/** 可用 skill（远端仓库中检测到的） */
export interface AvailableSkill {
  name: string
  path: string
  installed: boolean
}
