import { useEffect } from "react"
import { Dashboard } from "@/components/layout/dashboard"
import { initializeStreams } from "@/streams/setup"
import { useBackendHealth } from "@/hooks/use-backend-health"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"
import { ApiKeyPrompt } from "@/components/ui/api-key-prompt"
import { Toaster } from "sonner"

export function App() {
  useEffect(() => initializeStreams(), [])
  useBackendHealth()
  return (
    <>
      <ApiKeyPrompt />
      <Dashboard />
      <TutorialOverlay />
      <Toaster position="bottom-right" theme="dark" />
    </>
  )
}

export default App
