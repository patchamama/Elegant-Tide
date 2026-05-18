interface ElegantTideBridge {
  openProjector: (opts: { id: string; displayId?: number }) => Promise<void>
  closeProjector: (opts: { id: string }) => Promise<void>
  listDisplays: () => Promise<Array<{
    id: number
    label: string
    bounds: { x: number; y: number; width: number; height: number }
    isPrimary: boolean
  }>>
  openFileDialog: (opts?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>
  saveFileDialog: (opts?: { defaultName?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>
  secureGet: (key: string) => Promise<string | null>
  secureSet: (key: string, value: string) => Promise<boolean>
  secureDelete: (key: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
}

interface Window {
  elegantTide?: ElegantTideBridge
}
