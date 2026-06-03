import { CheckCircle2, AlertTriangle, Folder, GitBranch, Github } from 'lucide-react'
import { getSourceProvider } from './source'
import type { SkillUpdateStatus, SkillsSkillView } from './types'

function GitLabIcon({ className }: { className?: string }): React.ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51a.42.42 0 0 1 .82 0l2.44 7.51h8.06l2.44-7.51a.42.42 0 0 1 .82 0l2.44 7.51 1.22 3.78a.84.84 0 0 1-.3.94" />
    </svg>
  )
}

export function SourceIcon({ skill }: { skill: SkillsSkillView }): React.ReactNode {
  const sourceProvider = getSourceProvider(skill)
  if (sourceProvider === 'github') return <Github className="h-4 w-4 shrink-0 text-muted-foreground" />
  if (sourceProvider === 'gitlab') return <GitLabIcon className="h-4 w-4 shrink-0 text-orange-500" />
  if (sourceProvider === 'git') return <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
  return <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
}

/**
 * 从 source/sourceUrl 中提取显示友好的仓库短名。
 * - GitHub: "owner/repo" 直接返回
 * - GitLab SSH: "git@host:group/repo.git" → "group/repo"
 * - GitLab HTTPS: "https://host/group/repo.git" → "group/repo"
 * - 其他: 返回原始值
 */
export function getSourceDisplayName(skill: SkillsSkillView): string {
  const source = skill.source || ''
  const sourceUrl = skill.sourceUrl || ''
  const provider = getSourceProvider(skill)

  if (provider === 'github') {
    // GitHub source is already owner/repo format
    return source || 'Local'
  }

  if (provider === 'gitlab' || provider === 'git') {
    const url = sourceUrl || source
    // SSH format: git@host:group/repo.git → group/repo
    const sshMatch = url.match(/^git@[^:]+:(.+?)(?:\.git)?$/)
    if (sshMatch) return sshMatch[1]
    // HTTPS format: https://host/group/repo.git → group/repo
    const httpsMatch = url.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/)
    if (httpsMatch) return httpsMatch[1]
    return source || url
  }

  return source || 'Local'
}

/**
 * 获取仓库的可访问 URL（用于浏览器打开）。
 * - GitHub: https://github.com/{owner}/{repo}
 * - GitLab SSH: 转为 HTTPS 链接
 * - GitLab HTTPS: 去掉 .git 后缀
 */
export function getSourceUrl(skill: SkillsSkillView): string | null {
  const source = skill.source || ''
  const sourceUrl = skill.sourceUrl || ''
  const provider = getSourceProvider(skill)

  if (provider === 'github') {
    if (source && /^[^/\s]+\/[^/\s]+$/.test(source)) {
      return `https://github.com/${source}`
    }
    if (sourceUrl) return sourceUrl.replace(/\.git$/, '')
    return null
  }

  if (provider === 'gitlab' || provider === 'git') {
    const url = sourceUrl || source
    // SSH format: git@host:group/repo.git → http://host/group/repo
    const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
    if (sshMatch) return `http://${sshMatch[1]}/${sshMatch[2]}`
    // HTTPS: strip .git
    if (url.startsWith('http')) return url.replace(/\.git$/, '')
    return null
  }

  return null
}

export function StatusIcon({ status }: { status: SkillUpdateStatus }): React.ReactNode {
  return status === 'latest' ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  ) : (
    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
  )
}
