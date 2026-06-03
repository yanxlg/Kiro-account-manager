export type SkillUpdateStatus = 'unknown' | 'latest' | 'available' | 'unsupported' | 'failed'
export type SkillInstallMode = 'symlink' | 'copy'

export interface SkillsManagerConfig {
  version: 1
  defaultAutoUpdate: boolean
  defaultInstallMode: SkillInstallMode
  gitlabToken?: string
  githubToken?: string
  checkIntervalMinutes?: number
  skillConfigs: Record<string, SkillManagerSkillConfig>
  updateHistory?: UpdateHistoryEntry[]
  lastSelectedAgent?: string
}

export interface SkillManagerSkillConfig {
  agent: string
  skillName: string
  autoUpdate?: boolean
  lastCheckStatus?: SkillUpdateStatus
  lastCheckReason?: string
  lastCheckedAt?: string // ISO 8601
  createdAt: number
  updatedAt: number
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
  canonicalPath?: string
  installedAt?: string
  updatedAt?: string
  pluginName?: string
  version?: string
  installType?: 'skills' | 'plugin'
  autoUpdate: boolean
  updateStatus?: SkillUpdateStatus
  updateReason?: string
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

export interface SkillsAgentsResult {
  agents: SkillsAgentView[]
  config: SkillsManagerConfig
}

export interface SkillsOperationResult {
  success: boolean
  message?: string
  results?: Array<{ skillName?: string; agent?: string; success: boolean; error?: string }>
  error?: string
}

export interface SkillsInstallInput {
  source: string
  agents: string[]
  skills?: string[]
  copy?: boolean
  yes?: boolean
}

export interface AgentDefinition {
  id: string
  packageAgentId?: string
  displayName: string
  skillsDir: string
  globalSkillsDir: string
  detectCommands?: string[]
  detectPaths?: string[]
  detectBySkillsDir?: boolean
  universal?: boolean
  supportsSymlinkProjection?: boolean
}

export interface LockEntry {
  source?: string
  sourceType?: string
  sourceUrl?: string
  ref?: string
  skillPath?: string
  skillFolderHash?: string
  installedAt?: string
  updatedAt?: string
  pluginName?: string
  canonicalPath?: string
}

// --- Auto-Update Types ---

export interface UpdateHistoryEntry {
  skillName: string
  agent: string
  timestamp: string // ISO 8601
  previousHash: string
  newHash: string
  success: boolean
}

export interface UpdateTask {
  agent: string
  skillName: string
  source: string
  sourceUrl?: string
  ref: string
  skillPath?: string
  sourceType: string
}

export interface UpdateResult {
  agent: string
  skillName: string
  success: boolean
  previousHash?: string
  newHash?: string
  error?: string
  duration: number
}

export interface BatchUpdateResult {
  successes: UpdateResult[]
  failures: UpdateResult[]
  timestamp: string
}

// --- IPC Push Event Payloads ---

export interface StatusChangedEvent {
  agent: string
  skillName: string
  status: SkillUpdateStatus
  reason?: string
}

export interface BatchUpdateCompletedEvent {
  successes: Array<{ agent: string; skillName: string; previousHash: string; newHash: string }>
  failures: Array<{ agent: string; skillName: string; reason: string }>
  timestamp: string
}

export interface CheckProgressEvent {
  agent: string
  skillName: string
  checking: boolean
}
