import { useEffect, useRef } from 'react'
import { db } from '@elegant-tide/db'
import type { SubtitleLine } from '@elegant-tide/core-types'

const LOOKAHEAD = 5

function isDirectUrl(ref: string) {
  return ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('blob:')
}

export function useAudioPreloader(
  lines: SubtitleLine[],
  currentLineId: string | null,
  projectId: string,
): React.MutableRefObject<Map<string, HTMLAudioElement>> {
  const audioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const objectUrlsRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!currentLineId) return

    const currentIdx = lines.findIndex((l) => l.id === currentLineId)
    if (currentIdx === -1) return

    const window = lines.slice(currentIdx, currentIdx + LOOKAHEAD + 1)
    const targets = window.filter((l) => l.audioRef)

    const existingLineIds = new Set(targets.map((l) => l.id))

    // Revoke object URLs and remove audio for lines no longer in the lookahead
    for (const [lineId, audio] of audioMapRef.current.entries()) {
      if (!existingLineIds.has(lineId)) {
        audio.src = ''
        audio.load()
        audioMapRef.current.delete(lineId)
        const objUrl = objectUrlsRef.current.get(lineId)
        if (objUrl) {
          URL.revokeObjectURL(objUrl)
          objectUrlsRef.current.delete(lineId)
        }
      }
    }

    for (const line of targets) {
      if (audioMapRef.current.has(line.id)) continue
      const ref = line.audioRef!

      if (isDirectUrl(ref)) {
        const audio = new Audio(ref)
        audio.preload = 'auto'
        audio.load()
        audioMapRef.current.set(line.id, audio)
      } else {
        // Asset ID — load blob from Dexie
        void db.audioAssets.get(ref).then((asset) => {
          if (!asset) return
          let srcUrl: string
          if (asset.blob) {
            srcUrl = URL.createObjectURL(asset.blob)
            objectUrlsRef.current.set(line.id, srcUrl)
          } else if (asset.url) {
            srcUrl = asset.url
          } else {
            return
          }
          const audio = new Audio(srcUrl)
          audio.preload = 'auto'
          audio.load()
          audioMapRef.current.set(line.id, audio)
        })
      }
    }
  }, [lines, currentLineId, projectId])

  useEffect(() => {
    return () => {
      for (const [, audio] of audioMapRef.current.entries()) {
        audio.pause()
        audio.src = ''
      }
      audioMapRef.current.clear()
      for (const [, url] of objectUrlsRef.current.entries()) {
        URL.revokeObjectURL(url)
      }
      objectUrlsRef.current.clear()
    }
  }, [])

  return audioMapRef
}
