export const isElectron = typeof window !== 'undefined' && !!window.elegantTide

export const isCapacitor =
  typeof window !== 'undefined' &&
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    ?.isNativePlatform?.()

export function openProjectorWindow(projectId: string, displayId?: number): void {
  if (isCapacitor) {
    // Multi-window projection not supported on mobile — no-op
    return
  }
  if (isElectron && window.elegantTide) {
    void window.elegantTide.openProjector({ id: projectId, displayId })
  } else {
    window.open(`/projector/${projectId}`, '_blank', 'popup,width=1280,height=720')
  }
}
