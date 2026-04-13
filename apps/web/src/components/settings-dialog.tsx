import { useState, useEffect, useCallback, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  MicIcon,
  TvIcon,
  KeyIcon,
  SettingsIcon,
  CheckIcon,
  BookOpenIcon,
  RadioIcon,
  HelpCircleIcon,
  GraduationCapIcon,
  BrainCircuitIcon,
} from "lucide-react"
import { useSettingsStore } from "@/stores"
import { useTutorialStore } from "@/stores/tutorial-store"
import { useSettingsDialogStore } from "@/lib/settings-dialog"
import type { DeviceInfo } from "@/types/audio"

type NavSection = "audio" | "speech" | "bible" | "display" | "api-keys" | "remote" | "help"

const navItems: { name: string; id: NavSection; icon: React.ReactNode }[] = [
  { name: "Audio", id: "audio", icon: <MicIcon strokeWidth={2} /> },
  { name: "Speech Recognition", id: "speech", icon: <BrainCircuitIcon strokeWidth={2} /> },
  { name: "Bible", id: "bible", icon: <BookOpenIcon strokeWidth={2} /> },
  { name: "Display Mode", id: "display", icon: <TvIcon strokeWidth={2} /> },
  { name: "Remote Control", id: "remote", icon: <RadioIcon strokeWidth={2} /> },
  { name: "API Keys", id: "api-keys", icon: <KeyIcon strokeWidth={2} /> },
  { name: "Help", id: "help", icon: <HelpCircleIcon strokeWidth={2} /> },
]

function AudioSection() {
  const { audioDeviceId, setAudioDeviceId, gain, setGain } = useSettingsStore()
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)

  // TODO: Wire to API in WS-3
  const loadDevices = useCallback(async () => {
    try {
      setLoading(true)
      setDevices([]) // stub
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  const gainPercent = Math.round((gain / 2.0) * 100)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Input Device
        </label>
        <Select
          value={audioDeviceId ?? "__default__"}
          onValueChange={(v) => setAudioDeviceId(v === "__default__" ? null : v)}
          disabled={loading}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={loading ? "Loading devices..." : "System default"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">System default</SelectItem>
            {devices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.name}{device.is_default ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[0.625rem] text-muted-foreground">
          Selected device persists across sessions. Leave as system default to follow OS audio routing.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Input Gain</label>
          <span className="text-xs tabular-nums text-muted-foreground">{gainPercent}%</span>
        </div>
        <Slider min={0} max={100} step={1} value={[gainPercent]} onValueChange={([v]) => setGain((v / 100) * 2.0)} />
        <p className="text-[0.625rem] text-muted-foreground">
          Amplifies the incoming audio signal before transcription. 50% is unity gain.
        </p>
      </div>
    </div>
  )
}

function SpeechSection() {
  const { sttProvider, setSttProvider, deepgramApiKey, setDeepgramApiKey } = useSettingsStore()
  const [keyValue, setKeyValue] = useState(deepgramApiKey ?? "")
  const [saved, setSaved] = useState(false)

  const handleSaveKey = () => {
    setDeepgramApiKey(keyValue || null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Provider</label>
        <RadioGroup value={sttProvider} onValueChange={(v) => setSttProvider(v as "deepgram" | "whisper")} className="gap-3">
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${sttProvider !== "deepgram" ? "hover:border-muted-foreground/25" : ""}`}>
            <RadioGroupItem value="deepgram" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Cloud (Deepgram)</span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Uses Deepgram Nova-3 for real-time streaming transcription. Requires an API key and internet connection.
              </p>
            </div>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${sttProvider !== "whisper" ? "hover:border-muted-foreground/25" : ""}`}>
            <RadioGroupItem value="whisper" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Local (Whisper)</span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Runs Whisper large-v3-turbo locally on your device. Fully offline, no API key needed.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      {sttProvider === "deepgram" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Deepgram API Key</label>
            {deepgramApiKey && <Badge variant="outline" className="text-[0.5rem]">Key configured</Badge>}
          </div>
          <div className="flex gap-2">
            <Input type="password" placeholder="Enter your Deepgram API key..." value={keyValue} onChange={(e) => setKeyValue(e.target.value)} className="flex-1 text-xs" />
            <Button size="sm" onClick={handleSaveKey}>
              {saved ? (<><CheckIcon className="size-3" />Saved</>) : "Save"}
            </Button>
          </div>
          <p className="text-[0.625rem] text-muted-foreground">
            Required for live transcription. Get a key at <span className="text-primary">deepgram.com</span>
          </p>
        </div>
      )}
    </div>
  )
}

function DisplayModeSection() {
  const { autoMode, setAutoMode, confidenceThreshold, setConfidenceThreshold } = useSettingsStore()
  const thresholdPercent = Math.round(confidenceThreshold * 100)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Broadcast Mode</label>
        <RadioGroup value={autoMode ? "auto" : "manual"} onValueChange={(v) => setAutoMode(v === "auto")} className="gap-3">
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${!autoMode ? "hover:border-muted-foreground/25" : ""}`}>
            <RadioGroupItem value="auto" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Auto</span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Automatically displays the highest-confidence detected verse on broadcast output.
              </p>
            </div>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${autoMode ? "hover:border-muted-foreground/25" : ""}`}>
            <RadioGroupItem value="manual" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Manual</span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Nothing goes to broadcast until you explicitly send it.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      {autoMode && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Confidence Threshold</label>
            <span className="text-xs tabular-nums text-muted-foreground">{thresholdPercent}%</span>
          </div>
          <Slider min={35} max={100} step={1} value={[thresholdPercent]} onValueChange={([v]) => setConfidenceThreshold(v / 100)} />
          <p className="text-[0.625rem] text-muted-foreground">
            Only verses with confidence above this threshold will be sent to broadcast automatically.
          </p>
        </div>
      )}
    </div>
  )
}

function ApiKeysSection() {
  const { deepgramApiKey, sttProvider } = useSettingsStore()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Deepgram API Key</label>
          {deepgramApiKey ? (
            <Badge variant="outline" className="text-[0.5rem]">Key configured</Badge>
          ) : (
            <Badge variant="outline" className="text-[0.5rem] text-muted-foreground">Not set</Badge>
          )}
        </div>
        <p className="text-[0.625rem] text-muted-foreground">
          {sttProvider === "whisper" ? "Not required when using local Whisper. " : "Required for cloud transcription. "}
          Configure in the Speech Recognition section.
        </p>
      </div>
    </div>
  )
}

interface TranslationInfo {
  id: number
  abbreviation: string
  title: string
  language: string
}

function BibleSection() {
  const [translations, setTranslations] = useState<TranslationInfo[]>([])
  const [activeId, setActiveId] = useState<number>(1)
  const [loading, setLoading] = useState(true)

  // TODO: Wire to API in WS-3
  useEffect(() => {
    setLoading(false)
  }, [])

  const handleChange = async (value: string) => {
    const id = parseInt(value)
    setActiveId(id)
    const { useBibleStore } = await import("@/stores")
    useBibleStore.getState().setActiveTranslation(id)
  }

  const englishTranslations = translations.filter((t) => t.language === "en")
  const otherTranslations = translations.filter((t) => t.language !== "en")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Primary Translation</label>
        <Select value={String(activeId)} onValueChange={handleChange} disabled={loading}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={loading ? "Loading..." : "Select translation"} />
          </SelectTrigger>
          <SelectContent>
            {englishTranslations.length > 0 && (
              <>
                <div className="px-2 py-1 text-[0.5625rem] font-medium uppercase tracking-wider text-muted-foreground">English</div>
                {englishTranslations.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.abbreviation} — {t.title}</SelectItem>
                ))}
              </>
            )}
            {otherTranslations.length > 0 && (
              <>
                <div className="mt-1 px-2 py-1 text-[0.5625rem] font-medium uppercase tracking-wider text-muted-foreground">Other Languages</div>
                {otherTranslations.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.abbreviation} — {t.title}</SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
        <p className="text-[0.625rem] text-muted-foreground">
          Detected verses will display in this translation.
          {translations.length > 0 && ` ${translations.length} translations available.`}
        </p>
      </div>
    </div>
  )
}

function RemoteControlSection() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Remote control (OSC / HTTP API) will be available when the backend is connected.
      </p>
      {/* TODO: Wire to API in WS-3 — OSC and HTTP toggle/status */}
    </div>
  )
}

function HelpSection() {
  const closeSettings = useSettingsDialogStore((s) => s.closeSettings)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Resources to help you get the most out of OpenBeam.
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <GraduationCapIcon className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Interactive Tutorial</p>
              <p className="text-xs text-muted-foreground">Step-by-step walkthrough of every feature</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              closeSettings()
              setTimeout(() => {
                useTutorialStore.getState().startTutorial()
              }, 300)
            }}
          >
            <GraduationCapIcon className="mr-1.5 size-3.5" />
            Restart
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <KeyIcon className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Keyboard Shortcuts</p>
              <p className="text-xs text-muted-foreground">Arrow keys navigate the tutorial, Esc to dismiss</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const sectionTitles: Record<NavSection, string> = {
  audio: "Audio",
  speech: "Speech Recognition",
  bible: "Bible Translation",
  display: "Display Mode",
  remote: "Remote Control",
  "api-keys": "API Keys",
  help: "Help",
}

const sectionComponents: Record<NavSection, React.FC> = {
  audio: AudioSection,
  speech: SpeechSection,
  bible: BibleSection,
  display: DisplayModeSection,
  remote: RemoteControlSection,
  "api-keys": ApiKeysSection,
  help: HelpSection,
}

export function SettingsDialog() {
  const open = useSettingsDialogStore((s) => s.isOpen)
  const activeSection = useSettingsDialogStore((s) => s.activeSection)
  const setActiveSection = useSettingsDialogStore((s) => s.setActiveSection)
  const openSettingsFn = useSettingsDialogStore((s) => s.openSettings)
  const closeSettings = useSettingsDialogStore((s) => s.closeSettings)

  const ActiveContent = sectionComponents[activeSection]

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          openSettingsFn()
        } else {
          closeSettings()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" data-tour="settings">
          <SettingsIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[800px] lg:max-w-[900px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure audio, display mode, and API keys.
        </DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar collapsible="none" className="hidden md:flex">
            <div className="h-14 border-b border-border border-r px-4 flex items-center">
              Settings
            </div>
            <SidebarContent className="border-r border-border">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={item.id === activeSection}
                          onClick={() => setActiveSection(item.id)}
                        >
                          {item.icon}
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex h-[580px] flex-1 flex-col overflow-hidden">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border">
              <div className="flex items-center gap-2 px-4">
                {sectionTitles[activeSection]}
              </div>
            </header>
            <div className="flex flex-1 flex-col overflow-y-auto p-4">
              <ActiveContent />
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
