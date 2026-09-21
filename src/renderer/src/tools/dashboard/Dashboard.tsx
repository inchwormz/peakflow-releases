import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react'
import { TitleBar } from '@renderer/components/layout/TitleBar'
import { StatusBar } from '@renderer/components/layout/StatusBar'
import { ToolId, TOOL_DISPLAY_NAMES } from '@shared/tool-ids'
import { ShareAndEarn } from '@renderer/components/sharing/ShareAndEarn'
import peakflowLogo from '@renderer/assets/peakflow-logo.png'
import { IPC_INVOKE, IPC_SEND } from '@shared/ipc-types'
import type { LicenseActivationResult } from '@shared/ipc-types'

interface ToolMeta {
  id: ToolId
  description: string
  category: string
  icon: string[]
}

const TOOLS: ToolMeta[] = [
  {
    id: ToolId.LiquidFocus,
    category: 'Focus',
    description: 'Pomodoro timer and task tracking',
    icon: [
      'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z',
      'M12 6v6l4 2'
    ]
  },
  {
    id: ToolId.FocusDim,
    category: 'Focus',
    description: 'Dim everything beyond the active window',
    icon: ['M2 7V2h5', 'M17 2h5v5', 'M22 17v5h-5', 'M7 22H2v-5']
  },
  {
    id: ToolId.QuickBoard,
    category: 'Capture',
    description: 'Keep your best snippets within reach',
    icon: [
      'M12 2L2 7l10 5 10-5-10-5z',
      'M2 17l10 5 10-5',
      'M2 12l10 5 10-5'
    ]
  },
  {
    id: ToolId.ScreenSlap,
    category: 'Meetings',
    description: 'Make full-screen meeting alerts impossible to miss',
    icon: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z']
  },
  {
    id: ToolId.MeetReady,
    category: 'Meetings',
    description: 'Check your camera and mic before you join',
    icon: [
      'M23 7l-7 5 7 5V7z',
      'M1 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V5z'
    ]
  },
  {
    id: ToolId.SoundSplit,
    category: 'Audio',
    description: 'Shape volume per app without leaving your flow',
    icon: [
      'M4 21V14', 'M4 10V3',
      'M12 21V12', 'M12 8V3',
      'M20 21V16', 'M20 12V3',
      'M1 14h6', 'M9 8h6', 'M17 16h6'
    ]
  }
]

interface TrialStatus {
  isLicensed: boolean
  daysRemaining: number
}

interface ToolAccessMap {
  [toolId: string]: {
    allowed: boolean
    isLicensed: boolean
    isToolLicensed: boolean
    daysRemaining: number
    installed: boolean
  }
}

function toTrialStatus(raw: Record<string, unknown>): TrialStatus | null {
  if (typeof raw.daysRemaining !== 'number') return null
  return {
    isLicensed: raw.isLicensed === true,
    daysRemaining: raw.daysRemaining
  }
}

export function Dashboard(): React.JSX.Element {
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null)
  const [toolAccess, setToolAccess] = useState<ToolAccessMap>({})
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error'
    message: string
  }>({ type: 'idle', message: '' })
  const [showShare, setShowShare] = useState(false)
  const licenseInputRef = useRef<HTMLInputElement>(null)

  const openTool = useCallback((toolId: ToolId) => {
    window.peakflow.invoke(IPC_INVOKE.WINDOW_OPEN, { toolId })
  }, [])

  const refreshToolAccess = useCallback(async () => {
    const map: ToolAccessMap = {}
    await Promise.all(
      Object.values(ToolId).map(async (id) => {
        try {
          const [status, installState] = await Promise.all([
            window.peakflow.invoke(IPC_INVOKE.SECURITY_CHECK_TOOL_ACCESS, id),
            window.peakflow.invoke(IPC_INVOKE.TOOL_GET_INSTALL_STATE, id)
          ])
          const s = status && typeof status === 'object' ? status as Record<string, unknown> : {}
          const inst = installState && typeof installState === 'object' ? installState as Record<string, unknown> : {}
          map[id] = {
            allowed: s.allowed === true,
            isLicensed: s.isLicensed === true,
            isToolLicensed: s.isToolLicensed === true,
            daysRemaining: typeof s.daysRemaining === 'number' ? s.daysRemaining : -1,
            installed: inst.installed === true
          }
        } catch {
          // A missing native bridge should not prevent the dashboard from rendering.
        }
      })
    )
    setToolAccess(map)
  }, [])

  const installAndOpen = useCallback(async (toolId: ToolId) => {
    await window.peakflow.invoke(IPC_INVOKE.TOOL_INSTALL, toolId)
    await refreshToolAccess()
    window.peakflow.invoke(IPC_INVOKE.WINDOW_OPEN, { toolId })
  }, [refreshToolAccess])

  const handleActivate = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    const key = licenseKey.trim()
    if (!key) {
      licenseInputRef.current?.focus()
      return
    }
    setLicenseStatus({ type: 'loading', message: 'Validating...' })
    try {
      const result = await window.peakflow.invoke(IPC_INVOKE.SECURITY_ACTIVATE_LICENSE, key) as LicenseActivationResult
      if (result.success) {
        setLicenseStatus({ type: 'success', message: result.message || 'License activated.' })
        const globalStatus = await window.peakflow.invoke(IPC_INVOKE.SECURITY_CHECK_ACCESS)
        if (globalStatus && typeof globalStatus === 'object') {
          const nextStatus = toTrialStatus(globalStatus as Record<string, unknown>)
          if (nextStatus) setTrialStatus(nextStatus)
        }
        await refreshToolAccess()
      } else {
        setLicenseStatus({ type: 'error', message: result.message || 'Invalid license key.' })
      }
    } catch (err) {
      setLicenseStatus({ type: 'error', message: err instanceof Error ? err.message : 'Activation failed.' })
    }
  }, [licenseKey, refreshToolAccess])

  useEffect(() => {
    const refreshGlobalTrial = (): void => {
      window.peakflow.invoke(IPC_INVOKE.SECURITY_CHECK_ACCESS).then((status) => {
        if (status && typeof status === 'object') {
          const nextStatus = toTrialStatus(status as Record<string, unknown>)
          if (nextStatus) setTrialStatus(nextStatus)
        }
      }).catch(() => {})
    }

    refreshGlobalTrial()
    refreshToolAccess()

    const unsubscribe = window.peakflow.on(IPC_SEND.LICENSE_STATUS_CHANGED, () => {
      refreshGlobalTrial()
      refreshToolAccess()
    })

    return unsubscribe
  }, [refreshToolAccess])

  const daysRemaining = trialStatus?.daysRemaining ?? 14
  const isLicensed = trialStatus?.isLicensed === true
  const trialLabel = isLicensed ? 'Pro suite active' : `${daysRemaining} days left`
  const trialProgress = isLicensed ? 100 : Math.min(100, Math.max(8, (daysRemaining / 14) * 100))

  return (
    <>
      <TitleBar title="PeakFlow" showMaximize />
      <main className="dashboard-page">
        <aside className="app-sidebar">
          <div>
            <div className="sidebar-brand">
              <img src={peakflowLogo} alt="PeakFlow" className="sidebar-logo" />
              <div>
                <strong>PEAKFLOW</strong>
                <span>DESKTOP SUITE</span>
              </div>
            </div>

            <div className="sidebar-section-label">WORKSPACE</div>
            <nav className="sidebar-nav" aria-label="Workspace sections">
              <div className="sidebar-nav-item is-active">
                <span className="sidebar-nav-icon" aria-hidden="true"><GridIcon /></span>
                <span>All tools</span>
                <span className="sidebar-nav-count">06</span>
              </div>
            </nav>

            <div className="sidebar-section-label sidebar-section-label-spaced">CATEGORIES</div>
            <div className="sidebar-categories" aria-label="Tool categories">
              <div><span className="category-mark category-mark-focus" />Focus<span>02</span></div>
              <div><span className="category-mark category-mark-meetings" />Meetings<span>02</span></div>
              <div><span className="category-mark category-mark-capture" />Capture<span>01</span></div>
              <div><span className="category-mark category-mark-audio" />Audio<span>01</span></div>
            </div>
          </div>

          <div className="sidebar-bottom">
            <div className="sidebar-license">
              <div className="sidebar-license-heading">
                <span>ACCESS</span>
                <span className="access-dot" aria-hidden="true" />
              </div>
              <strong>{trialLabel}</strong>
              <p>{isLicensed ? 'All tools are unlocked.' : 'Trial access is active.'}</p>
              {!isLicensed && (
                <button type="button" onClick={() => licenseInputRef.current?.focus()}>
                  Activate license <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
            <button
              className={`share-button${showShare ? ' is-active' : ''}`}
              onClick={() => setShowShare(!showShare)}
              type="button"
            >
              <ShareIcon />
              Share &amp; Earn
            </button>
            <div className="sidebar-version">PeakFlow for Windows</div>
          </div>
        </aside>

        <section className="dashboard-workspace">
          <header className="workspace-toolbar">
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>All tools</strong>
            </div>
            <div className="workspace-toolbar-meta">
              <span className="ready-indicator"><span aria-hidden="true" />Ready</span>
              <span className="toolbar-divider" />
              <span>06 utilities</span>
            </div>
          </header>

          <div className="workspace-scroll">
            <section className="dashboard-intro" aria-labelledby="dashboard-heading">
              <div className="intro-copy">
                <span className="eyebrow">FOCUS SUITE / OVERVIEW</span>
                <h1 id="dashboard-heading">Clear the noise.<br /><span>Get to work.</span></h1>
                <p>Small utilities for the moments that interrupt your best work.</p>
              </div>
              <div className="overview-panel" aria-label={`${trialLabel}. ${TOOLS.length} utilities available.`}>
                <div className="overview-panel-topline">
                  <span>TRIAL ACCESS</span>
                  <span className="overview-status">{isLicensed ? 'PRO' : 'ACTIVE'}</span>
                </div>
                <div className="overview-days">
                  <strong>{isLicensed ? '∞' : daysRemaining}</strong>
                  <span>{isLicensed ? 'full suite unlocked' : 'days remaining'}</span>
                </div>
                <div className="overview-progress" aria-hidden="true"><span style={{ width: `${trialProgress}%` }} /></div>
                <p>{isLicensed ? 'Every PeakFlow tool is ready.' : 'Start with any tool below.'}</p>
              </div>
            </section>

            <section className="tool-section" aria-labelledby="tools-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">PRODUCTIVITY TOOLS</span>
                  <h2 id="tools-heading">All tools</h2>
                </div>
                <span className="tool-count">{TOOLS.length} AVAILABLE</span>
              </div>

              <div className="tool-grid">
                {TOOLS.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    trialStatus={trialStatus}
                    toolAccess={toolAccess[tool.id]}
                    onClick={() => openTool(tool.id)}
                    onInstall={() => installAndOpen(tool.id)}
                  />
                ))}
              </div>
            </section>

            {showShare && (
              <div className="share-panel">
                <ShareAndEarn
                  ownedTools={Object.entries(toolAccess)
                    .filter(([, value]) => value.isToolLicensed)
                    .map(([id]) => id as ToolId)}
                />
              </div>
            )}

            {trialStatus && !trialStatus.isLicensed && (
              <section className="license-panel" aria-labelledby="license-heading">
                <div className="license-copy">
                  <span className="eyebrow">LICENSE MANAGEMENT</span>
                  <h2 id="license-heading">Activate PeakFlow</h2>
                  <p>Enter your license key to unlock the full desktop suite.</p>
                </div>
                <form onSubmit={handleActivate} className="license-form">
                  <label className="sr-only" htmlFor="license-key">License key</label>
                  <input
                    ref={licenseInputRef}
                    id="license-key"
                    type="text"
                    value={licenseKey}
                    onChange={(event) => setLicenseKey(event.target.value)}
                    placeholder="Paste license key"
                    disabled={licenseStatus.type === 'loading' || licenseStatus.type === 'success'}
                  />
                  <button
                    type="submit"
                    disabled={licenseStatus.type === 'loading' || licenseStatus.type === 'success'}
                  >
                    {licenseStatus.type === 'loading' ? 'Checking' : 'Activate'}
                  </button>
                </form>
                {licenseStatus.type !== 'idle' && licenseStatus.type !== 'loading' && (
                  <p className={`license-message is-${licenseStatus.type}`}>{licenseStatus.message}</p>
                )}
              </section>
            )}
          </div>
        </section>
      </main>
      <StatusBar />
    </>
  )
}

function ToolCard({
  tool,
  trialStatus,
  toolAccess,
  onClick,
  onInstall
}: {
  tool: ToolMeta
  trialStatus: TrialStatus | null
  toolAccess?: ToolAccessMap[string]
  onClick: () => void
  onInstall: () => void
}): React.JSX.Element {
  const installed = toolAccess?.installed ?? false
  const isToolAllowed = toolAccess?.allowed ?? true
  const toolLicensed = toolAccess?.isToolLicensed ?? false
  const daysRemaining = toolAccess?.daysRemaining ?? trialStatus?.daysRemaining ?? 14
  const badgeLabel = toolLicensed && isToolAllowed
    ? 'PRO'
    : installed && daysRemaining > 0
      ? `${daysRemaining}D TRIAL`
      : installed && !isToolAllowed
        ? 'LOCKED'
        : 'AVAILABLE'

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (installed && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <article
      className={`tool-card${installed ? ' is-installed' : ''}`}
      onClick={installed ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role={installed ? 'button' : undefined}
      tabIndex={installed ? 0 : undefined}
    >
      <div className="tool-card-topline">
        <span className="tool-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {tool.icon.map((path, index) => <path key={index} d={path} />)}
          </svg>
        </span>
        <span className={`tool-badge${toolLicensed ? ' is-pro' : ''}`}>{badgeLabel}</span>
      </div>
      <div className="tool-card-copy">
        <span className="tool-category">{tool.category}</span>
        <h3>{TOOL_DISPLAY_NAMES[tool.id]}</h3>
        <p>{tool.description}</p>
      </div>
      <div className="tool-card-action">
        {installed ? (
          <span>Open tool <span aria-hidden="true">↗</span></span>
        ) : (
          <button type="button" onClick={(event) => { event.stopPropagation(); onInstall() }}>
            Install &amp; open <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </article>
  )
}

function GridIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5" height="5" rx=".5" />
      <rect x="9.5" y="1.5" width="5" height="5" rx=".5" />
      <rect x="1.5" y="9.5" width="5" height="5" rx=".5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx=".5" />
    </svg>
  )
}

function ShareIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </svg>
  )
}
