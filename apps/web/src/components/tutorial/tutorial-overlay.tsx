import { useState, useEffect, useCallback, useMemo } from "react"
import { Joyride, STATUS, type EventData } from "react-joyride"
import { toast } from "sonner"
import { useSettingsStore } from "@/stores/settings-store"
import {
  useTutorialStore,
  persistOnboardingComplete,
} from "@/stores/tutorial-store"
import { TUTORIAL_STEPS } from "./tutorial-steps"
import { TutorialTooltip } from "./tutorial-tooltip"
import { useTheme } from "@/components/theme-provider"

export function TutorialOverlay() {
  const isRunning = useTutorialStore((s) => s.isRunning)
  const deepgramApiKey = useSettingsStore((s) => s.deepgramApiKey)
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete)
  const { theme } = useTheme()

  const [arrowColor, setArrowColor] = useState<string | undefined>()

  useEffect(() => {
    requestAnimationFrame(() => {
      const cardEl = document.querySelector(".bg-card")
      if (cardEl) {
        setArrowColor(getComputedStyle(cardEl).backgroundColor)
      }
    })
  }, [theme])

  const steps = useMemo(
    () =>
      TUTORIAL_STEPS.map((step) => ({
        ...step,
        arrowColor,
      })),
    [arrowColor]
  )

  // Start tutorial only after API key is set and onboarding not yet complete
  useEffect(() => {
    if (!deepgramApiKey) return // API key modal is showing — wait
    if (onboardingComplete) return // Already done
    const timer = setTimeout(() => {
      useTutorialStore.getState().startTutorial()
    }, 500)
    return () => clearTimeout(timer)
  }, [deepgramApiKey, onboardingComplete])

  const handleEvent = useCallback((data: EventData) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      useTutorialStore.getState().stopTutorial()
      persistOnboardingComplete()

      if (data.status === STATUS.SKIPPED) {
        toast.info("Tutorial skipped", {
          description: "Restart anytime in Settings.",
        })
      }
    }
  }, [])

  return (
    <Joyride
      steps={steps}
      run={isRunning}
      continuous
      tooltipComponent={TutorialTooltip}
      onEvent={handleEvent}
      options={{
        buttons: ["back", "primary", "skip"],
        skipScroll: true,
        zIndex: 60,
        overlayColor: "rgba(0, 0, 0, 0.5)",
      }}
    />
  )
}
