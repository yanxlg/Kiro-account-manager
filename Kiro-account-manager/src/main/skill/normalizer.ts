import { cp, lstat, mkdir, readdir, readFile, realpath, rm, symlink } from 'fs/promises'
import { dirname, join, relative } from 'path'
import {
  canonicalGlobalSkillsDir,
  getInstalledAgentDefinitions,
  supportsAgentSymlinkProjection,
  getAgentById
} from './agents'
import { normalizeSkillName } from './config'
import { pathExists } from './filesystem'
import type { SkillsManagerConfig } from './types'

export interface NormalizeResult {
  normalized: Array<{ skillName: string; agents: string[] }>
  conflicts: Array<{ skillName: string; reason: string }>
  errors: Array<{ skillName: string; agent: string; reason: string }>
}

/**
 * Scan all installed agents' globalSkillsDir, find skill directories with the same
 * normalized name. Exclude those that are already symlinks pointing to canonical directory.
 * Group by normalized skill name.
 */
export async function scanDuplicateSkills(): Promise<
  Map<string, Array<{ agent: string; dir: string }>>
> {
  const agents = getInstalledAgentDefinitions()
  const grouped = new Map<string, Array<{ agent: string; dir: string }>>()

  for (const agent of agents) {
    const skillsDir = agent.globalSkillsDir
    if (!(await pathExists(skillsDir))) continue

    let entries: string[]
    try {
      entries = await readdir(skillsDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(skillsDir, entry)

      // Check if this is a directory (or symlink to directory)
      let stats
      try {
        stats = await lstat(fullPath)
      } catch {
        continue
      }

      // If it's a symlink, check if it points to canonical directory — if so, skip it
      if (stats.isSymbolicLink()) {
        try {
          const target = await realpath(fullPath)
          if (target.startsWith(canonicalGlobalSkillsDir)) {
            continue
          }
        } catch {
          // If we can't resolve the symlink, skip it
          continue
        }
      }

      // Must be a directory (or symlink to a non-canonical directory)
      if (!stats.isDirectory() && !stats.isSymbolicLink()) continue

      const normalizedName = normalizeSkillName(entry)
      if (!grouped.has(normalizedName)) {
        grouped.set(normalizedName, [])
      }
      grouped.get(normalizedName)!.push({ agent: agent.id, dir: fullPath })
    }
  }

  // Only return groups with more than one copy (duplicates)
  const duplicates = new Map<string, Array<{ agent: string; dir: string }>>()
  for (const [name, copies] of grouped) {
    if (copies.length > 1) {
      duplicates.set(name, copies)
    }
  }

  return duplicates
}

/**
 * Recursively compare two directories. All files must have identical byte content.
 * Uses readFile + Buffer.equals for comparison.
 */
export async function areDirectoriesIdentical(dirA: string, dirB: string): Promise<boolean> {
  let entriesA: string[]
  let entriesB: string[]

  try {
    entriesA = (await readdir(dirA)).sort()
    entriesB = (await readdir(dirB)).sort()
  } catch {
    return false
  }

  // Different number of entries means not identical
  if (entriesA.length !== entriesB.length) return false

  // Check that all entries have the same names
  for (let i = 0; i < entriesA.length; i++) {
    if (entriesA[i] !== entriesB[i]) return false
  }

  // Compare each entry recursively
  for (const entry of entriesA) {
    const pathA = join(dirA, entry)
    const pathB = join(dirB, entry)

    let statA, statB
    try {
      statA = await lstat(pathA)
      statB = await lstat(pathB)
    } catch {
      return false
    }

    if (statA.isDirectory() && statB.isDirectory()) {
      const subIdentical = await areDirectoriesIdentical(pathA, pathB)
      if (!subIdentical) return false
    } else if (statA.isFile() && statB.isFile()) {
      try {
        const contentA = await readFile(pathA)
        const contentB = await readFile(pathB)
        if (!contentA.equals(contentB)) return false
      } catch {
        return false
      }
    } else {
      // One is a file and the other is a directory (or symlink mismatch)
      return false
    }
  }

  return true
}

/**
 * Execute normalization: scan → move to canonical → project via symlink/copy.
 *
 * For each duplicate skill group:
 * - Check if canonical dir already has this skill
 * - If canonical has it and content differs from copies → report as conflict, skip
 * - If canonical doesn't have it → move the first copy (sorted by agent displayName alphabetically) to canonical
 * - For each remaining agent:
 *   - If agent.supportsSymlinkProjection !== false → replace with symlink to canonical (relative symlink)
 *   - If agent.supportsSymlinkProjection === false → keep copy (fresh copy from canonical)
 * - Record success
 *
 * On error: skip that agent/skill, record to errors, continue
 */
export async function normalizeSkills(_config: SkillsManagerConfig): Promise<NormalizeResult> {
  const result: NormalizeResult = {
    normalized: [],
    conflicts: [],
    errors: []
  }

  const duplicates = await scanDuplicateSkills()

  for (const [normalizedName, copies] of duplicates) {
    const canonicalDir = join(canonicalGlobalSkillsDir, normalizedName)
    const canonicalExists = await pathExists(canonicalDir)

    // If canonical already exists, check if content matches
    if (canonicalExists) {
      // Check content of first copy against canonical
      const firstCopy = copies[0]
      let identical: boolean
      try {
        identical = await areDirectoriesIdentical(canonicalDir, firstCopy.dir)
      } catch {
        identical = false
      }

      if (!identical) {
        result.conflicts.push({
          skillName: normalizedName,
          reason: `Canonical directory already has a different version of "${normalizedName}"`
        })
        continue
      }
    }

    // Sort copies by agent displayName alphabetically
    const sortedCopies = [...copies].sort((a, b) => {
      const agentA = getAgentById(a.agent)
      const agentB = getAgentById(b.agent)
      const nameA = agentA?.displayName || a.agent
      const nameB = agentB?.displayName || b.agent
      return nameA.localeCompare(nameB)
    })

    // If canonical doesn't exist, move the first copy there
    if (!canonicalExists) {
      const firstCopy = sortedCopies[0]
      try {
        await mkdir(dirname(canonicalDir), { recursive: true })
        await cp(firstCopy.dir, canonicalDir, { recursive: true })
        await rm(firstCopy.dir, { recursive: true, force: true })
      } catch (err) {
        result.errors.push({
          skillName: normalizedName,
          agent: firstCopy.agent,
          reason: `Failed to move skill to canonical directory: ${err instanceof Error ? err.message : String(err)}`
        })
        continue
      }
    }

    // Process each remaining copy (or all copies if canonical already existed)
    const copiesToProcess = canonicalExists ? sortedCopies : sortedCopies.slice(1)
    const successAgents: string[] = []

    // Include the first agent (moved to canonical) in the success list
    if (!canonicalExists) {
      successAgents.push(sortedCopies[0].agent)
    }

    for (const copy of copiesToProcess) {
      const agent = getAgentById(copy.agent)
      if (!agent) {
        result.errors.push({
          skillName: normalizedName,
          agent: copy.agent,
          reason: 'Agent definition not found'
        })
        continue
      }

      try {
        if (supportsAgentSymlinkProjection(agent)) {
          // Replace with relative symlink to canonical
          await rm(copy.dir, { recursive: true, force: true })
          const relPath = relative(dirname(copy.dir), canonicalDir)
          await symlink(relPath, copy.dir)
        } else {
          // Keep copy mode: fresh copy from canonical
          await rm(copy.dir, { recursive: true, force: true })
          await cp(canonicalDir, copy.dir, { recursive: true })
        }
        successAgents.push(copy.agent)
      } catch (err) {
        result.errors.push({
          skillName: normalizedName,
          agent: copy.agent,
          reason: `Failed to create projection: ${err instanceof Error ? err.message : String(err)}`
        })
      }
    }

    if (successAgents.length > 0) {
      result.normalized.push({
        skillName: normalizedName,
        agents: successAgents
      })
    }
  }

  return result
}
