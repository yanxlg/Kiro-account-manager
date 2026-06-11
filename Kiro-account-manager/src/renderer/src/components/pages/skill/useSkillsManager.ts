import { useCallback, useEffect, useMemo, useState } from 'react'
import { App } from 'antd'
import type { OperationBusy, SkillsAgentView, SkillsManagerConfig, SkillUpdateStatus } from './types'

// The return shape is intentionally broad because this hook is the page's local module boundary.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useSkillsManager(isEn: boolean) {
  const { message, modal } = App.useApp()
  const [agents, setAgents] = useState<SkillsAgentView[]>([])
  const [config, setConfig] = useState<SkillsManagerConfig | null>(null)
  const [activeAgent, setActiveAgent] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState<OperationBusy>('load')
  const [installSource, setInstallSource] = useState('')
  const [installSkillNames, setInstallSkillNames] = useState('')
  const [installTargets, setInstallTargets] = useState<string[]>([])
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [syncTargets, setSyncTargets] = useState<string[]>([])
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [syncSource, setSyncSource] = useState('')
  const [fullSyncTargets, setFullSyncTargets] = useState<string[]>([])
  const [showFullSyncDialog, setShowFullSyncDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [showMarketDialog, setShowMarketDialog] = useState(false)
  const [updateStatuses, setUpdateStatuses] = useState<
    Record<string, { status: SkillUpdateStatus; reason?: string }>
  >({})
  const hasSkillsApi = typeof window.api.skillsList === 'function'
  const initialCheckDone = useMemo(() => ({ current: false }), [])

  const load = useCallback(async () => {
    if (!hasSkillsApi) {
      message.error(
        isEn
          ? 'Skills API is not loaded. Please restart the Electron app.'
          : 'Skills API 尚未加载，请重启 Electron 应用。'
      )
      setBusy(null)
      return
    }

    setBusy('load')
    try {
      const result = await window.api.skillsList()
      setAgents(result.agents)
      setConfig(result.config)
      // 从后端返回的缓存状态初始化 updateStatuses
      const cachedStatuses: Record<string, { status: SkillUpdateStatus; reason?: string }> = {}
      for (const agent of result.agents) {
        for (const skill of agent.skills) {
          if (skill.updateStatus && skill.updateStatus !== 'unknown') {
            cachedStatuses[`${agent.id}:${skill.name}`] = {
              status: skill.updateStatus as SkillUpdateStatus,
              reason: skill.updateReason
            }
          }
        }
      }
      if (Object.keys(cachedStatuses).length > 0) {
        setUpdateStatuses((prev) => ({ ...prev, ...cachedStatuses }))
      }
      const nextActive = result.config.lastSelectedAgent || activeAgent || result.agents[0]?.id || ''
      const resolvedActive = result.agents.some((agent) => agent.id === nextActive)
        ? nextActive
        : result.agents[0]?.id || ''
      setActiveAgent(resolvedActive)
      if (installTargets.length === 0) {
        setInstallTargets(result.agents.map((agent) => agent.id))
      }
      if (syncTargets.length === 0) {
        setSyncTargets(result.agents.filter((agent) => agent.id !== resolvedActive).map((agent) => agent.id))
      }
      if (fullSyncTargets.length === 0 && resolvedActive) {
        setFullSyncTargets([resolvedActive])
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }, [activeAgent, fullSyncTargets.length, hasSkillsApi, installTargets.length, isEn, message, syncTargets.length])

  useEffect(() => {
    void load()
  }, [load])

  const currentAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgent),
    [agents, activeAgent]
  )

  const otherAgents = useMemo(
    () => agents.filter((agent) => agent.id !== currentAgent?.id),
    [agents, currentAgent?.id]
  )

  const filteredSkills = useMemo(() => {
    const lower = query.trim().toLowerCase()
    const skills = currentAgent?.skills || []
    if (!lower) return skills
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(lower) ||
        skill.description.toLowerCase().includes(lower) ||
        (skill.source || '').toLowerCase().includes(lower) ||
        skill.path.toLowerCase().includes(lower)
    )
  }, [currentAgent?.skills, query])

  const fullSyncSourceAgent = useMemo(
    () => agents.find((agent) => agent.id === syncSource),
    [agents, syncSource]
  )

  const fullSyncTargetOptions = useMemo(
    () => agents.filter((agent) => agent.id !== syncSource),
    [agents, syncSource]
  )

  const effectiveSyncTargets = useMemo(
    () => syncTargets.filter((id) => otherAgents.some((agent) => agent.id === id)),
    [otherAgents, syncTargets]
  )

  const effectiveFullSyncTargets = useMemo(
    () => fullSyncTargets.filter((id) => fullSyncTargetOptions.some((agent) => agent.id === id)),
    [fullSyncTargetOptions, fullSyncTargets]
  )

  const setActiveAndPersist = useCallback(
    async (agentId: string) => {
      setActiveAgent(agentId)
      setSelected([])
      setSyncTargets(agents.filter((agent) => agent.id !== agentId).map((agent) => agent.id))
      setFullSyncTargets([agentId])
      await window.api.skillsSaveConfig({ lastSelectedAgent: agentId })
    },
    [agents]
  )

  const saveConfigPatch = useCallback(
    async (patch: Partial<SkillsManagerConfig>) => {
      setConfig((prev) => (prev ? { ...prev, ...patch } : prev))
      const result = await window.api.skillsSaveConfig(patch)
      if (!result.success) {
        message.error(result.error || (isEn ? 'Save failed' : '保存失败'))
        await load()
        return false
      }
      if (result.config) {
        setConfig(result.config)
      }
      return true
    },
    [isEn, load, message]
  )

  const updateSkillAutoUpdate = useCallback(
    async (skillName: string, enabled: boolean) => {
      if (!currentAgent) return
      const result = await window.api.skillsSetAutoUpdate({
        agent: currentAgent.id,
        skillName,
        enabled
      })
      if (!result.success) {
        message.error(result.error || (isEn ? 'Save failed' : '保存失败'))
        return
      }
      setAgents((prev) =>
        prev.map((agent) =>
          agent.id !== currentAgent.id
            ? agent
            : {
                ...agent,
                skills: agent.skills.map((skill) =>
                  skill.name === skillName ? { ...skill, autoUpdate: enabled } : skill
                )
              }
        )
      )
    },
    [currentAgent, isEn, message]
  )

  const runInstall = useCallback(async () => {
    if (!installSource.trim() || installTargets.length === 0) return
    setBusy('install')
    const skillNames = installSkillNames
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const result = await window.api.skillsInstall({
      source: installSource.trim(),
      agents: installTargets,
      skills: skillNames,
      copy: config?.defaultInstallMode === 'copy'
    })
    setBusy(null)
    if (result.success) {
      message.success(isEn ? 'Install complete' : '安装完成')
      setInstallSource('')
      setInstallSkillNames('')
      setShowInstallDialog(false)
      await load()
      return
    }
    message.error(result.error || (isEn ? 'Install failed' : '安装失败'))
  }, [installSkillNames, installSource, installTargets, isEn, load, message])

  const runDelete = useCallback(
    async (_allAgents = false, names = selected) => {
      if (!currentAgent || names.length === 0) return

      // 找到要删除的 skill 对象
      const skillsToDelete = (currentAgent.skills || []).filter((s) => names.includes(s.name))

      for (const skill of skillsToDelete) {
        if (skill.installType === 'plugin') {
          // Plugin skill：获取 plugin 信息
          const info = await window.api.skillsGetPluginDeleteInfo({
            skillName: skill.name,
            pluginName: skill.pluginName || '',
            marketplace: skill.source || ''
          })
          if (!info) {
            message.error(isEn ? 'Failed to get plugin info' : '获取插件信息失败')
            continue
          }
          const confirmed = await modal.confirm({
            title: isEn ? 'Delete skill?' : '删除技能？',
            okText: isEn ? 'Delete' : '删除',
            cancelText: isEn ? 'Cancel' : '取消',
            content: info.skillNames.length <= 1
              ? (isEn
                ? `Are you sure you want to delete "${skill.name}"?`
                : `确定要删除「${skill.name}」吗？`)
              : (isEn
                ? `Deleting "${skill.name}" will also remove: ${info.skillNames.filter(n => n !== skill.name).join(', ')}`
                : `删除「${skill.name}」会同时移除：${info.skillNames.filter(n => n !== skill.name).join('、')}`)
          })
          if (!confirmed) continue

          setBusy('delete')
          const result = await window.api.skillsDeletePlugin(info)
          setBusy(null)
          if (!result.success) {
            message.error(result.error || (isEn ? 'Delete failed' : '删除失败'))
          } else {
            message.success(isEn ? 'Deleted' : '已删除')
          }
        } else {
          const confirmed = await modal.confirm({
            title: isEn ? 'Delete skill?' : '删除技能？',
            okText: isEn ? 'Delete' : '删除',
            cancelText: isEn ? 'Cancel' : '取消',
            content: isEn
              ? `Are you sure you want to delete "${skill.name}"?`
              : `确定要删除「${skill.name}」吗？`
          })
          if (!confirmed) continue

          setBusy('delete')
          const result = await window.api.skillsDeleteSkill({ skillName: skill.name })
          setBusy(null)
          if (!result.success) {
            message.error(result.error || (isEn ? 'Delete failed' : '删除失败'))
          } else {
            message.success(isEn ? 'Deleted' : '已删除')
          }
        }
      }

      setSelected([])
      await load()
    },
    [currentAgent, isEn, load, message, modal, selected]
  )

  const runSync = useCallback(
    async (skillNames = selected, targetAgents = effectiveSyncTargets) => {
      if (!currentAgent || skillNames.length === 0 || targetAgents.length === 0) return

      const confirmed = await modal.confirm({
        title: isEn ? 'Sync skills?' : '同步技能？',
        okText: isEn ? 'Sync' : '同步',
        cancelText: isEn ? 'Cancel' : '取消',
        content: isEn
          ? `Sync "${skillNames.join(', ')}" to ${targetAgents.length} agent(s)?`
          : `将「${skillNames.join('、')}」同步到 ${targetAgents.length} 个 Agent？`
      })
      if (!confirmed) return

      setBusy('sync')
      const result = await window.api.skillsSync({
        sourceAgent: currentAgent.id,
        skillNames,
        targetAgents
      })
      setBusy(null)
      if (result.success) {
        message.success(isEn ? 'Synced' : '同步完成')
        setShowSyncDialog(false)
        await load()
        return
      }
      message.error(result.error || (isEn ? 'Sync failed' : '同步失败'))
    },
    [currentAgent, effectiveSyncTargets, isEn, load, message, modal, selected]
  )

  const runSyncFromAgent = useCallback(
    async (targetAgents = effectiveFullSyncTargets) => {
      if (!syncSource || targetAgents.length === 0) return
      const source = agents.find((agent) => agent.id === syncSource)
      if (!source || source.skills.length === 0) return
      setBusy('sync')
      const result = await window.api.skillsSync({
        sourceAgent: source.id,
        skillNames: source.skills.map((skill) => skill.name),
        targetAgents,
        overwrite: true
      })
      setBusy(null)
      if (result.success) {
        message.success(isEn ? 'Synced from agent' : '已从 Agent 全量同步')
        setShowFullSyncDialog(false)
        await load()
        return
      }
      message.error(result.error || (isEn ? 'Sync failed' : '同步失败'))
    },
    [agents, effectiveFullSyncTargets, isEn, load, message, syncSource]
  )

  const runUpdate = useCallback(
    async (skillNames = selected) => {
      if (!currentAgent || skillNames.length === 0) return

      const skillsToUpdate = (currentAgent.skills || []).filter((s) => skillNames.includes(s.name))

      // 确认弹窗
      const confirmMsg = skillNames.length === 1
        ? (isEn ? `Are you sure you want to update "${skillNames[0]}"?` : `确定要更新「${skillNames[0]}」吗？`)
        : (isEn ? `Update ${skillNames.length} skill(s)?` : `确定更新 ${skillNames.length} 个技能？`)

      const confirmed = await modal.confirm({
        title: isEn ? 'Update skill?' : '更新技能？',
        okText: isEn ? 'Update' : '更新',
        cancelText: isEn ? 'Cancel' : '取消',
        content: confirmMsg
      })
      if (!confirmed) return

      setBusy('update')
      let allSuccess = true

      for (const name of skillNames) {
        const skill = skillsToUpdate.find((s) => s.name === name)
        const key = `${currentAgent.id}:${name}`

        // 更新中状态
        setUpdateStatuses((prev) => ({ ...prev, [key]: { status: 'updating' } }))

        if (skill?.installType === 'plugin') {
          const result = await window.api.skillsUpdatePlugin({
            pluginName: skill.pluginName || '',
            marketplace: skill.source || ''
          })
          if (!result.success) {
            message.error(`${name}: ${result.error || (isEn ? 'Update failed' : '更新失败')}`)
            allSuccess = false
            setUpdateStatuses((prev) => ({
              ...prev,
              [key]: { status: 'available', reason: result.error }
            }))
          } else {
            setUpdateStatuses((prev) => ({ ...prev, [key]: { status: 'latest' } }))
          }
        } else {
          const result = await window.api.skillsUpdateSkill({ skillName: name })
          if (!result.success) {
            message.error(`${name}: ${result.error || (isEn ? 'Update failed' : '更新失败')}`)
            allSuccess = false
            setUpdateStatuses((prev) => ({
              ...prev,
              [key]: { status: 'available', reason: result.error }
            }))
          } else {
            setUpdateStatuses((prev) => ({ ...prev, [key]: { status: 'latest' } }))
          }
        }
      }

      setBusy(null)
      if (allSuccess) {
        message.success(isEn ? 'Update complete' : '更新完成')
      }
      await load()
    },
    [currentAgent, isEn, load, message, modal, selected]
  )

  const runCheck = useCallback(
    async (skillName: string) => {
      if (!currentAgent) return
      setBusy('check')
      const result = await window.api.skillsCheckUpdate({
        agent: currentAgent.id,
        skillName
      })
      setBusy(null)
      if (!result.success || result.reason) {
        message[result.success ? 'info' : 'error'](
          result.reason || (isEn ? 'Check failed' : '检查失败')
        )
      }
      // 检测完成后刷新列表以更新 version 列
      await load()
    },
    [currentAgent, isEn, load, message]
  )

  const runCheckAll = useCallback(
    async () => {
      if (!currentAgent) return
      setBusy('check')
      // 委托给后端并发池检测，结果通过 push 事件实时更新
      await window.api.skillsCheckUpdateBatch({ agent: currentAgent.id })
      setBusy(null)
      // 检测完成后重新加载列表以刷新 version（lastKnownVersion 由 backend 持久化）
      await load()
    },
    [currentAgent, load]
  )

  useEffect(() => {
    if (initialCheckDone.current) return
    if (busy === null && currentAgent && filteredSkills.length > 0) {
      initialCheckDone.current = true
      void runCheckAll()
    }
  }, [busy, currentAgent, filteredSkills.length, initialCheckDone, runCheckAll])

  // Task 13.2: Listen for push events to reactively update skill statuses.
  // 为保证「更新中」过程态可见，终态至少在 'updating' 显示 MIN_UPDATING_MS 后才覆盖。
  const updatingSinceRef = useMemo<{ current: Record<string, number> }>(() => ({ current: {} }), [])
  const pendingFinalRef = useMemo<{ current: Record<string, ReturnType<typeof setTimeout>> }>(
    () => ({ current: {} }),
    []
  )
  useEffect(() => {
    const MIN_UPDATING_MS = 700
    const unsubStatus = window.api.onSkillsUpdateStatusChanged?.((event) => {
      const key = `${event.agent}:${event.skillName}`
      const next = { status: event.status as SkillUpdateStatus, reason: event.reason }

      // 清除该 key 上待生效的终态
      if (pendingFinalRef.current[key]) {
        clearTimeout(pendingFinalRef.current[key])
        delete pendingFinalRef.current[key]
      }

      if (event.status === 'updating') {
        updatingSinceRef.current[key] = Date.now()
        setUpdateStatuses((prev) => ({ ...prev, [key]: next }))
        return
      }

      // 终态：确保「更新中」至少显示了 MIN_UPDATING_MS
      const since = updatingSinceRef.current[key]
      const remaining = since ? MIN_UPDATING_MS - (Date.now() - since) : 0
      if (remaining > 0) {
        pendingFinalRef.current[key] = setTimeout(() => {
          delete pendingFinalRef.current[key]
          delete updatingSinceRef.current[key]
          setUpdateStatuses((prev) => ({ ...prev, [key]: next }))
        }, remaining)
      } else {
        delete updatingSinceRef.current[key]
        setUpdateStatuses((prev) => ({ ...prev, [key]: next }))
      }
    })
    return () => {
      unsubStatus?.()
      Object.values(pendingFinalRef.current).forEach(clearTimeout)
      pendingFinalRef.current = {}
    }
  }, [])

  // Task 13.3: Listen for batch update completed events and show notification
  useEffect(() => {
    const unsubBatch = window.api.onSkillsBatchUpdateCompleted?.((event) => {
      const successCount = event.successes.length
      const failCount = event.failures.length
      if (successCount > 0 || failCount > 0) {
        message.info(
          isEn
            ? `${successCount} skill(s) updated, ${failCount} failed`
            : `${successCount} 个 skill 已更新，${failCount} 个失败`,
          5
        )
        // Refresh list to reflect updated skills
        void load()
      }
    })
    return () => { unsubBatch?.() }
  }, [isEn, load, message])

  // Task 13.5: Batch set auto-update for selected skills
  const runBatchSetAutoUpdate = useCallback(
    async (enabled: boolean) => {
      if (!currentAgent || selected.length === 0) return
      const skillKeys = selected.map((name) => `${currentAgent.id}:${name}`)
      setBusy('update')
      await window.api.skillsBatchSetAutoUpdate({ skillKeys, enabled })
      setBusy(null)
      await load()
    },
    [currentAgent, load, selected]
  )

  // Task 13.6: Get update history for a skill
  const getUpdateHistory = useCallback(
    async (skillName: string) => {
      const result = await window.api.skillsGetUpdateHistory({ skillName })
      return result
    },
    []
  )

  return {
    activeAgent,
    agents,
    busy,
    config,
    currentAgent,
    effectiveFullSyncTargets,
    effectiveSyncTargets,
    filteredSkills,
    fullSyncSourceAgent,
    fullSyncTargetOptions,
    fullSyncTargets,
    hasSkillsApi,
    installSkillNames,
    installSource,
    installTargets,
    otherAgents,
    query,
    selected,
    showFullSyncDialog,
    showInstallDialog,
    showMarketDialog,
    showSettingsDialog,
    showSyncDialog,
    syncSource,
    syncTargets,
    updateStatuses,
    load,
    runCheck,
    runCheckAll,
    runDelete,
    runInstall,
    runSync,
    runSyncFromAgent,
    runUpdate,
    setActiveAndPersist,
    setFullSyncTargets,
    setInstallSkillNames,
    setInstallSource,
    setInstallTargets,
    setQuery,
    setSelected,
    setShowFullSyncDialog,
    setShowInstallDialog,
    setShowMarketDialog,
    setShowSettingsDialog,
    setShowSyncDialog,
    setSyncSource,
    setSyncTargets,
    updateSkillAutoUpdate,
    saveConfigPatch,
    runBatchSetAutoUpdate,
    getUpdateHistory
  }
}
