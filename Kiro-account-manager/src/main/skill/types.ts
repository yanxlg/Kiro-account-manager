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

// --- Marketplace Management Types ---

/** 市场来源类型 */
export type MarketplaceSourceType = 'claude-plugin' | 'github-skills' | 'custom'

/** 市场信息记录 */
export interface MarketplaceInfo {
  id: string                        // 唯一标识（UUID 或 derived key）
  name: string                      // 显示名称
  gitUrl: string                    // 仓库地址（HTTPS/SSH/shorthand）
  sourceType: MarketplaceSourceType // 来源类型
  owner?: string                    // 仓库 owner（解析自 URL）
  repo?: string                     // 仓库 repo name（解析自 URL）
  ref?: string                      // 分支/tag
  host?: string                     // GitLab host（仅 GitLab 类型）
  projectPath?: string              // GitLab projectPath（仅 GitLab 类型）
  createdAt?: string                // 添加时间（ISO 8601）
  installedSkillCount?: number      // 该市场下已安装 skill 数
}

/** 可用 skill（远端仓库中检测到的） */
export interface AvailableSkill {
  name: string                      // skill 名称（目录名）
  path: string                      // 在仓库中的相对路径
  installed: boolean                // 是否已安装到本地
}

/** 自定义市场持久化记录 */
export interface CustomMarketplaceRecord {
  id: string
  name: string
  gitUrl: string
  sourceType: 'custom'
  owner?: string
  repo?: string
  ref?: string
  host?: string
  projectPath?: string
  createdAt: string
}

/** 解析后的 Git URL 信息 */
export interface ParsedGitUrl {
  owner: string
  repo: string
  host: string            // 'github.com' | gitlab host
  platform: 'github' | 'gitlab' | 'unknown'
  normalizedUrl: string   // 用于去重比较的规范化 URL
}
