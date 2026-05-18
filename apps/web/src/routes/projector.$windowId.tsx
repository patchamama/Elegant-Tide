import { createFileRoute } from '@tanstack/react-router'
import { ProjectorPage } from '@/features/projection/ProjectorPage'

export const Route = createFileRoute('/projector/$windowId')({
  component: ProjectorPage,
})
