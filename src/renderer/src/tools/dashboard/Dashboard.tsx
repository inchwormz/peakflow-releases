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
  const trialLabel = isLicensed ? 'Pro suite active' : `${daysRemaining} days left in trial`

  return (
    <>
      <TitleBar title="" showMaximize={false} />
      <main className="dashboard-page">
        <header className="dashboard-header">
          <div className="dashboard-brand-row">
            <div className="dashboard-brand">
              <img src={peakflowLogo} alt="PeakFlow" className="dashboard-logo" />
              <span>PRODUCTIVITY OS</span>
            </div>
            <button
              className={`share-button${showShare ? ' is-active' : ''}`}
              onClick={() => setShowShare(!showShare)}
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM20 19H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 12 7.4l3.38 4.6L17 10.83 14.92 8H20v6z" />
              </svg>
              Share &amp; Earn
            </button>
          </div>

          <div className="dashboard-hero">
            <div className="hero-copy">
              <span className="eyebrow">YOUR WORKDAY, IN FLOW</span>
              <h1>Make room for <em>deep work.</em></h1>
              <p>Six focused utilities for the small moments that interrupt your best work.</p>
            </div>
            <div className="trial-card" aria-label={trialLabel}>
              <span className="trial-dot" aria-hidden="true" />
              <div>
                <strong>{trialLabel}</strong>
                <span>{isLicensed ? 'Every tool is unlocked' : 'Start with any tool below'}</span>
              </div>
            </div>
          </div>
        </header>

        <section className="suite-section" aria-labelledby="suite-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THE SUITE</span>
              <h2 id="suite-heading">Choose your focus</h2>
            </div>
            <span className="tool-count">06 TOOLS</span>
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
              <span className="eyebrow">UNLOCK THE FULL SUITE</span>
              <h2 id="license-heading">Already have a key?</h2>
              <p>Activate it once and keep every tool ready when you need it.</p>
            </div>
            <form onSubmit={handleActivate} className="license-form">
              <label className="sr-only" htmlFor="license-key">License key</label>
              <input
                ref={licenseInputRef}
                id="license-key"
                type="text"
                value={licenseKey}
                onChange={(event) => setLicenseKey(event.target.value)}
                placeholder="Paste your license key"
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
        : ''

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
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {tool.icon.map((path, index) => <path key={index} d={path} />)}
          </svg>
        </span>
        {badgeLabel && <span className="tool-badge">{badgeLabel}</span>}
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
            Try free <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </article>
  )
}
