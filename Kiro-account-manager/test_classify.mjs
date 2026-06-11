function parseGitLabUrl(url) {
  if (!url) return null
  const sshMatch = url.match(/^git@([^:]+):([^/][^:]+?)(?:\.git)?$/)
  if (sshMatch) return { host: sshMatch[1], projectPath: sshMatch[2] }
  const httpsMatch = url.match(/^(https?:\/\/[^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return { host: httpsMatch[1], projectPath: httpsMatch[2] }
  return null
}

const lockEntry = {
  source: 'http://gitlab.caijj.net/claude-code/claude-code-marketplace.git',
  sourceType: 'git',
  sourceUrl: 'http://gitlab.caijj.net/claude-code/claude-code-marketplace.git',
  skillPath: 'sh_cli-oauth_skill/skills/sh_cli-oauth_skill/SKILL.md'
}

const parsed = parseGitLabUrl(lockEntry.sourceUrl)
console.log('parseGitLabUrl result:', parsed)
console.log('sourceType:', lockEntry.sourceType)
console.log('skillFolderHash:', lockEntry.skillFolderHash)
console.log('pluginName:', lockEntry.pluginName)

// Classify
const { source, sourceType, sourceUrl, skillFolderHash, pluginName } = lockEntry
const isOwnerRepoFormat = (s) => s && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s)

let result = 'unknown'
if (sourceType === 'local') result = 'local'
else if (!source && !sourceUrl && !sourceType) result = 'unsupported'
else if (skillFolderHash && isOwnerRepoFormat(source)) result = 'github'
else if (sourceUrl && parseGitLabUrl(sourceUrl)) {
  if (pluginName && !skillFolderHash) result = 'plugin-gitlab'
  else result = 'gitlab'
} else if (pluginName && !skillFolderHash && isOwnerRepoFormat(source)) result = 'plugin-github'
else if (sourceType === 'git') result = 'unsupported-git'
else if (isOwnerRepoFormat(source)) result = 'github-downgrade'
else result = 'unsupported-final'

console.log('Classification:', result)
