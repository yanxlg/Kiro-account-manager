import type { SkillsManagerConfig, SkillManagerSkillConfig } from './types'

export function defaultSkillsManagerConfig(): SkillsManagerConfig {
  return { version: 1, defaultAutoUpdate: true, defaultInstallMode: 'symlink', skillConfigs: {} }
}

export function normalizeSkillName(name: string): string {
  return (
    (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 255) || 'unnamed-skill'
  )
}

export function normalizeSkillsManagerConfig(value: unknown): SkillsManagerConfig {
  const input = value && typeof value === 'object' ? (value as Partial<SkillsManagerConfig>) : {}
  const rawInterval = (input as Record<string, unknown>).checkIntervalMinutes
  const checkIntervalMinutes =
    typeof rawInterval === 'number' &&
    Number.isInteger(rawInterval) &&
    rawInterval >= 30 &&
    rawInterval <= 1440
      ? rawInterval
      : 240
  return {
    version: 1,
    defaultAutoUpdate: input.defaultAutoUpdate === true,
    defaultInstallMode: input.defaultInstallMode === 'copy' ? 'copy' : 'symlink',
    gitlabToken: typeof input.gitlabToken === 'string' ? input.gitlabToken : undefined,
    githubToken: typeof input.githubToken === 'string' ? input.githubToken : undefined,
    checkIntervalMinutes,
    skillConfigs:
      input.skillConfigs && typeof input.skillConfigs === 'object' ? input.skillConfigs : {},
    updateHistory: Array.isArray(input.updateHistory) ? input.updateHistory : [],
    lastSelectedAgent: typeof input.lastSelectedAgent === 'string' ? input.lastSelectedAgent : undefined
  }
}

export function getSkillConfigKey(agent: string, skillName: string): string {
  return `${agent}:${normalizeSkillName(skillName)}`
}

/**
 * 校验 checkInterval 值：必须为 30-1440 之间的整数
 */
export function validateCheckInterval(value: unknown): { valid: boolean; error?: string } {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 30 &&
    value <= 1440
  ) {
    return { valid: true }
  }
  return { valid: false, error: '检测间隔必须为 30-1440 之间的整数' }
}

/**
 * 原子批量设置 autoUpdate。
 * 如果任一 key 处理出现异常则全部回滚，返回原始 config。
 */
export function batchSetAutoUpdate(
  skillKeys: string[],
  enabled: boolean,
  config: SkillsManagerConfig
): SkillsManagerConfig {
  // Deep clone skillConfigs to avoid mutating original
  const updatedConfigs: Record<string, SkillManagerSkillConfig> = JSON.parse(
    JSON.stringify(config.skillConfigs)
  )

  try {
    const now = Date.now()
    for (const key of skillKeys) {
      if (updatedConfigs[key]) {
        // Key exists: update autoUpdate and updatedAt
        updatedConfigs[key].autoUpdate = enabled
        updatedConfigs[key].updatedAt = now
      } else {
        // Key doesn't exist: create new entry, parse agent and skillName from key
        const separatorIndex = key.indexOf(':')
        if (separatorIndex === -1) {
          throw new Error(`Invalid skill key format: ${key}`)
        }
        const agent = key.slice(0, separatorIndex)
        const skillName = key.slice(separatorIndex + 1)
        updatedConfigs[key] = {
          agent,
          skillName,
          autoUpdate: enabled,
          createdAt: now,
          updatedAt: now
        }
      }
    }
  } catch {
    // Rollback: return original config unchanged
    return config
  }

  return {
    ...config,
    skillConfigs: updatedConfigs
  }
}
