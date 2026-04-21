import { useState, useEffect } from "react"
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
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useBroadcastStore } from "@/stores"
import { getSessionId } from "@/streams/setup"
import {
  MonitorIcon,
  CastIcon,
  CopyIcon,
  CheckIcon,
  LinkIcon,
} from "lucide-react"

export function BroadcastSettings({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const altActiveThemeId = useBroadcastStore((s) => s.altActiveThemeId)
  const mainEnabled = useBroadcastStore((s) => s.mainEnabled)
  const altEnabled = useBroadcastStore((s) => s.altEnabled)

  const [mainThemeId, setMainThemeId] = useState(activeThemeId)
  const [mainCopied, setMainCopied] = useState(false)

  const [altThemeId, setAltThemeId] = useState(altActiveThemeId)
  const [altCopied, setAltCopied] = useState(false)

  useEffect(() => {
    setMainThemeId(activeThemeId)
  }, [activeThemeId])

  useEffect(() => {
    setAltThemeId(altActiveThemeId)
  }, [altActiveThemeId])

  const handleMainThemeChange = (id: string) => {
    setMainThemeId(id)
    useBroadcastStore.getState().setActiveTheme(id)
  }

  const handleAltThemeChange = (id: string) => {
    setAltThemeId(id)
    useBroadcastStore.getState().setAltActiveTheme(id)
  }

  const sessionId = getSessionId()
  const overlayUrl = `${window.location.origin}/overlay.html?role=overlay&session=${sessionId}`
  const altOverlayUrl = `${window.location.origin}/overlay.html?role=overlay&output=alt&session=${sessionId}`

  const copyUrl = async (url: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text for manual copy
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
                <Switch
                  checked={mainEnabled}
                  onCheckedChange={(v) => useBroadcastStore.getState().setMainEnabled(v)}
                />
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
              <div className="flex items-center gap-1.5">
                <LinkIcon className="size-3 text-muted-foreground" />
                <label className="text-xs text-muted-foreground">Overlay URL</label>
              </div>
              <p className="text-[0.625rem] text-muted-foreground/70 leading-tight">
                Add as a Browser Source in OBS or any streaming software.
              </p>
              <div className="flex gap-1.5">
                <code className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[0.625rem] text-muted-foreground truncate select-all">
                  {overlayUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1 px-2"
                  onClick={() => copyUrl(overlayUrl, setMainCopied)}
                >
                  {mainCopied
                    ? <><CheckIcon className="size-3 text-emerald-400" />Copied</>
                    : <><CopyIcon className="size-3" />Copy</>}
                </Button>
              </div>
            </div>
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
                <Switch
                  checked={altEnabled}
                  onCheckedChange={(v) => useBroadcastStore.getState().setAltEnabled(v)}
                />
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
              <div className="flex items-center gap-1.5">
                <LinkIcon className="size-3 text-muted-foreground" />
                <label className="text-xs text-muted-foreground">Overlay URL</label>
              </div>
              <p className="text-[0.625rem] text-muted-foreground/70 leading-tight">
                Add as a Browser Source in OBS or any streaming software.
              </p>
              <div className="flex gap-1.5">
                <code className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[0.625rem] text-muted-foreground truncate select-all">
                  {altOverlayUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1 px-2"
                  onClick={() => copyUrl(altOverlayUrl, setAltCopied)}
                >
                  {altCopied
                    ? <><CheckIcon className="size-3 text-emerald-400" />Copied</>
                    : <><CopyIcon className="size-3" />Copy</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
