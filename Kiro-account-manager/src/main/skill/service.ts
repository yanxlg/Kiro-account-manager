import { cp, lstat, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from 'fs/promises'
import { basename, dirname, join, relative, resolve } from 'path'
import {
  agentDefinitions,
  canonicalGlobalSkillsDir,
  claudeHome,
  detectAgent,
  getAgentById,
  getAgentSkillDirs,
  getInstalledAgentDefinitions,
  supportsAgentSymlinkProjection,
  toPackageAgentId
} from './agents'
import { runNpxSkills } from './commands'
import {
  defaultSkillsManagerConfig,
  getSkillConfigKey,
  normalizeSkillName,
  normalizeSkillsManagerConfig
} from './config'
import { isPathSafe, pathExists, readSkillDirs } from './filesystem'
import { getGitHubTree, lockForSkill, readGlobalLock, removeGlobalLockEntry, addGlobalLockEntry } from './lock'

/**
 * 从 skill 目录本地读取版本号。
 * 依次尝试 skill 目录及向上 2 级的 package.json / .claude-plugin/plugin.json。
 */
async function readSkillVersion(skillDir: string): Promise<string | undefined> {
  const parts = skillDir.split('/').filter(Boolean)
  const candidates: string[] = [
    join(skillDir, 'package.json'),
    join(skillDir, '.claude-plugin', 'plugin.json'),
    join(skillDir, 'marketplace.json')
  ]
  if (parts.length >= 2) {
    const parent = '/' + parts.slice(0, -1).join('/')
    candidates.push(join(parent, 'package.json'))
    candidates.push(join(parent, '.claude-plugin', 'plugin.json'))
    candidates.push(join(parent, 'marketplace.json'))
  }
  if (parts.length >= 3) {
    const grandparent = '/' + parts.slice(0, -2).join('/')
    candidates.push(join(grandparent, 'package.json'))
    candidates.push(join(grandparent, '.claude-plugin', 'plugin.json'))
    candidates.push(join(grandparent, 'marketplace.json'))
  }
  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, 'utf-8')
      const data = JSON.parse(content) as { version?: string; metadata?: { version?: string } }
      if (data.version) return data.version
      if (data.metadata?.version) return data.metadata.version
    } catch {
      // file not found or parse error, try next
    }
  }
  return undefined
}
import type {
  SkillUpdateStatus,
  SkillsAgentView,
  SkillsAgentsResult,
  SkillsInstallInput,
  SkillsManagerConfig,
  SkillsOperationResult,
  SkillsSkillView
} from './types'

/** Extract GitLab host and project path from SSH or HTTPS URL */
function extractGitLabInfo(url: string): { host: string; projectPath: string } | null {
  // git@gitlab.example.com:group/repo.git
  const sshMatch = url.match(/^git@([^:]+):([^/][^:]+?)(?:\.git)?$/)
  if (sshMatch) return { host: `https://${sshMatch[1]}`, projectPath: sshMatch[2] }
  // https://gitlab.example.com/group/repo.git
  const httpsMatch = url.match(/^(https?:\/\/[^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return { host: httpsMatch[1], projectPath: httpsMatch[2] }
  return null
}

export {
  defaultSkillsManagerConfig,
  getSkillConfigKey,
  normalizeSkillName,
  normalizeSkillsManagerConfig
}
export type {
  SkillUpdateStatus,
  SkillsAgentView,
  SkillsAgentsResult,
  SkillsInstallInput,
  SkillsManagerConfig,
  SkillsOperationResult,
  SkillsSkillView
}

/**
 * Read Claude Code installed plugins from ~/.claude/plugins/installed_plugins.json
 * and scan their skill directories.
 */
async function readClaudePluginSkills(config: SkillsManagerConfig): Promise<SkillsSkillView[]> {
  const pluginsJsonPath = join(claudeHome, 'plugins', 'installed_plugins.json')
  const results: SkillsSkillView[] = []

  try {
    const raw = await readFile(pluginsJsonPath, 'utf-8')
    const data = JSON.parse(raw) as {
      version?: number
      plugins?: Record<string, Array<{
        scope?: string
        installPath?: string
        version?: string
        installedAt?: string
        lastUpdated?: string
        gitCommitSha?: string
      }>>
    }

    if (!data.plugins) return results

    for (const [pluginKey, installations] of Object.entries(data.plugins)) {
      // Use the latest installation (first in array)
      const install = installations[0]
      if (!install?.installPath) continue

      // Scan skills/ subdirectory within the plugin install path
      const skillsDir = join(install.installPath, 'skills')
      const skills = await readSkillDirs(skillsDir).catch(() => [])

      for (const skill of skills) {
        const cfg = config.skillConfigs[getSkillConfigKey('claude-code', skill.name)]
        results.push({
          name: skill.name,
          description: skill.description,
          agent: 'claude-code',
          source: pluginKey.split('@')[1] || pluginKey, // marketplace name
          sourceType: 'plugin',
          path: skill.dir,
          installedAt: install.installedAt,
          updatedAt: install.lastUpdated,
          pluginName: pluginKey.split('@')[0],
          version: install.version,
          installType: 'plugin',
          autoUpdate: cfg?.autoUpdate ?? false,
          updateStatus: cfg?.lastCheckStatus || 'unknown',
          updateReason: cfg?.lastCheckReason
        })
      }
    }
  } catch {
    // installed_plugins.json doesn't exist or is malformed
  }

  return results
}

export async function listSkillsState(configValue: unknown): Promise<SkillsAgentsResult> {
  const config = normalizeSkillsManagerConfig(configValue)
  const lock = await readGlobalLock()
  const agents = await Promise.all(
    agentDefinitions.map(async (agent) => {
      const installed = detectAgent(agent)
      if (!installed) return null
      const byName = new Map<string, SkillsSkillView>()
      for (const dir of getAgentSkillDirs(agent)) {
        const skills = await readSkillDirs(dir)
        for (const skill of skills) {
          const key = normalizeSkillName(skill.name)
          if (byName.has(key)) continue
          const lockEntry = lockForSkill(lock, skill.name)
          const cfg = config.skillConfigs[getSkillConfigKey(agent.id, skill.name)]
          // Fallback: check if any other agent has autoUpdate set for the same skill
          const resolvedAutoUpdate = cfg?.autoUpdate ?? Object.values(config.skillConfigs).find(
            (c) => c.skillName === skill.name && c.autoUpdate !== undefined
          )?.autoUpdate ?? false
          // 状态跨 agent 同步：skill 是 canonical 共享的，取所有 agent 中最新一次检测的状态，
          // 避免某些 tab 显示过期的 available
          const statusCandidates = Object.values(config.skillConfigs).filter(
            (c) => c.skillName === skill.name && c.lastCheckStatus
          )
          const freshestStatus = statusCandidates.reduce<typeof statusCandidates[number] | undefined>(
            (best, c) => {
              const tc = c.lastCheckedAt ? Date.parse(c.lastCheckedAt) : 0
              const tb = best?.lastCheckedAt ? Date.parse(best.lastCheckedAt) : 0
              return !best || tc > tb ? c : best
            },
            undefined
          )
          byName.set(key, {
            name: skill.name,
            description: skill.description,
            agent: agent.id,
            source: lockEntry?.source,
            sourceType: lockEntry?.sourceType,
            sourceUrl: lockEntry?.sourceUrl,
            ref: lockEntry?.ref,
            path: skill.dir,
            canonicalPath:
              dir === canonicalGlobalSkillsDir
                ? skill.dir
                : join(canonicalGlobalSkillsDir, normalizeSkillName(skill.name)),
            installedAt: lockEntry?.installedAt,
            updatedAt: lockEntry?.updatedAt,
            pluginName: lockEntry?.pluginName,
            version: await readSkillVersion(skill.dir) || cfg?.lastKnownVersion || freshestStatus?.lastKnownVersion,
            installType: 'skills',
            autoUpdate: resolvedAutoUpdate,
            updateStatus: freshestStatus?.lastCheckStatus || 'unknown',
            updateReason: freshestStatus?.lastCheckReason
          })
        }
      }

      // For Claude Code, also read installed plugins
      if (agent.id === 'claude-code') {
        console.log(`[Skills] Claude Code skills dir has ${byName.size} skills before plugin scan`)
        const pluginSkills = await readClaudePluginSkills(config)
        for (const ps of pluginSkills) {
          const key = normalizeSkillName(ps.name)
          if (byName.has(key)) continue
          byName.set(key, { ...ps, agent: agent.id })
        }
        console.log(`[Skills] Claude Code total after plugin scan: ${byName.size}`)
      }

      const skills = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
      return {
        id: agent.id,
        displayName: agent.displayName,
        installed: true,
        universal: agent.universal === true,
        supportsSymlinkProjection: supportsAgentSymlinkProjection(agent),
        effectiveInstallMode: agent.universal
          ? 'shared'
          : config.defaultInstallMode === 'copy' || !supportsAgentSymlinkProjection(agent)
            ? 'copy'
            : 'symlink',
        globalSkillsDir: agent.globalSkillsDir,
        count: skills.length,
        skills
      } as SkillsAgentView
    })
  )

  return { agents: agents.filter((agent): agent is SkillsAgentView => agent !== null), config }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  if (await isSamePath(src, dest)) return
  await rm(dest, { recursive: true, force: true })
  await mkdir(dest, { recursive: true })
  await cp(src, dest, { recursive: true, dereference: true })
}

async function isSamePath(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    realpath(a).catch(() => resolve(a)),
    realpath(b).catch(() => resolve(b))
  ])
  return left === right
}

async function createRelativeSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const targetReal = await stat(target)
      .then(() => resolve(target))
      .catch(() => resolve(target))
    const linkReal = resolve(linkPath)
    if (targetReal === linkReal) return true
    const existing = await lstat(linkPath).catch(() => null)
    if (existing) await rm(linkPath, { recursive: true, force: true })
    await mkdir(dirname(linkPath), { recursive: true })
    await symlink(
      relative(dirname(linkPath), target),
      linkPath,
      process.platform === 'win32' ? 'junction' : undefined
    )
    return true
  } catch {
    return false
  }
}

function getCanonicalSkillDir(skillName: string): string {
  return join(canonicalGlobalSkillsDir, normalizeSkillName(skillName))
}

function getAgentProjectionDir(agent: NonNullable<ReturnType<typeof getAgentById>>, skillName: string): string {
  const normalized = normalizeSkillName(skillName)
  return agent.universal ? getCanonicalSkillDir(normalized) : join(agent.globalSkillsDir, normalized)
}

async function ensureCanonicalSkillDir(
  skillName: string,
  sourceDir: string,
  overwrite?: boolean
): Promise<string> {
  const canonicalDir = getCanonicalSkillDir(skillName)
  if (overwrite || !(await pathExists(canonicalDir))) {
    await copyDirectory(sourceDir, canonicalDir)
  }
  return canonicalDir
}

async function projectCanonicalSkillToAgent(
  agent: NonNullable<ReturnType<typeof getAgentById>>,
  skillName: string,
  overwrite = true,
  preferredMode: SkillsManagerConfig['defaultInstallMode'] = 'symlink'
): Promise<boolean> {
  const canonicalDir = getCanonicalSkillDir(skillName)
  if (!(await pathExists(canonicalDir))) return false
  if (agent.universal) return true

  const targetDir = getAgentProjectionDir(agent, skillName)
  if (!overwrite && (await pathExists(targetDir))) return true

  const useCopy = preferredMode === 'copy' || !supportsAgentSymlinkProjection(agent)
  if (!useCopy) {
    const linked = await createRelativeSymlink(canonicalDir, targetDir)
    if (linked) return true
  }
  await copyDirectory(canonicalDir, targetDir)
  return true
}

async function findSkillSourceDir(sourceAgentId: string, skillName: string): Promise<string | null> {
  const sourceAgent = getAgentById(sourceAgentId)
  if (!sourceAgent) return null
  const normalized = normalizeSkillName(skillName)
  for (const dir of getAgentSkillDirs(sourceAgent)) {
    const entries = await readSkillDirs(dir)
    const match = entries.find(
      (skill) =>
        normalizeSkillName(skill.name) === normalized ||
        normalizeSkillName(basename(skill.dir)) === normalized
    )
    if (match) return match.dir
  }

  // For Claude Code, also search plugin cache directories
  if (sourceAgentId === 'claude-code') {
    const pluginsJsonPath = join(claudeHome, 'plugins', 'installed_plugins.json')
    try {
      const raw = await readFile(pluginsJsonPath, 'utf-8')
      const data = JSON.parse(raw) as {
        plugins?: Record<string, Array<{ installPath?: string }>>
      }
      if (data.plugins) {
        for (const installations of Object.values(data.plugins)) {
          const install = installations[0]
          if (!install?.installPath) continue
          const skillsDir = join(install.installPath, 'skills')
          const entries = await readSkillDirs(skillsDir).catch(() => [])
          const match = entries.find(
            (skill) =>
              normalizeSkillName(skill.name) === normalized ||
              normalizeSkillName(basename(skill.dir)) === normalized
          )
          if (match) return match.dir
        }
      }
    } catch {
      // ignore
    }
  }

  return null
}

async function listCanonicalSkillNames(): Promise<string[]> {
  const skills = await readSkillDirs(canonicalGlobalSkillsDir)
  return skills.map((skill) => skill.name)
}

/**
 * 为从 plugin cache 同步过来的 skill 构建 lock entry。
 * 从 known_marketplaces.json 和 installed_plugins.json 推断 source 信息。
 */
async function ensurePluginSkillLockEntry(skillName: string, sourceDir: string): Promise<void> {
  try {
    // 从 sourceDir 路径解析 marketplace 和 plugin 信息
    // 路径格式: ~/.claude/plugins/cache/{marketplace}/{pluginName}/{version}/skills/{skillName}
    const cacheIndex = sourceDir.indexOf('/plugins/cache/')
    if (cacheIndex === -1) return
    const afterCache = sourceDir.slice(cacheIndex + '/plugins/cache/'.length)
    const parts = afterCache.split('/')
    if (parts.length < 2) return
    const marketplace = parts[0]
    const pluginName = parts[1]

    // 读取 marketplace 配置获取 git url 和 ref
    const knownPath = join(claudeHome, 'plugins', 'known_marketplaces.json')
    const knownRaw = await readFile(knownPath, 'utf-8')
    const known = JSON.parse(knownRaw) as Record<string, { source?: { url?: string; ref?: string } }>
    const marketplaceInfo = known[marketplace]
    if (!marketplaceInfo?.source?.url) return

    const gitUrl = marketplaceInfo.source.url
    const ref = marketplaceInfo.source.ref || ''

    // 构建 skillPath（在 marketplace 仓库中的路径）
    // 先试 {pluginName}/skills/{skillName}/SKILL.md，再试 plugins/{pluginName}/skills/{skillName}/SKILL.md
    const skillPath = `${pluginName}/skills/${skillName}/SKILL.md`

    await addGlobalLockEntry(skillName, {
      source: gitUrl,
      sourceType: 'git',
      sourceUrl: gitUrl,
      ref: ref || undefined,
      skillPath,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  } catch {
    // 构建 lock entry 失败不影响同步操作
  }
}

async function refreshExistingSkillProjections(
  skillNames: string[],
  preferredMode: SkillsManagerConfig['defaultInstallMode']
): Promise<void> {
  const agents = getInstalledAgentDefinitions()
  for (const skillName of skillNames) {
    const normalized = normalizeSkillName(skillName)
    for (const agent of agents) {
      if (agent.universal) continue
      const targetDir = join(agent.globalSkillsDir, normalized)
      if (!(await pathExists(targetDir))) continue
      await projectCanonicalSkillToAgent(agent, skillName, true, preferredMode)
    }
  }
}

async function projectSkillsToAgents(
  skillNames: string[],
  agentIds: string[],
  preferredMode: SkillsManagerConfig['defaultInstallMode']
): Promise<void> {
  for (const skillName of skillNames) {
    for (const agentId of agentIds) {
      const agent = getAgentById(agentId)
      if (!agent) continue
      await projectCanonicalSkillToAgent(agent, skillName, true, preferredMode)
    }
  }
}

export async function syncSkills(
  input: { sourceAgent: string; skillNames: string[]; targetAgents: string[]; overwrite?: boolean },
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsOperationResult> {
  const config = normalizeSkillsManagerConfig(configValue)
  const results: NonNullable<SkillsOperationResult['results']> = []
  for (const skillName of input.skillNames) {
    const sourceDir = await findSkillSourceDir(input.sourceAgent, skillName)
    if (!sourceDir) {
      results.push({ skillName, success: false, error: 'Source skill not found' })
      continue
    }
    await ensureCanonicalSkillDir(skillName, sourceDir, input.overwrite)

    // If source is from plugin cache, ensure a lock entry exists for version tracking
    const existingLock = await readGlobalLock()
    if (!lockForSkill(existingLock, skillName) && sourceDir.includes('/plugins/cache/')) {
      await ensurePluginSkillLockEntry(skillName, sourceDir)
    }

    for (const targetAgentId of input.targetAgents) {
      const targetAgent = getAgentById(targetAgentId)
      if (!targetAgent) {
        results.push({ skillName, agent: targetAgentId, success: false, error: 'Unknown agent' })
        continue
      }
      try {
        await projectCanonicalSkillToAgent(
          targetAgent,
          skillName,
          true,
          config.defaultInstallMode
        )
        const cfgKey = getSkillConfigKey(targetAgentId, skillName)
        if (!config.skillConfigs[cfgKey]) {
          const now = Date.now()
          config.skillConfigs[cfgKey] = {
            agent: targetAgentId,
            skillName,
            autoUpdate: config.defaultAutoUpdate,
            lastCheckStatus: 'latest',
            lastCheckedAt: new Date().toISOString(),
            createdAt: now,
            updatedAt: now
          }
        }
        results.push({ skillName, agent: targetAgentId, success: true })
      } catch (error) {
        results.push({
          skillName,
          agent: targetAgentId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
  saveConfig(config)
  return { success: results.every((result) => result.success), results }
}

export async function deleteSkills(
  input: { agent: string; skillNames: string[]; allAgents?: boolean },
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsOperationResult> {
  const config = normalizeSkillsManagerConfig(configValue)
  const targetAgents = input.allAgents
    ? getInstalledAgentDefinitions().map((agent) => agent.id)
    : [input.agent]
  const results: NonNullable<SkillsOperationResult['results']> = []

  for (const skillName of input.skillNames) {
    const normalized = normalizeSkillName(skillName)
    for (const agentId of targetAgents) {
      const agent = getAgentById(agentId)
      if (!agent) continue
      for (const baseDir of getAgentSkillDirs(agent)) {
        const target = join(baseDir, normalized)
        if (!isPathSafe(baseDir, target)) continue
        await rm(target, { recursive: true, force: true }).catch(() => undefined)
      }
      delete config.skillConfigs[getSkillConfigKey(agentId, skillName)]
      results.push({ skillName, agent: agentId, success: true })
    }

    if (input.allAgents) {
      await rm(join(canonicalGlobalSkillsDir, normalized), { recursive: true, force: true }).catch(
        () => undefined
      )
      await removeGlobalLockEntry(skillName)
      for (const key of Object.keys(config.skillConfigs)) {
        if (key.endsWith(`:${normalized}`)) delete config.skillConfigs[key]
      }
    }
  }

  saveConfig(config)
  return { success: true, results }
}

/**
 * 删除非 plugin 的 skill：从所有 agent 目录中删除同名 skill（含 canonical 和软链）。
 * 不删除 plugin 中的 skill。
 */
export async function deleteSkillFromAllAgents(
  input: { skillName: string },
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsOperationResult> {
  const config = normalizeSkillsManagerConfig(configValue)
  const normalized = normalizeSkillName(input.skillName)
  const results: NonNullable<SkillsOperationResult['results']> = []

  // 删除所有已安装 agent 目录中的同名 skill
  const agents = getInstalledAgentDefinitions()
  for (const agent of agents) {
    for (const baseDir of getAgentSkillDirs(agent)) {
      const target = join(baseDir, normalized)
      if (!isPathSafe(baseDir, target)) continue
      if (await pathExists(target)) {
        await rm(target, { recursive: true, force: true }).catch(() => undefined)
        results.push({ skillName: input.skillName, agent: agent.id, success: true })
      }
    }
    // 清理该 agent 的 skill config
    delete config.skillConfigs[getSkillConfigKey(agent.id, input.skillName)]
  }

  // 删除 canonical 目录
  await rm(join(canonicalGlobalSkillsDir, normalized), { recursive: true, force: true }).catch(() => undefined)

  // 删除 lock 记录
  await removeGlobalLockEntry(input.skillName)

  // 清理所有相关 config
  for (const key of Object.keys(config.skillConfigs)) {
    if (key.endsWith(`:${normalized}`)) delete config.skillConfigs[key]
  }

  saveConfig(config)
  return { success: true, results }
}

export interface PluginDeleteInfo {
  pluginKey: string        // e.g. "sh_announcement_skill@shuhe-claude-plugins"
  pluginName: string       // e.g. "sh_announcement_skill"
  marketplace: string      // e.g. "shuhe-claude-plugins"
  version: string
  skillNames: string[]     // 该 plugin 下的所有 skill 名称
  installPath: string
}

/**
 * 获取某个 plugin skill 所属 plugin 的完整信息（用于确认弹窗）。
 */
export async function getPluginDeleteInfo(
  input: { skillName: string; pluginName: string; marketplace: string }
): Promise<PluginDeleteInfo | null> {
  const pluginsJsonPath = join(claudeHome, 'plugins', 'installed_plugins.json')
  try {
    const raw = await readFile(pluginsJsonPath, 'utf-8')
    const data = JSON.parse(raw) as {
      plugins?: Record<string, Array<{ installPath?: string; version?: string }>>
    }
    if (!data.plugins) return null

    const pluginKey = `${input.pluginName}@${input.marketplace}`
    console.log(`[Skills] getPluginDeleteInfo: looking for key="${pluginKey}"`)
    console.log(`[Skills] Available keys:`, Object.keys(data.plugins).join(', '))
    const installations = data.plugins[pluginKey]
    if (!installations || installations.length === 0) {
      console.log(`[Skills] Plugin key not found in installed_plugins.json`)
      return null
    }

    const install = installations[0]
    if (!install.installPath) return null

    // 扫描该 plugin 的 skills 目录获取所有 skill 名称
    const skillsDir = join(install.installPath, 'skills')
    const skills = await readSkillDirs(skillsDir).catch(() => [])

    return {
      pluginKey,
      pluginName: input.pluginName,
      marketplace: input.marketplace,
      version: install.version || '',
      skillNames: skills.map((s) => s.name),
      installPath: install.installPath
    }
  } catch {
    return null
  }
}

/**
 * 删除 plugin：从 installed_plugins.json 移除条目，删除 cache 目录，清理 config。
 */
export async function deletePlugin(
  input: { pluginKey: string; pluginName: string; marketplace: string; installPath: string; skillNames: string[] },
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsOperationResult> {
  const config = normalizeSkillsManagerConfig(configValue)

  // 1. 从 installed_plugins.json 移除该 plugin 条目
  const pluginsJsonPath = join(claudeHome, 'plugins', 'installed_plugins.json')
  try {
    const raw = await readFile(pluginsJsonPath, 'utf-8')
    const data = JSON.parse(raw) as { version?: number; plugins?: Record<string, unknown> }
    if (data.plugins && data.plugins[input.pluginKey]) {
      delete data.plugins[input.pluginKey]
      await writeFile(pluginsJsonPath, JSON.stringify(data, null, 2), 'utf-8')
    }
  } catch (err) {
    console.error('[Skills] Failed to update installed_plugins.json:', err)
    // 继续清理其他部分
  }

  // 2. 删除 cache 下该插件的目录
  // installPath 格式: ~/.claude/plugins/cache/{marketplace}/{pluginName}/{version}
  // 删除 pluginName 级目录（包含所有版本）
  const pluginCacheDir = dirname(input.installPath) // 去掉 version 层
  if (await pathExists(pluginCacheDir)) {
    await rm(pluginCacheDir, { recursive: true, force: true }).catch(() => undefined)
  }

  // 3. 删除 ~/.claude/skills/ 下该 plugin 的所有 skill 目录
  const claudeSkillsDir = join(claudeHome, 'skills')
  for (const skillName of input.skillNames) {
    const normalized = normalizeSkillName(skillName)
    const skillDir = join(claudeSkillsDir, normalized)
    if (await pathExists(skillDir)) {
      await rm(skillDir, { recursive: true, force: true }).catch(() => undefined)
    }
    // 也尝试原始名称（未 normalize 的）
    const rawSkillDir = join(claudeSkillsDir, skillName)
    if (rawSkillDir !== skillDir && (await pathExists(rawSkillDir))) {
      await rm(rawSkillDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  // 4. 清理 config 中该 plugin 下所有 skill 的配置
  for (const skillName of input.skillNames) {
    const normalized = normalizeSkillName(skillName)
    for (const key of Object.keys(config.skillConfigs)) {
      if (key.endsWith(`:${normalized}`)) delete config.skillConfigs[key]
    }
  }

  saveConfig(config)
  return { success: true }
}

export async function setSkillAutoUpdate(
  input: { agent: string; skillName: string; enabled: boolean },
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsOperationResult> {
  const config = normalizeSkillsManagerConfig(configValue)
  const now = Date.now()

  // Sync autoUpdate across ALL agents for the same skill name
  // Find all existing keys for this skillName
  const matchingKeys = Object.keys(config.skillConfigs).filter((k) => {
    const cfg = config.skillConfigs[k]
    return cfg.skillName === input.skillName
  })

  // Update all existing entries
  for (const key of matchingKeys) {
    config.skillConfigs[key].autoUpdate = input.enabled
    config.skillConfigs[key].updatedAt = now
  }

  // Ensure the current agent's key also exists
  const primaryKey = getSkillConfigKey(input.agent, input.skillName)
  if (!config.skillConfigs[primaryKey]) {
    config.skillConfigs[primaryKey] = {
      agent: input.agent,
      skillName: input.skillName,
      autoUpdate: input.enabled,
      createdAt: now,
      updatedAt: now
    }
  }

  saveConfig(config)
  return { success: true }
}

export async function saveSkillsConfigPatch(
  patch: Partial<SkillsManagerConfig>,
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsManagerConfig> {
  const current = normalizeSkillsManagerConfig(configValue)
  const next = normalizeSkillsManagerConfig({
    ...current,
    ...patch,
    skillConfigs: patch.skillConfigs || current.skillConfigs
  })
  saveConfig(next)
  return next
}

export async function checkSkillUpdate(input: {
  agent: string
  skillName: string
}, config?: SkillsManagerConfig): Promise<{ success: boolean; status: SkillUpdateStatus; reason?: string }> {
  const lock = await readGlobalLock()
  const entry = lockForSkill(lock, input.skillName)
  if (!entry) return { success: true, status: 'unsupported', reason: '缺少版本追踪记录' }
  if (entry.sourceType === 'local') {
    return { success: true, status: 'unsupported', reason: '本地路径来源无法自动检查' }
  }
  if (entry.sourceType === 'git') {
    if (!entry.sourceUrl && !entry.source) {
      return { success: true, status: 'unsupported', reason: '缺少 git 远端地址' }
    }
    if (!entry.skillFolderHash || !entry.skillPath) {
      return { success: true, status: 'unsupported', reason: '缺少 skillPath 或 hash' }
    }
    const url = entry.sourceUrl || entry.source || ''
    const ref = entry.ref || 'HEAD'
    const skillDir = entry.skillPath.replace(/\/?SKILL\.md$/, '')
    // 尝试用 GitLab API
    const gitlabToken = config?.gitlabToken
    if (gitlabToken) {
      try {
        const gitlabInfo = extractGitLabInfo(url)
        if (gitlabInfo) {
          const encodedPath = encodeURIComponent(gitlabInfo.projectPath)
          const encodedDir = encodeURIComponent(skillDir)
          const apiRef = ref === 'HEAD' ? '' : `&ref_name=${encodeURIComponent(ref)}`
          // 获取该目录最新 commit
          const resp = await fetch(
            `${gitlabInfo.host}/api/v4/projects/${encodedPath}/repository/commits?path=${encodedDir}${apiRef}&per_page=1`,
            { headers: { 'PRIVATE-TOKEN': gitlabToken } }
          )
          if (resp.ok) {
            const commits = await resp.json() as Array<{ committed_date: string }>
            if (commits.length > 0) {
              const remoteDate = new Date(commits[0].committed_date).getTime()
              const localDate = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0
              if (remoteDate <= localDate) {
                return { success: true, status: 'latest' }
              }
              return { success: true, status: 'available' }
            }
          }
        }
      } catch {
        // fallback below
      }
    }
    // 没有 GitLab Token 无法检查
    if (!config?.gitlabToken) {
      return { success: true, status: 'unsupported', reason: '需要配置 GitLab Token' }
    }
    return { success: false, status: 'failed', reason: '无法连接远端仓库' }
  }
  if (!entry.skillFolderHash || !entry.skillPath) {
    return { success: true, status: 'unsupported', reason: '缺少 skillPath 或 hash' }
  }
  const source = entry.source || ''
  if (!/^[^/\s]+\/[^/\s]+$/.test(source)) {
    return { success: true, status: 'unsupported', reason: '仅支持 GitHub owner/repo 来源' }
  }
  const tree = await getGitHubTree(source, entry.ref)
  if (!tree) return { success: false, status: 'failed', reason: '获取上游版本失败' }
  const skillDir = entry.skillPath.replace(/\/?SKILL\.md$/, '')
  const latest = tree.find((item) => item.type === 'tree' && item.path === skillDir)?.sha
  if (!latest) return { success: true, status: 'unsupported', reason: '上游 skill 不存在或已删除' }
  return { success: true, status: latest === entry.skillFolderHash ? 'latest' : 'available' }
}

export async function installSkills(
  input: SkillsInstallInput,
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsOperationResult> {
  if (!input.source?.trim()) return { success: false, error: 'Missing source' }
  const config = normalizeSkillsManagerConfig(configValue)
  const beforeNames = new Set((await listCanonicalSkillNames()).map((name) => normalizeSkillName(name)))
  const args = ['add', input.source.trim(), '-g', '-y']
  const agents = input.agents?.length ? input.agents : ['*']
  for (const agent of agents) args.push('-a', agent === '*' ? agent : toPackageAgentId(agent))
  if ((input.copy ?? (config.defaultInstallMode === 'copy')) === true) args.push('--copy')
  for (const skill of input.skills || []) args.push('-s', skill)
  const result = await runNpxSkills(args)
  if (result.success) {
    const afterNames = await listCanonicalSkillNames()
    const installedSkillNames = input.skills?.length
      ? input.skills
      : afterNames.filter((name) => !beforeNames.has(normalizeSkillName(name)))
    const targetAgentIds = agents.includes('*')
      ? getInstalledAgentDefinitions().map((agent) => agent.id)
      : input.agents
    if (installedSkillNames.length > 0) {
      await projectSkillsToAgents(installedSkillNames, targetAgentIds, config.defaultInstallMode)
      // 标记新安装的 skill 为 latest（刚装的肯定是最新的）
      const now = Date.now()
      for (const skillName of installedSkillNames) {
        for (const agentId of targetAgentIds) {
          const key = getSkillConfigKey(agentId, skillName)
          config.skillConfigs[key] = {
            ...config.skillConfigs[key],
            agent: agentId,
            skillName,
            autoUpdate: config.skillConfigs[key]?.autoUpdate ?? config.defaultAutoUpdate,
            lastCheckStatus: 'latest',
            lastCheckedAt: new Date().toISOString(),
            createdAt: config.skillConfigs[key]?.createdAt || now,
            updatedAt: now
          }
        }
      }
    }
    saveConfig(config)
  }
  return result
}

/**
 * 更新非 plugin 的 skill：使用 npx skills add 重新安装指定 skill 到 canonical 目录，然后刷新所有 agent 投射。
 * 只下载一次，symlink 不需额外操作，copy 重新复制。
 */
export async function updateSkillV2(
  input: { skillName: string },
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsOperationResult> {
  const config = normalizeSkillsManagerConfig(configValue)

  // 从 lock 获取 source 信息，用 add -s 精确更新单个 skill
  const lock = await readGlobalLock()
  const entry = lockForSkill(lock, input.skillName)
  const source = entry?.source || entry?.sourceUrl || ''

  let args: string[]
  if (source) {
    // 用 add + -s 精确安装单个 skill（不影响同仓库其他 skill）
    args = ['add', source, '-g', '-y', '-s', input.skillName]
  } else {
    // fallback：用 update（可能会更新同仓库其他 skill）
    args = ['update', '-g', '-y', input.skillName]
  }

  const result = await runNpxSkills(args)
  if (result.success) {
    // 刷新所有 agent 的投射（只有 copy 模式需要重新复制）
    await refreshExistingSkillProjections([input.skillName], config.defaultInstallMode)
    // 标记为 latest
    const now = Date.now()
    const agents = getInstalledAgentDefinitions()
    for (const agent of agents) {
      const key = getSkillConfigKey(agent.id, input.skillName)
      if (config.skillConfigs[key]) {
        config.skillConfigs[key].lastCheckStatus = 'latest'
        config.skillConfigs[key].lastCheckReason = undefined
        config.skillConfigs[key].lastCheckedAt = new Date().toISOString()
        config.skillConfigs[key].updatedAt = now
      }
    }
    saveConfig(config)
  }
  return result
}

/**
 * 更新 plugin：先 pull marketplace，再 claude plugin install 覆盖安装。
 */
export async function updatePlugin(
  input: { pluginName: string; marketplace: string },
  configValue: unknown,
  saveConfig: (config: SkillsManagerConfig) => void
): Promise<SkillsOperationResult> {
  // 读取 marketplace 配置获取本地目录
  const knownPath = join(claudeHome, 'plugins', 'known_marketplaces.json')
  let marketplaceDir: string
  try {
    const raw = await readFile(knownPath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, { installLocation?: string }>
    const entry = data[input.marketplace]
    if (!entry?.installLocation) {
      return { success: false, error: `未找到 marketplace: ${input.marketplace}` }
    }
    marketplaceDir = entry.installLocation
  } catch {
    return { success: false, error: '无法读取 marketplace 配置' }
  }

  // 1. git pull marketplace 目录
  const { spawn } = await import('child_process')
  const pullResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    const child = spawn('git', ['pull'], { cwd: marketplaceDir })
    let output = ''
    child.stdout?.on('data', (d) => { output += String(d) })
    child.stderr?.on('data', (d) => { output += String(d) })
    child.on('error', (e) => resolve({ success: false, error: e.message }))
    child.on('close', (code) => resolve({ success: code === 0, error: code !== 0 ? output : undefined }))
  })

  if (!pullResult.success) {
    return { success: false, error: `git pull 失败: ${pullResult.error}` }
  }

  // 2. claude plugin install <pluginName>@<marketplace>
  const installResult = await new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
    const pluginArg = `${input.pluginName}@${input.marketplace}`
    const child = spawn('claude', ['plugin', 'install', pluginArg], {
      cwd: marketplaceDir,
      env: { ...process.env }
    })
    let output = ''
    child.stdout?.on('data', (d) => { output += String(d) })
    child.stderr?.on('data', (d) => { output += String(d) })
    child.on('error', (e) => resolve({ success: false, error: e.message }))
    child.on('close', (code) => resolve({
      success: code === 0,
      message: output.trim(),
      error: code !== 0 ? output.trim() || `claude plugin install exited with ${code}` : undefined
    }))
  })

  if (installResult.success) {
    // 标记为 latest
    const config = normalizeSkillsManagerConfig(configValue)
    const now = Date.now()
    const key = getSkillConfigKey('claude-code', input.pluginName)
    if (config.skillConfigs[key]) {
      config.skillConfigs[key].lastCheckStatus = 'latest'
      config.skillConfigs[key].lastCheckReason = undefined
      config.skillConfigs[key].lastCheckedAt = new Date().toISOString()
      config.skillConfigs[key].updatedAt = now
    }
    saveConfig(config)
  }

  return installResult
}
