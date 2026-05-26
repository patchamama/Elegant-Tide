import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { SubtitleProject, LangCode } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { projectsRepo } from '@elegant-tide/db'
import { enqueueProjectUpsert, enqueueProjectDelete } from '@elegant-tide/sync'

interface ProjectStore {
  currentProject: SubtitleProject | null

  loadProject: (id: string) => Promise<void>
  createProject: (name: string, primaryLang?: LangCode) => Promise<SubtitleProject>
  updateProject: (patch: Partial<SubtitleProject> & { id: string }) => Promise<void>
  deleteProject: (id: string) => Promise<void>
}

function makeProject(name: string, primaryLang: LangCode = 'en'): SubtitleProject {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name,
    languages: [primaryLang],
    primaryLanguage: primaryLang,
    defaultStyle: { ...DEFAULT_PROJECTION_STYLE },
    projectorWindows: [],
    collaborators: [],
    createdAt: now,
    updatedAt: now,
    version: -1,
  }
}

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector((set, get) => ({
    currentProject: null,

    loadProject: async (id) => {
      const project = await projectsRepo.get(id)
      set({ currentProject: project ?? null })
    },

    createProject: async (name, primaryLang = 'en') => {
      const project = makeProject(name, primaryLang)
      await projectsRepo.upsert(project)
      void enqueueProjectUpsert(project)
      return project
    },

    updateProject: async (patch) => {
      const existing = await projectsRepo.get(patch.id)
      if (!existing) return
      const updated: SubtitleProject = { ...existing, ...patch, updatedAt: Date.now() }
      await projectsRepo.upsert(updated)
      void enqueueProjectUpsert(updated)
      if (get().currentProject?.id === updated.id) {
        set({ currentProject: updated })
      }
    },

    deleteProject: async (id) => {
      await projectsRepo.softDelete(id)
      void enqueueProjectDelete(id)
      if (get().currentProject?.id === id) {
        set({ currentProject: null })
      }
    },
  })),
)
