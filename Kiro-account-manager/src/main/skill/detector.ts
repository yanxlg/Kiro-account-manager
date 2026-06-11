import type { LockEntry, SkillsSkillView, SkillUpdateStatus } from './types'
import { lockForSkill } from './lock'
import { runConcurrentPool } from './concurrentPool'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { claudeHome } from './agents'

/**
 * Skill 来源类型枚举
 * - 'github': npx skills 安装，来源为 GitHub（有 skillFolderHash + source 为 owner/repo）
 * - 'gitlab': npx skills 安装，来源为 GitLab（有 sourceUrl 匹配 GitLab）
 * - 'plugin-github': Claude plugin 安装，来源为 GitHub（有 pluginName + 无 skillFolderHash + 有 source）
 * - 'plugin-gitlab': Claude plugin 安装，来源为 GitLab（有 pluginName + 无 skillFolderHash + 有 sourceUrl）
 * - 'local': 本地路径来源
 * - 'unsupported': 无法自动检测
 */
export type SkillSourceType =
  | 'github'
  | 'gitlab'
  | 'plugin-github'
  | 'plugin-gitlab'
  | 'local'
  | 'unsupported'

/**
 * 根据 LockEntry 判定 skill 来源类型。
 *
 * 分类规则（按优先级）：
 * 1. sourceType = 'local' → 'local'
 * 2. source/sourceUrl/sourceType 全为空 → 'unsupported'
 * 3. 有 skillFolderHash 且 source 匹配 owner/repo → 'github'
 * 4. 有 sourceUrl 匹配 GitLab 域名（SSH/HTTPS 格式能被 parseGitLabUrl 解析）:
 *    - 有 pluginName 且无 skillFolderHash → 'plugin-gitlab'
 *    - 其他 → 'gitlab'
 * 5. 有 pluginName 且无 skillFolderHash 且有 source → 'plugin-github'
 * 6. sourceType = 'git' 但不属于 github.com/gitlab → 'unsupported'
 * 7. 有 source 匹配 owner/repo（无 skillFolderHash）→ 'github'（降级）
 * 8. 其他 → 'unsupported'
 */
export function classifySkillSource(lockEntry: LockEntry | undefined): SkillSourceType {
  if (!lockEntry) return 'unsupported'

  const { source, sourceType, sourceUrl, skillFolderHash, pluginName } = lockEntry

  // Rule 1: local 来源
  if (sourceType === 'local') return 'local'

  // Rule 2: 全部字段缺失
  if (!source && !sourceUrl && !sourceType) return 'unsupported'

  // Helper: 判断 source 是否为 owner/repo 格式（纯 GitHub shorthand，不含 @:. 等 URL 字符）
  const isOwnerRepoFormat = (s: string | undefined): boolean => {
    if (!s) return false
    return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s)
  }

  // Rule 3: npx skills 安装的 GitHub skill
  if (skillFolderHash && isOwnerRepoFormat(source)) {
    return 'github'
  }

  // Rule 4: 有 sourceUrl 且能被 parseGitLabUrl 解析
  if (sourceUrl && parseGitLabUrl(sourceUrl)) {
    if (pluginName && !skillFolderHash) {
      return 'plugin-gitlab'
    }
    return 'gitlab'
  }

  // Rule 5: Claude plugin GitHub 方式
  if (pluginName && !skillFolderHash && isOwnerRepoFormat(source)) {
    return 'plugin-github'
  }

  // Rule 6: sourceType = 'git' 但无法匹配 github/gitlab
  if (sourceType === 'git') {
    return 'unsupported'
  }

  // Rule 7: 有 source 为 owner/repo 格式（没有 skillFolderHash 的降级路径）
  if (isOwnerRepoFormat(source)) {
    return 'github'
  }

  // Rule 8: 其他情况
  return 'unsupported'
}

/**
 * 解析 GitLab URL，支持 SSH 和 HTTPS 两种格式。
 *
 * SSH 格式: git@host:group/repo.git → { host: 'https://host', projectPath: 'group/repo' }
 * HTTPS 格式: https://host/group/repo.git → { host: 'https://host', projectPath: 'group/repo' }
 *
 * @returns 解析结果，无法匹配时返回 null
 */
export function parseGitLabUrl(url: string): { host: string; projectPath: string } | null {
  if (!url) return null

  // SSH 格式: git@gitlab.example.com:group/repo.git
  const sshMatch = url.match(/^git@([^:]+):([^/][^:]+?)(?:\.git)?$/)
  if (sshMatch) {
    return { host: sshMatch[1], projectPath: sshMatch[2] }
  }

  // HTTPS/HTTP 格式: https://gitlab.example.com/group/repo.git
  const httpsMatch = url.match(/^(https?:\/\/[^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) {
    return { host: httpsMatch[1], projectPath: httpsMatch[2] }
  }

  return null
}

/**
 * 仅返回 autoUpdate === true 的 skill 列表。
 * 用于版本检测调度器在触发检测前过滤 skill。
 */
export function filterSkillsForCheck(skills: SkillsSkillView[]): SkillsSkillView[] {
  return skills.filter((skill) => skill.autoUpdate === true)
}


// --- Version Detection Interfaces ---

export interface DetectOptions {
  gitlabToken?: string
  githubToken?: string
  timeoutMs?: number // default 15000
}

export interface CheckResult {
  agent: string
  skillName: string
  status: SkillUpdateStatus
  reason?: string
  remoteVersion?: string // 远端检测到的版本号（用于 UI 展示和版本缓存）
  checkedAt: string // ISO 8601
}

// --- GitHub API ---

// --- GitHub Tree Cache ---
// 同一个 owner/repo#ref 只请求一次，复用 tree 结果
type TreeEntry = { path: string; type: string; sha: string }
type TreeResult = { tree: TreeEntry[] } | { error: string }
const gitHubTreeCache = new Map<string, TreeResult | Promise<TreeResult>>()

/** 清除 tree 缓存（用于测试或手动刷新） */
export function clearGitHubTreeCache(): void {
  gitHubTreeCache.clear()
}

async function fetchGitHubTree(
  ownerRepo: string,
  ref: string,
  timeoutMs: number,
  githubToken?: string
): Promise<TreeResult> {
  const cacheKey = `${ownerRepo}#${ref}`

  // 已有缓存或正在请求中
  const cached = gitHubTreeCache.get(cacheKey)
  if (cached) {
    return cached instanceof Promise ? cached : cached
  }

  // 发起请求并缓存 Promise（防止并发重复请求）
  const promise = (async (): Promise<TreeResult> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const url = `https://api.github.com/repos/${ownerRepo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
      if (githubToken) {
        headers.Authorization = `token ${githubToken}`
      }
      const resp = await fetch(url, {
        signal: controller.signal,
        headers
      })
      console.log(`[Detector] GitHub API ${ownerRepo}#${ref}: HTTP ${resp.status}`)

      if (resp.status === 403 || resp.status === 429) {
        const result: TreeResult = { error: 'GitHub API 速率限制' }
        // 不缓存 rate limit 错误，下次请求时重试（可能 token 已更新）
        gitHubTreeCache.delete(cacheKey)
        return result
      }
      if (resp.status === 404) {
        const result: TreeResult = { error: '仓库不存在或已删除' }
        gitHubTreeCache.delete(cacheKey)
        return result
      }
      if (!resp.ok) {
        const result: TreeResult = { error: `GitHub API 错误 (HTTP ${resp.status})` }
        gitHubTreeCache.delete(cacheKey)
        return result
      }

      const data = (await resp.json()) as { tree?: TreeEntry[] }
      if (!data.tree) {
        gitHubTreeCache.delete(cacheKey)
        return { error: 'GitHub API 返回数据格式异常' }
      }

      const result: TreeResult = { tree: data.tree }
      gitHubTreeCache.set(cacheKey, result)
      return result
    } catch (err: unknown) {
      gitHubTreeCache.delete(cacheKey)
      if (err instanceof Error && err.name === 'AbortError') {
        return { error: '请求超时' }
      }
      console.error(`[Detector] GitHub API error for ${ownerRepo}:`, err)
      return { error: `网络错误: ${err instanceof Error ? err.message : String(err)}` }
    } finally {
      clearTimeout(timer)
    }
  })()

  gitHubTreeCache.set(cacheKey, promise)
  return promise
}

/**
 * 获取指定 GitHub 仓库中某目录的 tree SHA。
 *
 * 使用 tree 缓存：同一个 owner/repo#ref 只请求一次 API。
 *
 * @param ownerRepo - GitHub 仓库路径，格式为 "owner/repo"
 * @param ref - 分支或 tag 名称
 * @param skillPath - skill 目录在仓库中的相对路径（不含 SKILL.md）
 * @param timeoutMs - 请求超时时间（毫秒）
 */
export async function getGitHubTreeSha(
  ownerRepo: string,
  ref: string,
  skillPath: string,
  timeoutMs: number,
  githubToken?: string
): Promise<{ sha: string } | { error: string }> {
  const result = await fetchGitHubTree(ownerRepo, ref, timeoutMs, githubToken)

  if ('error' in result) {
    return { error: result.error }
  }

  // Normalize skillPath: remove leading/trailing slashes
  const normalizedPath = skillPath.replace(/^\/+|\/+$/g, '')

  // Find the tree entry matching skillPath (directory type)
  const entry = result.tree.find(
    (item) => item.path === normalizedPath && item.type === 'tree'
  )

  if (!entry) {
    return { error: '上游 skill 不存在或已删除' }
  }

  return { sha: entry.sha }
}

// --- GitLab API ---

/**
 * 获取 GitLab 仓库中指定路径的最新 commit 日期。
 *
 * 使用 GitLab Commits API 查询指定路径和分支的最新一次 commit。
 *
 * @param host - GitLab 主机地址，如 "https://gitlab.example.com"
 * @param projectPath - 项目路径，如 "group/repo"
 * @param ref - 分支名称
 * @param skillPath - skill 目录在仓库中的路径
 * @param token - GitLab Private Token
 * @param timeoutMs - 请求超时时间（毫秒）
 */
export async function getGitLabLatestCommitDate(
  host: string,
  projectPath: string,
  ref: string,
  skillPath: string,
  token: string,
  timeoutMs: number
): Promise<{ committedDate: string } | { error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const encodedProject = encodeURIComponent(projectPath)
    const skillDir = skillPath.replace(/^\/+|\/+$/g, '')
    const refParam = ref ? `&ref_name=${encodeURIComponent(ref)}` : ''
    const url = `${host}/api/v4/projects/${encodedProject}/repository/commits?path=${encodeURIComponent(skillDir)}${refParam}&per_page=1`

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'PRIVATE-TOKEN': token
      }
    })

    console.log(`[Detector] GitLab API ${projectPath}: HTTP ${resp.status}`)

    if (resp.status === 401 || resp.status === 403) {
      return { error: 'GitLab Token 无效或无权限' }
    }

    if (resp.status === 404) {
      return { error: '上游 skill 不存在或已删除' }
    }

    if (!resp.ok) {
      return { error: `GitLab API 错误 (HTTP ${resp.status})` }
    }

    const commits = (await resp.json()) as Array<{ committed_date?: string }>

    if (!commits || commits.length === 0) {
      return { error: '上游 skill 不存在或已删除' }
    }

    const committedDate = commits[0].committed_date
    if (!committedDate) {
      return { error: 'GitLab API 返回数据格式异常' }
    }

    return { committedDate }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: '请求超时' }
    }
    return { error: `网络错误: ${err instanceof Error ? err.message : String(err)}` }
  } finally {
    clearTimeout(timer)
  }
}

// --- Single Skill Version Detection ---

/**
 * 检测单个 skill 的远端版本状态。
 *
 * 根据来源类型调用相应 API 获取远端版本标识，
 * 与本地 Lock_File 记录进行比较，返回检测结果。
 */
export async function detectSkillVersion(
  skillView: SkillsSkillView,
  lockEntry: LockEntry | undefined,
  options: DetectOptions
): Promise<CheckResult> {
  const timeoutMs = options.timeoutMs ?? 15000
  const checkedAt = new Date().toISOString()
  const base: Pick<CheckResult, 'agent' | 'skillName' | 'checkedAt'> = {
    agent: skillView.agent,
    skillName: skillView.name,
    checkedAt
  }

  const sourceType = classifySkillSource(lockEntry)

  // Plugin-installed skills: check version via marketplace API
  if (skillView.installType === 'plugin') {
    return detectPlugin(skillView, base, options, timeoutMs)
  }

  // Handle unsupported source types
  if (sourceType === 'local') {
    return { ...base, status: 'unsupported', reason: '本地路径来源无法自动检查' }
  }

  if (sourceType === 'unsupported') {
    return { ...base, status: 'unsupported', reason: '缺少版本追踪记录' }
  }

  // GitHub-based detection (github / plugin-github)
  if (sourceType === 'github' || sourceType === 'plugin-github') {
    return detectGitHub(skillView, lockEntry!, base, timeoutMs, options.githubToken)
  }

  // GitLab-based detection (gitlab / plugin-gitlab)
  if (sourceType === 'gitlab' || sourceType === 'plugin-gitlab') {
    return detectGitLab(skillView, lockEntry!, base, options, timeoutMs)
  }

  return { ...base, status: 'unsupported', reason: '仅支持 GitHub 和 GitLab 来源的自动检测' }
}

async function detectGitHub(
  skillView: SkillsSkillView,
  lockEntry: LockEntry,
  base: Pick<CheckResult, 'agent' | 'skillName' | 'checkedAt'>,
  timeoutMs: number,
  githubToken?: string
): Promise<CheckResult> {
  const ownerRepo = lockEntry.source
  const skillPath = lockEntry.skillPath

  if (!ownerRepo || !skillPath) {
    return { ...base, status: 'unsupported', reason: 'Plugin 安装缺少来源追踪信息' }
  }

  const ref = lockEntry.ref || ''
  const skillDir = skillPath.replace(/\/?SKILL\.md$/i, '').replace(/^\/+|\/+$/g, '')
  const localHash = lockEntry.skillFolderHash || ''
  const localVersion = skillView.version || await readLocalVersion(skillView.path)

  const refsToTry = ref ? [ref] : ['main', 'master']
  let lastError = ''

  for (const tryRef of refsToTry) {
    // 1. 尝试通过版本号比较（plugin.json / package.json）
    const versionResult = await fetchRemoteVersionGitHub(ownerRepo, tryRef, skillDir, timeoutMs, githubToken)
    if (versionResult && localVersion) {
      const cmp = comparePluginVersion(versionResult, localVersion, base)
      return { ...cmp, remoteVersion: versionResult }
    }
    // 即使没有本地版本，也记录远端版本
    if (versionResult && !localVersion) {
      // 无本地版本无法比较 → fallback 到 hash，但携带 remoteVersion
      const result = await getGitHubTreeSha(ownerRepo, tryRef, skillDir, timeoutMs, githubToken)
      if ('sha' in result) {
        if (!localHash) return { ...base, status: 'latest', remoteVersion: versionResult }
        return { ...base, status: result.sha !== localHash ? 'available' : 'latest', remoteVersion: versionResult }
      }
      lastError = result.error
      if (result.error !== '仓库不存在或已删除') break
      continue
    }

    // 2. fallback: tree SHA 比较
    const result = await getGitHubTreeSha(ownerRepo, tryRef, skillDir, timeoutMs, githubToken)
    if ('sha' in result) {
      if (!localHash) return { ...base, status: 'latest' }
      return { ...base, status: result.sha !== localHash ? 'available' : 'latest' }
    }
    lastError = result.error
    if (result.error !== '仓库不存在或已删除') break
  }

  if (lastError === '上游 skill 不存在或已删除') {
    return { ...base, status: 'unsupported', reason: lastError }
  }
  return { ...base, status: 'failed', reason: lastError || '检查失败' }
}

/**
 * 从 GitHub 远端尝试获取 skill 的版本号。
 * 利用已缓存的 recursive tree 搜索 package.json / plugin.json，
 * 找到后用 Contents API 读取内容获取 version 字段。
 * 优先从 skill 目录最近的版本文件开始查找。
 */
async function fetchRemoteVersionGitHub(
  ownerRepo: string,
  ref: string,
  skillDir: string,
  timeoutMs: number,
  githubToken?: string
): Promise<string | null> {
  // 利用 tree cache 找到所有 package.json 和 plugin.json
  const treeResult = await fetchGitHubTree(ownerRepo, ref, timeoutMs, githubToken)
  if ('error' in treeResult) {
    console.log(`[Detector] fetchRemoteVersionGitHub: tree fetch failed for ${ownerRepo}#${ref}: ${treeResult.error}`)
    return null
  }

  // 从 tree 中筛选版本文件候选
  const versionFiles = treeResult.tree.filter(
    (entry) =>
      entry.type === 'blob' &&
      (entry.path.endsWith('/package.json') ||
        entry.path === 'package.json' ||
        entry.path.endsWith('/plugin.json') ||
        entry.path.endsWith('/marketplace.json') ||
        entry.path === 'marketplace.json')
  )

  // 按与 skillDir 的亲近度排序：skill 目录自身 > 逐级父目录 > 根级
  const normalizedSkillDir = skillDir.replace(/^\/+|\/+$/g, '')
  const skillParts = normalizedSkillDir.split('/')
  const scored = versionFiles
    .map((entry) => {
      const dir = entry.path.includes('/') ? entry.path.replace(/\/[^/]+$/, '') : '' // 文件所在目录（根级文件为空字符串）
      let score = 999

      if (dir === normalizedSkillDir) {
        score = 0 // skill 目录本身
      } else if (normalizedSkillDir.startsWith(dir + '/') && dir !== '') {
        // 是 skillDir 的祖先目录，层级越近分越低
        score = skillParts.length - dir.split('/').length
      } else if (dir === '' || !dir.includes('/')) {
        // 根级文件或根级子目录（如 .claude-plugin/marketplace.json）
        score = skillParts.length + 1
      }
      return { entry, score }
    })
    .filter((item) => item.score < 999)
    .sort((a, b) => a.score - b.score)

  // 依次尝试读取候选文件的 version 字段
  for (const { entry } of scored) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : ''
      const url = `https://api.github.com/repos/${ownerRepo}/contents/${entry.path}${refParam}`
      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3.raw' }
      if (githubToken) headers.Authorization = `token ${githubToken}`

      const resp = await fetch(url, { signal: controller.signal, headers })
      if (!resp.ok) continue

      const data = JSON.parse(await resp.text()) as { version?: string; metadata?: { version?: string } }
      if (data.version) return data.version
      if (data.metadata?.version) return data.metadata.version
    } catch {
      // ignore and try next
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

async function detectGitLab(
  skillView: SkillsSkillView,
  lockEntry: LockEntry,
  base: Pick<CheckResult, 'agent' | 'skillName' | 'checkedAt'>,
  options: DetectOptions,
  timeoutMs: number
): Promise<CheckResult> {
  const token = options.gitlabToken
  if (!token) {
    return { ...base, status: 'unsupported', reason: '需要配置 GitLab Token' }
  }

  const sourceUrl = lockEntry.sourceUrl
  if (!sourceUrl) {
    return { ...base, status: 'unsupported', reason: 'Plugin 安装缺少来源追踪信息' }
  }

  const parsed = parseGitLabUrl(sourceUrl)
  if (!parsed) {
    return { ...base, status: 'unsupported', reason: '无法解析 GitLab 地址' }
  }

  const skillPath = lockEntry.skillPath
  if (!skillPath) {
    return { ...base, status: 'unsupported', reason: 'Plugin 安装缺少来源追踪信息' }
  }

  const ref = lockEntry.ref || ''
  const skillDir = skillPath.replace(/\/?SKILL\.md$/i, '').replace(/^\/+|\/+$/g, '')
  const localHash = lockEntry.skillFolderHash || ''
  const localVersion = skillView.version || await readLocalVersion(skillView.path)

  const hostsToTry = parsed.host.startsWith('http')
    ? [parsed.host]
    : [`http://${parsed.host}`, `https://${parsed.host}`]

  let lastError = ''
  for (const host of hostsToTry) {
    // 1. 尝试通过版本号比较（plugin.json / package.json）
    const versionResult = await fetchRemoteVersionGitLab(host, parsed.projectPath, ref, skillDir, token, timeoutMs)
    if (versionResult && localVersion) {
      const cmp = comparePluginVersion(versionResult, localVersion, base)
      return { ...cmp, remoteVersion: versionResult }
    }
    if (versionResult && !localVersion) {
      // 有远端版本但无本地版本 → fallback hash/date 但携带 remoteVersion
      if (localHash) {
        const treeResult = await getGitLabTreeId(host, parsed.projectPath, ref, skillDir, token, timeoutMs)
        if ('id' in treeResult) {
          return { ...base, status: treeResult.id !== localHash ? 'available' : 'latest', remoteVersion: versionResult }
        }
      }
      const result = await getGitLabLatestCommitDate(host, parsed.projectPath, ref, skillDir, token, timeoutMs)
      if ('committedDate' in result) {
        const localDate = lockEntry.updatedAt
        if (!localDate) return { ...base, status: 'latest', remoteVersion: versionResult }
        const remoteTime = new Date(result.committedDate).getTime()
        const localTime = new Date(localDate).getTime()
        return { ...base, status: remoteTime > localTime ? 'available' : 'latest', remoteVersion: versionResult }
      }
      lastError = result.error
      if (result.error.includes('网络错误') || result.error.includes('请求超时')) continue
      break
    }

    // 2. 尝试 tree hash 比较（当有 skillFolderHash 时）
    if (localHash) {
      const treeResult = await getGitLabTreeId(host, parsed.projectPath, ref, skillDir, token, timeoutMs)
      if ('id' in treeResult) {
        return { ...base, status: treeResult.id !== localHash ? 'available' : 'latest' }
      }
      if (!treeResult.error.includes('网络') && !treeResult.error.includes('超时')) {
        if (treeResult.error.includes('Token') || treeResult.error.includes('不存在')) {
          lastError = treeResult.error
          break
        }
      }
    }

    // 3. fallback: commit date 比较
    const result = await getGitLabLatestCommitDate(
      host,
      parsed.projectPath,
      ref,
      skillDir,
      token,
      timeoutMs
    )

    if ('committedDate' in result) {
      const localDate = lockEntry.updatedAt
      if (!localDate) return { ...base, status: 'latest' }
      const remoteTime = new Date(result.committedDate).getTime()
      const localTime = new Date(localDate).getTime()
      return { ...base, status: remoteTime > localTime ? 'available' : 'latest' }
    }

    lastError = result.error
    if (result.error.includes('网络错误') || result.error.includes('请求超时')) continue
    break
  }

  if (lastError === '上游 skill 不存在或已删除') {
    return { ...base, status: 'unsupported', reason: lastError }
  }
  return { ...base, status: 'failed', reason: lastError || '检查失败' }
}

/**
 * 从 GitLab 远端尝试获取 skill 的版本号。
 * 查找逻辑与 GitHub 一致（plugin.json / package.json，向上查找）。
 */
async function fetchRemoteVersionGitLab(
  host: string,
  projectPath: string,
  ref: string,
  skillDir: string,
  token: string,
  timeoutMs: number
): Promise<string | null> {
  const paths = buildVersionFilePaths(skillDir)
  const encodedProject = encodeURIComponent(projectPath)
  const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : ''

  console.log(`[Detector] fetchRemoteVersionGitLab: ${host}/${projectPath}, skillDir=${skillDir}, candidates=${paths.length}`)

  for (const filePath of paths) {
    const encodedFile = encodeURIComponent(filePath)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const url = `${host}/api/v4/projects/${encodedProject}/repository/files/${encodedFile}/raw${refParam}`
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'PRIVATE-TOKEN': token }
      })
      if (resp.status === 404) continue
      if (!resp.ok) {
        console.log(`[Detector] fetchRemoteVersionGitLab: ${filePath} → HTTP ${resp.status}`)
        continue
      }

      const text = await resp.text()
      try {
        const data = JSON.parse(text) as { version?: string; metadata?: { version?: string } }
        if (data.version) {
          console.log(`[Detector] fetchRemoteVersionGitLab: found version ${data.version} in ${filePath}`)
          return data.version
        }
        if (data.metadata?.version) {
          console.log(`[Detector] fetchRemoteVersionGitLab: found metadata.version ${data.metadata.version} in ${filePath}`)
          return data.metadata.version
        }
        console.log(`[Detector] fetchRemoteVersionGitLab: ${filePath} has no version field`)
      } catch {
        console.log(`[Detector] fetchRemoteVersionGitLab: ${filePath} not valid JSON`)
      }
    } catch (err) {
      console.log(`[Detector] fetchRemoteVersionGitLab: ${filePath} error: ${err instanceof Error ? err.message : err}`)
    } finally {
      clearTimeout(timer)
    }
  }
  console.log(`[Detector] fetchRemoteVersionGitLab: no version found for ${skillDir}`)
  return null
}

// --- GitLab Tree API (for hash-based comparison) ---

/**
 * 获取 GitLab 仓库中指定路径的 tree ID（SHA），用于与本地 skillFolderHash 比较。
 *
 * 使用 GitLab Repository Tree API 查询指定路径和分支下的目录 tree。
 */
async function getGitLabTreeId(
  host: string,
  projectPath: string,
  ref: string,
  skillDir: string,
  token: string,
  timeoutMs: number
): Promise<{ id: string } | { error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const encodedProject = encodeURIComponent(projectPath)
    const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : ''
    // 获取 skill 目录下的 tree 条目，按路径过滤
    const url = `${host}/api/v4/projects/${encodedProject}/repository/tree?path=${encodeURIComponent(skillDir)}${refParam}&per_page=100&recursive=true`

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'PRIVATE-TOKEN': token }
    })

    if (resp.status === 401 || resp.status === 403) {
      return { error: 'GitLab Token 无效或无权限' }
    }
    if (resp.status === 404) {
      return { error: '上游 skill 不存在或已删除' }
    }
    if (!resp.ok) {
      return { error: `GitLab Tree API 错误 (HTTP ${resp.status})` }
    }

    const entries = (await resp.json()) as Array<{ id: string; name: string; type: string; path: string }>
    if (!entries || entries.length === 0) {
      return { error: '上游 skill 目录为空或不存在' }
    }

    // 计算一个复合 hash：将所有条目的 id (blob SHA) 拼接后 hash
    // 这样任何文件变化都能被检测到
    const concatenated = entries
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((e) => `${e.path}:${e.id}`)
      .join('\n')

    // 使用 Web Crypto 风格的简单 hash（使用字符串 reduce 类似 skillFolderHash 的生成方式）
    // skillFolderHash 是 npx skills 生成的，用的是类似 git tree hash 的算法
    // 我们这里用 entries 的 blob id 排序拼接做 sha256
    const { createHash } = await import('crypto')
    const computedHash = createHash('sha256').update(concatenated).digest('hex')

    return { id: computedHash }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: '请求超时' }
    }
    return { error: `网络错误: ${err instanceof Error ? err.message : String(err)}` }
  } finally {
    clearTimeout(timer)
  }
}

// --- Plugin Version Detection ---

/**
 * 从本地 skill 路径尝试读取版本号。
 * 依次尝试 skill 目录及向上所有层级的 package.json 和 .claude-plugin/plugin.json。
 */
async function readLocalVersion(skillPath: string): Promise<string> {
  if (!skillPath) return ''
  const { dirname } = await import('path')
  const dir = skillPath.endsWith('SKILL.md') ? dirname(skillPath) : skillPath
  const parts = dir.split('/').filter(Boolean)

  // 候选本地路径：从 skill 目录向上查找 package.json 和 plugin.json
  const candidates: string[] = []
  // package.json 向上查找
  candidates.push(join(dir, 'package.json'))
  for (let i = parts.length - 1; i >= 1; i--) {
    candidates.push('/' + parts.slice(0, i).join('/') + '/package.json')
  }
  // .claude-plugin/plugin.json 向上查找
  candidates.push(join(dir, '.claude-plugin', 'plugin.json'))
  for (let i = parts.length - 1; i >= 1; i--) {
    candidates.push('/' + parts.slice(0, i).join('/') + '/.claude-plugin/plugin.json')
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
  return ''
}

/**
 * 构建版本文件的候选路径列表（从 skill 目录向上查找）。
 * 用于 GitHub/GitLab 远端获取版本号。
 *
 * 查找顺序：
 * 1. {skillDir}/package.json
 * 2. {skillDir}/../package.json（plugin 根目录）
 * 3. {skillDir}/../../package.json（更上层）
 * 4. {skillDir}/../.claude-plugin/plugin.json
 * 5. {skillDir}/../../.claude-plugin/plugin.json
 *
 * 示例：skillDir = "plugins/sh-bfe-plugin/skills/o-d2c"
 * → 尝试:
 *   plugins/sh-bfe-plugin/skills/o-d2c/package.json
 *   plugins/sh-bfe-plugin/skills/package.json
 *   plugins/sh-bfe-plugin/package.json
 *   plugins/sh-bfe-plugin/skills/.claude-plugin/plugin.json
 *   plugins/sh-bfe-plugin/.claude-plugin/plugin.json
 */
function buildVersionFilePaths(skillDir: string): string[] {
  const parts = skillDir.split('/').filter(Boolean)
  const paths: string[] = []

  // package.json: 从 skill 目录本身 → 向上直到仓库根目录
  paths.push(`${skillDir}/package.json`)
  for (let i = parts.length - 1; i >= 1; i--) {
    paths.push(`${parts.slice(0, i).join('/')}/package.json`)
  }
  paths.push('package.json') // 仓库根目录

  // .claude-plugin/plugin.json: 向上查找
  if (parts.length >= 1) {
    paths.push(`${skillDir}/.claude-plugin/plugin.json`)
  }
  if (parts.length >= 2) {
    paths.push(`${parts.slice(0, -1).join('/')}/.claude-plugin/plugin.json`)
  }
  if (parts.length >= 3) {
    paths.push(`${parts.slice(0, -2).join('/')}/.claude-plugin/plugin.json`)
  }
  paths.push('.claude-plugin/plugin.json') // 仓库根目录

  // marketplace.json: 向上查找（metadata.version）
  paths.push(`${skillDir}/marketplace.json`)
  for (let i = parts.length - 1; i >= 1; i--) {
    paths.push(`${parts.slice(0, i).join('/')}/marketplace.json`)
  }
  paths.push('marketplace.json')

  return paths
}

interface MarketplaceConfig {
  source: { source: string; repo?: string; url?: string; ref?: string }
  installLocation: string
}

/** 读取 known_marketplaces.json 获取 marketplace 配置 */
async function readKnownMarketplaces(): Promise<Record<string, MarketplaceConfig>> {
  try {
    const raw = await readFile(join(claudeHome, 'plugins', 'known_marketplaces.json'), 'utf-8')
    return JSON.parse(raw) as Record<string, MarketplaceConfig>
  } catch {
    return {}
  }
}

/**
 * 检测 plugin 安装的 skill 版本。
 * 通过 GitLab/GitHub API 读取远端 plugin.json 的 version 字段，
 * 和本地已安装版本做 semver 比较。
 */
async function detectPlugin(
  skillView: SkillsSkillView,
  base: Pick<CheckResult, 'agent' | 'skillName' | 'checkedAt'>,
  options: DetectOptions,
  timeoutMs: number
): Promise<CheckResult> {
  const localVersion = skillView.version
  if (!localVersion) {
    return { ...base, status: 'unsupported', reason: '缺少本地版本信息' }
  }

  // pluginName 格式: "sh_announcement_skill"，source 是 marketplace 名称
  const marketplaceName = skillView.source
  const pluginName = skillView.pluginName
  if (!marketplaceName || !pluginName) {
    return { ...base, status: 'unsupported', reason: '缺少 marketplace 信息' }
  }

  // 读取 marketplace 配置
  const marketplaces = await readKnownMarketplaces()
  const marketplace = marketplaces[marketplaceName]
  if (!marketplace) {
    return { ...base, status: 'unsupported', reason: `未找到 marketplace: ${marketplaceName}` }
  }

  // 构建远端 plugin.json 的路径（有些 marketplace 把 plugin 放在 plugins/ 子目录下）
  const filePaths = [
    `${pluginName}/.claude-plugin/plugin.json`,
    `plugins/${pluginName}/.claude-plugin/plugin.json`
  ]
  const ref = marketplace.source.ref || ''

  // 根据 marketplace 来源类型选择 API
  if (marketplace.source.source === 'github' && marketplace.source.repo) {
    return detectPluginViaGitHub(marketplace.source.repo, filePaths, ref, localVersion, base, options, timeoutMs)
  }

  if (marketplace.source.source === 'git' && marketplace.source.url) {
    return detectPluginViaGitLab(marketplace.source.url, filePaths, ref, localVersion, base, options, timeoutMs)
  }

  return { ...base, status: 'unsupported', reason: '不支持的 marketplace 来源类型' }
}

async function detectPluginViaGitHub(
  repo: string,
  filePaths: string[],
  ref: string,
  localVersion: string,
  base: Pick<CheckResult, 'agent' | 'skillName' | 'checkedAt'>,
  options: DetectOptions,
  timeoutMs: number
): Promise<CheckResult> {
  for (const filePath of filePaths) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : ''
      const url = `https://api.github.com/repos/${repo}/contents/${filePath}${refParam}`
      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3.raw' }
      if (options.githubToken) headers.Authorization = `token ${options.githubToken}`

      const resp = await fetch(url, { signal: controller.signal, headers })
      if (resp.status === 404) continue // 试下一个路径
      if (!resp.ok) {
        return { ...base, status: 'failed', reason: `GitHub API (HTTP ${resp.status})` }
      }
      const data = JSON.parse(await resp.text()) as { version?: string }
      return comparePluginVersion(data.version, localVersion, base)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return { ...base, status: 'failed', reason: '请求超时' }
      return { ...base, status: 'failed', reason: `网络错误: ${err instanceof Error ? err.message : String(err)}` }
    } finally {
      clearTimeout(timer)
    }
  }
  return { ...base, status: 'unsupported', reason: '远端 plugin 不存在或已删除' }
}

async function detectPluginViaGitLab(
  gitUrl: string,
  filePaths: string[],
  ref: string,
  localVersion: string,
  base: Pick<CheckResult, 'agent' | 'skillName' | 'checkedAt'>,
  options: DetectOptions,
  timeoutMs: number
): Promise<CheckResult> {
  const parsed = parseGitLabUrl(gitUrl)
  if (!parsed) return { ...base, status: 'unsupported', reason: '无法解析 marketplace 地址' }

  const token = options.gitlabToken
  if (!token) return { ...base, status: 'unsupported', reason: '需要配置 GitLab Token' }

  // 先试 http，再试 https
  const hostsToTry = parsed.host.startsWith('http')
    ? [parsed.host]
    : [`http://${parsed.host}`, `https://${parsed.host}`]

  const encodedProject = encodeURIComponent(parsed.projectPath)
  const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : ''

  let lastError = ''
  for (const host of hostsToTry) {
    for (const filePath of filePaths) {
      const encodedFile = encodeURIComponent(filePath)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const url = `${host}/api/v4/projects/${encodedProject}/repository/files/${encodedFile}/raw${refParam}`
        console.log(`[Detector] Plugin check: ${url}`)
        console.log(`[Detector] Plugin token present: ${!!token}, length: ${token?.length}`)
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: { 'PRIVATE-TOKEN': token }
        })
        console.log(`[Detector] Plugin check response: HTTP ${resp.status}`)

        if (resp.status === 404) continue // 试下一个路径
        if (resp.status === 401 || resp.status === 403) {
          return { ...base, status: 'failed', reason: 'GitLab Token 无效或无权限' }
        }
        if (!resp.ok) {
          lastError = `GitLab API (HTTP ${resp.status})`
          continue
        }

        const data = JSON.parse(await resp.text()) as { version?: string }
        return comparePluginVersion(data.version, localVersion, base)
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = '请求超时'
        } else {
          lastError = `网络错误: ${err instanceof Error ? err.message : String(err)}`
        }
        // 网络错误时换 host 再试
        break
      } finally {
        clearTimeout(timer)
      }
    }
    // 如果所有 filePaths 都 404 了但网络正常，换 host 没意义
    if (!lastError || lastError.includes('网络') || lastError.includes('超时')) continue
    break
  }

  if (!lastError) return { ...base, status: 'unsupported', reason: '远端 plugin 不存在或已删除' }
  return { ...base, status: 'failed', reason: lastError }
}

function comparePluginVersion(
  remoteVersion: string | undefined,
  localVersion: string,
  base: Pick<CheckResult, 'agent' | 'skillName' | 'checkedAt'>
): CheckResult {
  if (!remoteVersion) {
    return { ...base, status: 'unsupported', reason: '远端 plugin.json 无 version 字段' }
  }
  // 简单 semver 比较：把版本拆成数字数组逐位比较
  const remote = remoteVersion.split('.').map(Number)
  const local = localVersion.split('.').map(Number)
  for (let i = 0; i < Math.max(remote.length, local.length); i++) {
    const r = remote[i] || 0
    const l = local[i] || 0
    if (r > l) return { ...base, status: 'available', reason: `最新版本: v${remoteVersion}` }
    if (r < l) return { ...base, status: 'latest' }
  }
  return { ...base, status: 'latest' }
}

// --- Batch Version Detection ---

/**
 * 批量检测多个 skill 的远端版本状态。
 *
 * 使用并发池限制同时检测数量（默认 5），每完成一个立即回调。
 * 同名 + 同 source + 同本地 hash 的 skill 只检测一次，结果复用。
 * 单个失败不中断其余 skill 的检测。
 */
export async function detectSkillVersions(
  skills: SkillsSkillView[],
  lock: Record<string, LockEntry>,
  options: DetectOptions & { concurrency?: number },
  onResult?: (result: CheckResult, index: number) => void
): Promise<CheckResult[]> {
  const concurrency = options.concurrency ?? 5

  // 去重缓存：key = "source|skillFolderHash"，value = CheckResult（复用 status/reason）
  const checkCache = new Map<string, CheckResult>()

  function getCacheKey(entry: LockEntry | undefined): string | null {
    if (!entry) return null
    const source = entry.source || entry.sourceUrl || ''
    const hash = entry.skillFolderHash || entry.updatedAt || ''
    if (!source) return null
    return `${source}|${hash}`
  }

  return runConcurrentPool(
    skills,
    concurrency,
    async (skill) => {
      const entry = lockForSkill(lock, skill.name)
      const cacheKey = getCacheKey(entry)

      // 如果同 source + 同 hash 已经检测过，直接复用结果
      if (cacheKey && checkCache.has(cacheKey)) {
        const cached = checkCache.get(cacheKey)!
        return { ...cached, agent: skill.agent, skillName: skill.name, checkedAt: new Date().toISOString() }
      }

      const result = await detectSkillVersion(skill, entry, options)

      // 缓存结果供同源同版本的 skill 复用
      if (cacheKey) {
        checkCache.set(cacheKey, result)
      }

      return result
    },
    onResult
  )
}
