import { createContext, useContext } from 'react'
import type { IocContext } from 'power-di'
import type { ReactNode } from 'react'

/**
 * View-layer glue for the composition root: components resolve services
 * by class token. Views never construct services (ADR: logic lives in
 * services; views map observable -> render and event -> service method).
 */
const ServicesContext = createContext<IocContext | null>(null)

export function ServicesProvider({
  container,
  children,
}: {
  container: IocContext
  children: ReactNode
}) {
  return (
    <ServicesContext.Provider value={container}>
      {children}
    </ServicesContext.Provider>
  )
}

export function useService<T>(token: new (...args: Array<never>) => T): T {
  const container = useContext(ServicesContext)
  if (!container) {
    throw new Error('ServicesProvider is missing above this component')
  }
  return container.get(token)
}
