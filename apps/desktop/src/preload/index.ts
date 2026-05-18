import { contextBridge, ipcRenderer } from 'electron'

const elegantTide = {
  openProjector: (opts: { id: string; displayId?: number }) =>
    ipcRenderer.invoke('projector:open', opts),
  closeProjector: (opts: { id: string }) =>
    ipcRenderer.invoke('projector:close', opts),
  listDisplays: () =>
    ipcRenderer.invoke('displays:list') as Promise<Array<{
      id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; isPrimary: boolean
    }>>,
  openFileDialog: (opts?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('dialog:openFile', opts ?? {}) as Promise<string | null>,
  saveFileDialog: (opts?: { defaultName?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('dialog:saveFile', opts ?? {}) as Promise<string | null>,
  secureGet: (key: string) =>
    ipcRenderer.invoke('secure:get', { key }) as Promise<string | null>,
  secureSet: (key: string, value: string) =>
    ipcRenderer.invoke('secure:set', { key, value }) as Promise<boolean>,
  secureDelete: (key: string) =>
    ipcRenderer.invoke('secure:delete', { key }) as Promise<void>,
  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:openExternal', { url }),
}

contextBridge.exposeInMainWorld('elegantTide', elegantTide)
