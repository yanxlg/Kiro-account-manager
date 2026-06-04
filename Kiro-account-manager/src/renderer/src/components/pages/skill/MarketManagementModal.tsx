import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Input, message, Modal, Space, Spin, Tabs, Tag, Typography } from 'antd'
import { DeleteOutlined, LinkOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { MarketplaceInfo, MarketplaceSourceType, AvailableSkill, SkillsSkillView } from './types'

/** Convert any git URL format to a browser-openable URL */
function getMarketplaceWebUrl(gitUrl: string): string | null {
  if (!gitUrl) return null
  const trimmed = gitUrl.trim()

  // Already has protocol — strip .git suffix
  if (/^https?:\/\//.test(trimmed)) {
    return trimmed.replace(/\.git$/, '')
  }

  // SSH format: git@host:owner/repo(.git)
  const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (sshMatch) {
    const host = sshMatch[1]
    const path = sshMatch[2]
    // GitHub uses https; other hosts (like internal GitLab) use http
    const protocol = host === 'github.com' ? 'https' : 'http'
    return `${protocol}://${host}/${path}`
  }

  // GitHub shorthand: owner/repo
  const shorthandMatch = trimmed.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/)
  if (shorthandMatch) {
    return `https://github.com/${shorthandMatch[1]}`
  }

  return null
}

interface MarketManagementModalProps {
  isEn: boolean
  open: boolean
  onCancel: () => void
}

interface ModalState {
  marketplaces: MarketplaceInfo[]
  selectedId: string | null
  activeTab: 'installed' | 'available'
  loading: boolean
  refreshing: boolean
  installedSkills: SkillsSkillView[]
  installedLoading: boolean
  remoteSkills: AvailableSkill[]
  remoteLoading: boolean
  remoteError: string | null
  addFormVisible: boolean
}

const initialState: ModalState = {
  marketplaces: [],
  selectedId: null,
  activeTab: 'installed',
  loading: false,
  refreshing: false,
  installedSkills: [],
  installedLoading: false,
  remoteSkills: [],
  remoteLoading: false,
  remoteError: null,
  addFormVisible: false
}

/** Source type tag configuration: color and label */
function getSourceTypeTag(
  sourceType: MarketplaceSourceType,
  isEn: boolean
): { color: string; label: string } {
  switch (sourceType) {
    case 'claude-plugin':
      return { color: 'purple', label: isEn ? 'Claude Plugin' : 'Claude 插件' }
    case 'github-skills':
      return { color: 'default', label: 'GitHub' }
    case 'custom':
      return { color: 'blue', label: isEn ? 'Custom' : '自定义' }
  }
}

/** AddMarketplaceForm: form for adding a new custom marketplace (matches InstallModal style) */
function AddMarketplaceForm(props: {
  isEn: boolean
  existingMarketplaces: MarketplaceInfo[]
  onSuccess: (marketplace: MarketplaceInfo) => void
  onCancel: () => void
}): React.ReactNode {
  const { isEn, existingMarketplaces, onSuccess, onCancel } = props
  const [gitUrl, setGitUrl] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (): Promise<void> => {
    setError(null)

    const trimmedUrl = gitUrl.trim()
    if (!trimmedUrl) {
      setError(isEn ? 'Please enter a git repository URL' : '请输入 git 仓库地址')
      return
    }

    const normalizeForCompare = (url: string): string =>
      url.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '')
    const normalizedInput = normalizeForCompare(trimmedUrl)
    const isDuplicate = existingMarketplaces.some(
      (mp) => normalizeForCompare(mp.gitUrl) === normalizedInput
    )
    if (isDuplicate) {
      setError(isEn ? 'This marketplace already exists' : '该市场已存在')
      return
    }

    setSubmitting(true)
    try {
      const result = await window.api.marketplaceAdd({
        gitUrl: trimmedUrl,
        name: name.trim() || undefined
      })
      const newMarketplace = result as MarketplaceInfo
      onSuccess(newMarketplace)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : isEn ? 'Failed to add marketplace' : '添加市场失败'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      title={isEn ? 'Add Marketplace' : '新增市场'}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText={isEn ? 'Add' : '添加'}
      cancelText={isEn ? 'Cancel' : '取消'}
      okButtonProps={{ loading: submitting, disabled: !gitUrl.trim() }}
      width={520}
      destroyOnHidden
    >
      <Space direction="vertical" size={16} className="w-full">
        <div>
          <Typography.Text strong>{isEn ? 'Git URL' : 'Git 仓库地址'}</Typography.Text>
          <Input
            variant="filled"
            value={gitUrl}
            onChange={(e) => {
              setGitUrl(e.target.value)
              if (error) setError(null)
            }}
            onPressEnter={handleSubmit}
            placeholder={isEn ? 'HTTPS URL, SSH URL, or owner/repo' : 'HTTPS 地址、SSH 地址 或 owner/repo'}
            status={error ? 'error' : undefined}
            className="mt-2"
          />
        </div>

        <div>
          <Typography.Text strong>{isEn ? 'Display Name' : '显示名称'}</Typography.Text>
          <Input
            variant="filled"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleSubmit}
            placeholder={isEn ? 'Optional, auto-detected from URL' : '可选，默认从 URL 自动提取'}
            className="mt-2"
          />
        </div>

        {error && (
          <Typography.Text type="danger">{error}</Typography.Text>
        )}
      </Space>
    </Modal>
  )
}

export function MarketManagementModal(props: MarketManagementModalProps): React.ReactNode {
  const { isEn, open, onCancel } = props
  const [state, setState] = useState<ModalState>(initialState)

  // Fetch marketplace list on modal open
  useEffect(() => {
    if (!open) {
      setState(initialState)
      return
    }
    setState((prev) => ({ ...prev, loading: true }))
    window.api
      .marketplaceList()
      .then((result: unknown) => {
        const marketplaces = Array.isArray(result) ? (result as MarketplaceInfo[]) : []
        setState((prev) => ({
          ...prev,
          marketplaces,
          selectedId: marketplaces.length > 0 ? marketplaces[0].id : null,
          loading: false
        }))
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false }))
      })
  }, [open])

  // Fetch remote skills when "available" tab is active and a marketplace is selected
  const fetchRemoteSkills = useCallback(() => {
    const selectedMarketplace = state.marketplaces.find((mp) => mp.id === state.selectedId)
    if (!selectedMarketplace) return

    setState((prev) => ({ ...prev, remoteLoading: true, remoteError: null }))
    window.api
      .marketplaceListRemoteSkills(selectedMarketplace)
      .then((result: unknown) => {
        // Handle error responses from IPC (returns { success: false, error: "..." })
        if (result && typeof result === 'object' && 'success' in result && !(result as { success: boolean }).success) {
          const errMsg = (result as { error?: string }).error || (isEn ? 'Failed to load skills' : '加载 skill 列表失败')
          setState((prev) => ({ ...prev, remoteError: errMsg, remoteLoading: false }))
          return
        }
        const skills = Array.isArray(result) ? (result as AvailableSkill[]) : []
        setState((prev) => ({ ...prev, remoteSkills: skills, remoteLoading: false }))
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : isEn ? 'Failed to load skills' : '加载 skill 列表失败'
        setState((prev) => ({ ...prev, remoteError: msg, remoteLoading: false }))
      })
  }, [state.marketplaces, state.selectedId, isEn])

  useEffect(() => {
    if (!open || state.activeTab !== 'available' || !state.selectedId) return
    fetchRemoteSkills()
  }, [open, state.activeTab, state.selectedId, fetchRemoteSkills])

  // Fetch installed skills for the selected marketplace
  const fetchInstalledSkills = useCallback(() => {
    const selectedMarketplace = state.marketplaces.find((mp) => mp.id === state.selectedId)
    if (!selectedMarketplace) return

    setState((prev) => ({ ...prev, installedLoading: true }))
    window.api
      .marketplaceGetInstalledSkills(selectedMarketplace)
      .then((result: unknown) => {
        const skills = Array.isArray(result) ? (result as SkillsSkillView[]) : []
        setState((prev) => ({ ...prev, installedSkills: skills, installedLoading: false }))
      })
      .catch(() => {
        setState((prev) => ({ ...prev, installedSkills: [], installedLoading: false }))
      })
  }, [state.marketplaces, state.selectedId])

  useEffect(() => {
    if (!open || state.activeTab !== 'installed' || !state.selectedId) return
    fetchInstalledSkills()
  }, [open, state.activeTab, state.selectedId, fetchInstalledSkills])

  // Handle delete marketplace (only for custom type)
  const handleDeleteMarketplace = useCallback(
    (mp: MarketplaceInfo) => {
      Modal.confirm({
        title: isEn ? 'Delete Marketplace' : '删除市场',
        content: isEn
          ? `Are you sure you want to delete marketplace "${mp.name}"?`
          : `确定删除市场 "${mp.name}" 吗？`,
        okText: isEn ? 'Delete' : '删除',
        cancelText: isEn ? 'Cancel' : '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            const result = (await window.api.marketplaceRemove(mp.id)) as {
              success: boolean
              error?: string
            }
            if (result.success) {
              setState((prev) => {
                const updatedMarketplaces = prev.marketplaces.filter((m) => m.id !== mp.id)
                const newSelectedId =
                  prev.selectedId === mp.id
                    ? updatedMarketplaces.length > 0
                      ? updatedMarketplaces[0].id
                      : null
                    : prev.selectedId
                return {
                  ...prev,
                  marketplaces: updatedMarketplaces,
                  selectedId: newSelectedId
                }
              })
            } else {
              message.error(
                result.error ||
                  (isEn ? 'Failed to delete marketplace' : '删除市场失败')
              )
            }
          } catch {
            message.error(isEn ? 'Failed to delete marketplace' : '删除市场失败')
          }
        }
      })
    },
    [isEn]
  )

  // Handle refresh marketplace list
  const handleRefresh = useCallback(async () => {
    setState((prev) => ({ ...prev, refreshing: true }))
    try {
      const result = await window.api.marketplaceRefresh()
      const marketplaces = Array.isArray(result) ? (result as MarketplaceInfo[]) : []
      setState((prev) => {
        // Preserve selection if the previously selected marketplace still exists
        const previousSelectedId = prev.selectedId
        const stillExists = marketplaces.some((mp) => mp.id === previousSelectedId)
        const newSelectedId = stillExists
          ? previousSelectedId
          : marketplaces.length > 0
            ? marketplaces[0].id
            : null
        return {
          ...prev,
          marketplaces,
          selectedId: newSelectedId,
          refreshing: false
        }
      })
    } catch {
      message.error(isEn ? 'Failed to refresh marketplace list' : '刷新市场列表失败')
      setState((prev) => ({ ...prev, refreshing: false }))
    }
  }, [isEn])

  return (
    <>
    <Modal
      open={open}
      title={isEn ? 'Marketplace Management' : '市场管理'}
      onCancel={onCancel}
      footer={null}
      width="80vw"
      style={{ minWidth: 900 }}
      destroyOnHidden
    >
      <div className="flex" style={{ height: 640 }}>
        {/* Left Panel - 30% Marketplace List */}
        <div
          className="flex flex-col border-r border-border/50 overflow-hidden"
          style={{ width: '30%', minWidth: 0 }}
        >
          {state.loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spin />
            </div>
          ) : (
            <>
              {/* MarketplaceList (task 6.2) */}
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {state.marketplaces.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                    {isEn
                      ? 'No marketplaces found. Add a marketplace to get started.'
                      : '暂无市场来源，请通过"新增市场"添加。'}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {state.marketplaces.map((mp) => {
                      const tag = getSourceTypeTag(mp.sourceType, isEn)
                      const isSelected = state.selectedId === mp.id
                      return (
                        <div
                          key={mp.id}
                          className={`group relative cursor-pointer rounded px-3 py-2 text-sm transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => setState((prev) => ({ ...prev, selectedId: mp.id }))}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{mp.name}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                type="text"
                                size="small"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                icon={<LinkOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const url = getMarketplaceWebUrl(mp.gitUrl)
                                  if (url) window.api.openExternal(url)
                                }}
                                title={isEn ? 'Open in browser' : '在浏览器中打开'}
                                style={{ width: 22, height: 22, minWidth: 22 }}
                              />
                              {mp.sourceType === 'custom' && (
                                <Button
                                  type="text"
                                  size="small"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  icon={<DeleteOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteMarketplace(mp)
                                  }}
                                  style={{ width: 22, height: 22, minWidth: 22 }}
                                />
                              )}
                              {(mp.installedSkillCount ?? 0) > 0 && (
                                <Badge
                                  count={mp.installedSkillCount}
                                  size="small"
                                  style={{ backgroundColor: isSelected ? '#1677ff' : '#8c8c8c' }}
                                />
                              )}
                            </div>
                          </div>
                          <div className="mt-1">
                            <Tag
                              color={tag.color}
                              style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px', margin: 0 }}
                            >
                              {tag.label}
                            </Tag>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* ActionBar (add + refresh buttons) */}
              <div className="border-t border-border/50 p-2">
                <div className="flex gap-2">
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    block
                    onClick={() => setState((prev) => ({ ...prev, addFormVisible: true }))}
                  >
                    {isEn ? 'Add Marketplace' : '新增市场'}
                  </Button>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={state.refreshing}
                    disabled={state.refreshing}
                    onClick={() => void handleRefresh()}
                    title={isEn ? 'Refresh' : '刷新'}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Panel - 70% Detail Area */}
        <div className="flex flex-1 flex-col overflow-hidden" style={{ width: '70%', minWidth: 0 }}>
          {state.selectedId ? (
            <>
              {/* Tabs header */}
              <Tabs
                activeKey={state.activeTab}
                onChange={(key) =>
                  setState((prev) => ({ ...prev, activeTab: key as 'installed' | 'available' }))
                }
                className="px-4"
                items={[
                  {
                    key: 'installed',
                    label: isEn ? 'Installed' : '已安装'
                  },
                  {
                    key: 'available',
                    label: isEn ? 'All Skills' : '全部 skill'
                  }
                ]}
              />
              {/* Tab content area */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                {state.activeTab === 'installed' ? (
                  <div className="text-sm">
                    {state.installedLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Spin />
                      </div>
                    ) : state.installedSkills.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-muted-foreground">
                        {isEn
                          ? 'No installed skills in this marketplace'
                          : '该市场暂无已安装的 skill'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          // Group skills by name to deduplicate across agents
                          const grouped = new Map<string, { skill: SkillsSkillView; agents: string[] }>()
                          for (const skill of state.installedSkills) {
                            const existing = grouped.get(skill.name)
                            if (existing) {
                              if (!existing.agents.includes(skill.agent)) {
                                existing.agents.push(skill.agent)
                              }
                            } else {
                              grouped.set(skill.name, { skill, agents: [skill.agent] })
                            }
                          }
                          return Array.from(grouped.values()).map(({ skill, agents }) => (
                            <div
                              key={skill.name}
                              className="flex items-center justify-between rounded border border-border/50 px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium">{skill.name}</div>
                                {skill.description && (
                                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {skill.description}
                                  </div>
                                )}
                                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>
                                    {isEn ? 'Agents' : '所属 Agent'}:{' '}
                                    <span className="text-foreground">{agents.join(', ')}</span>
                                  </span>
                                  {skill.installedAt && (
                                    <span>
                                      {isEn ? 'Installed' : '安装时间'}:{' '}
                                      <span className="text-foreground">
                                        {new Date(skill.installedAt).toLocaleDateString()}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Tag color="green" style={{ marginLeft: 8, flexShrink: 0 }}>
                                {isEn ? 'Installed' : '已安装'}
                              </Tag>
                            </div>
                          ))
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm">
                    {/* AvailableSkillList (task 6.4) */}
                    {state.remoteLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Spin />
                      </div>
                    ) : state.remoteError ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                        <span>{state.remoteError}</span>
                        <Button size="small" onClick={fetchRemoteSkills}>
                          {isEn ? 'Retry' : '重试'}
                        </Button>
                      </div>
                    ) : state.remoteSkills.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-muted-foreground">
                        {isEn
                          ? 'No skills found in this marketplace'
                          : '该市场暂无 skill'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {state.remoteSkills.map((skill) => (
                          <div
                            key={skill.path}
                            className="flex items-center justify-between rounded border border-border/50 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{skill.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {skill.path}
                              </div>
                            </div>
                            {skill.installed ? (
                              <Tag color="green" style={{ marginLeft: 8, flexShrink: 0 }}>
                                {isEn ? 'Installed' : '已安装'}
                              </Tag>
                            ) : (
                              <Button
                                size="small"
                                type="primary"
                                style={{ marginLeft: 8, flexShrink: 0 }}
                                onClick={async () => {
                                  const selectedMarketplace = state.marketplaces.find((mp) => mp.id === state.selectedId)
                                  if (!selectedMarketplace) return
                                  const result = await window.api.skillsInstall({
                                    source: selectedMarketplace.gitUrl,
                                    agents: [],
                                    skills: [skill.name]
                                  }) as { success: boolean; error?: string }
                                  if (result.success) {
                                    message.success(isEn ? `${skill.name} installed` : `${skill.name} 安装成功`)
                                    // Refresh remote skills to update installed status
                                    fetchRemoteSkills()
                                  } else {
                                    message.error(result.error || (isEn ? 'Install failed' : '安装失败'))
                                  }
                                }}
                              >
                                {isEn ? 'Install' : '安装'}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {isEn ? 'Select a marketplace to view details' : '请选择一个市场查看详情'}
            </div>
          )}
        </div>
      </div>
    </Modal>

      {/* Add Marketplace Modal */}
      {state.addFormVisible && (
        <AddMarketplaceForm
          isEn={isEn}
          existingMarketplaces={state.marketplaces}
          onSuccess={(newMarketplace) => {
            setState((prev) => ({
              ...prev,
              marketplaces: [...prev.marketplaces, newMarketplace],
              selectedId: newMarketplace.id,
              addFormVisible: false
            }))
          }}
          onCancel={() => setState((prev) => ({ ...prev, addFormVisible: false }))}
        />
      )}
    </>
  )
}
