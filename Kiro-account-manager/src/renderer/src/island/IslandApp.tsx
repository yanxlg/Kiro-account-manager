import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type {
  IslandAccountSnapshot,
  IslandProxySnapshot,
  IslandPrefs
} from '../../../preload/island'
import islandLogo from '../assets/Kiro Logo.png'

type Lang = 'en' | 'zh'

const STRINGS = {
  en: {
    noAccount: 'No Active Account',
    usage: 'Usage',
    unknown: 'Unknown',
    proxyRunning: 'Proxy running',
    proxyStopped: 'Proxy stopped',
    open: 'Open',
    switch: 'Switch',
    refresh: 'Refresh',
    active: 'Active',
    error: 'Error'
  },
  zh: {
    noAccount: '暂无活跃账户',
    usage: '用量',
    unknown: '未知',
    proxyRunning: '反代运行中',
    proxyStopped: '反代已停止',
    open: '打开',
    switch: '切换',
    refresh: '刷新',
    active: '活跃',
    error: '异常'
  }
} as const

const DRAG_THRESHOLD = 4
const COLLAPSE_DELAY = 300

function dotClass(status: string | undefined): string {
  if (status === 'active') return 'island-dot island-dot--active'
  if (status === 'error') return 'island-dot island-dot--error'
  return 'island-dot island-dot--idle'
}

/** 计算用量百分比，做除零/NaN 保护（Property 7） */
function usagePercent(usage?: { usedCredits: number; totalCredits: number }): number | null {
  if (!usage || !Number.isFinite(usage.totalCredits) || usage.totalCredits <= 0) return null
  const pct = (usage.usedCredits / usage.totalCredits) * 100
  if (!Number.isFinite(pct)) return null
  return Math.min(100, Math.max(0, pct))
}

/** 隐私模式邮箱脱敏（与主窗口 maskEmail 算法一致） */
function maskEmail(email: string, privacy: boolean): string {
  if (!privacy || !email) return email
  const hash = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return `user${(hash % 100000).toString().padStart(5, '0')}@***.com`
}

/** 将主题偏好应用为根节点 CSS 变量，供 island.css 使用（Requirement 9.3） */
function applyPrefsToRoot(prefs: IslandPrefs): void {
  const root = document.documentElement
  root.style.setProperty('--isl-primary', prefs.primary)
  root.style.setProperty('--isl-grad-to', prefs.gradientTo)
  root.style.setProperty('--isl-fg', prefs.foreground)
  root.style.setProperty('--isl-muted', prefs.mutedForeground)
  root.style.setProperty('--isl-border', prefs.border)
  // 深/浅色玻璃底色
  root.style.setProperty('--isl-bg', prefs.isDark ? 'rgba(18, 24, 38, 0.82)' : 'rgba(255, 255, 255, 0.86)')
  root.style.setProperty('--isl-track', prefs.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)')
  root.style.setProperty('--isl-tag-bg', prefs.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)')
  root.style.setProperty('--isl-btn-bg', prefs.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)')
  root.dataset.islandDark = prefs.isDark ? 'true' : 'false'
}

export default function IslandApp(): React.JSX.Element {
  const [account, setAccount] = useState<IslandAccountSnapshot | null>(null)
  const [proxy, setProxy] = useState<IslandProxySnapshot | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [lang, setLang] = useState<Lang>('zh')
  const [privacy, setPrivacy] = useState(false)

  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragState = useRef<{ grabX: number; grabY: number; moved: boolean } | null>(null)

  const t = STRINGS[lang]

  // ============ 订阅主进程推送 ============
  useEffect(() => {
    const unsubs = [
      window.islandApi.onAccountUpdate((a) => setAccount(a)),
      window.islandApi.onProxyUpdate((p) => setProxy(p)),
      window.islandApi.onLanguageChanged((l) => setLang(l)),
      window.islandApi.onPrefsChanged((p) => {
        applyPrefsToRoot(p)
        setPrivacy(p.privacyMode)
      })
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  // ============ 悬停展开 / 延迟收起 ============
  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
    setExpanded(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_DELAY)
  }, [])

  // ============ 拖拽 vs 单击 ============
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    // 窗口左上角 ≈ screen - client（frameless 全填充内容）
    dragState.current = { grabX: e.clientX, grabY: e.clientY, moved: false }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const st = dragState.current
    if (!st) return
    const newX = e.screenX - st.grabX
    const newY = e.screenY - st.grabY
    if (!st.moved) {
      const movedEnough =
        Math.abs(e.clientX - st.grabX) > DRAG_THRESHOLD ||
        Math.abs(e.clientY - st.grabY) > DRAG_THRESHOLD
      if (movedEnough) st.moved = true
    }
    if (st.moved) window.islandApi.dragMove(newX, newY)
  }, [])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current
      dragState.current = null
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      if (!st) return
      if (st.moved) {
        window.islandApi.savePosition(e.screenX - st.grabX, e.screenY - st.grabY)
      } else {
        // 未拖拽 → 单击恢复主窗口（Requirement 5.2）
        window.islandApi.restoreMain()
      }
    },
    []
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    window.islandApi.openContextMenu()
  }, [])

  const pct = usagePercent(account?.usage)

  const sharedProps = {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onContextMenu: handleContextMenu
  }

  return (
    <div className="island-stage">
      {expanded ? (
        <motion.div
          layout
          className="island island--expanded"
          initial={{ opacity: 0.6, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          {...sharedProps}
        >
          {account ? (
            <>
              <div className="island-header">
                <img className="island-logo" src={islandLogo} alt="" draggable={false} />
                <span className="island-email">{maskEmail(account.email, privacy)}</span>
                <span className={dotClass(account.status)} />
              </div>

              <div className="island-meta">
                <span className="island-tag">{account.idp || t.unknown}</span>
                <span className="island-tag">{account.subscription || t.unknown}</span>
                <span className="island-tag">
                  {account.status === 'active' ? t.active : account.status === 'error' ? t.error : account.status}
                </span>
              </div>

              {pct !== null && account.usage ? (
                <>
                  <div className="island-usage-label">
                    <span>{t.usage}</span>
                    <span>
                      {account.usage.usedCredits} / {account.usage.totalCredits} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="island-usage-track">
                    <div
                      className={`island-usage-fill${pct >= 90 ? ' island-usage-fill--warn' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="island-usage-label">
                  <span>{t.usage}</span>
                  <span>-</span>
                </div>
              )}

              {proxy && (
                <div className="island-proxy">
                  <span className={proxy.running ? 'island-dot island-dot--active' : 'island-dot island-dot--idle'} />
                  <span>
                    {proxy.running ? `${t.proxyRunning} :${proxy.port}` : t.proxyStopped}
                    {proxy.running && ` · ✓${proxy.successRequests} ✗${proxy.failedRequests}`}
                  </span>
                </div>
              )}

              <div className="island-actions">
                <button
                  className="island-btn island-btn--primary"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => window.islandApi.restoreMain()}
                >
                  {t.open}
                </button>
                <button
                  className="island-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => window.islandApi.switchAccount()}
                >
                  {t.switch}
                </button>
                <button
                  className="island-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => window.islandApi.refreshAccount()}
                >
                  {t.refresh}
                </button>
              </div>
            </>
          ) : (
            <div className="island-empty">{t.noAccount}</div>
          )}
        </motion.div>
      ) : (
        <motion.div
          layout
          className="island island--collapsed"
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          {...sharedProps}
        >
          <img className="island-logo" src={islandLogo} alt="" draggable={false} />
          {account ? (
            <>
              <span className="island-collapsed-email">{maskEmail(account.email, privacy)}</span>
              <span className={dotClass(account.status)} />
            </>
          ) : (
            <span className="island-collapsed-email">{t.noAccount}</span>
          )}
        </motion.div>
      )}
    </div>
  )
}
