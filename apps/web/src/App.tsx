import { useEffect } from "react"
import { Dashboard } from "@/components/layout/dashboard"
import { initializeStreams } from "@/streams/setup"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"
import { ApiKeyPrompt } from "@/components/ui/api-key-prompt"
import { Toaster } from "sonner"

export function App() {
  useEffect(() => initializeStreams(), [])
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
