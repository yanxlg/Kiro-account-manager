import type { UpdateTask, UpdateResult, BatchUpdateResult, SkillsManagerConfig } from './types'
import { runNpxSkills } from './commands'
import { normalizeSkillName } from './config'
import {
  canonicalGlobalSkillsDir,
  getInstalledAgentDefinitions,
  supportsAgentSymlinkProjection
} from './agents'
import { readGlobalLock, lockForSkill } from './lock'
import { pathExists } from './filesystem'
import { join } from 'path'
import { cp, mkdir, rm } from 'fs/promises'

const MAX_QUEUE_SIZE = 50
const COMMAND_TIMEOUT_MS = 120_000
const IDLE_POLL_INTERVAL_MS = 30_000
const DEFAULT_MAX_WAIT_MS = 600_000

/**
 * 根据 UpdateTask 的来源类型构建安装源地址。
 *
 * 规则：
 * - sourceType=github → `${source}/${skillFolder}#${ref}`
 * - sourceType=gitlab 且 sourceUrl 为 HTTPS → `${sourceUrl}/${skillFolder}#${ref}`
 * - sourceType=gitlab 且 sourceUrl 为 SSH (git@...) → `${sourceUrl}#${ref}` (不追加子路径)
 *
 * skillFolder 从 skillPath 中提取：去掉尾部的 SKILL.md 并规范化路径分隔符。
 */
export function buildInstallSource(task: UpdateTask, refOverride?: string): string {
  const ref = refOverride || task.ref || 'main'
  const skillFolder = normalizeSkillFolder(task.skillPath)

  if (task.sourceType === 'github' || task.sourceType === 'plugin-github') {
    // GitHub: source/skillFolder#ref
    const base = task.source.replace(/\/+$/, '')
    if (skillFolder) {
      return `${base}/${skillFolder}#${ref}`
    }
    return `${base}#${ref}`
  }

  if (task.sourceType === 'gitlab' || task.sourceType === 'plugin-gitlab') {
    const sourceUrl = task.sourceUrl || ''

    // SSH 格式: git@ 开头不追加子路径
    if (sourceUrl.startsWith('git@')) {
      return `${sourceUrl}#${ref}`
    }

    // HTTPS 格式: 追加 skillFolder
    const base = sourceUrl.replace(/\/+$/, '')
    if (skillFolder) {
      return `${base}/${skillFolder}#${ref}`
    }
    return `${base}#${ref}`
  }

  // Fallback: 使用 source 直接拼接
  return `${task.source}#${ref}`
}

/**
 * 从 skillPath 中提取 skillFolder：
 * - 去除尾部的 /SKILL.md 或 SKILL.md
 * - 去除首尾斜杠
 * - 规范化路径分隔符
 */
function normalizeSkillFolder(skillPath: string | undefined): string {
  if (!skillPath) return ''

  let folder = skillPath
    // 去除尾部的 SKILL.md（可能有或没有前导斜杠）
    .replace(/\/?SKILL\.md$/i, '')
    // 规范化连续斜杠
    .replace(/\/+/g, '/')
    // 去除首尾斜杠
    .replace(/^\/+|\/+$/g, '')

  return folder
}

/**
 * 更新执行器。
 *
 * 职责：
 * - 构建安装命令
 * - 管理更新队列（最大 50）
 * - 维护并发锁（canonicalPath 级互斥）
 * - 维护 agent:skillName 级互斥（防止重复更新）
 *
 * executeSingle/executeBatch/waitForIdle 实现更新执行逻辑。
 */

/**
 * 执行 npx skills 命令并附加超时保护。
 * 超过 timeoutMs 后会杀死子进程并返回失败结果。
 */
function runNpxSkillsWithTimeout(
  args: string[],
  timeoutMs: number = COMMAND_TIMEOUT_MS
): Promise<{ success: boolean; message?: string; error?: string }> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ success: false, error: `命令执行超时(${timeoutMs / 1000}秒)` })
      }
    }, timeoutMs)

    runNpxSkills(args).then((result) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
    }).catch((err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ success: false, error: err instanceof Error ? err.message : String(err) })
      }
    })
  })
}

/**
 * 刷新某 skill 在所有已投射 agent 目录中的副本。
 * 对于 copy 模式的非 universal agent，将 canonical 目录的内容重新复制到 agent 的 globalSkillsDir。
 */
async function refreshProjectionsForSkill(
  skillName: string,
  preferredMode: SkillsManagerConfig['defaultInstallMode']
): Promise<void> {
  const normalized = normalizeSkillName(skillName)
  const canonicalDir = join(canonicalGlobalSkillsDir, normalized)
  if (!(await pathExists(canonicalDir))) return

  const agents = getInstalledAgentDefinitions()
  for (const agent of agents) {
    if (agent.universal) continue
    const targetDir = join(agent.globalSkillsDir, normalized)
    if (!(await pathExists(targetDir))) continue

    const useCopy = preferredMode === 'copy' || !supportsAgentSymlinkProjection(agent)
    if (useCopy) {
      // 复制模式：删除旧目录，重新复制
      await rm(targetDir, { recursive: true, force: true })
      await mkdir(targetDir, { recursive: true })
      await cp(canonicalDir, targetDir, { recursive: true, dereference: true })
    }
    // symlink 模式下不需要刷新，因为已经指向 canonical
  }
}
export class UpdateExecutor {
  private queue: UpdateTask[] = []
  private activeLocks: Set<string> = new Set()
  private updating: Set<string> = new Set()

  // --- 安装源地址构建 ---

  /**
   * 构建安装源地址，委托给模块级 buildInstallSource 函数。
   */
  buildInstallSource(task: UpdateTask, refOverride?: string): string {
    return buildInstallSource(task, refOverride)
  }

  // --- 队列管理 ---

  /**
   * 入队一个更新任务。
   * @returns true 如果入队成功，false 如果队列已满（>= 50）
   */
  enqueue(task: UpdateTask): boolean {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      return false
    }
    this.queue.push(task)
    return true
  }

  /**
   * 出队一个更新任务（FIFO 顺序）。
   * @returns 下一个待执行任务，队列为空时返回 undefined
   */
  dequeue(): UpdateTask | undefined {
    return this.queue.shift()
  }

  /**
   * 检查队列是否已满。
   */
  isFull(): boolean {
    return this.queue.length >= MAX_QUEUE_SIZE
  }

  /**
   * 获取当前队列长度（用于测试/调试）。
   */
  getQueueLength(): number {
    return this.queue.length
  }

  // --- agent:skillName 级互斥 ---

  /**
   * 查询某 skill 是否正在更新中。
   */
  isUpdating(agent: string, skillName: string): boolean {
    return this.updating.has(`${agent}:${skillName}`)
  }

  /**
   * 标记某 skill 开始更新。
   * @returns true 如果标记成功，false 如果已在更新中
   */
  markUpdating(agent: string, skillName: string): boolean {
    const key = `${agent}:${skillName}`
    if (this.updating.has(key)) {
      return false
    }
    this.updating.add(key)
    return true
  }

  /**
   * 清除某 skill 的更新标记。
   */
  clearUpdating(agent: string, skillName: string): void {
    this.updating.delete(`${agent}:${skillName}`)
  }

  // --- canonicalPath 级互斥锁 ---

  /**
   * 获取某 canonical 路径的写入锁。
   * @returns true 如果获取成功，false 如果已被锁定
   */
  acquireLock(canonicalPath: string): boolean {
    if (this.activeLocks.has(canonicalPath)) {
      return false
    }
    this.activeLocks.add(canonicalPath)
    return true
  }

  /**
   * 释放某 canonical 路径的写入锁。
   */
  releaseLock(canonicalPath: string): void {
    this.activeLocks.delete(canonicalPath)
  }

  /**
   * 检查某 canonical 路径是否已被锁定。
   */
  isLocked(canonicalPath: string): boolean {
    return this.activeLocks.has(canonicalPath)
  }

  // --- 更新执行 ---

  /**
   * 执行单个 skill 更新。
   * 1. 检查是否正在更新 → 拒绝
   * 2. 获取 canonicalPath 锁 → 拒绝或等待
   * 3. 构建安装源并执行 npx skills add
   * 4. 成功后刷新投射、读取新 hash
   * 5. 始终清理锁和更新标记
   */
  async executeSingle(
    task: UpdateTask,
    config: SkillsManagerConfig
  ): Promise<UpdateResult> {
    const startTime = Date.now()
    const normalized = normalizeSkillName(task.skillName)
    const canonicalPath = join(canonicalGlobalSkillsDir, normalized)

    // 1. 检查 agent:skillName 互斥
    if (!this.markUpdating(task.agent, task.skillName)) {
      return {
        agent: task.agent,
        skillName: task.skillName,
        success: false,
        error: '正在更新中',
        duration: Date.now() - startTime
      }
    }

    // 2. 获取 canonicalPath 锁
    if (!this.acquireLock(canonicalPath)) {
      this.clearUpdating(task.agent, task.skillName)
      return {
        agent: task.agent,
        skillName: task.skillName,
        success: false,
        error: '该 skill 的 canonical 路径正被其他操作锁定',
        duration: Date.now() - startTime
      }
    }

    try {
      // 读取更新前的 hash
      const lockBefore = await readGlobalLock()
      const entryBefore = lockForSkill(lockBefore, task.skillName)
      const previousHash = entryBefore?.skillFolderHash || ''

      // 3-4. 使用 `npx skills add <source> -g -y -s <skillName>`：
      //   - bare source（不拼 #ref 子路径），由 skills CLI 解析仓库默认分支
      //   - -s 按名精确选中 skill（兼容 monorepo / 子目录 / SSH GitLab）
      //   与手动更新 (updateSkillV2) 保持一致，避免分支/子路径猜测导致 clone 失败
      const installSource = task.sourceUrl || task.source || ''
      const result = await runNpxSkillsWithTimeout(
        ['add', installSource, '-g', '-y', '-s', task.skillName],
        COMMAND_TIMEOUT_MS
      )

      if (!result.success) {
        return {
          agent: task.agent,
          skillName: task.skillName,
          success: false,
          previousHash,
          error: result.error || '更新失败',
          duration: Date.now() - startTime
        }
      }

      // 5. 成功：刷新投射
      await refreshProjectionsForSkill(task.skillName, config.defaultInstallMode)

      // 6. 读取更新后的 hash
      const lockAfter = await readGlobalLock()
      const entryAfter = lockForSkill(lockAfter, task.skillName)
      const newHash = entryAfter?.skillFolderHash || ''

      return {
        agent: task.agent,
        skillName: task.skillName,
        success: true,
        previousHash,
        newHash,
        duration: Date.now() - startTime
      }
    } catch (err) {
      return {
        agent: task.agent,
        skillName: task.skillName,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime
      }
    } finally {
      // 7. 始终清理
      this.clearUpdating(task.agent, task.skillName)
      this.releaseLock(canonicalPath)
    }
  }

  /**
   * 执行批量自动更新（串行）。
   * 逐个执行任务，单个失败不中断批次。
   * 每个任务完成后调用 onProgress 回调。
   */
  async executeBatch(
    tasks: UpdateTask[],
    config: SkillsManagerConfig,
    onProgress?: (result: UpdateResult) => void
  ): Promise<BatchUpdateResult> {
    const successes: UpdateResult[] = []
    const failures: UpdateResult[] = []

    for (const task of tasks) {
      const result = await this.executeSingle(task, config)
      if (result.success) {
        successes.push(result)
      } else {
        failures.push(result)
      }
      if (onProgress) {
        onProgress(result)
      }
    }

    return {
      successes,
      failures,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 检查是否可以开始更新（等待用户操作完成）。
   * 每 30 秒轮询一次是否有活跃锁或正在更新的任务。
   * 最长等待 maxWaitMs（默认 10 分钟），超时返回 false。
   */
  async waitForIdle(maxWaitMs: number = DEFAULT_MAX_WAIT_MS): Promise<boolean> {
    const startTime = Date.now()

    while (true) {
      // 检查是否空闲：没有活跃锁且没有正在更新的 skill
      if (this.activeLocks.size === 0 && this.updating.size === 0) {
        return true
      }

      // 检查是否超时
      if (Date.now() - startTime >= maxWaitMs) {
        return false
      }

      // 等待 30 秒后重试
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_INTERVAL_MS))
    }
  }
}
