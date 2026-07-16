import { Suspense, lazy } from 'react'
import { ClientOnly, createFileRoute } from '@tanstack/react-router'

const ClientApp = lazy(() => import('#/views/ClientApp.tsx'))

export const Route = createFileRoute('/')({ component: Home })

/**
 * The prerendered shell shows a static loading frame; the interactive
 * app (monaco + analysis worker) mounts client-side only.
 */
function Home() {
  return (
    <ClientOnly fallback={<BootSplash />}>
      <Suspense fallback={<BootSplash />}>
        <ClientApp />
      </Suspense>
    </ClientOnly>
  )
}

function BootSplash() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4">
      <svg width="72" height="72" viewBox="0 0 28 28" aria-hidden="true">
        <circle
          cx="14"
          cy="14"
          r="12"
          fill="none"
          stroke="#3178c6"
          strokeWidth="3"
        />
        <circle
          cx="17"
          cy="16"
          r="5.5"
          fill="#f7df1e"
          stroke="#1b2733"
          strokeWidth="2"
        />
        <circle cx="9.5" cy="11" r="1.8" fill="#1b2733" />
      </svg>
      <p className="font-game text-2xl font-bold tracking-tight">typarium</p>
      <p className="text-sm font-semibold text-(--color-ink-soft)">
        TypeScript 代数集合论可视化
      </p>
    </div>
  )
}
