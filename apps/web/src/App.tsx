import { Dashboard } from "@/components/layout/dashboard"
import { useRemoteControl } from "@/hooks/use-remote-control"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"

export function App() {
  useRemoteControl()
  return (
    <>
      <Dashboard />
      <TutorialOverlay />
    </>
  )
}

export default App
