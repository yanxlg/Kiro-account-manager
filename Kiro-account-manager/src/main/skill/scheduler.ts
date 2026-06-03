import type { BrowserWindow } from 'electron'
import type {
  BatchUpdateResult,
  SkillsManagerConfig,
  UpdateTask,
  StatusChangedEvent,
  BatchUpdateCompletedEvent,
  CheckProgressEvent
} from './types'
import { filterSkillsForCheck, detectSkillVersions } from './detector'
import type { CheckResult } from './detector'
import { UpdateExecutor } from './executor'
import { createHistoryStore } from './history'
import { listSkillsState } from './service'
import { readGlobalLock } from './lock'
import { getSkillConfigKey } from './config'

const INITIAL_DELAY_MS = 3_000 // 3 seconds after start (TODO: restore to 30_000)
const DEFAULT_INTERVAL_MINUTES = 240 // 4 hours
const MIN_INTERVAL_MINUTES = 30
const MAX_INTERVAL_MINUTES = 1440

export interface SchedulerOptions {
  getConfig: () => SkillsManagerConfig
  saveConfig: (config: SkillsManagerConfig) => void
  getWindow: () => BrowserWindow | null
}

export class AutoUpdateScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private checking = false
  private updating = false
  private lastBatchResult: BatchUpdateResult | null = null
  private lastCheckResults: CheckResult[] = []
  private executor: UpdateExecutor

  constructor(private options: SchedulerOptions) {
    this.executor = new UpdateExecutor()
  }

  /**
   * 应用启动后调用，30 秒后首次检测。
   */
  start(): void {
    this.stop()
    this.timer = setTimeout(() => {
      void this.runCycle()
    }, INITIAL_DELAY_MS)
  }

  /**
   * 应用退出时调用，清除定时器。
   */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * 用户修改 checkIntervalMinutes 时调用。
   * @returns true 如果新值有效且已重新调度，false 如果无效。
   */
  reschedule(newIntervalMinutes: number): boolean {
    if (!this.isValidInterval(newIntervalMinutes)) {
      return false
    }

    // 清除当前定时器
    this.stop()

    // 以新间隔重新调度
    this.scheduleNext(newIntervalMinutes)
    return true
  }

  /**
   * 手动触发检测。
   * 如果正在检测中，返回缓存结果（不重复发起请求）。
   */
  async triggerCheck(agent?: string, skillName?: string): Promise<CheckResult[]> {
    // 如果正在检测中，返回缓存结果
    if (this.checking) {
      return this.lastCheckResults
    }

    this.checking = true

    try {
      const config = this.options.getConfig()
      const { agents } = await listSkillsState(config)

      // 收集所有 skill
      let allSkills = agents.flatMap((a) => a.skills)

      // 如果指定了 agent，过滤
      if (agent) {
        allSkills = allSkills.filter((s) => s.agent === agent)
      }

      // 如果指定了 skillName，过滤
      if (skillName) {
        allSkills = allSkills.filter((s) => s.name === skillName)
      }

      // 排除无来源的 skill（本地手动创建无 sourceType）
      allSkills = allSkills.filter((s) => !!s.sourceType)

      // 发送检测进度事件
      for (const skill of allSkills) {
        this.sendCheckProgress({ agent: skill.agent, skillName: skill.name, checking: true })
      }

      // 读取 lock 文件
      const lock = await readGlobalLock()

      // 执行版本检测（并发池，默认 5 个并行，每完成一个立即回调）
      const results = await detectSkillVersions(allSkills, lock, {
        gitlabToken: config.gitlabToken,
        githubToken: config.githubToken,
        timeoutMs: 15000,
        concurrency: 5
      }, (result) => {
        // 每完成一个立即：持久化 + 推送
        this.persistCheckResult(result)
        this.sendStatusChanged({
          agent: result.agent,
          skillName: result.skillName,
          status: result.status,
          reason: result.reason
        })
        this.sendCheckProgress({ agent: result.agent, skillName: result.skillName, checking: false })
      })

      this.lastCheckResults = results
      return results
    } finally {
      this.checking = false
    }
  }

  /**
   * 获取最近一次批量更新结果。
   */
  getLastBatchResult(): BatchUpdateResult | null {
    return this.lastBatchResult
  }

  /**
   * 内部：执行一轮完整的检测+更新周期。
   */
  private async runCycle(): Promise<void> {
    // 防止并发检测
    if (this.checking) {
      this.scheduleNext()
      return
    }

    this.checking = true

    try {
      const config = this.options.getConfig()
      const { agents } = await listSkillsState(config)

      // 获取所有 skill
      const allSkills = agents.flatMap((a) => a.skills)

      // 检测所有 skill（检测和 autoUpdate 是独立的，都要检测）
      const skillsToCheck = allSkills.filter((s) => !!s.sourceType)

      if (skillsToCheck.length === 0) {
        this.scheduleNext()
        return
      }

      // 发送检测进度事件
      for (const skill of skillsToCheck) {
        this.sendCheckProgress({ agent: skill.agent, skillName: skill.name, checking: true })
      }

      // 读取 lock 文件并执行检测（并发池，默认 5 个并行）
      const lock = await readGlobalLock()
      const results = await detectSkillVersions(skillsToCheck, lock, {
        gitlabToken: config.gitlabToken,
        githubToken: config.githubToken,
        timeoutMs: 15000,
        concurrency: 5
      }, (result) => {
        this.persistCheckResult(result)
        this.sendStatusChanged({
          agent: result.agent,
          skillName: result.skillName,
          status: result.status,
          reason: result.reason
        })
        this.sendCheckProgress({ agent: result.agent, skillName: result.skillName, checking: false })
      })

      this.lastCheckResults = results

      // 收集需要自动更新的 skill（status=available 且 autoUpdate=true）
      const skillsToUpdate = results.filter((r) => {
        if (r.status !== 'available') return false
        const skill = allSkills.find((s) => s.name === r.skillName && s.agent === r.agent)
        return skill?.autoUpdate === true
      })

      // 找到对应的 skill view 用于构建 UpdateTask
      if (skillsToUpdate.length > 0) {
        this.updating = true

        try {
          // 等待空闲（没有其他操作在进行）
          const idle = await this.executor.waitForIdle()
          if (!idle) {
            // 超时放弃本轮更新
            this.scheduleNext()
            return
          }

          // 构建 UpdateTask 列表
          const tasks: UpdateTask[] = []
          for (const checkResult of skillsToUpdate) {
            const skillView = allSkills.find(
              (s) => s.name === checkResult.skillName && s.agent === checkResult.agent
            )
            if (!skillView || !skillView.source) continue

            tasks.push({
              agent: checkResult.agent,
              skillName: checkResult.skillName,
              source: skillView.source || '',
              sourceUrl: skillView.sourceUrl,
              ref: skillView.ref || 'main',
              skillPath: lock[skillView.name]?.skillPath,
              sourceType: skillView.sourceType || 'github'
            })
          }

          if (tasks.length > 0) {
            // 执行批量更新
            const batchResult = await this.executor.executeBatch(tasks, config)

            // 记录历史
            const historyStore = createHistoryStore(
              this.options.getConfig,
              this.options.saveConfig
            )

            for (const success of batchResult.successes) {
              historyStore.append({
                skillName: success.skillName,
                agent: success.agent,
                timestamp: new Date().toISOString(),
                previousHash: success.previousHash || '',
                newHash: success.newHash || '',
                success: true
              })
            }

            for (const failure of batchResult.failures) {
              historyStore.append({
                skillName: failure.skillName,
                agent: failure.agent,
                timestamp: new Date().toISOString(),
                previousHash: failure.previousHash || '',
                newHash: '',
                success: false
              })
            }

            // 发送批量更新完成事件
            this.sendBatchUpdateCompleted({
              successes: batchResult.successes.map((s) => ({
                agent: s.agent,
                skillName: s.skillName,
                previousHash: s.previousHash || '',
                newHash: s.newHash || ''
              })),
              failures: batchResult.failures.map((f) => ({
                agent: f.agent,
                skillName: f.skillName,
                reason: f.error || '未知错误'
              })),
              timestamp: batchResult.timestamp
            })

            // 缓存最近一次批量更新结果
            this.lastBatchResult = batchResult
          }
        } finally {
          this.updating = false
        }
      }
    } catch {
      // 整个 cycle 出错不崩溃，等下一次
    } finally {
      this.checking = false
      this.scheduleNext()
    }
  }

  /**
   * 调度下一次检测周期。
   */
  private scheduleNext(intervalMinutes?: number): void {
    const config = this.options.getConfig()
    const minutes = intervalMinutes ?? config.checkIntervalMinutes ?? DEFAULT_INTERVAL_MINUTES
    const ms = minutes * 60 * 1000

    this.timer = setTimeout(() => {
      void this.runCycle()
    }, ms)
  }

  /**
   * 校验间隔值是否有效。
   */
  private isValidInterval(value: number): boolean {
    return (
      Number.isInteger(value) &&
      value >= MIN_INTERVAL_MINUTES &&
      value <= MAX_INTERVAL_MINUTES
    )
  }

  // --- Persistence ---

  /**
   * 将单个检测结果持久化到 skillConfigs。
   * 打开 App 时 listSkillsState 会从这里读取缓存状态。
   */
  private persistCheckResult(result: CheckResult): void {
    const config = this.options.getConfig()
    const key = getSkillConfigKey(result.agent, result.skillName)
    const existing = config.skillConfigs[key]
    const now = Date.now()
    config.skillConfigs[key] = {
      agent: result.agent,
      skillName: result.skillName,
      autoUpdate: existing?.autoUpdate,
      lastCheckStatus: result.status,
      lastCheckReason: result.reason,
      lastCheckedAt: result.checkedAt,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    this.options.saveConfig(config)
  }

  // --- IPC Push Event Helpers ---

  private sendStatusChanged(event: StatusChangedEvent): void {
    const win = this.options.getWindow()
    if (win?.webContents) {
      win.webContents.send('skills:update-status-changed', event)
    }
  }

  private sendBatchUpdateCompleted(event: BatchUpdateCompletedEvent): void {
    const win = this.options.getWindow()
    if (win?.webContents) {
      win.webContents.send('skills:batch-update-completed', event)
    }
  }

  private sendCheckProgress(event: CheckProgressEvent): void {
    const win = this.options.getWindow()
    if (win?.webContents) {
      win.webContents.send('skills:check-progress', event)
    }
  }
}
