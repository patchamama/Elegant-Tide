export const isElectron = typeof window !== 'undefined' && !!window.elegantTide

export function openProjectorWindow(projectId: string, displayId?: number): void {
  if (isElectron && window.elegantTide) {
    void window.elegantTide.openProjector({ id: projectId, displayId })
  } else {
    window.open(`/projector/${projectId}`, '_blank', 'popup,width=1280,height=720')
  }
}
