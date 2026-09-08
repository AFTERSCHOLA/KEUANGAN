import { useState, useEffect } from 'react'
import { loadPhotoDataUrl } from '../lib/photoStorage.js'

/**
 * Single sidebar shell, reused for the desktop sidebar AND the mobile drawer.
 * `variant="desktop"` is a persistent left rail with collapse toggle.
 * `variant="drawer"` is a transient overlay with a close button.
 *
 * After M3 the sidebar is pure navigation. Period filters live in the
 * page header (<PeriodFilter/>), system actions live in the account
 * menu (<AccountMenu/>) in the top-right.
 */
export function SidebarLogo({ logoUrl, logoEntry, size = 'w-10 h-10', iconSize = 'w-6 h-6' }) {
  const [idbUrl, setIdbUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (logoEntry) {
      loadPhotoDataUrl(logoEntry).then(url => {
        if (!cancelled) setIdbUrl(url)
      })
    } else {
      setIdbUrl(null)
    }
    return () => { cancelled = true }
  }, [logoEntry])

  const src = idbUrl || logoUrl

  if (src) {
    return (
      <img
        src={src}
        alt="Logo"
        className={`${size} rounded-full object-cover border-2 border-yellow-400 bg-white shadow-md shrink-0`}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
    )
  }
  return (
    <div
      className={`${size} rounded-full border-2 border-yellow-400 bg-blue-950 flex items-center justify-center text-white font-extrabold text-base shadow-inner shrink-0`}
    >
      <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0v6" />
      </svg>
    </div>
  )
}

export default function SidebarLayout({
  variant = 'desktop',          // 'desktop' | 'drawer'
  title = 'Afterschola',
  logoUrl = '',
  logoEntry, // tambahkan ini

  tabs,                          // [{ id, label, icon, comingSoon }]
  activeTab,
  onSelectTab,

  // Variant-specific controls
  onClose,                        // drawer only
  collapsed = false,             // desktop only
  onToggleCollapsed,             // desktop only
}) {
  const isDrawer = variant === 'drawer'

  function handleSelect(tabId) {
    onSelectTab?.(tabId)
    if (isDrawer) onClose?.()
  }

  return (
    <aside
      className={
        isDrawer
          ? 'relative w-64 bg-blue-900 border-r-2 border-yellow-400 flex flex-col animate-fadeIn'
          : `hidden md:flex flex-col bg-blue-900 border-r-2 border-yellow-400 shrink-0 transition-all overflow-hidden sticky top-0 self-start h-screen ${collapsed ? 'w-20' : 'w-64'}`
      }
    >
      {/* Header */}
      <div
        className={`flex items-center gap-2 py-4 border-b border-blue-800 ${
          isDrawer || collapsed
            ? // PM.5.15/F-14: in the collapsed rail (w-20 = 80px) px-4 +
              // justify-between pushed the 28px toggle past the rail edge
              // (clipped by overflow-hidden). Center the header contents
              // with px-2 so the toggle + logo stay inside the rail.
              'justify-center px-2'
            : 'justify-between px-4'
        }`}
      >
        {(!collapsed || isDrawer) && (
          <div className="flex items-center gap-2 min-w-0">
            <SidebarLogo logoUrl={logoUrl} logoEntry={logoEntry} />
            <h1 className="text-xl font-bold tracking-tight text-yellow-300 truncate">{title}</h1>
          </div>
        )}
        {collapsed && !isDrawer && <SidebarLogo logoUrl={logoUrl} logoEntry={logoEntry} />}
        {isDrawer ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu"
            className="text-blue-300 hover:text-yellow-300 p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            className="text-blue-300 hover:text-yellow-300 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
            </svg>
          </button>
        )}
      </div>

      {/* Nav (sidebar is now pure navigation) */}
      <nav className="flex-1 flex flex-col gap-1 px-3 py-4 overflow-y-auto">
        {tabs?.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => handleSelect(tab.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                collapsed && !isDrawer ? 'justify-center' : ''
              } ${isActive ? 'bg-yellow-400 text-slate-900 shadow-md' : 'text-white hover:bg-blue-800'}`}
              title={collapsed && !isDrawer ? tab.label : undefined}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
              </svg>
              {(!collapsed || isDrawer) && tab.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}