import { useState, useCallback } from 'react'
import type { ProjectRole } from '@elegant-tide/core-types'

const key = (projectId: string) => `project:${projectId}:role`

export function loadProjectRole(projectId: string): ProjectRole {
  return (localStorage.getItem(key(projectId)) as ProjectRole) ?? 'viewer'
}

export function saveProjectRole(projectId: string, role: ProjectRole) {
  localStorage.setItem(key(projectId), role)
}

export function useProjectRole(projectId: string) {
  const [role, setRoleState] = useState<ProjectRole>(() => loadProjectRole(projectId))

  const setRole = useCallback((r: ProjectRole) => {
    saveProjectRole(projectId, r)
    setRoleState(r)
  }, [projectId])

  return {
    role,
    setRole,
    isMaster: role === 'master',
    isSound: role === 'sound',
    isLighting: role === 'lighting',
    canEditSubtitles: role === 'master',
    canEditComments: role === 'master' || role === 'sound' || role === 'lighting',
  }
}
