import { lstat, mkdir, rm, cp, symlink, readdir } from 'fs/promises'
import { join, relative, dirname } from 'path'
import {
  getAgentById,
  canonicalGlobalSkillsDir,
  supportsAgentSymlinkProjection
} from './agents'
import { normalizeSkillName } from './config'
import { pathExists } from './filesystem'
import type { SkillsManagerConfig } from './types'

export interface ConvertResult {
  converted: Array<{ skillName: string }>
  skipped: Array<{ skillName: string; reason: string }>
  errors: Array<{ skillName: string; reason: string }>
}

/**
 * Convert all copy-mode skills in a given agent's globalSkillsDir to symlinks
 * pointing to the canonical directory (~/.agents/skills/).
 *
 * Requirements:
 * - Check supportsSymlinkProjection → reject if false (Req 8.4)
 * - For each non-symlink skill directory:
 *   - If canonical has no same-name skill → move to canonical, then create symlink back (Req 8.2)
 *   - If canonical already has it → remove agent copy, create symlink to canonical (Req 8.1)
 *   - On failure → keep original copy, record error, continue (Req 8.5)
 * - All success → effectiveInstallMode = 'symlink' (Req 8.3)
 * - Partial failure → effectiveInstallMode stays 'copy' (Req 8.6)
 */
export async function convertAgentToSymlink(
  agentId: string,
  _config: SkillsManagerConfig
): Promise<ConvertResult> {
  const result: ConvertResult = {
    converted: [],
    skipped: [],
    errors: []
  }

  // Look up the agent definition
  const agent = getAgentById(agentId)
  if (!agent) {
    result.errors.push({
      skillName: '*',
      reason: `Agent "${agentId}" 不存在`
    })
    return result
  }

  // Check if agent supports symlink projection (Req 8.4)
  if (!supportsAgentSymlinkProjection(agent)) {
    result.errors.push({
      skillName: '*',
      reason: '该 Agent 当前不支持软链模式'
    })
    return result
  }

  const skillsDir = agent.globalSkillsDir

  // If agent's globalSkillsDir doesn't exist, nothing to convert
  if (!(await pathExists(skillsDir))) {
    return result
  }

  // List entries in the agent's globalSkillsDir
  let entries: string[]
  try {
    entries = await readdir(skillsDir)
  } catch {
    result.errors.push({
      skillName: '*',
      reason: `无法读取 agent skills 目录: ${skillsDir}`
    })
    return result
  }

  for (const entry of entries) {
    const fullPath = join(skillsDir, entry)

    // Check if this is already a symlink — if so, skip it
    let stats
    try {
      stats = await lstat(fullPath)
    } catch (err) {
      result.errors.push({
        skillName: entry,
        reason: `无法读取文件状态: ${err instanceof Error ? err.message : String(err)}`
      })
      continue
    }

    // Skip if already a symlink (already converted)
    if (stats.isSymbolicLink()) {
      result.skipped.push({
        skillName: entry,
        reason: '已经是软链，无需转换'
      })
      continue
    }

    // Skip if not a directory
    if (!stats.isDirectory()) {
      result.skipped.push({
        skillName: entry,
        reason: '不是目录，跳过'
      })
      continue
    }

    // Normalize the skill name for canonical path lookup
    const normalizedName = normalizeSkillName(entry)
    const canonicalDir = join(canonicalGlobalSkillsDir, normalizedName)

    try {
      const canonicalExists = await pathExists(canonicalDir)

      if (!canonicalExists) {
        // Canonical doesn't exist → move agent's copy to canonical, then create symlink (Req 8.2)
        await mkdir(dirname(canonicalDir), { recursive: true })
        await cp(fullPath, canonicalDir, { recursive: true })
        await rm(fullPath, { recursive: true, force: true })
      } else {
        // Canonical exists → remove agent's copy (Req 8.1)
        await rm(fullPath, { recursive: true, force: true })
      }

      // Create relative symlink from agent dir to canonical
      const relPath = relative(dirname(fullPath), canonicalDir)
      await symlink(relPath, fullPath)

      result.converted.push({ skillName: entry })
    } catch (err) {
      // On failure → restore original if needed, record error, continue (Req 8.5)
      // Since we might have partially completed (e.g., removed agent copy but failed symlink),
      // try to restore from canonical if the original was moved there
      try {
        if (!(await pathExists(fullPath))) {
          // Original was removed but symlink failed — try to copy back from canonical
          const canonicalStillExists = await pathExists(canonicalDir)
          if (canonicalStillExists) {
            await cp(canonicalDir, fullPath, { recursive: true })
          }
        }
      } catch {
        // Best effort recovery — if this also fails, we can only report
      }

      result.errors.push({
        skillName: entry,
        reason: `转换失败: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }

  return result
}
