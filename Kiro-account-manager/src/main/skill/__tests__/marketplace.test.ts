import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { normalizeGitUrl, MarketplaceDetector, MarketplaceManager } from '../marketplace'
import type { MarketplaceInfo } from '../types'
import type { MarketplaceStoreLike } from '../marketplace'

// Mock fs/promises and os
vi.mock('fs/promises')
vi.mock('os', () => ({
  homedir: () => '/mock-home'
}))

import { readFile } from 'fs/promises'

const mockedReadFile = vi.mocked(readFile)

describe('normalizeGitUrl', () => {
  it('should normalize HTTPS URL', () => {
    expect(normalizeGitUrl('https://github.com/owner/repo')).toBe('github.com/owner/repo')
  })

  it('should normalize HTTPS URL with .git suffix', () => {
    expect(normalizeGitUrl('https://github.com/owner/repo.git')).toBe('github.com/owner/repo')
  })

  it('should normalize SSH URL', () => {
    expect(normalizeGitUrl('git@github.com:owner/repo.git')).toBe('github.com/owner/repo')
  })

  it('should normalize SSH URL without .git suffix', () => {
    expect(normalizeGitUrl('git@github.com:owner/repo')).toBe('github.com/owner/repo')
  })

  it('should normalize GitHub shorthand', () => {
    expect(normalizeGitUrl('owner/repo')).toBe('github.com/owner/repo')
  })

  it('should treat different formats of same repo as equal', () => {
    const https = normalizeGitUrl('https://github.com/owner/repo')
    const httpsGit = normalizeGitUrl('https://github.com/owner/repo.git')
    const ssh = normalizeGitUrl('git@github.com:owner/repo.git')
    const sshNoGit = normalizeGitUrl('git@github.com:owner/repo')
    const shorthand = normalizeGitUrl('owner/repo')

    expect(https).toBe(httpsGit)
    expect(https).toBe(ssh)
    expect(https).toBe(sshNoGit)
    expect(https).toBe(shorthand)
  })

  it('should handle GitLab SSH URLs', () => {
    expect(normalizeGitUrl('git@gitlab.example.com:group/project.git')).toBe(
      'gitlab.example.com/group/project'
    )
  })

  it('should handle GitLab HTTPS URLs', () => {
    expect(normalizeGitUrl('https://gitlab.example.com/group/project.git')).toBe(
      'gitlab.example.com/group/project'
    )
  })

  it('should return empty string for empty input', () => {
    expect(normalizeGitUrl('')).toBe('')
  })

  it('should trim whitespace', () => {
    expect(normalizeGitUrl('  https://github.com/owner/repo  ')).toBe('github.com/owner/repo')
  })
})

describe('MarketplaceDetector', () => {
  const detector = new MarketplaceDetector()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('detectGitHubSkillsMarketplaces', () => {
    it('should extract unique owner/repo combinations from .skill-lock.json', async () => {
      const lockContent = JSON.stringify({
        version: 3,
        skills: {
          'skill-a': {
            source: 'owner1/repo1',
            sourceType: 'git',
            sourceUrl: 'git@github.com:owner1/repo1.git',
            ref: 'main',
            skillPath: 'skills/skill-a/SKILL.md',
            skillFolderHash: 'abc123',
            installedAt: '2024-01-01T00:00:00.000Z'
          },
          'skill-b': {
            source: 'owner2/repo2',
            sourceType: 'git',
            sourceUrl: 'git@github.com:owner2/repo2.git',
            ref: 'main',
            skillPath: 'skills/skill-b/SKILL.md',
            skillFolderHash: 'def456',
            installedAt: '2024-01-02T00:00:00.000Z'
          }
        }
      })
      mockedReadFile.mockResolvedValue(lockContent)

      const result = await detector.detectGitHubSkillsMarketplaces()

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        id: 'github-skills:owner1/repo1',
        name: 'owner1/repo1',
        gitUrl: 'https://github.com/owner1/repo1',
        sourceType: 'github-skills',
        owner: 'owner1',
        repo: 'repo1'
      })
      expect(result[1]).toMatchObject({
        id: 'github-skills:owner2/repo2',
        name: 'owner2/repo2',
        gitUrl: 'https://github.com/owner2/repo2',
        sourceType: 'github-skills',
        owner: 'owner2',
        repo: 'repo2'
      })
    })

    it('should deduplicate owner/repo combinations from multiple skills', async () => {
      const lockContent = JSON.stringify({
        version: 3,
        skills: {
          'skill-a': {
            source: 'owner1/repo1',
            sourceType: 'git',
            ref: 'main'
          },
          'skill-b': {
            source: 'owner1/repo1',
            sourceType: 'git',
            ref: 'main'
          },
          'skill-c': {
            source: 'owner2/repo2',
            sourceType: 'git',
            ref: 'main'
          }
        }
      })
      mockedReadFile.mockResolvedValue(lockContent)

      const result = await detector.detectGitHubSkillsMarketplaces()

      expect(result).toHaveLength(2)
      expect(result.map((m) => m.name)).toEqual(['owner1/repo1', 'owner2/repo2'])
    })

    it('should use sourceUrl to derive gitUrl when available', async () => {
      const lockContent = JSON.stringify({
        version: 3,
        skills: {
          'skill-a': {
            source: 'mygroup/myrepo',
            sourceType: 'git',
            sourceUrl: 'git@gitlab.example.com:mygroup/myrepo.git',
            ref: 'main'
          }
        }
      })
      mockedReadFile.mockResolvedValue(lockContent)

      const result = await detector.detectGitHubSkillsMarketplaces()

      expect(result).toHaveLength(1)
      expect(result[0].gitUrl).toBe('https://gitlab.example.com/mygroup/myrepo')
    })

    it('should return empty array when file does not exist', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockedReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'))

      const result = await detector.detectGitHubSkillsMarketplaces()

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MarketplaceDetector] .skill-lock.json not found'),
        expect.any(String)
      )
      warnSpy.mockRestore()
    })

    it('should return empty array when JSON is invalid', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockedReadFile.mockResolvedValue('not valid json {{{')

      const result = await detector.detectGitHubSkillsMarketplaces()

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MarketplaceDetector] .skill-lock.json parse failed'),
        expect.any(String)
      )
      warnSpy.mockRestore()
    })

    it('should return empty array when skills object is missing', async () => {
      mockedReadFile.mockResolvedValue(JSON.stringify({ version: 3 }))

      const result = await detector.detectGitHubSkillsMarketplaces()

      expect(result).toEqual([])
    })

    it('should skip entries without source field', async () => {
      const lockContent = JSON.stringify({
        version: 3,
        skills: {
          'skill-a': {
            source: 'owner1/repo1',
            sourceType: 'git'
          },
          'skill-b': {
            sourceType: 'git'
            // no source field
          }
        }
      })
      mockedReadFile.mockResolvedValue(lockContent)

      const result = await detector.detectGitHubSkillsMarketplaces()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('owner1/repo1')
    })

    it('should default to github.com when sourceUrl is not available', async () => {
      const lockContent = JSON.stringify({
        version: 3,
        skills: {
          'skill-a': {
            source: 'owner1/repo1',
            sourceType: 'git'
            // no sourceUrl
          }
        }
      })
      mockedReadFile.mockResolvedValue(lockContent)

      const result = await detector.detectGitHubSkillsMarketplaces()

      expect(result).toHaveLength(1)
      expect(result[0].gitUrl).toBe('https://github.com/owner1/repo1')
    })

    it('should read from correct file path', async () => {
      mockedReadFile.mockResolvedValue(JSON.stringify({ version: 3, skills: {} }))

      await detector.detectGitHubSkillsMarketplaces()

      expect(mockedReadFile).toHaveBeenCalledWith(
        '/mock-home/.agents/.skill-lock.json',
        'utf-8'
      )
    })
  })

  describe('mergeMarketplaces', () => {
    it('should merge multiple sources', () => {
      const source1: MarketplaceInfo[] = [
        { id: '1', name: 'Market A', gitUrl: 'https://github.com/owner/repo-a', sourceType: 'claude-plugin' }
      ]
      const source2: MarketplaceInfo[] = [
        { id: '2', name: 'Market B', gitUrl: 'https://github.com/owner/repo-b', sourceType: 'github-skills' }
      ]

      const result = detector.mergeMarketplaces(source1, source2)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Market A')
      expect(result[1].name).toBe('Market B')
    })

    it('should deduplicate by normalized git URL', () => {
      const source1: MarketplaceInfo[] = [
        { id: '1', name: 'Market A (HTTPS)', gitUrl: 'https://github.com/owner/repo', sourceType: 'claude-plugin' }
      ]
      const source2: MarketplaceInfo[] = [
        { id: '2', name: 'Market A (SSH)', gitUrl: 'git@github.com:owner/repo.git', sourceType: 'github-skills' }
      ]

      const result = detector.mergeMarketplaces(source1, source2)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Market A (HTTPS)') // 保留第一次出现的
    })

    it('should deduplicate shorthand against full URL', () => {
      const source1: MarketplaceInfo[] = [
        { id: '1', name: 'Full', gitUrl: 'https://github.com/owner/repo', sourceType: 'claude-plugin' }
      ]
      const source2: MarketplaceInfo[] = [
        { id: '2', name: 'Short', gitUrl: 'owner/repo', sourceType: 'custom' }
      ]

      const result = detector.mergeMarketplaces(source1, source2)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Full')
    })

    it('should return empty array for empty inputs', () => {
      const result = detector.mergeMarketplaces([], [], [])
      expect(result).toHaveLength(0)
    })

    it('should handle single source', () => {
      const source: MarketplaceInfo[] = [
        { id: '1', name: 'A', gitUrl: 'https://github.com/a/b', sourceType: 'custom' },
        { id: '2', name: 'B', gitUrl: 'https://github.com/c/d', sourceType: 'custom' }
      ]

      const result = detector.mergeMarketplaces(source)
      expect(result).toHaveLength(2)
    })
  })

  describe('groupByType', () => {
    it('should group markets by sourceType', () => {
      const markets: MarketplaceInfo[] = [
        { id: '1', name: 'A', gitUrl: 'https://github.com/a/a', sourceType: 'claude-plugin' },
        { id: '2', name: 'B', gitUrl: 'https://github.com/b/b', sourceType: 'github-skills' },
        { id: '3', name: 'C', gitUrl: 'https://github.com/c/c', sourceType: 'custom' },
        { id: '4', name: 'D', gitUrl: 'https://github.com/d/d', sourceType: 'claude-plugin' }
      ]

      const groups = detector.groupByType(markets)
      expect(groups['claude-plugin']).toHaveLength(2)
      expect(groups['github-skills']).toHaveLength(1)
      expect(groups['custom']).toHaveLength(1)
    })

    it('should return empty arrays for missing types', () => {
      const markets: MarketplaceInfo[] = [
        { id: '1', name: 'A', gitUrl: 'https://github.com/a/a', sourceType: 'custom' }
      ]

      const groups = detector.groupByType(markets)
      expect(groups['claude-plugin']).toHaveLength(0)
      expect(groups['github-skills']).toHaveLength(0)
      expect(groups['custom']).toHaveLength(1)
    })

    it('should handle empty input', () => {
      const groups = detector.groupByType([])
      expect(groups['claude-plugin']).toHaveLength(0)
      expect(groups['github-skills']).toHaveLength(0)
      expect(groups['custom']).toHaveLength(0)
    })

    it('sum of groups should equal original list length', () => {
      const markets: MarketplaceInfo[] = [
        { id: '1', name: 'A', gitUrl: 'u1', sourceType: 'claude-plugin' },
        { id: '2', name: 'B', gitUrl: 'u2', sourceType: 'github-skills' },
        { id: '3', name: 'C', gitUrl: 'u3', sourceType: 'custom' }
      ]

      const groups = detector.groupByType(markets)
      const totalGrouped =
        groups['claude-plugin'].length +
        groups['github-skills'].length +
        groups['custom'].length
      expect(totalGrouped).toBe(markets.length)
    })
  })
})


describe('MarketplaceDetector.detectClaudePluginMarketplaces', () => {
  const detector = new MarketplaceDetector()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should parse a valid known_marketplaces.json with github source', async () => {
    const mockData = {
      'my-marketplace': {
        source: {
          source: 'github',
          repo: 'acme/skills-repo',
          url: '',
          ref: 'main'
        },
        installLocation: '~/.claude/plugins/cache/my-marketplace'
      }
    }
    mockedReadFile.mockResolvedValue(JSON.stringify(mockData))

    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'claude-plugin:my-marketplace',
      name: 'my-marketplace',
      gitUrl: 'https://github.com/acme/skills-repo',
      sourceType: 'claude-plugin',
      owner: 'acme',
      repo: 'skills-repo',
      ref: 'main'
    })
  })

  it('should parse a valid entry with SSH url in source.url', async () => {
    const mockData = {
      'gitlab-market': {
        source: {
          source: 'git',
          repo: 'group/project',
          url: 'git@gitlab.example.com:group/project.git',
          ref: 'develop'
        },
        installLocation: '~/.claude/plugins/cache/gitlab-market'
      }
    }
    mockedReadFile.mockResolvedValue(JSON.stringify(mockData))

    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'claude-plugin:gitlab-market',
      name: 'gitlab-market',
      gitUrl: 'git@gitlab.example.com:group/project.git',
      sourceType: 'claude-plugin',
      owner: 'group',
      repo: 'project',
      ref: 'develop'
    })
  })

  it('should parse multiple marketplace entries', async () => {
    const mockData = {
      'market-a': {
        source: {
          source: 'github',
          repo: 'owner-a/repo-a',
          url: '',
          ref: 'main'
        },
        installLocation: '~/.claude/plugins/cache/market-a'
      },
      'market-b': {
        source: {
          source: 'git',
          repo: 'owner-b/repo-b',
          url: 'git@github.com:owner-b/repo-b.git',
          ref: 'v2'
        },
        installLocation: '~/.claude/plugins/cache/market-b'
      }
    }
    mockedReadFile.mockResolvedValue(JSON.stringify(mockData))

    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('market-a')
    expect(result[1].name).toBe('market-b')
    expect(result.every((m) => m.sourceType === 'claude-plugin')).toBe(true)
  })

  it('should return empty array when file does not exist', async () => {
    const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    mockedReadFile.mockRejectedValue(err)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('should return empty array when file has invalid JSON', async () => {
    mockedReadFile.mockResolvedValue('not valid json {{{')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('should skip entries without a source object', async () => {
    const mockData = {
      'valid-market': {
        source: {
          source: 'github',
          repo: 'owner/repo',
          url: '',
          ref: 'main'
        },
        installLocation: 'some/path'
      },
      'invalid-market': {
        installLocation: 'some/other/path'
      }
    }
    mockedReadFile.mockResolvedValue(JSON.stringify(mockData))

    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('valid-market')
  })

  it('should skip entries where gitUrl cannot be derived', async () => {
    const mockData = {
      'no-url-market': {
        source: {
          source: 'unknown',
          repo: '',
          url: '',
          ref: ''
        },
        installLocation: 'some/path'
      }
    }
    mockedReadFile.mockResolvedValue(JSON.stringify(mockData))

    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toHaveLength(0)
  })

  it('should prefer source.url over constructing from source.repo', async () => {
    const mockData = {
      'url-pref': {
        source: {
          source: 'github',
          repo: 'owner/repo',
          url: 'git@custom-host.com:different-owner/different-repo.git',
          ref: 'main'
        },
        installLocation: 'path'
      }
    }
    mockedReadFile.mockResolvedValue(JSON.stringify(mockData))

    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toHaveLength(1)
    expect(result[0].gitUrl).toBe('git@custom-host.com:different-owner/different-repo.git')
  })

  it('should return empty array when JSON is an array instead of object', async () => {
    mockedReadFile.mockResolvedValue('[]')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await detector.detectClaudePluginMarketplaces()

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})


describe('MarketplaceManager.addCustomMarketplace', () => {
  let store: MarketplaceStoreLike
  let storeData: Record<string, unknown>
  let manager: MarketplaceManager

  beforeEach(() => {
    storeData = {}
    store = {
      get: (key: string, defaultValue?: unknown) => storeData[key] ?? defaultValue,
      set: (key: string, value: unknown) => { storeData[key] = value }
    }
    manager = new MarketplaceManager(store)
  })

  it('should add a valid HTTPS URL marketplace', async () => {
    const result = await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/my-org/my-skills'
    })

    expect(result.id).toBeDefined()
    expect(result.name).toBe('my-skills')
    expect(result.gitUrl).toBe('https://github.com/my-org/my-skills')
    expect(result.sourceType).toBe('custom')
    expect(result.owner).toBe('my-org')
    expect(result.repo).toBe('my-skills')
    expect(result.host).toBe('github.com')
    expect(result.createdAt).toBeDefined()
  })

  it('should add a valid SSH URL marketplace', async () => {
    const result = await manager.addCustomMarketplace({
      gitUrl: 'git@github.com:team/skill-repo.git'
    })

    expect(result.name).toBe('skill-repo')
    expect(result.owner).toBe('team')
    expect(result.repo).toBe('skill-repo')
    expect(result.host).toBe('github.com')
    expect(result.sourceType).toBe('custom')
  })

  it('should add a GitHub shorthand URL', async () => {
    const result = await manager.addCustomMarketplace({
      gitUrl: 'owner/repo'
    })

    expect(result.name).toBe('repo')
    expect(result.owner).toBe('owner')
    expect(result.repo).toBe('repo')
    expect(result.host).toBe('github.com')
  })

  it('should use provided name instead of default repo name', async () => {
    const result = await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/org/repo',
      name: 'My Custom Market'
    })

    expect(result.name).toBe('My Custom Market')
  })

  it('should use repo name as default when name is not provided', async () => {
    const result = await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/org/awesome-skills'
    })

    expect(result.name).toBe('awesome-skills')
  })

  it('should throw "Invalid git URL format" for invalid URLs', async () => {
    await expect(
      manager.addCustomMarketplace({ gitUrl: 'not-a-valid-url' })
    ).rejects.toThrow('Invalid git URL format')
  })

  it('should throw "Invalid git URL format" for empty string', async () => {
    await expect(
      manager.addCustomMarketplace({ gitUrl: '' })
    ).rejects.toThrow('Invalid git URL format')
  })

  it('should throw "Marketplace already exists" when URL is duplicate (same format)', async () => {
    await manager.addCustomMarketplace({ gitUrl: 'https://github.com/owner/repo' })

    await expect(
      manager.addCustomMarketplace({ gitUrl: 'https://github.com/owner/repo' })
    ).rejects.toThrow('Marketplace already exists')
  })

  it('should throw "Marketplace already exists" when URL is duplicate (different format)', async () => {
    await manager.addCustomMarketplace({ gitUrl: 'https://github.com/owner/repo' })

    // SSH format of same repo
    await expect(
      manager.addCustomMarketplace({ gitUrl: 'git@github.com:owner/repo.git' })
    ).rejects.toThrow('Marketplace already exists')
  })

  it('should throw "Marketplace already exists" for shorthand duplicate', async () => {
    await manager.addCustomMarketplace({ gitUrl: 'https://github.com/owner/repo' })

    await expect(
      manager.addCustomMarketplace({ gitUrl: 'owner/repo' })
    ).rejects.toThrow('Marketplace already exists')
  })

  it('should persist marketplace to electron-store', async () => {
    await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/org/skills',
      name: 'My Skills'
    })

    const saved = storeData['marketplaceConfig'] as { customMarketplaces: unknown[] }
    expect(saved).toBeDefined()
    expect(saved.customMarketplaces).toHaveLength(1)
    expect(saved.customMarketplaces[0]).toMatchObject({
      name: 'My Skills',
      gitUrl: 'https://github.com/org/skills',
      sourceType: 'custom',
      owner: 'org',
      repo: 'skills'
    })
  })

  it('should append to existing custom marketplaces in store', async () => {
    // Pre-populate store with an existing marketplace
    storeData['marketplaceConfig'] = {
      customMarketplaces: [{
        id: 'existing-id',
        name: 'Existing',
        gitUrl: 'https://github.com/existing/market',
        sourceType: 'custom',
        owner: 'existing',
        repo: 'market',
        host: 'github.com',
        createdAt: '2024-01-01T00:00:00.000Z'
      }]
    }

    await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/new/skills'
    })

    const saved = storeData['marketplaceConfig'] as { customMarketplaces: unknown[] }
    expect(saved.customMarketplaces).toHaveLength(2)
  })

  it('should set projectPath for GitLab URLs', async () => {
    const result = await manager.addCustomMarketplace({
      gitUrl: 'git@gitlab.example.com:group/subgroup/project.git'
    })

    expect(result.host).toBe('gitlab.example.com')
    expect(result.projectPath).toBe('group/subgroup/project')
  })

  it('should not set projectPath for GitHub URLs', async () => {
    const result = await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/owner/repo'
    })

    expect(result.projectPath).toBeUndefined()
  })

  it('should generate a unique UUID for each marketplace', async () => {
    const result1 = await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/org/repo1'
    })
    const result2 = await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/org/repo2'
    })

    expect(result1.id).not.toBe(result2.id)
    // UUID format check
    expect(result1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('should set createdAt to a valid ISO 8601 date string', async () => {
    const before = new Date().toISOString()
    const result = await manager.addCustomMarketplace({
      gitUrl: 'https://github.com/org/repo'
    })
    const after = new Date().toISOString()

    expect(result.createdAt).toBeDefined()
    expect(new Date(result.createdAt!).toISOString()).toBe(result.createdAt)
    expect(result.createdAt! >= before).toBe(true)
    expect(result.createdAt! <= after).toBe(true)
  })
})

describe('MarketplaceDetector.loadCustomMarketplaces', () => {
  it('should return empty array when no store is provided', () => {
    const detector = new MarketplaceDetector()
    const result = detector.loadCustomMarketplaces()
    expect(result).toEqual([])
  })

  it('should return empty array when store has no marketplaceConfig key', () => {
    const mockStore: MarketplaceStoreLike = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn()
    }
    const detector = new MarketplaceDetector(mockStore)
    const result = detector.loadCustomMarketplaces()
    expect(result).toEqual([])
  })

  it('should return empty array when customMarketplaces is not an array', () => {
    const mockStore: MarketplaceStoreLike = {
      get: vi.fn().mockReturnValue({ customMarketplaces: 'invalid' }),
      set: vi.fn()
    }
    const detector = new MarketplaceDetector(mockStore)
    const result = detector.loadCustomMarketplaces()
    expect(result).toEqual([])
  })

  it('should convert CustomMarketplaceRecord[] to MarketplaceInfo[]', () => {
    const mockStore: MarketplaceStoreLike = {
      get: vi.fn().mockReturnValue({
        customMarketplaces: [
          {
            id: 'custom-1',
            name: 'My Market',
            gitUrl: 'https://github.com/owner/repo',
            sourceType: 'custom',
            owner: 'owner',
            repo: 'repo',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      }),
      set: vi.fn()
    }
    const detector = new MarketplaceDetector(mockStore)
    const result = detector.loadCustomMarketplaces()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'custom-1',
      name: 'My Market',
      gitUrl: 'https://github.com/owner/repo',
      sourceType: 'custom',
      owner: 'owner',
      repo: 'repo',
      ref: undefined,
      host: undefined,
      projectPath: undefined,
      createdAt: '2024-01-01T00:00:00.000Z'
    })
  })

  it('should convert multiple records', () => {
    const mockStore: MarketplaceStoreLike = {
      get: vi.fn().mockReturnValue({
        customMarketplaces: [
          {
            id: 'c1',
            name: 'Market A',
            gitUrl: 'https://github.com/a/a',
            sourceType: 'custom',
            createdAt: '2024-01-01T00:00:00.000Z'
          },
          {
            id: 'c2',
            name: 'Market B',
            gitUrl: 'git@gitlab.com:b/b.git',
            sourceType: 'custom',
            owner: 'b',
            repo: 'b',
            host: 'gitlab.com',
            projectPath: 'b/b',
            createdAt: '2024-02-01T00:00:00.000Z'
          }
        ]
      }),
      set: vi.fn()
    }
    const detector = new MarketplaceDetector(mockStore)
    const result = detector.loadCustomMarketplaces()

    expect(result).toHaveLength(2)
    expect(result[0].sourceType).toBe('custom')
    expect(result[1].sourceType).toBe('custom')
    expect(result[0].name).toBe('Market A')
    expect(result[1].name).toBe('Market B')
    expect(result[1].host).toBe('gitlab.com')
  })

  it('should skip records missing required fields (id, name, gitUrl)', () => {
    const mockStore: MarketplaceStoreLike = {
      get: vi.fn().mockReturnValue({
        customMarketplaces: [
          { id: 'c1', name: 'Valid', gitUrl: 'https://github.com/a/b', sourceType: 'custom', createdAt: '2024-01-01T00:00:00.000Z' },
          { id: '', name: 'No ID', gitUrl: 'https://github.com/c/d', sourceType: 'custom', createdAt: '2024-01-01T00:00:00.000Z' },
          { id: 'c3', name: '', gitUrl: 'https://github.com/e/f', sourceType: 'custom', createdAt: '2024-01-01T00:00:00.000Z' },
          { id: 'c4', name: 'No URL', gitUrl: '', sourceType: 'custom', createdAt: '2024-01-01T00:00:00.000Z' },
          null,
          undefined
        ]
      }),
      set: vi.fn()
    }
    const detector = new MarketplaceDetector(mockStore)
    const result = detector.loadCustomMarketplaces()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Valid')
  })

  it('should return empty array and log warning when store.get throws', () => {
    const mockStore: MarketplaceStoreLike = {
      get: vi.fn().mockImplementation(() => { throw new Error('store corrupted') }),
      set: vi.fn()
    }
    const detector = new MarketplaceDetector(mockStore)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = detector.loadCustomMarketplaces()

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      '[MarketplaceDetector] Failed to load custom marketplaces from store:',
      'store corrupted'
    )
    warnSpy.mockRestore()
  })

  it('should preserve optional fields like ref, host, and projectPath', () => {
    const mockStore: MarketplaceStoreLike = {
      get: vi.fn().mockReturnValue({
        customMarketplaces: [
          {
            id: 'gl-1',
            name: 'GitLab Market',
            gitUrl: 'git@gitlab.example.com:team/project.git',
            sourceType: 'custom',
            owner: 'team',
            repo: 'project',
            ref: 'develop',
            host: 'gitlab.example.com',
            projectPath: 'team/project',
            createdAt: '2024-03-15T12:00:00.000Z'
          }
        ]
      }),
      set: vi.fn()
    }
    const detector = new MarketplaceDetector(mockStore)
    const result = detector.loadCustomMarketplaces()

    expect(result).toHaveLength(1)
    expect(result[0].ref).toBe('develop')
    expect(result[0].host).toBe('gitlab.example.com')
    expect(result[0].projectPath).toBe('team/project')
    expect(result[0].createdAt).toBe('2024-03-15T12:00:00.000Z')
  })
})

// Mock the lock module for removeCustomMarketplace tests
vi.mock('../lock', () => ({
  readGlobalLock: vi.fn().mockResolvedValue({})
}))

import { readGlobalLock } from '../lock'
const mockedReadGlobalLock = vi.mocked(readGlobalLock)

describe('MarketplaceManager.removeCustomMarketplace', () => {
  let store: MarketplaceStoreLike
  let storeData: Record<string, unknown>
  let manager: MarketplaceManager

  beforeEach(() => {
    storeData = {}
    store = {
      get: (key: string, defaultValue?: unknown) => storeData[key] ?? defaultValue,
      set: (key: string, value: unknown) => { storeData[key] = value }
    }
    manager = new MarketplaceManager(store)
    mockedReadGlobalLock.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return error when marketplace is not found', async () => {
    storeData['marketplaceConfig'] = { customMarketplaces: [] }

    const result = await manager.removeCustomMarketplace('non-existent-id')

    expect(result).toEqual({ success: false, error: 'Marketplace not found' })
  })

  it('should successfully remove a marketplace with no installed skills', async () => {
    const marketId = 'test-market-id'
    storeData['marketplaceConfig'] = {
      customMarketplaces: [{
        id: marketId,
        name: 'Test Market',
        gitUrl: 'https://github.com/test/skills',
        sourceType: 'custom',
        owner: 'test',
        repo: 'skills',
        host: 'github.com',
        createdAt: '2024-01-01T00:00:00.000Z'
      }]
    }

    mockedReadGlobalLock.mockResolvedValue({})

    const result = await manager.removeCustomMarketplace(marketId)

    expect(result).toEqual({ success: true })
    const saved = storeData['marketplaceConfig'] as { customMarketplaces: unknown[] }
    expect(saved.customMarketplaces).toHaveLength(0)
  })

  it('should block deletion when marketplace has installed skills (source match)', async () => {
    const marketId = 'market-with-skills'
    storeData['marketplaceConfig'] = {
      customMarketplaces: [{
        id: marketId,
        name: 'Active Market',
        gitUrl: 'https://github.com/org/skills-repo',
        sourceType: 'custom',
        owner: 'org',
        repo: 'skills-repo',
        host: 'github.com',
        createdAt: '2024-01-01T00:00:00.000Z'
      }]
    }

    mockedReadGlobalLock.mockResolvedValue({
      'skill-one': {
        source: 'org/skills-repo',
        sourceType: 'git',
        sourceUrl: 'git@github.com:org/skills-repo.git',
        ref: 'main'
      },
      'skill-two': {
        source: 'org/skills-repo',
        sourceType: 'git',
        sourceUrl: 'git@github.com:org/skills-repo.git',
        ref: 'main'
      }
    })

    const result = await manager.removeCustomMarketplace(marketId)

    expect(result.success).toBe(false)
    expect(result.error).toBe('该市场下有 2 个 skill 正在使用，请先卸载后再删除')
  })

  it('should block deletion when marketplace has installed skills (sourceUrl match)', async () => {
    const marketId = 'market-url-match'
    storeData['marketplaceConfig'] = {
      customMarketplaces: [{
        id: marketId,
        name: 'URL Match Market',
        gitUrl: 'https://github.com/team/repo',
        sourceType: 'custom',
        owner: 'team',
        repo: 'repo',
        host: 'github.com',
        createdAt: '2024-01-01T00:00:00.000Z'
      }]
    }

    // Skills using SSH URL format that normalizes to the same repo
    mockedReadGlobalLock.mockResolvedValue({
      'skill-a': {
        source: 'other-owner/other-repo',
        sourceType: 'git',
        sourceUrl: 'git@github.com:team/repo.git',
        ref: 'main'
      }
    })

    const result = await manager.removeCustomMarketplace(marketId)

    expect(result.success).toBe(false)
    expect(result.error).toBe('该市场下有 1 个 skill 正在使用，请先卸载后再删除')
  })

  it('should allow deletion when lock entries belong to a different marketplace', async () => {
    const marketId = 'empty-market'
    storeData['marketplaceConfig'] = {
      customMarketplaces: [{
        id: marketId,
        name: 'Empty Market',
        gitUrl: 'https://github.com/my/empty-repo',
        sourceType: 'custom',
        owner: 'my',
        repo: 'empty-repo',
        host: 'github.com',
        createdAt: '2024-01-01T00:00:00.000Z'
      }]
    }

    // Lock entries belong to a different repo
    mockedReadGlobalLock.mockResolvedValue({
      'skill-x': {
        source: 'other/repo',
        sourceType: 'git',
        sourceUrl: 'git@github.com:other/repo.git',
        ref: 'main'
      }
    })

    const result = await manager.removeCustomMarketplace(marketId)

    expect(result).toEqual({ success: true })
  })

  it('should not remove other marketplaces from store', async () => {
    storeData['marketplaceConfig'] = {
      customMarketplaces: [
        {
          id: 'market-1',
          name: 'Market 1',
          gitUrl: 'https://github.com/org/repo1',
          sourceType: 'custom',
          owner: 'org',
          repo: 'repo1',
          host: 'github.com',
          createdAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'market-2',
          name: 'Market 2',
          gitUrl: 'https://github.com/org/repo2',
          sourceType: 'custom',
          owner: 'org',
          repo: 'repo2',
          host: 'github.com',
          createdAt: '2024-02-01T00:00:00.000Z'
        }
      ]
    }

    mockedReadGlobalLock.mockResolvedValue({})

    const result = await manager.removeCustomMarketplace('market-1')

    expect(result).toEqual({ success: true })
    const saved = storeData['marketplaceConfig'] as { customMarketplaces: { id: string }[] }
    expect(saved.customMarketplaces).toHaveLength(1)
    expect(saved.customMarketplaces[0].id).toBe('market-2')
  })

  it('should return error when store has no marketplaceConfig', async () => {
    // storeData is empty, so get returns defaultValue
    const result = await manager.removeCustomMarketplace('some-id')

    expect(result).toEqual({ success: false, error: 'Marketplace not found' })
  })
})

describe('MarketplaceManager.getInstalledSkillsForMarketplace', () => {
  let manager: MarketplaceManager

  beforeEach(() => {
    manager = new MarketplaceManager(null)
  })

  describe('claude-plugin marketplace', () => {
    it('should match skills where skill.source === marketplace.name', () => {
      const marketplace: MarketplaceInfo = {
        id: 'claude-plugin:my-market',
        name: 'my-market',
        gitUrl: 'https://github.com/owner/repo',
        sourceType: 'claude-plugin'
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'my-market', path: '/p', autoUpdate: false },
        { name: 'skill-b', description: '', agent: 'agent1', source: 'other-market', path: '/p', autoUpdate: false },
        { name: 'skill-c', description: '', agent: 'agent1', source: 'my-market', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('skill-a')
      expect(result[1].name).toBe('skill-c')
    })

    it('should return empty array when no skills match', () => {
      const marketplace: MarketplaceInfo = {
        id: 'claude-plugin:my-market',
        name: 'my-market',
        gitUrl: 'https://github.com/owner/repo',
        sourceType: 'claude-plugin'
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'other', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)
      expect(result).toHaveLength(0)
    })

    it('should not match skills without a source field', () => {
      const marketplace: MarketplaceInfo = {
        id: 'claude-plugin:my-market',
        name: 'my-market',
        gitUrl: 'https://github.com/owner/repo',
        sourceType: 'claude-plugin'
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)
      expect(result).toHaveLength(0)
    })
  })

  describe('github-skills marketplace', () => {
    it('should match skills where skill.source === owner/repo', () => {
      const marketplace: MarketplaceInfo = {
        id: 'github-skills:acme/skills',
        name: 'acme/skills',
        gitUrl: 'https://github.com/acme/skills',
        sourceType: 'github-skills',
        owner: 'acme',
        repo: 'skills'
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'acme/skills', path: '/p', autoUpdate: false },
        { name: 'skill-b', description: '', agent: 'agent1', source: 'other/repo', path: '/p', autoUpdate: false },
        { name: 'skill-c', description: '', agent: 'agent1', source: 'acme/skills', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('skill-a')
      expect(result[1].name).toBe('skill-c')
    })

    it('should return empty array when marketplace has no owner/repo', () => {
      const marketplace: MarketplaceInfo = {
        id: 'github-skills:unknown',
        name: 'unknown',
        gitUrl: 'https://github.com/owner/repo',
        sourceType: 'github-skills'
        // no owner/repo
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'owner/repo', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)
      expect(result).toHaveLength(0)
    })
  })

  describe('custom marketplace', () => {
    it('should match by normalized sourceUrl', () => {
      const marketplace: MarketplaceInfo = {
        id: 'custom-1',
        name: 'Custom Market',
        gitUrl: 'https://github.com/team/skills',
        sourceType: 'custom',
        owner: 'team',
        repo: 'skills'
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'other/thing', sourceUrl: 'git@github.com:team/skills.git', path: '/p', autoUpdate: false },
        { name: 'skill-b', description: '', agent: 'agent1', source: 'no-match', sourceUrl: 'https://github.com/unrelated/repo', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('skill-a')
    })

    it('should match by source === owner/repo', () => {
      const marketplace: MarketplaceInfo = {
        id: 'custom-1',
        name: 'Custom Market',
        gitUrl: 'git@gitlab.example.com:team/skills.git',
        sourceType: 'custom',
        owner: 'team',
        repo: 'skills'
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'team/skills', path: '/p', autoUpdate: false },
        { name: 'skill-b', description: '', agent: 'agent1', source: 'other/repo', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('skill-a')
    })

    it('should match by either sourceUrl or source (union)', () => {
      const marketplace: MarketplaceInfo = {
        id: 'custom-1',
        name: 'Custom Market',
        gitUrl: 'https://github.com/team/skills',
        sourceType: 'custom',
        owner: 'team',
        repo: 'skills'
      }
      const skills = [
        { name: 'skill-url', description: '', agent: 'agent1', source: 'different', sourceUrl: 'git@github.com:team/skills.git', path: '/p', autoUpdate: false },
        { name: 'skill-source', description: '', agent: 'agent1', source: 'team/skills', path: '/p', autoUpdate: false },
        { name: 'skill-none', description: '', agent: 'agent1', source: 'unrelated', sourceUrl: 'https://github.com/other/repo', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)

      expect(result).toHaveLength(2)
      expect(result.map(s => s.name)).toEqual(['skill-url', 'skill-source'])
    })

    it('should not duplicate skills that match both rules', () => {
      const marketplace: MarketplaceInfo = {
        id: 'custom-1',
        name: 'Custom Market',
        gitUrl: 'https://github.com/team/skills',
        sourceType: 'custom',
        owner: 'team',
        repo: 'skills'
      }
      const skills = [
        { name: 'skill-both', description: '', agent: 'agent1', source: 'team/skills', sourceUrl: 'https://github.com/team/skills', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)
      expect(result).toHaveLength(1)
    })

    it('should return empty when marketplace has no owner/repo and gitUrl does not match', () => {
      const marketplace: MarketplaceInfo = {
        id: 'custom-1',
        name: 'Custom Market',
        gitUrl: 'https://github.com/team/skills',
        sourceType: 'custom'
        // no owner/repo
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'team/skills', path: '/p', autoUpdate: false }
      ]

      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)
      // sourceUrl is not set on skill, so first rule doesn't match
      // owner/repo is not set on marketplace, so second rule doesn't apply
      expect(result).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('should return empty array for null/undefined marketplace', () => {
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'x', path: '/p', autoUpdate: false }
      ]
      const result = manager.getInstalledSkillsForMarketplace(null as any, skills)
      expect(result).toEqual([])
    })

    it('should return empty array for empty skills list', () => {
      const marketplace: MarketplaceInfo = {
        id: 'test',
        name: 'test',
        gitUrl: 'https://github.com/a/b',
        sourceType: 'claude-plugin'
      }
      const result = manager.getInstalledSkillsForMarketplace(marketplace, [])
      expect(result).toEqual([])
    })

    it('should return empty array for unknown sourceType', () => {
      const marketplace: MarketplaceInfo = {
        id: 'test',
        name: 'test',
        gitUrl: 'https://github.com/a/b',
        sourceType: 'unknown-type' as any
      }
      const skills = [
        { name: 'skill-a', description: '', agent: 'agent1', source: 'a/b', path: '/p', autoUpdate: false }
      ]
      const result = manager.getInstalledSkillsForMarketplace(marketplace, skills)
      expect(result).toEqual([])
    })
  })
})

describe('MarketplaceManager.listRemoteSkills', () => {
  let store: MarketplaceStoreLike
  let storeData: Record<string, unknown>
  let manager: MarketplaceManager

  beforeEach(() => {
    storeData = {}
    store = {
      get: (key: string, defaultValue?: unknown) => storeData[key] ?? defaultValue,
      set: (key: string, value: unknown) => { storeData[key] = value }
    }
    manager = new MarketplaceManager(store)
    vi.clearAllMocks()
    mockedReadGlobalLock.mockResolvedValue({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    manager.clearCache()
  })

  describe('extractSkillPathsFromTree (GitHub)', () => {
    it('should extract directory paths containing SKILL.md', () => {
      const tree = [
        { path: 'skill-a/SKILL.md', type: 'blob' },
        { path: 'skill-b/SKILL.md', type: 'blob' },
        { path: 'other/file.ts', type: 'blob' },
        { path: 'skill-a', type: 'tree' }
      ]

      const result = manager.extractSkillPathsFromTree(tree)

      expect(result).toEqual(['skill-a', 'skill-b'])
    })

    it('should handle SKILL.md at root', () => {
      const tree = [
        { path: 'SKILL.md', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromTree(tree)

      expect(result).toEqual(['.'])
    })

    it('should handle nested directories', () => {
      const tree = [
        { path: 'plugins/skill-a/SKILL.md', type: 'blob' },
        { path: 'plugins/skill-b/SKILL.md', type: 'blob' },
        { path: 'plugins/skill-b/README.md', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromTree(tree)

      expect(result).toEqual(['plugins/skill-a', 'plugins/skill-b'])
    })

    it('should not include tree (directory) type entries', () => {
      const tree = [
        { path: 'skill-a/SKILL.md', type: 'tree' }, // directory named SKILL.md (unlikely but valid)
        { path: 'skill-b/SKILL.md', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromTree(tree)

      expect(result).toEqual(['skill-b'])
    })

    it('should return empty array when no SKILL.md found', () => {
      const tree = [
        { path: 'src/index.ts', type: 'blob' },
        { path: 'README.md', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromTree(tree)

      expect(result).toEqual([])
    })

    it('should not match partial name like MY_SKILL.md', () => {
      const tree = [
        { path: 'tools/MY_SKILL.md', type: 'blob' },
        { path: 'tools/skill-a/SKILL.md', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromTree(tree)

      expect(result).toEqual(['tools/skill-a'])
    })
  })

  describe('extractSkillPathsFromGitLabTree', () => {
    it('should extract directory paths from GitLab tree entries', () => {
      const entries = [
        { name: 'SKILL.md', path: 'skill-a/SKILL.md', type: 'blob' },
        { name: 'SKILL.md', path: 'skill-b/SKILL.md', type: 'blob' },
        { name: 'README.md', path: 'skill-a/README.md', type: 'blob' },
        { name: 'skill-a', path: 'skill-a', type: 'tree' }
      ]

      const result = manager.extractSkillPathsFromGitLabTree(entries)

      expect(result).toEqual(['skill-a', 'skill-b'])
    })

    it('should handle SKILL.md at root', () => {
      const entries = [
        { name: 'SKILL.md', path: 'SKILL.md', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromGitLabTree(entries)

      expect(result).toEqual(['.'])
    })

    it('should handle nested directories', () => {
      const entries = [
        { name: 'SKILL.md', path: 'plugins/tool-x/SKILL.md', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromGitLabTree(entries)

      expect(result).toEqual(['plugins/tool-x'])
    })

    it('should not include non-blob entries', () => {
      const entries = [
        { name: 'SKILL.md', path: 'skill-a/SKILL.md', type: 'tree' },
        { name: 'SKILL.md', path: 'skill-b/SKILL.md', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromGitLabTree(entries)

      expect(result).toEqual(['skill-b'])
    })

    it('should return empty array when no SKILL.md found', () => {
      const entries = [
        { name: 'index.ts', path: 'src/index.ts', type: 'blob' }
      ]

      const result = manager.extractSkillPathsFromGitLabTree(entries)

      expect(result).toEqual([])
    })
  })

  describe('listRemoteSkills - GitHub flow', () => {
    it('should fetch GitHub tree and return skills', async () => {
      const mockResponse = {
        tree: [
          { path: 'skill-hello/SKILL.md', type: 'blob' },
          { path: 'skill-world/SKILL.md', type: 'blob' },
          { path: 'README.md', type: 'blob' }
        ]
      }

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'test-1',
        name: 'Test Market',
        gitUrl: 'https://github.com/acme/skills',
        sourceType: 'github-skills',
        owner: 'acme',
        repo: 'skills'
      }

      const result = await manager.listRemoteSkills(marketplace)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ name: 'skill-hello', path: 'skill-hello', installed: false })
      expect(result[1]).toEqual({ name: 'skill-world', path: 'skill-world', installed: false })
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://api.github.com/repos/acme/skills/git/trees/'),
        expect.any(Object)
      )
    })

    it('should use cache on second call', async () => {
      const mockResponse = {
        tree: [
          { path: 'my-skill/SKILL.md', type: 'blob' }
        ]
      }

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'cache-test',
        name: 'Cache Market',
        gitUrl: 'https://github.com/org/cached-skills',
        sourceType: 'github-skills',
        owner: 'org',
        repo: 'cached-skills'
      }

      const result1 = await manager.listRemoteSkills(marketplace)
      const result2 = await manager.listRemoteSkills(marketplace)

      expect(result1).toEqual(result2)
      expect(fetchMock).toHaveBeenCalledTimes(1) // Only called once due to cache
    })

    it('should mark skills as installed when matching lock entries', async () => {
      const mockResponse = {
        tree: [
          { path: 'skill-a/SKILL.md', type: 'blob' },
          { path: 'skill-b/SKILL.md', type: 'blob' }
        ]
      }

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      })
      vi.stubGlobal('fetch', fetchMock)

      mockedReadGlobalLock.mockResolvedValue({
        'skill-a': {
          source: 'owner/repo',
          sourceType: 'git',
          skillPath: 'skill-a/SKILL.md',
          ref: 'main'
        }
      })

      const marketplace: MarketplaceInfo = {
        id: 'install-test',
        name: 'Install Market',
        gitUrl: 'https://github.com/owner/repo',
        sourceType: 'github-skills',
        owner: 'owner',
        repo: 'repo'
      }

      const result = await manager.listRemoteSkills(marketplace)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ name: 'skill-a', path: 'skill-a', installed: true })
      expect(result[1]).toEqual({ name: 'skill-b', path: 'skill-b', installed: false })
    })

    it('should throw on 401/403 response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'auth-fail',
        name: 'Auth Fail',
        gitUrl: 'https://github.com/private/repo',
        sourceType: 'github-skills',
        owner: 'private',
        repo: 'repo'
      }

      await expect(manager.listRemoteSkills(marketplace)).rejects.toThrow('认证失败')
    })

    it('should throw on 429 rate limit response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'rate-limit',
        name: 'Rate Limited',
        gitUrl: 'https://github.com/busy/repo',
        sourceType: 'github-skills',
        owner: 'busy',
        repo: 'repo'
      }

      await expect(manager.listRemoteSkills(marketplace)).rejects.toThrow('速率限制')
    })

    it('should throw on network error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'))
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'net-err',
        name: 'Net Error',
        gitUrl: 'https://github.com/no-net/repo',
        sourceType: 'github-skills',
        owner: 'no-net',
        repo: 'repo'
      }

      await expect(manager.listRemoteSkills(marketplace)).rejects.toThrow('网络错误')
    })

    it('should use default ref "main" when not specified', async () => {
      const mockResponse = { tree: [] }
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'no-ref',
        name: 'No Ref',
        gitUrl: 'https://github.com/org/repo',
        sourceType: 'github-skills',
        owner: 'org',
        repo: 'repo'
        // no ref specified
      }

      await manager.listRemoteSkills(marketplace)

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/git/trees/main'),
        expect.any(Object)
      )
    })

    it('should use specified ref when available', async () => {
      const mockResponse = { tree: [] }
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'with-ref',
        name: 'With Ref',
        gitUrl: 'https://github.com/org/repo',
        sourceType: 'github-skills',
        owner: 'org',
        repo: 'repo',
        ref: 'develop'
      }

      await manager.listRemoteSkills(marketplace)

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/git/trees/develop'),
        expect.any(Object)
      )
    })
  })

  describe('listRemoteSkills - GitLab flow', () => {
    it('should fetch GitLab tree and return skills', async () => {
      const mockResponse = [
        { name: 'SKILL.md', path: 'skill-x/SKILL.md', type: 'blob' },
        { name: 'README.md', path: 'README.md', type: 'blob' }
      ]

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'gitlab-test',
        name: 'GitLab Market',
        gitUrl: 'git@gitlab.example.com:group/project.git',
        sourceType: 'custom',
        owner: 'group',
        repo: 'project',
        host: 'gitlab.example.com',
        projectPath: 'group/project'
      }

      const result = await manager.listRemoteSkills(marketplace)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ name: 'skill-x', path: 'skill-x', installed: false })
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('gitlab.example.com/api/v4/projects'),
        expect.any(Object)
      )
    })

    it('should throw on GitLab 401/403 response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 403
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'gl-auth',
        name: 'GL Auth',
        gitUrl: 'git@gitlab.com:group/repo.git',
        sourceType: 'custom',
        owner: 'group',
        repo: 'repo',
        host: 'gitlab.com',
        projectPath: 'group/repo'
      }

      await expect(manager.listRemoteSkills(marketplace)).rejects.toThrow('认证失败')
    })
  })

  describe('listRemoteSkills - cache behavior', () => {
    it('should clear cache when clearCache is called', async () => {
      const mockResponse = { tree: [{ path: 'x/SKILL.md', type: 'blob' }] }
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      })
      vi.stubGlobal('fetch', fetchMock)

      const marketplace: MarketplaceInfo = {
        id: 'clear-cache-test',
        name: 'ClearCache',
        gitUrl: 'https://github.com/cc/repo',
        sourceType: 'github-skills',
        owner: 'cc',
        repo: 'repo'
      }

      await manager.listRemoteSkills(marketplace)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      manager.clearCache()

      await manager.listRemoteSkills(marketplace)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('should throw for empty/invalid marketplace gitUrl', async () => {
      const marketplace: MarketplaceInfo = {
        id: 'no-url',
        name: 'No URL',
        gitUrl: '',
        sourceType: 'custom'
      }

      await expect(manager.listRemoteSkills(marketplace)).rejects.toThrow('Invalid marketplace git URL')
    })
  })
})
