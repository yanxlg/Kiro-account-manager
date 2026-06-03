export type SkillUpdateStatus = 'unknown' | 'latest' | 'available' | 'unsupported' | 'failed'
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
