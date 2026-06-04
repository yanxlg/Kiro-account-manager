import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import type {
  AvailableSkill,
  CustomMarketplaceRecord,
  LockEntry,
  MarketplaceInfo,
  MarketplaceSourceType,
  ParsedGitUrl,
  SkillsSkillView
} from './types'
import { readGlobalLock } from './lock'
import { parseGitLabUrl } from './detector'

/** electron-store 兼容接口 */
export interface MarketplaceStoreLike {
  get: (key: string, defaultValue?: unknown) => unknown
  set: (key: string, value: unknown) => void
}

/** electron-store 中 marketplaceConfig 的数据结构 */
export interface MarketplaceStoreData {
  customMarketplaces: CustomMarketplaceRecord[]
}

// --- Git URL Normalization ---

/**
 * 规范化 git URL 为统一格式 "host/owner/repo"。
 *
 * 支持以下输入格式：
 * - HTTPS: https://github.com/owner/repo(.git)
 * - SSH: git@github.com:owner/repo(.git)
 * - Shorthand: owner/repo (默认为 github.com)
 *
 * 输出格式: "github.com/owner/repo"（无协议前缀、无 .git 后缀）
 */
export function normalizeGitUrl(url: string): string {
  if (!url) return ''

  const normalized = url.trim()

  // SSH 格式: git@host:owner/repo(.git)
  const sshMatch = normalized.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`
  }

  // HTTPS/HTTP 格式: https://host/owner/repo(.git)
  const httpsMatch = normalized.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`
  }

  // GitHub shorthand 格式: owner/repo
  const shorthandMatch = normalized.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/)
  if (shorthandMatch) {
    return `github.com/${shorthandMatch[1]}`
  }

  // 无法识别的格式，返回原始值（小写）
  return normalized.toLowerCase()
}

// --- MarketplaceDetector ---

/**
 * 市场检测器。
 *
 * 负责在应用启动时扫描本地配置文件以发现 skill 来源市场。
 * 读取 3 个来源（Claude 插件市场、GitHub Skills 市场、自定义市场），
 * 合并去重后返回统一的 MarketplaceInfo 列表。
 */
export class MarketplaceDetector {
  private store: MarketplaceStoreLike | null

  constructor(store?: MarketplaceStoreLike | null) {
    this.store = store ?? null
  }

  /**
   * 执行完整的市场检测流程。
   * 读取 3 个来源并合并去重。
   */
  async detect(): Promise<MarketplaceInfo[]> {
    const [claudeMarkets, githubMarkets, customMarkets] = await Promise.all([
      this.detectClaudePluginMarketplaces(),
      this.detectGitHubSkillsMarketplaces(),
      Promise.resolve(this.loadCustomMarketplaces())
    ])

    return this.mergeMarketplaces(claudeMarkets, githubMarkets, customMarkets)
  }

  /**
   * 解析 known_marketplaces.json → Claude_Plugin_Marketplace[]
   *
   * 读取 ~/.claude/plugins/known_marketplaces.json，将每个条目转换为 MarketplaceInfo。
   * 文件不存在或解析失败时记录 warning 并返回空数组。
   */
  async detectClaudePluginMarketplaces(): Promise<MarketplaceInfo[]> {
    const filePath = join(homedir(), '.claude', 'plugins', 'known_marketplaces.json')

    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch (err) {
      console.warn(
        `[MarketplaceDetector] known_marketplaces.json not found or unreadable: ${filePath}`,
        err instanceof Error ? err.message : err
      )
      return []
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(content)
    } catch (err) {
      console.warn(
        `[MarketplaceDetector] Failed to parse known_marketplaces.json`,
        err instanceof Error ? err.message : err
      )
      return []
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.warn(`[MarketplaceDetector] known_marketplaces.json has unexpected format`)
      return []
    }

    const results: MarketplaceInfo[] = []

    for (const [name, entry] of Object.entries(data)) {
      if (!entry || typeof entry !== 'object') continue

      const source = (entry as Record<string, unknown>).source as
        | { source?: string; repo?: string; url?: string; ref?: string }
        | undefined

      if (!source || typeof source !== 'object') continue

      // Derive gitUrl: prefer source.url, fallback to constructing from source.repo
      let gitUrl = ''
      if (source.url && typeof source.url === 'string') {
        gitUrl = source.url
      } else if (source.repo && typeof source.repo === 'string') {
        // GitHub shorthand or owner/repo → construct HTTPS URL
        if (source.source === 'github') {
          gitUrl = `https://github.com/${source.repo}`
        } else {
          gitUrl = source.repo
        }
      }

      if (!gitUrl) continue

      // Parse owner/repo from gitUrl or source.repo
      let owner: string | undefined
      let repo: string | undefined

      if (source.repo && typeof source.repo === 'string' && source.repo.includes('/')) {
        const parts = source.repo.split('/')
        owner = parts[0]
        repo = parts.slice(1).join('/')
      } else {
        // Try to parse from gitUrl
        const parsed = MarketplaceManager.parseGitUrl(gitUrl)
        if (parsed) {
          owner = parsed.owner
          repo = parsed.repo
        }
      }

      results.push({
        id: `claude-plugin:${name}`,
        name,
        gitUrl,
        sourceType: 'claude-plugin',
        owner,
        repo,
        ref: typeof source.ref === 'string' ? source.ref : undefined
      })
    }

    return results
  }

  /**
   * 解析 .skill-lock.json → GitHub_Skills_Marketplace[]
   *
   * 读取 `~/.agents/.skill-lock.json`，从每个 lock 条目的 `source` 字段（格式 "owner/repo"）
   * 中提取唯一的 owner/repo 组合，为每个组合创建一个 MarketplaceInfo 记录。
   *
   * 如果 sourceUrl 可用，尝试从中获取更精确的 host 信息；否则默认使用 github.com。
   *
   * 文件不存在或 JSON 解析失败时记录 warning 并返回空数组。
   */
  async detectGitHubSkillsMarketplaces(): Promise<MarketplaceInfo[]> {
    const lockPath = process.env.XDG_STATE_HOME
      ? join(process.env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
      : join(homedir(), '.agents', '.skill-lock.json')

    let raw: string
    try {
      raw = await readFile(lockPath, 'utf-8')
    } catch (err) {
      console.warn('[MarketplaceDetector] .skill-lock.json not found or unreadable:', (err as Error).message)
      return []
    }

    let parsed: { version?: number; skills?: Record<string, LockEntry> }
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.warn('[MarketplaceDetector] .skill-lock.json parse failed:', (err as Error).message)
      return []
    }

    const skills = parsed?.skills
    if (!skills || typeof skills !== 'object') {
      return []
    }

    // Collect unique owner/repo combinations and their associated sourceUrl (for host detection)
    const seen = new Map<string, { owner: string; repo: string; sourceUrl?: string }>()

    for (const entry of Object.values(skills)) {
      const source = entry.source
      if (!source || typeof source !== 'string') continue

      // source format is "owner/repo"
      const parts = source.split('/')
      if (parts.length < 2) continue

      const owner = parts[0]
      const repo = parts.slice(1).join('/')
      const key = `${owner}/${repo}`

      if (!seen.has(key)) {
        seen.set(key, { owner, repo, sourceUrl: entry.sourceUrl })
      }
    }

    // Convert unique owner/repo combinations to MarketplaceInfo records
    const results: MarketplaceInfo[] = []
    for (const [key, { owner, repo, sourceUrl }] of seen) {
      // Try to extract host info from sourceUrl if available
      let gitUrl = `https://github.com/${owner}/${repo}`
      if (sourceUrl) {
        const parsedUrl = MarketplaceManager.parseGitUrl(sourceUrl)
        if (parsedUrl) {
          gitUrl = `https://${parsedUrl.host}/${parsedUrl.owner}/${parsedUrl.repo}`
        }
      }

      results.push({
        id: `github-skills:${key}`,
        name: key,
        gitUrl,
        sourceType: 'github-skills',
        owner,
        repo
      })
    }

    return results
  }

  /**
   * 从 electron-store 读取 Custom_Marketplace[]
   *
   * 读取 `marketplaceConfig` 键中的 `customMarketplaces` 数组，
   * 将每个 `CustomMarketplaceRecord` 转换为 `MarketplaceInfo`。
   *
   * 如果 store 未初始化、键不存在或读取失败，返回空数组。
   */
  loadCustomMarketplaces(): MarketplaceInfo[] {
    if (!this.store) return []

    try {
      const data = this.store.get('marketplaceConfig', null) as MarketplaceStoreData | null
      if (!data || !Array.isArray(data.customMarketplaces)) return []

      const results: MarketplaceInfo[] = []
      for (const record of data.customMarketplaces) {
        // 跳过无效记录（缺少必要字段）
        if (!record || !record.id || !record.gitUrl || !record.name) continue

        results.push({
          id: record.id,
          name: record.name,
          gitUrl: record.gitUrl,
          sourceType: 'custom',
          owner: record.owner,
          repo: record.repo,
          ref: record.ref,
          host: record.host,
          projectPath: record.projectPath,
          createdAt: record.createdAt
        })
      }

      return results
    } catch (err) {
      console.warn(
        '[MarketplaceDetector] Failed to load custom marketplaces from store:',
        err instanceof Error ? err.message : err
      )
      return []
    }
  }

  /**
   * 合并多个来源的市场列表并去重（按 gitUrl 规范化后去重）。
   *
   * 去重规则：对于规范化后 URL 相同的条目，保留第一次出现的记录。
   * 来源优先级：claude-plugin > github-skills > custom（参数传入顺序）。
   */
  mergeMarketplaces(...sources: MarketplaceInfo[][]): MarketplaceInfo[] {
    const seen = new Set<string>()
    const result: MarketplaceInfo[] = []

    for (const source of sources) {
      for (const market of source) {
        const normalized = normalizeGitUrl(market.gitUrl)
        if (!normalized) continue
        if (seen.has(normalized)) continue
        seen.add(normalized)
        result.push(market)
      }
    }

    return result
  }

  /**
   * 按 sourceType 分组。
   *
   * 返回一个包含所有三种 sourceType 键的 Record，
   * 即使某种类型没有条目也会返回空数组。
   */
  groupByType(markets: MarketplaceInfo[]): Record<MarketplaceSourceType, MarketplaceInfo[]> {
    const groups: Record<MarketplaceSourceType, MarketplaceInfo[]> = {
      'claude-plugin': [],
      'github-skills': [],
      custom: []
    }

    for (const market of markets) {
      if (groups[market.sourceType]) {
        groups[market.sourceType].push(market)
      }
    }

    return groups
  }
}

// --- MarketplaceManager ---

/**
 * 市场管理器。
 *
 * 核心功能：
 * - 解析 git URL（HTTPS / SSH / shorthand）
 * - 基于 normalized URL 判重
 * - 远端 skill 查询（会话级缓存）
 * - 自定义市场增删
 */
export class MarketplaceManager {
  private cache: Map<string, AvailableSkill[]> = new Map()
  private store: MarketplaceStoreLike | null

  constructor(store?: MarketplaceStoreLike | null) {
    this.store = store ?? null
  }

  // ─── Store 访问 ────────────────────────────────────────────────

  /** 读取 electron-store 中的 customMarketplaces 列表 */
  private readCustomMarketplaces(): CustomMarketplaceRecord[] {
    if (!this.store) return []
    const data = this.store.get('marketplaceConfig', { customMarketplaces: [] }) as MarketplaceStoreData
    if (!data || !Array.isArray(data.customMarketplaces)) return []
    return data.customMarketplaces
  }

  /** 保存 customMarketplaces 列表到 electron-store */
  private saveCustomMarketplaces(records: CustomMarketplaceRecord[]): void {
    if (!this.store) return
    const existing = this.store.get('marketplaceConfig', { customMarketplaces: [] }) as MarketplaceStoreData
    this.store.set('marketplaceConfig', { ...existing, customMarketplaces: records })
  }

  // ─── 静态工具方法 ────────────────────────────────────────────────

  /**
   * 解析 git URL，支持 HTTPS、SSH 和 GitHub shorthand 格式。
   *
   * 规则：
   * - HTTPS: https://github.com/owner/repo(.git)
   * - SSH:   git@github.com:owner/repo(.git)
   * - Shorthand: owner/repo（默认 github.com）
   * - GitLab URLs 可能含 subgroup: https://gitlab.com/group/subgroup/repo
   * - Normalize: "host/owner/repo"（小写，去掉 .git 后缀）
   * - Platform 检测: github.com → 'github'，含 gitlab → 'gitlab'，其他 → 'unknown'
   *
   * @returns ParsedGitUrl 或 null（无法解析时）
   */
  static parseGitUrl(url: string): ParsedGitUrl | null {
    if (!url || typeof url !== 'string') return null

    const trimmed = url.trim()
    if (!trimmed) return null

    let host: string
    let pathPart: string

    // HTTPS 格式: https://github.com/owner/repo(.git)
    const httpsMatch = trimmed.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/)
    if (httpsMatch) {
      host = httpsMatch[1].toLowerCase()
      pathPart = httpsMatch[2].replace(/\/+$/, '')
    }
    // SSH 格式: git@github.com:owner/repo(.git)
    else {
      const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
      if (sshMatch) {
        host = sshMatch[1].toLowerCase()
        pathPart = sshMatch[2].replace(/\/+$/, '')
      }
      // GitHub shorthand: owner/repo
      else {
        const shorthandMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/)
        if (shorthandMatch) {
          host = 'github.com'
          pathPart = `${shorthandMatch[1]}/${shorthandMatch[2]}`
        } else {
          return null
        }
      }
    }

    // pathPart 至少需要 owner/repo (2 segments)
    const segments = pathPart.split('/').filter(Boolean)
    if (segments.length < 2) return null

    // owner 是除了最后一段的部分（支持 GitLab subgroups）
    const repo = segments[segments.length - 1].toLowerCase()
    const owner = segments
      .slice(0, -1)
      .join('/')
      .toLowerCase()

    // Platform 检测
    let platform: 'github' | 'gitlab' | 'unknown'
    if (host === 'github.com') {
      platform = 'github'
    } else if (host.includes('gitlab')) {
      platform = 'gitlab'
    } else {
      platform = 'unknown'
    }

    const normalizedUrl = `${host}/${owner}/${repo}`

    return { owner, repo, host, platform, normalizedUrl }
  }

  /**
   * 检测 URL 是否已存在于市场列表中。
   *
   * 将输入 URL 规范化后与 existing 列表中每个市场的 gitUrl 规范化结果比较。
   * 不同格式（HTTPS / SSH / shorthand）表示同一仓库时视为重复。
   *
   * @returns true 如果存在重复
   */
  static isDuplicate(url: string, existing: MarketplaceInfo[]): boolean {
    const parsed = MarketplaceManager.parseGitUrl(url)
    if (!parsed) return false

    return existing.some((market) => {
      const marketParsed = MarketplaceManager.parseGitUrl(market.gitUrl)
      if (!marketParsed) return false
      return parsed.normalizedUrl === marketParsed.normalizedUrl
    })
  }

  // ─── 实例方法 ──────────────────────────────────────────────────

  /** 清除远端 skill 缓存 */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * 查询远端仓库中的所有 skill（含 SKILL.md 的目录）。
   * 优先从缓存读取，未命中时调用 API。
   *
   * 流程：
   * 1. 生成缓存 key（基于 normalized URL）
   * 2. 检查缓存命中 → 直接返回
   * 3. 根据 platform 选择 GitHub Trees API 或 GitLab Repository Tree API
   * 4. 解析 API 响应，提取含 SKILL.md 的目录路径
   * 5. 标记每个 skill 的安装状态（与 lock 文件比较）
   * 6. 存入缓存并返回
   */
  async listRemoteSkills(marketplace: MarketplaceInfo): Promise<AvailableSkill[]> {
    // 1. 生成缓存 key
    const cacheKey = normalizeGitUrl(marketplace.gitUrl)
    if (!cacheKey) {
      throw new Error('Invalid marketplace git URL')
    }

    // 2. 检查缓存
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    // 3. 确定 platform
    const parsed = MarketplaceManager.parseGitUrl(marketplace.gitUrl)
    const platform = parsed?.platform ?? 'github'

    // 4. 根据 platform 调用 API
    let skillPaths: string[]
    if (platform === 'gitlab') {
      skillPaths = await this.fetchGitLabTree(marketplace, parsed)
    } else {
      // GitHub (包含 'github' 和 'unknown')
      skillPaths = await this.fetchGitHubTreeForSkills(marketplace, parsed)
    }

    // 5. 标记安装状态
    const lockEntries = await readGlobalLock()
    const ownerRepo = marketplace.owner && marketplace.repo
      ? `${marketplace.owner}/${marketplace.repo}`
      : undefined

    const results: AvailableSkill[] = skillPaths.map((skillPath) => {
      const dirName = skillPath.split('/').pop() || skillPath
      const installed = this.isSkillInstalled(dirName, skillPath, ownerRepo, marketplace.gitUrl, lockEntries)
      return {
        name: dirName,
        path: skillPath,
        installed
      }
    })

    // 6. 存入缓存
    this.cache.set(cacheKey, results)

    return results
  }

  /**
   * 通过 GitHub Trees API 获取仓库中所有含 SKILL.md 的目录路径。
   */
  private async fetchGitHubTreeForSkills(
    marketplace: MarketplaceInfo,
    parsed: ParsedGitUrl | null
  ): Promise<string[]> {
    const owner = marketplace.owner || parsed?.owner
    const repo = marketplace.repo || parsed?.repo
    if (!owner || !repo) {
      throw new Error('Cannot determine owner/repo for GitHub API')
    }

    const ownerRepo = `${owner}/${repo}`
    // 始终使用默认分支（main/master），不使用 feature 分支
    const refsToTry = ['main', 'master']

    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
    let lastError: Error | null = null

    for (const ref of refsToTry) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)

      try {
        const url = `https://api.github.com/repos/${ownerRepo}/git/trees/${encodeURIComponent(ref)}?recursive=1`

        const resp = await fetch(url, {
          signal: controller.signal,
          headers
        })

        if (resp.status === 401 || resp.status === 403) {
          throw new Error('GitHub API 认证失败，请检查 Token 配置')
        }
        if (resp.status === 429) {
          throw new Error('GitHub API 速率限制，请稍后重试')
        }
        if (resp.status === 404) {
          // ref not found, try next
          continue
        }
        if (!resp.ok) {
          throw new Error(`GitHub API 请求失败 (HTTP ${resp.status})`)
        }

        const data = (await resp.json()) as { tree?: Array<{ path: string; type: string }> }
        if (!data.tree) {
          throw new Error('GitHub API 返回数据格式异常')
        }

        return this.extractSkillPathsFromTree(data.tree)
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (lastError.name === 'AbortError') {
          throw new Error('网络超时，请稍后重试')
        }
        if (lastError.message.startsWith('GitHub API')) {
          throw lastError
        }
        // Network error — stop trying
        throw new Error(`网络错误: ${lastError.message}`)
      } finally {
        clearTimeout(timer)
      }
    }

    throw lastError || new Error('GitHub API: 无法找到默认分支 (main/master)')
  }

  /**
   * 通过 GitLab Repository Tree API 获取仓库中所有含 SKILL.md 的目录路径。
   */
  private async fetchGitLabTree(
    marketplace: MarketplaceInfo,
    parsed: ParsedGitUrl | null
  ): Promise<string[]> {
    // 确定 host（不带协议）和 projectPath
    let rawHost: string
    let projectPath: string

    if (marketplace.host && marketplace.projectPath) {
      rawHost = marketplace.host.replace(/^https?:\/\//, '')
      projectPath = marketplace.projectPath
    } else if (parsed) {
      rawHost = parsed.host
      projectPath = `${parsed.owner}/${parsed.repo}`
    } else {
      const gitLabParsed = parseGitLabUrl(marketplace.gitUrl)
      if (!gitLabParsed) {
        throw new Error('Cannot parse GitLab URL')
      }
      rawHost = gitLabParsed.host.replace(/^https?:\/\//, '')
      projectPath = gitLabParsed.projectPath
    }

    const encodedProject = encodeURIComponent(projectPath)

    // 获取配置中的 GitLab token
    const gitlabToken = this.store
      ? (this.store.get('skillsManagerConfig', {}) as { gitlabToken?: string })?.gitlabToken
      : undefined

    // 尝试 HTTP 优先，fallback 到 HTTPS（内网 GitLab 通常走 HTTP）
    const protocols = ['http', 'https']
    // 如果 ref 是默认值 'main'，则 fallback 尝试 'master'
    // 对于市场列表查询，始终使用默认分支（main/master），不使用 feature 分支
    const refsToTry = ['main', 'master']
    let lastError: Error | null = null

    for (const protocol of protocols) {
      const host = `${protocol}://${rawHost}`

      for (const tryRef of refsToTry) {
        const baseUrl = `${host}/api/v4/projects/${encodedProject}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(tryRef)}`

        try {
          const headers: Record<string, string> = {}
          if (gitlabToken) {
            headers['PRIVATE-TOKEN'] = gitlabToken
          }

          // Paginate through all pages
          const allEntries: Array<{ name: string; path: string; type: string }> = []
          let page = 1
          const maxPages = 50 // safety limit

          while (page <= maxPages) {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 10000)

            try {
              const url = `${baseUrl}&page=${page}`
              const resp = await fetch(url, { signal: controller.signal, headers })

              if (resp.status === 401 || resp.status === 403) {
                throw new Error('GitLab API 认证失败，Token 无效或无权限')
              }
              if (resp.status === 429) {
                throw new Error('GitLab API 速率限制，请稍后重试')
              }
              if (resp.status === 404) {
                // ref not found — try next ref
                throw new Error(`REF_NOT_FOUND:${tryRef}`)
              }
              if (!resp.ok) {
                throw new Error(`GitLab API 请求失败 (HTTP ${resp.status})`)
              }

            const entries = (await resp.json()) as Array<{ name: string; path: string; type: string }>
            if (!Array.isArray(entries) || entries.length === 0) break

            allEntries.push(...entries)

            // If we got fewer than per_page entries, we've reached the last page
            if (entries.length < 100) break
            page++
          } finally {
            clearTimeout(timer)
          }
        }

        return this.extractSkillPathsFromGitLabTree(allEntries)
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err))

        // REF_NOT_FOUND: try next ref
        if (lastError.message.startsWith('REF_NOT_FOUND:')) {
          continue
        }

        // 如果是认证/业务错误，不再 fallback
        if (lastError.message.startsWith('GitLab API')) {
          throw lastError
        }

        // Network error — break inner ref loop, try next protocol
        break
      }
      } // end refsToTry loop
    } // end protocols loop

    throw new Error(`网络错误: ${lastError?.message || 'fetch failed'}`)
  }

  /**
   * 从 GitHub tree 响应中提取含 SKILL.md 的目录路径。
   *
   * 规则：
   * 1. 跳过隐藏目录（路径以 . 开头的段，如 .agents/, .kiro/, .roo/）
   * 2. 如果存在 skills/ 目录下的 SKILL.md，优先使用 skills/ 下的
   * 3. 同名 skill 去重：skills/ 目录下的优先于 plugins/ 或其他目录下的
   */
  extractSkillPathsFromTree(tree: Array<{ path: string; type: string }>): string[] {
    const allSkillPaths: string[] = []
    const skillsDirPaths: string[] = []

    for (const entry of tree) {
      if (entry.type !== 'blob') continue
      if (!entry.path.endsWith('/SKILL.md') && entry.path !== 'SKILL.md') continue

      // 跳过隐藏目录（任何路径段以 . 开头）
      if (entry.path.split('/').some(seg => seg.startsWith('.'))) continue

      if (entry.path === 'SKILL.md') {
        allSkillPaths.push('.')
      } else {
        const dirPath = entry.path.slice(0, -'/SKILL.md'.length)
        allSkillPaths.push(dirPath)
        // 仅匹配顶层 skills/ 目录（path 以 skills/ 开头）
        if (dirPath.startsWith('skills/') || dirPath === 'skills') {
          skillsDirPaths.push(dirPath)
        }
      }
    }

    // 如果存在顶层 skills/ 目录下的条目，优先使用
    const paths = skillsDirPaths.length > 0 ? skillsDirPaths : allSkillPaths

    // 按 skill 名称去重
    return this.deduplicateSkillPaths(paths)
  }

  /**
   * 从 GitLab tree 响应中提取含 SKILL.md 的目录路径。
   *
   * 规则同上。
   */
  extractSkillPathsFromGitLabTree(entries: Array<{ name: string; path: string; type: string }>): string[] {
    const allSkillPaths: string[] = []
    const skillsDirPaths: string[] = []

    for (const entry of entries) {
      if (entry.type !== 'blob') continue
      if (entry.name !== 'SKILL.md') continue

      // 跳过隐藏目录
      if (entry.path.split('/').some(seg => seg.startsWith('.'))) continue

      if (entry.path === 'SKILL.md') {
        allSkillPaths.push('.')
      } else {
        const dirPath = entry.path.slice(0, -'/SKILL.md'.length)
        allSkillPaths.push(dirPath)
        // 仅匹配顶层 skills/ 目录
        if (dirPath.startsWith('skills/') || dirPath === 'skills') {
          skillsDirPaths.push(dirPath)
        }
      }
    }

    const paths = skillsDirPaths.length > 0 ? skillsDirPaths : allSkillPaths
    return this.deduplicateSkillPaths(paths)
  }

  /**
   * 按 skill 名称去重：同名 skill 优先保留直接在顶层 skills/ 目录下的路径。
   * 顶层 skills/ 指的是 path 以 "skills/" 开头（如 skills/cavecrew），
   * 而非嵌套在其他目录中的（如 plugins/caveman/skills/cavecrew）。
   */
  private deduplicateSkillPaths(paths: string[]): string[] {
    const byName = new Map<string, string>()

    for (const p of paths) {
      const name = p.split('/').pop() || p
      const existing = byName.get(name)
      if (!existing) {
        byName.set(name, p)
      } else {
        // 优先保留顶层 skills/ 目录下的（path 以 "skills/" 开头）
        const currentIsTopSkills = p.startsWith('skills/')
        const existingIsTopSkills = existing.startsWith('skills/')
        if (currentIsTopSkills && !existingIsTopSkills) {
          byName.set(name, p)
        }
      }
    }

    return Array.from(byName.values())
  }

  /**
   * 判断某个 skill 是否已安装到本地。
   *
   * 匹配规则：
   * - lockEntry.source === ownerRepo 且 skillPath 包含该目录路径
   * - lockEntry.sourceUrl 规范化后与市场 gitUrl 规范化后匹配
   */
  private isSkillInstalled(
    skillName: string,
    skillPath: string,
    ownerRepo: string | undefined,
    gitUrl: string,
    lockEntries: Record<string, LockEntry>
  ): boolean {
    const marketNormalized = normalizeGitUrl(gitUrl)

    for (const entry of Object.values(lockEntries)) {
      // 匹配规则 1: source 为 owner/repo 格式 + skillPath 中包含该目录
      if (ownerRepo && entry.source === ownerRepo) {
        // 检查 lock 中的 skillPath 是否指向同一个目录
        if (entry.skillPath) {
          const lockSkillDir = entry.skillPath.replace(/\/?SKILL\.md$/i, '').replace(/^\/+|\/+$/g, '')
          if (lockSkillDir === skillPath || lockSkillDir.endsWith(`/${skillPath}`)) {
            return true
          }
        }
        // 如果没有 skillPath，通过名称匹配
        continue
      }

      // 匹配规则 2: sourceUrl 规范化匹配
      if (entry.sourceUrl && marketNormalized) {
        const entryNormalized = normalizeGitUrl(entry.sourceUrl)
        if (entryNormalized === marketNormalized && entry.skillPath) {
          const lockSkillDir = entry.skillPath.replace(/\/?SKILL\.md$/i, '').replace(/^\/+|\/+$/g, '')
          if (lockSkillDir === skillPath || lockSkillDir.endsWith(`/${skillPath}`)) {
            return true
          }
        }
      }
    }

    return false
  }

  /**
   * 新增自定义市场。
   *
   * 流程：
   * 1. 验证 git URL 格式有效性（parseGitUrl 返回 null 则无效）
   * 2. 检查是否重复（调用 isDuplicate 与现有所有市场比较）
   * 3. 解析 URL 提取 owner/repo 作为默认名称
   * 4. 生成 CustomMarketplaceRecord 并持久化到 electron-store
   * 5. 返回 MarketplaceInfo
   */
  async addCustomMarketplace(input: { gitUrl: string; name?: string }): Promise<MarketplaceInfo> {
    // 1. 验证 git URL 格式
    const parsed = MarketplaceManager.parseGitUrl(input.gitUrl)
    if (!parsed) {
      throw new Error('Invalid git URL format')
    }

    // 2. 检查重复：加载现有自定义市场并构建完整列表进行判重
    const existingRecords = this.readCustomMarketplaces()
    const existingMarketplaces: MarketplaceInfo[] = existingRecords.map((r) => ({
      id: r.id,
      name: r.name,
      gitUrl: r.gitUrl,
      sourceType: r.sourceType,
      owner: r.owner,
      repo: r.repo,
      host: r.host
    }))

    if (MarketplaceManager.isDuplicate(input.gitUrl, existingMarketplaces)) {
      throw new Error('Marketplace already exists')
    }

    // 3. 构建 CustomMarketplaceRecord
    const record: CustomMarketplaceRecord = {
      id: randomUUID(),
      name: input.name || parsed.repo,
      gitUrl: input.gitUrl,
      sourceType: 'custom',
      owner: parsed.owner,
      repo: parsed.repo,
      host: parsed.host,
      projectPath: parsed.platform === 'gitlab' ? `${parsed.owner}/${parsed.repo}` : undefined,
      createdAt: new Date().toISOString()
    }

    // 4. 持久化
    const updatedRecords = [...existingRecords, record]
    this.saveCustomMarketplaces(updatedRecords)

    // 5. 返回 MarketplaceInfo
    return {
      id: record.id,
      name: record.name,
      gitUrl: record.gitUrl,
      sourceType: record.sourceType,
      owner: record.owner,
      repo: record.repo,
      host: record.host,
      projectPath: record.projectPath,
      createdAt: record.createdAt
    }
  }

  /**
   * 删除自定义市场（需检查是否有已安装 skill）。
   *
   * 流程：
   * 1. 从 electron-store 读取 customMarketplaces 列表
   * 2. 查找目标市场记录（按 id 匹配）
   * 3. 如果找不到，返回错误
   * 4. 读取全局 lock 文件，检查是否有 skill 归属于该市场
   * 5. 有已安装 skill 时阻止删除，返回错误信息
   * 6. 无已安装 skill 时从列表中移除并持久化
   */
  async removeCustomMarketplace(id: string): Promise<{ success: boolean; error?: string }> {
    // 1. 读取现有自定义市场列表
    const records = this.readCustomMarketplaces()

    // 2. 查找目标市场
    const targetIndex = records.findIndex((r) => r.id === id)
    if (targetIndex === -1) {
      return { success: false, error: 'Marketplace not found' }
    }

    const target = records[targetIndex]

    // 3. 读取全局 lock 文件，检查是否有 skill 归属于该市场
    const lockEntries = await readGlobalLock()
    const targetNormalized = normalizeGitUrl(target.gitUrl)

    let installedCount = 0
    for (const entry of Object.values(lockEntries)) {
      // 匹配规则 1: lockEntry.source === marketplace.owner/repo
      if (target.owner && target.repo && entry.source) {
        const expectedSource = `${target.owner}/${target.repo}`
        if (entry.source === expectedSource) {
          installedCount++
          continue
        }
      }

      // 匹配规则 2: normalizeGitUrl(lockEntry.sourceUrl) === normalizeGitUrl(marketplace.gitUrl)
      if (entry.sourceUrl && targetNormalized) {
        const entryNormalized = normalizeGitUrl(entry.sourceUrl)
        if (entryNormalized === targetNormalized) {
          installedCount++
          continue
        }
      }
    }

    // 4. 有已安装 skill 时阻止删除
    if (installedCount > 0) {
      return {
        success: false,
        error: `该市场下有 ${installedCount} 个 skill 正在使用，请先卸载后再删除`
      }
    }

    // 5. 无已安装 skill，执行删除
    const updatedRecords = records.filter((r) => r.id !== id)
    this.saveCustomMarketplaces(updatedRecords)

    return { success: true }
  }

  /**
   * 获取某个市场下的已安装 skill 列表。
   *
   * 通过匹配 skill 的 source/sourceUrl 字段与市场信息来归属 skill。
   * 匹配规则按市场 sourceType 不同：
   * - claude-plugin: skill.source === marketplace.name
   * - github-skills: skill.source === `${marketplace.owner}/${marketplace.repo}`
   * - custom: normalizeGitUrl(skill.sourceUrl) === normalizeGitUrl(marketplace.gitUrl)
   *          或 skill.source === `${marketplace.owner}/${marketplace.repo}`
   */
  getInstalledSkillsForMarketplace(
    marketplace: MarketplaceInfo,
    allSkills: SkillsSkillView[]
  ): SkillsSkillView[] {
    if (!marketplace || !allSkills || allSkills.length === 0) {
      return []
    }

    switch (marketplace.sourceType) {
      case 'claude-plugin':
        // Claude 插件市场: skill.source === marketplace.name
        return allSkills.filter(
          (skill) => skill.source != null && skill.source === marketplace.name
        )

      case 'github-skills':
        // GitHub Skills 市场: skill.source === "owner/repo"
        if (!marketplace.owner || !marketplace.repo) return []
        const githubSource = `${marketplace.owner}/${marketplace.repo}`
        return allSkills.filter(
          (skill) => skill.source != null && skill.source === githubSource
        )

      case 'custom': {
        // 自定义市场: 两种匹配方式（满足任一即归属）
        const normalizedMarketUrl = normalizeGitUrl(marketplace.gitUrl)
        const customOwnerRepo =
          marketplace.owner && marketplace.repo
            ? `${marketplace.owner}/${marketplace.repo}`
            : null

        return allSkills.filter((skill) => {
          // 规则 1: normalizeGitUrl(skill.sourceUrl) === normalizeGitUrl(marketplace.gitUrl)
          if (skill.sourceUrl && normalizedMarketUrl) {
            const normalizedSkillUrl = normalizeGitUrl(skill.sourceUrl)
            if (normalizedSkillUrl === normalizedMarketUrl) {
              return true
            }
          }

          // 规则 2: skill.source === "owner/repo"
          if (customOwnerRepo && skill.source === customOwnerRepo) {
            return true
          }

          return false
        })
      }

      default:
        return []
    }
  }
}
