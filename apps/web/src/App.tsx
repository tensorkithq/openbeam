import { Dashboard } from "@/components/layout/dashboard"
import { useRemoteControl } from "@/hooks/use-remote-control"
import { useDetectionWebSocket } from "@/hooks/use-detection-ws"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"
import { ApiKeyPrompt } from "@/components/ui/api-key-prompt"
import { Toaster } from "sonner"

export function App() {
  useRemoteControl()
  useDetectionWebSocket()
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
