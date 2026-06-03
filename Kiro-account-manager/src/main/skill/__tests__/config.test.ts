import { describe, it, expect } from 'vitest'
import {
  validateCheckInterval,
  batchSetAutoUpdate,
  normalizeSkillsManagerConfig
} from '../config'
import type { SkillsManagerConfig } from '../types'

describe('validateCheckInterval', () => {
  it('should accept valid integer within range', () => {
    expect(validateCheckInterval(30)).toEqual({ valid: true })
    expect(validateCheckInterval(240)).toEqual({ valid: true })
    expect(validateCheckInterval(1440)).toEqual({ valid: true })
    expect(validateCheckInterval(100)).toEqual({ valid: true })
  })

  it('should reject values below 30', () => {
    const result = validateCheckInterval(29)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('检测间隔必须为 30-1440 之间的整数')
  })

  it('should reject values above 1440', () => {
    const result = validateCheckInterval(1441)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('检测间隔必须为 30-1440 之间的整数')
  })

  it('should reject non-integer numbers', () => {
    expect(validateCheckInterval(30.5).valid).toBe(false)
    expect(validateCheckInterval(100.1).valid).toBe(false)
  })

  it('should reject non-number types', () => {
    expect(validateCheckInterval('240').valid).toBe(false)
    expect(validateCheckInterval(null).valid).toBe(false)
    expect(validateCheckInterval(undefined).valid).toBe(false)
    expect(validateCheckInterval({}).valid).toBe(false)
    expect(validateCheckInterval(NaN).valid).toBe(false)
  })
})

describe('batchSetAutoUpdate', () => {
  function makeConfig(overrides?: Partial<SkillsManagerConfig>): SkillsManagerConfig {
    return {
      version: 1,
      defaultAutoUpdate: true,
      defaultInstallMode: 'symlink',
      skillConfigs: {},
      ...overrides
    }
  }

  it('should update existing skill configs', () => {
    const config = makeConfig({
      skillConfigs: {
        'claude:my-skill': {
          agent: 'claude',
          skillName: 'my-skill',
          autoUpdate: false,
          createdAt: 1000,
          updatedAt: 1000
        }
      }
    })

    const result = batchSetAutoUpdate(['claude:my-skill'], true, config)
    expect(result.skillConfigs['claude:my-skill'].autoUpdate).toBe(true)
    expect(result.skillConfigs['claude:my-skill'].updatedAt).toBeGreaterThan(1000)
    // createdAt should be preserved
    expect(result.skillConfigs['claude:my-skill'].createdAt).toBe(1000)
  })

  it('should create new skill configs for non-existing keys', () => {
    const config = makeConfig()
    const result = batchSetAutoUpdate(['claude:new-skill'], true, config)
    expect(result.skillConfigs['claude:new-skill']).toBeDefined()
    expect(result.skillConfigs['claude:new-skill'].agent).toBe('claude')
    expect(result.skillConfigs['claude:new-skill'].skillName).toBe('new-skill')
    expect(result.skillConfigs['claude:new-skill'].autoUpdate).toBe(true)
  })

  it('should not mutate the original config', () => {
    const config = makeConfig({
      skillConfigs: {
        'claude:my-skill': {
          agent: 'claude',
          skillName: 'my-skill',
          autoUpdate: false,
          createdAt: 1000,
          updatedAt: 1000
        }
      }
    })

    const originalConfigs = JSON.parse(JSON.stringify(config.skillConfigs))
    batchSetAutoUpdate(['claude:my-skill'], true, config)
    expect(config.skillConfigs).toEqual(originalConfigs)
  })

  it('should rollback all changes if any key is invalid (no colon separator)', () => {
    const config = makeConfig({
      skillConfigs: {
        'claude:existing': {
          agent: 'claude',
          skillName: 'existing',
          autoUpdate: false,
          createdAt: 1000,
          updatedAt: 1000
        }
      }
    })

    // 'invalid-key' has no colon → should trigger rollback
    const result = batchSetAutoUpdate(['claude:existing', 'invalid-key'], true, config)
    // Should return original config unchanged
    expect(result).toBe(config)
  })

  it('should handle multiple keys atomically', () => {
    const config = makeConfig({
      skillConfigs: {
        'claude:skill-a': {
          agent: 'claude',
          skillName: 'skill-a',
          autoUpdate: true,
          createdAt: 1000,
          updatedAt: 1000
        },
        'kiro:skill-b': {
          agent: 'kiro',
          skillName: 'skill-b',
          autoUpdate: true,
          createdAt: 2000,
          updatedAt: 2000
        }
      }
    })

    const result = batchSetAutoUpdate(['claude:skill-a', 'kiro:skill-b'], false, config)
    expect(result.skillConfigs['claude:skill-a'].autoUpdate).toBe(false)
    expect(result.skillConfigs['kiro:skill-b'].autoUpdate).toBe(false)
  })

  it('should not modify unselected skill configs', () => {
    const config = makeConfig({
      skillConfigs: {
        'claude:selected': {
          agent: 'claude',
          skillName: 'selected',
          autoUpdate: false,
          createdAt: 1000,
          updatedAt: 1000
        },
        'claude:unselected': {
          agent: 'claude',
          skillName: 'unselected',
          autoUpdate: true,
          createdAt: 2000,
          updatedAt: 2000
        }
      }
    })

    const result = batchSetAutoUpdate(['claude:selected'], true, config)
    expect(result.skillConfigs['claude:unselected'].autoUpdate).toBe(true)
    expect(result.skillConfigs['claude:unselected'].updatedAt).toBe(2000)
  })

  it('should handle empty skillKeys array', () => {
    const config = makeConfig({
      skillConfigs: {
        'claude:skill': {
          agent: 'claude',
          skillName: 'skill',
          autoUpdate: false,
          createdAt: 1000,
          updatedAt: 1000
        }
      }
    })

    const result = batchSetAutoUpdate([], true, config)
    expect(result.skillConfigs['claude:skill'].autoUpdate).toBe(false)
  })
})

describe('normalizeSkillsManagerConfig - checkIntervalMinutes', () => {
  it('should default to 240 when field is missing', () => {
    const result = normalizeSkillsManagerConfig({})
    expect(result.checkIntervalMinutes).toBe(240)
  })

  it('should default to 240 when value is invalid (below range)', () => {
    const result = normalizeSkillsManagerConfig({ checkIntervalMinutes: 10 })
    expect(result.checkIntervalMinutes).toBe(240)
  })

  it('should default to 240 when value is invalid (above range)', () => {
    const result = normalizeSkillsManagerConfig({ checkIntervalMinutes: 2000 })
    expect(result.checkIntervalMinutes).toBe(240)
  })

  it('should default to 240 when value is not an integer', () => {
    const result = normalizeSkillsManagerConfig({ checkIntervalMinutes: 100.5 })
    expect(result.checkIntervalMinutes).toBe(240)
  })

  it('should keep valid value as-is', () => {
    const result = normalizeSkillsManagerConfig({ checkIntervalMinutes: 60 })
    expect(result.checkIntervalMinutes).toBe(60)
  })

  it('should keep boundary values (30 and 1440)', () => {
    expect(normalizeSkillsManagerConfig({ checkIntervalMinutes: 30 }).checkIntervalMinutes).toBe(30)
    expect(normalizeSkillsManagerConfig({ checkIntervalMinutes: 1440 }).checkIntervalMinutes).toBe(1440)
  })
})

describe('normalizeSkillsManagerConfig - updateHistory', () => {
  it('should default to empty array when field is missing', () => {
    const result = normalizeSkillsManagerConfig({})
    expect(result.updateHistory).toEqual([])
  })

  it('should default to empty array when value is not an array', () => {
    const result = normalizeSkillsManagerConfig({ updateHistory: 'not-array' as unknown })
    expect(result.updateHistory).toEqual([])
  })

  it('should keep existing array', () => {
    const history = [
      { skillName: 'test', agent: 'claude', timestamp: '2024-01-01T00:00:00Z', previousHash: 'a', newHash: 'b', success: true }
    ]
    const result = normalizeSkillsManagerConfig({ updateHistory: history })
    expect(result.updateHistory).toEqual(history)
  })
})

describe('normalizeSkillsManagerConfig - defaultAutoUpdate isolation', () => {
  it('changing defaultAutoUpdate should not affect existing skillConfigs', () => {
    const existingConfigs = {
      'claude:skill-a': {
        agent: 'claude',
        skillName: 'skill-a',
        autoUpdate: true,
        createdAt: 1000,
        updatedAt: 1000
      }
    }

    const resultTrue = normalizeSkillsManagerConfig({
      defaultAutoUpdate: true,
      skillConfigs: existingConfigs
    })
    const resultFalse = normalizeSkillsManagerConfig({
      defaultAutoUpdate: false,
      skillConfigs: existingConfigs
    })

    // skillConfigs should be identical regardless of defaultAutoUpdate
    expect(resultTrue.skillConfigs).toEqual(resultFalse.skillConfigs)
    expect(resultTrue.skillConfigs['claude:skill-a'].autoUpdate).toBe(true)
  })
})
