import { Badge, Button, Input, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Download, Edit, Plug, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { EditModal } from './EditModal'
import type { ManagedMcpServer, McpAgentView } from './types'
import { useMcpManager } from './useMcpManager'

/** Agent 颜色池（按 index 分配，保证同一 Agent 颜色固定） */
const AGENT_COLORS = [
  'blue',
  'purple',
  'green',
  'orange',
  'cyan',
  'magenta',
  'geekblue',
  'gold',
  'lime',
  'volcano'
] as const

function agentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

/** 扁平化后的行数据：一个 MCP server + 它存在于哪些 Agent（含配置路径） */
interface FlatRow {
  name: string
  transport: string
  managed: boolean
  managedServer?: ManagedMcpServer
  /** 每个拥有此 server 的 agent（displayName + configPath + color） */
  agents: Array<{ displayName: string; configPath: string; color: string }>
  warning?: string
}

export function McpPage(): React.ReactNode {
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const [tableScrollY, setTableScrollY] = useState(480)
  const { t } = useTranslation()
  const isEn = t('common.unknown') === 'Unknown'
  const {
    agents,
    busy,
    editing,
    kiroInstalled,
    query,
    servers,
    showEditDialog,
    deleteServer,
    importFromAgents,
    load,
    openCreate,
    openEdit,
    saveServer,
    setQuery,
    setShowEditDialog
  } = useMcpManager(isEn)

  // 构建 agent id → (displayName, color) 映射
  const agentMeta = useMemo(() => {
    const map = new Map<string, { displayName: string; color: string }>()
    agents.forEach((agent, idx) => {
      map.set(agent.id, { displayName: agent.displayName, color: agentColor(idx) })
    })
    return map
  }, [agents])

  // 扁平化：去重 server name，合并各 agent 信息
  const flatRows: FlatRow[] = useMemo(() => {
    const rowMap = new Map<string, FlatRow>()

    agents.forEach((agent: McpAgentView) => {
      if (!agent.installed) return
      const meta = agentMeta.get(agent.id)
      if (!meta) return

      for (const reg of agent.servers) {
        const key = reg.name.toLowerCase()
        let row = rowMap.get(key)
        if (!row) {
          const managed =
            servers.find((s) => s.name.toLowerCase() === key) ||
            reg.server || {
              name: reg.name,
              transport:
                reg.nativeTransport === 'http' || reg.nativeTransport === 'sse'
                  ? reg.nativeTransport
                  : 'stdio',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              source: 'imported'
            }
          row = {
            name: reg.name,
            transport: reg.nativeTransport,
            managed: reg.managed,
            managedServer: managed as ManagedMcpServer,
            agents: [],
            warning: reg.warning
          }
          rowMap.set(key, row)
        }
        row.agents.push({
          displayName: meta.displayName,
          configPath: reg.configPath,
          color: meta.color
        })
      }
    })

    return Array.from(rowMap.values())
  }, [agents, agentMeta, servers])

  // 搜索过滤
  const lowerQuery = query.trim().toLowerCase()
  const filteredRows = useMemo(
    () =>
      lowerQuery
        ? flatRows.filter(
            (row) =>
              row.name.toLowerCase().includes(lowerQuery) ||
              row.transport.toLowerCase().includes(lowerQuery) ||
              row.agents.some((a) => a.displayName.toLowerCase().includes(lowerQuery)) ||
              row.agents.some((a) => a.configPath.toLowerCase().includes(lowerQuery)) ||
              (row.managedServer?.url || '').toLowerCase().includes(lowerQuery) ||
              (row.managedServer?.command || '').toLowerCase().includes(lowerQuery)
          )
        : flatRows,
    [flatRows, lowerQuery]
  )

  const totalCount = flatRows.length

  // 表格高度自适应
  useEffect(() => {
    const container = tableContainerRef.current
    if (!container) return

    const updateTableScrollY = (): void => {
      const title = container.querySelector('.ant-table-title') as HTMLElement | null
      const header = container.querySelector('.ant-table-thead') as HTMLElement | null
      const containerHeight = container.clientHeight
      const titleHeight = title?.offsetHeight || 0
      const headerHeight = header?.offsetHeight || 0
      setTableScrollY(Math.max(200, containerHeight - titleHeight - headerHeight - 8))
    }

    updateTableScrollY()
    const observer = new ResizeObserver(() => updateTableScrollY())
    observer.observe(container)
    window.addEventListener('resize', updateTableScrollY)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateTableScrollY)
    }
  }, [filteredRows.length, query])

  const columns: ColumnsType<FlatRow> = [
    {
      title: 'MCP',
      key: 'registration',
      width: 320,
      render: (_value, row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{row.name}</span>
            {row.managedServer?.disabled ? (
              <Tag color="default">{isEn ? 'Disabled' : '已禁用'}</Tag>
            ) : null}
          </div>
          {row.managedServer?.description ? (
            <div className="line-clamp-2 text-xs text-muted-foreground">
              {row.managedServer.description}
            </div>
          ) : null}
          <div className="truncate font-mono text-[10px] text-muted-foreground/80">
            {row.managedServer?.url ||
              [row.managedServer?.command, ...(row.managedServer?.args || [])]
                .filter(Boolean)
                .join(' ') ||
              ''}
          </div>
        </div>
      )
    },
    {
      title: isEn ? 'Transport' : '传输',
      dataIndex: 'transport',
      width: 90,
      render: (transport: string) =>
        transport === 'unknown' ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <Tag color={transport === 'stdio' ? 'blue' : 'green'}>{transport}</Tag>
        )
    },
    {
      title: isEn ? 'Agents' : 'Agent',
      key: 'agents',
      width: 220,
      render: (_value, row) => (
        <div className="flex flex-wrap gap-1">
          {row.agents.map((agent) => (
            <Tooltip key={agent.displayName} title={agent.configPath}>
              <Tag
                color={agent.color}
                className="cursor-pointer"
                onClick={() => window.api.openLocalFile(agent.configPath)}
              >
                {agent.displayName}
              </Tag>
            </Tooltip>
          ))}
        </div>
      )
    },
    {
      title: isEn ? 'Actions' : '操作',
      key: 'actions',
      width: 72,
      fixed: 'right',
      render: (_value, row) => (
        <Space size={4}>
          <Tooltip title={isEn ? 'Edit' : '编辑'}>
            <Button
              size="small"
              type="text"
              icon={<Edit className="h-4 w-4" />}
              onClick={() => openEdit(row.managedServer!)}
            />
          </Tooltip>
          <Tooltip title={isEn ? 'Delete' : '删除'}>
            <Button
              size="small"
              type="text"
              danger
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => void deleteServer({ name: row.name })}
            />
          </Tooltip>
        </Space>
      )
    }
  ]

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2">
          <Plug className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <Typography.Title level={4} style={{ margin: 0 }}>
            <Badge
              count={totalCount}
              showZero
              overflowCount={999}
              offset={[8, -4]}
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-primary-foreground)',
                fontSize: 11
              }}
            >
              {isEn ? 'MCP Manager' : 'MCP 管理'}
            </Badge>
          </Typography.Title>
          <Typography.Text type="secondary">
            {isEn ? 'Manage local MCP registrations' : '管理本机 MCP 注册'}
          </Typography.Text>
        </div>
        <Button
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={() => void load()}
          loading={busy === 'load'}
        >
          {isEn ? 'Refresh' : '刷新'}
        </Button>
      </div>

      <div
        className="border px-4 py-3"
        style={{
          background: 'transparent',
          borderColor: 'var(--color-border)'
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            {isEn ? 'Add' : '添加'}
          </Button>
          <Button
            icon={<Download className="h-4 w-4" />}
            loading={busy === 'import'}
            onClick={() => void importFromAgents()}
          >
            {isEn ? 'Import existing' : '导入已有'}
          </Button>
        </div>
      </div>

      <div ref={tableContainerRef} className="min-h-0 flex-1 overflow-hidden">
        <Table
          rowKey={(row) => row.name}
          columns={columns}
          dataSource={filteredRows}
          pagination={false}
          size="middle"
          loading={busy === 'load'}
          styles={{
            root: { borderRadius: 8, overflow: 'hidden' }
          }}
          title={() => (
            <div className="flex flex-wrap items-center gap-2" style={{ paddingLeft: 14 }}>
              <Input
                allowClear
                variant="filled"
                prefix={<Search className="h-3.5 w-3.5" />}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isEn ? 'Search MCP...' : '搜索 MCP...'}
                className="ml-auto"
                style={{ width: 280 }}
              />
            </div>
          )}
          scroll={{ x: 780, y: tableScrollY }}
          locale={{ emptyText: isEn ? 'No MCP registrations' : '暂无 MCP 注册' }}
        />
      </div>

      <EditModal
        open={showEditDialog}
        isEn={isEn}
        server={editing}
        kiroInstalled={kiroInstalled}
        saving={busy === 'save'}
        onCancel={() => setShowEditDialog(false)}
        onSave={(server, oldName) => void saveServer(server, oldName)}
      />
    </div>
  )
}
