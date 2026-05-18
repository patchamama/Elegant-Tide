import { createFileRoute } from '@tanstack/react-router'
import { ControlPage } from '@/features/projection/ControlPage'

export const Route = createFileRoute('/control/$projectId')({
  component: ControlPage,
})
