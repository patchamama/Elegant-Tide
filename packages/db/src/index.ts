export { db, ElegantTideDB } from './schema.ts'
export { projectsRepo } from './repo/projects.ts'
export { linesRepo } from './repo/lines.ts'
export { connectivityRepo } from './repo/connectivity.ts'
export { appConfigRepo } from './repo/appConfig.ts'
export { conflictsRepo } from './repo/conflicts.ts'

// Fractional index utilities
export const ORDER_GAP = 1024
export const ORDER_MIN_GAP = 1

export function midOrder(prev: number, next: number): number {
  return (prev + next) / 2
}

export function needsCompaction(prev: number, next: number): boolean {
  return next - prev < ORDER_MIN_GAP
}

export function initialOrder(index: number): number {
  return (index + 1) * ORDER_GAP
}
