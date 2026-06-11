import { spawn } from 'child_process'
import { home } from './agents'
import type { SkillsOperationResult } from './types'

/**
 * 去除终端控制序列（ANSI/CSI 转义、spinner 光标移动等），返回可读纯文本。
 */
export function stripAnsi(input: string): string {
  return input
    // ESC [ ... 字母 (CSI: 颜色/光标移动/清屏等)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // 其他 ESC 序列
    .replace(/\x1b[@-Z\\-_]/g, '')
    // 残留的裸 CR
    .replace(/\r/g, '\n')
}

/**
 * 从命令原始输出中提取简洁的错误信息。
 * 优先取包含 fatal/error/failed 的关键行，否则取最后一条非空行。
 */
export function extractErrorMessage(rawOutput: string, exitCode?: number): string {
  const cleaned = stripAnsi(rawOutput)
  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return exitCode != null ? `npx skills exited with ${exitCode}` : '更新失败'
  }

  // 去重（spinner 会产生大量重复行）
  const unique = Array.from(new Set(lines))

  const keyword = unique.find((l) => /\b(fatal|error|failed)\b/i.test(l))
  return keyword || unique[unique.length - 1]
}

export function runNpxSkills(args: string[]): Promise<SkillsOperationResult> {
  return new Promise((resolveResult) => {
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['skills', ...args], {
      cwd: home,
      env: { ...process.env, DISABLE_TELEMETRY: '1' }
    })
    let output = ''
    child.stdout.on('data', (data) => {
      output += String(data)
    })
    child.stderr.on('data', (data) => {
      output += String(data)
    })
    child.on('error', (error) => resolveResult({ success: false, error: error.message }))
    child.on('close', (code) => {
      resolveResult({
        success: code === 0,
        message: stripAnsi(output).trim(),
        error: code === 0 ? undefined : extractErrorMessage(output, code ?? undefined)
      })
    })
  })
}
