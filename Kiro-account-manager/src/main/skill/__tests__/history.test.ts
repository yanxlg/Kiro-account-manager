import { describe, it, expect } from 'vitest'
import { createHistoryStore } from '../history'
import { SkillsManagerConfig, UpdateHistoryEntry } from '../types'

function makeEntry(overrides: Partial<UpdateHistoryEntry> = {}): UpdateHistoryEntry {
  return {
    skillName: 'test-skill',
    agent: 'test-agent',
    timestamp: new Date().toISOString(),
    previousHash: 'abc123',
    newHash: 'def456',
    success: true,
    ...overrides
  }
}

function createTestStore(initialHistory: UpdateHistoryEntry[] = []) {
  let config: SkillsManagerConfig = {
    version: 1,
    defaultAutoUpdate: true,
    defaultInstallMode: 'copy',
    skillConfigs: {},
    updateHistory: initialHistory
  }

  const store = createHistoryStore(
    () => config,
    (newConfig) => { config = newConfig }
  )

  return { store, getConfig: () => config }
}

describe('HistoryStore', () => {
  describe('createHistoryStore', () => {
    it('should create a store with append, query, and getAll methods', () => {
      const { store } = createTestStore()
      expect(store.append).toBeDefined()
      expect(store.query).toBeDefined()
      expect(store.getAll).toBeDefined()
    })
  })

  describe('append', () => {
    it('should append a new entry to history', () => {
      const { store, getConfig } = createTestStore()
      const entry = makeEntry()

      store.append(entry)

      expect(getConfig().updateHistory).toHaveLength(1)
      expect(getConfig().updateHistory![0]).toEqual(entry)
    })

    it('should append multiple entries', () => {
      const { store, getConfig } = createTestStore()

      store.append(makeEntry({ skillName: 'skill-1', timestamp: '2024-01-01T00:00:00Z' }))
      store.append(makeEntry({ skillName: 'skill-2', timestamp: '2024-01-02T00:00:00Z' }))

      expect(getConfig().updateHistory).toHaveLength(2)
    })

    it('should trim to 200 entries when exceeding max', () => {
      const initialHistory: UpdateHistoryEntry[] = []
      for (let i = 0; i < 200; i++) {
        initialHistory.push(
          makeEntry({
            skillName: `skill-${i}`,
            timestamp: `2024-01-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`
          })
        )
      }

      const { store, getConfig } = createTestStore(initialHistory)

      // Append one more entry with latest timestamp
      const newEntry = makeEntry({ skillName: 'new-skill', timestamp: '2024-12-31T23:59:59Z' })
      store.append(newEntry)

      const history = getConfig().updateHistory!
      expect(history).toHaveLength(200)
      // The newest entry should be present
      expect(history[history.length - 1]).toEqual(newEntry)
      // The oldest entry (skill-0) should be removed
      expect(history.find((e) => e.skillName === 'skill-0')).toBeUndefined()
    })

    it('should delete oldest entries by timestamp when trimming', () => {
      const initialHistory: UpdateHistoryEntry[] = []
      for (let i = 0; i < 200; i++) {
        initialHistory.push(
          makeEntry({
            skillName: `skill-${i}`,
            timestamp: new Date(2024, 0, 1, 0, 0, i).toISOString()
          })
        )
      }

      const { store, getConfig } = createTestStore(initialHistory)

      // Add entry with timestamp earlier than some existing ones
      const earlyEntry = makeEntry({
        skillName: 'early-skill',
        timestamp: new Date(2023, 0, 1).toISOString()
      })
      store.append(earlyEntry)

      const history = getConfig().updateHistory!
      expect(history).toHaveLength(200)
      // The early entry should be trimmed as it's the oldest
      expect(history.find((e) => e.skillName === 'early-skill')).toBeUndefined()
    })
  })

  describe('query', () => {
    it('should return entries matching skillName exactly', () => {
      const { store } = createTestStore([
        makeEntry({ skillName: 'alpha', timestamp: '2024-01-01T00:00:00Z' }),
        makeEntry({ skillName: 'beta', timestamp: '2024-01-02T00:00:00Z' }),
        makeEntry({ skillName: 'alpha', timestamp: '2024-01-03T00:00:00Z' })
      ])

      const results = store.query('alpha')
      expect(results).toHaveLength(2)
      expect(results.every((e) => e.skillName === 'alpha')).toBe(true)
    })

    it('should return results sorted by timestamp descending', () => {
      const { store } = createTestStore([
        makeEntry({ skillName: 'skill-a', timestamp: '2024-01-01T00:00:00Z' }),
        makeEntry({ skillName: 'skill-a', timestamp: '2024-01-03T00:00:00Z' }),
        makeEntry({ skillName: 'skill-a', timestamp: '2024-01-02T00:00:00Z' })
      ])

      const results = store.query('skill-a')
      expect(results).toHaveLength(3)
      expect(results[0].timestamp).toBe('2024-01-03T00:00:00Z')
      expect(results[1].timestamp).toBe('2024-01-02T00:00:00Z')
      expect(results[2].timestamp).toBe('2024-01-01T00:00:00Z')
    })

    it('should return empty array when no entries match', () => {
      const { store } = createTestStore([
        makeEntry({ skillName: 'other-skill' })
      ])

      const results = store.query('non-existent')
      expect(results).toEqual([])
    })

    it('should return empty array when history is empty', () => {
      const { store } = createTestStore()
      expect(store.query('anything')).toEqual([])
    })
  })

  describe('getAll', () => {
    it('should return all entries', () => {
      const entries = [
        makeEntry({ skillName: 'skill-1' }),
        makeEntry({ skillName: 'skill-2' }),
        makeEntry({ skillName: 'skill-3' })
      ]
      const { store } = createTestStore(entries)

      expect(store.getAll()).toHaveLength(3)
    })

    it('should return empty array when no history exists', () => {
      const { store } = createTestStore()
      expect(store.getAll()).toEqual([])
    })

    it('should return empty array when updateHistory is undefined', () => {
      let config: SkillsManagerConfig = {
        version: 1,
        defaultAutoUpdate: true,
        defaultInstallMode: 'copy',
        skillConfigs: {}
        // updateHistory intentionally undefined
      }

      const store = createHistoryStore(
        () => config,
        (newConfig) => { config = newConfig }
      )

      expect(store.getAll()).toEqual([])
    })
  })
})
