import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useBroadcastStore } from "@/stores"
import type { NdiAlphaMode, NdiFrameRate, NdiResolution } from "@/types"
import {
  MonitorIcon,
  CastIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshCwIcon,
  RadioIcon,
} from "lucide-react"

// TODO: Wire to API in WS-3 — all invoke/emitTo/listen/availableMonitors/getAllWindows replaced with stubs

type OutputType = "display" | "ndi"

interface Monitor {
  name: string
  size: { width: number; height: number }
}

// Stubs for Tauri window APIs
async function availableMonitors(): Promise<Monitor[]> { return [] }
async function getAllWindows(): Promise<{ label: string }[]> { return [] }

const NDI_RESOLUTION_OPTIONS: Array<{ value: NdiResolution; label: string }> = [
  { value: "r1080p", label: "1080p (1920x1080)" },
  { value: "r720p", label: "720p (1280x720)" },
  { value: "r4k", label: "4K (3840x2160)" },
]

const NDI_FRAME_RATE_OPTIONS: Array<{ value: NdiFrameRate; label: string }> = [
  { value: "fps24", label: "24 fps" },
  { value: "fps30", label: "30 fps" },
  { value: "fps60", label: "60 fps" },
]

const NDI_ALPHA_OPTIONS: Array<{ value: NdiAlphaMode; label: string }> = [
  { value: "noneOpaque", label: "None (Opaque)" },
  { value: "straightAlpha", label: "Straight Alpha" },
  { value: "premultipliedAlpha", label: "Premultiplied Alpha" },
]

export function BroadcastSettings({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)

  const [mainEnabled, setMainEnabled] = useState(false)
  const [mainThemeId, setMainThemeId] = useState(activeThemeId)
  const [outputType, setOutputType] = useState<OutputType>("display")
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [selectedMonitor, setSelectedMonitor] = useState("0")
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [ndiSourceName, setNdiSourceName] = useState("OpenBeam Output")
  const [ndiResolution, setNdiResolution] = useState<NdiResolution>("r1080p")
  const [ndiFrameRate, setNdiFrameRate] = useState<NdiFrameRate>("fps24")
  const [ndiAlphaMode, setNdiAlphaMode] = useState<NdiAlphaMode>("straightAlpha")
  const [ndiActive, setNdiActive] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const altActiveThemeId = useBroadcastStore((s) => s.altActiveThemeId)
  const [altEnabled, setAltEnabled] = useState(false)
  const [altThemeId, setAltThemeId] = useState(altActiveThemeId)
  const [altOutputType, setAltOutputType] = useState<OutputType>("ndi")
  const [altSelectedMonitor, setAltSelectedMonitor] = useState("0")
  const [altIsPreviewOpen, setAltIsPreviewOpen] = useState(false)
  const [altNdiSourceName, setAltNdiSourceName] = useState("OpenBeam Alt")
  const [altNdiResolution, setAltNdiResolution] = useState<NdiResolution>("r1080p")
  const [altNdiFrameRate, setAltNdiFrameRate] = useState<NdiFrameRate>("fps24")
  const [altNdiAlphaMode, setAltNdiAlphaMode] = useState<NdiAlphaMode>("straightAlpha")
  const [altNdiActive, setAltNdiActive] = useState(false)

  const fetchMonitors = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await availableMonitors()
      setMonitors(result)
    } catch {
      setMonitors([])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchMonitors()
  }, [open, fetchMonitors])

  useEffect(() => {
    setMainThemeId(activeThemeId)
  }, [activeThemeId])

  const handleMainThemeChange = (id: string) => {
    setMainThemeId(id)
    useBroadcastStore.getState().setActiveTheme(id)
  }

  // TODO: Wire to API in WS-3
  const handleTogglePreview = async () => {
    setIsPreviewOpen(!isPreviewOpen)
  }

  // TODO: Wire to API in WS-3
  const handleToggleNdi = async () => {
    setNdiActive(!ndiActive)
  }

  const handleMainToggle = async (enabled: boolean) => {
    setMainEnabled(enabled)
    if (!enabled) {
      setIsPreviewOpen(false)
      setNdiActive(false)
    }
  }

  const handleAltThemeChange = (id: string) => {
    setAltThemeId(id)
    useBroadcastStore.getState().setAltActiveTheme(id)
  }

  // TODO: Wire to API in WS-3
  const handleAltTogglePreview = async () => {
    setAltIsPreviewOpen(!altIsPreviewOpen)
  }

  // TODO: Wire to API in WS-3
  const handleAltToggleNdi = async () => {
    setAltNdiActive(!altNdiActive)
  }

  const handleAltToggle = async (enabled: boolean) => {
    setAltEnabled(enabled)
    if (!enabled) {
      setAltIsPreviewOpen(false)
      setAltNdiActive(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[700px] gap-4"
        showCloseButton={true}
      >
        <DialogHeader>
          <DialogTitle>Broadcast</DialogTitle>
          <DialogDescription>
            Configure two independent outputs with different themes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Main Output Card */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonitorIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Main Output</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs", mainEnabled ? "text-foreground" : "text-muted-foreground")}>
                  {mainEnabled ? "On" : "Off"}
                </span>
                <Switch checked={mainEnabled} onCheckedChange={handleMainToggle} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Theme</label>
              <Select value={mainThemeId} onValueChange={handleMainThemeChange}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {themes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Output Type</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setOutputType("display")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                    outputType === "display"
                      ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MonitorIcon className="size-3.5" />
                  External Display
                </button>
                <button
                  onClick={() => setOutputType("ndi")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                    outputType === "ndi"
                      ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <RadioIcon className="size-3.5" />
                  NDI
                </button>
              </div>
            </div>

            {outputType === "display" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Target Monitor</label>
                    <Button variant="ghost" size="xs" disabled={refreshing} onClick={fetchMonitors} className="h-5 gap-1 px-1.5 text-[0.625rem] text-muted-foreground">
                      <RefreshCwIcon className={cn("size-3", refreshing && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>
                  <Select value={selectedMonitor} onValueChange={setSelectedMonitor} disabled={monitors.length === 0}>
                    <SelectTrigger className="w-full" disabled={monitors.length === 0}>
                      <SelectValue placeholder={monitors.length === 0 ? "No monitors detected" : "Select monitor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {monitors.map((m, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {m.name} ({m.size.width}x{m.size.height})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-1.5" disabled={monitors.length === 0} onClick={handleTogglePreview}>
                  {isPreviewOpen ? (<><EyeOffIcon className="size-3.5" />Close Preview</>) : (<><EyeIcon className="size-3.5" />Open Preview</>)}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Resolution</label>
                    <Select value={ndiResolution} onValueChange={(v) => setNdiResolution(v as NdiResolution)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NDI_RESOLUTION_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Frame Rate</label>
                    <Select value={ndiFrameRate} onValueChange={(v) => setNdiFrameRate(v as NdiFrameRate)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NDI_FRAME_RATE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Alpha Channel</label>
                  <Select value={ndiAlphaMode} onValueChange={(v) => setNdiAlphaMode(v as NdiAlphaMode)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NDI_ALPHA_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Source Name</label>
                  <Input value={ndiSourceName} onChange={(e) => setNdiSourceName(e.target.value)} placeholder="OpenBeam Output" />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("w-full gap-1.5", ndiActive && "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400")}
                  onClick={handleToggleNdi}
                >
                  {ndiActive ? (<><CastIcon className="size-3.5" />Stop NDI</>) : (<><CastIcon className="size-3.5" />Start NDI</>)}
                </Button>
              </div>
            )}
          </div>

          {/* Alternate Output Card */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CastIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Alternate Output</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs", altEnabled ? "text-foreground" : "text-muted-foreground")}>
                  {altEnabled ? "On" : "Off"}
                </span>
                <Switch checked={altEnabled} onCheckedChange={handleAltToggle} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Theme</label>
              <Select value={altThemeId} onValueChange={handleAltThemeChange}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {themes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Output Type</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setAltOutputType("display")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                    altOutputType === "display"
                      ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MonitorIcon className="size-3.5" />
                  External Display
                </button>
                <button
                  onClick={() => setAltOutputType("ndi")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                    altOutputType === "ndi"
                      ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <RadioIcon className="size-3.5" />
                  NDI
                </button>
              </div>
            </div>

            {altOutputType === "display" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Target Monitor</label>
                    <Button variant="ghost" size="xs" disabled={refreshing} onClick={fetchMonitors} className="h-5 gap-1 px-1.5 text-[0.625rem] text-muted-foreground">
                      <RefreshCwIcon className={cn("size-3", refreshing && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>
                  <Select value={altSelectedMonitor} onValueChange={setAltSelectedMonitor} disabled={monitors.length === 0}>
                    <SelectTrigger className="w-full" disabled={monitors.length === 0}>
                      <SelectValue placeholder={monitors.length === 0 ? "No monitors detected" : "Select monitor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {monitors.map((m, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {m.name} ({m.size.width}x{m.size.height})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-1.5" disabled={monitors.length === 0} onClick={handleAltTogglePreview}>
                  {altIsPreviewOpen ? (<><EyeOffIcon className="size-3.5" />Close Preview</>) : (<><EyeIcon className="size-3.5" />Open Preview</>)}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Resolution</label>
                    <Select value={altNdiResolution} onValueChange={(v) => setAltNdiResolution(v as NdiResolution)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NDI_RESOLUTION_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Frame Rate</label>
                    <Select value={altNdiFrameRate} onValueChange={(v) => setAltNdiFrameRate(v as NdiFrameRate)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NDI_FRAME_RATE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Alpha Channel</label>
                  <Select value={altNdiAlphaMode} onValueChange={(v) => setAltNdiAlphaMode(v as NdiAlphaMode)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NDI_ALPHA_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Source Name</label>
                  <Input value={altNdiSourceName} onChange={(e) => setAltNdiSourceName(e.target.value)} placeholder="OpenBeam Alt" />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("w-full gap-1.5", altNdiActive && "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400")}
                  onClick={handleAltToggleNdi}
                >
                  {altNdiActive ? (<><CastIcon className="size-3.5" />Stop NDI</>) : (<><CastIcon className="size-3.5" />Start NDI</>)}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
