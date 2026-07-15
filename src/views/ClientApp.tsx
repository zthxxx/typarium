import { createTypescriptAdapter } from '#/adapters/typescript/adapter.ts'
import { AppView } from '#/views/AppView.tsx'

/**
 * Client-only entry chunk: constructing the adapter spawns the analysis
 * worker, so this module must never execute during prerender. It is
 * loaded lazily under <ClientOnly> in the route.
 */
const adapter = createTypescriptAdapter()

export default function ClientApp() {
  return <AppView adapter={adapter} />
}
