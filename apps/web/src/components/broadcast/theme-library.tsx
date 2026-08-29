import { useState, useMemo, useRef, useEffect } from "react"
import { toast } from "sonner"
import { useBroadcastStore } from "@/stores"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  PlusIcon,
  HeartIcon,
  MoreHorizontalIcon,
  SearchIcon,
  DownloadIcon,
  UploadIcon,
  CopyIcon,
  MonitorIcon,
  CastIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { downloadJson, parseThemeFile, serializeThemes, themeFileName } from "@/lib/theme-io"
import type { BroadcastTheme, VerseRenderData } from "@/types"

type FilterTab = "all" | "pinned" | "custom"

const THUMBNAIL_VERSE: VerseRenderData = {
  reference: "John 3:16 (KJV)",
  segments: [{ text: "Sample Verse" }],
}

function ThemeCard({
  theme,
  isMain,
  isAlt,
  isEditing,
  onSelect,
  onRequestDelete,
}: {
  theme: BroadcastTheme
  isMain: boolean
  isAlt: boolean
  isEditing: boolean
  onSelect: () => void
  onRequestDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(theme.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const beginRename = () => {
    setDraftName(theme.name)
    setRenaming(true)
  }

  const commitRename = () => {
    setRenaming(false)
    if (draftName.trim() && draftName.trim() !== theme.name) {
      useBroadcastStore.getState().renameTheme(theme.id, draftName)
    }
  }

  const store = () => useBroadcastStore.getState()

  return (
    <div
      role="button"
      tabIndex={0}
      data-slot="theme-card"
      onClick={onSelect}
      className={cn(
        "group relative flex w-full flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted/50",
        isEditing && "ring-2 ring-primary"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        <CanvasVerse theme={theme} verse={THUMBNAIL_VERSE} className="w-full" />

        {/* Output badges */}
        {(isMain || isAlt) && (
          <div className="absolute top-1.5 left-1.5 flex gap-1">
            {isMain && (
              <Badge className="bg-emerald-600 text-[0.5rem] text-white hover:bg-emerald-600">
                Main
              </Badge>
            )}
            {isAlt && (
              <Badge className="bg-sky-600 text-[0.5rem] text-white hover:bg-sky-600">
                Alt
              </Badge>
            )}
          </div>
        )}

        {/* Pin icon */}
        {theme.pinned && (
          <div className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-background/80">
            <HeartIcon className="size-3 text-primary" strokeWidth={2} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-center gap-1.5 px-0.5">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <Input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") setRenaming(false)
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-6 px-1.5 text-xs"
              aria-label="Theme name"
            />
          ) : (
            <p className="truncate text-xs font-medium text-foreground">{theme.name}</p>
          )}
        </div>

        {/* Tags */}
        <div className="flex shrink-0 items-center gap-1">
          {theme.builtin && (
            <Badge variant="outline" className="text-[0.5rem]">
              Built-in
            </Badge>
          )}
        </div>

        {/* More menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Actions for ${theme.name}`}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontalIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem disabled={isMain} onSelect={() => store().setActiveTheme(theme.id)}>
              <MonitorIcon />
              Set as Main Output
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isAlt} onSelect={() => store().setAltActiveTheme(theme.id)}>
              <CastIcon />
              Set as Alternate Output
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => store().duplicateTheme(theme.id)}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            {!theme.builtin && (
              <>
                <DropdownMenuItem onSelect={beginRename}>
                  <PencilIcon />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    downloadJson(themeFileName(theme.name), serializeThemes([theme]))
                  }
                >
                  <DownloadIcon />
                  Export
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onRequestDelete}>
                  <TrashIcon />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function ThemeLibrary() {
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const altActiveThemeId = useBroadcastStore((s) => s.altActiveThemeId)
  const editingThemeId = useBroadcastStore((s) => s.editingThemeId)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterTab>("all")
  const [pendingDelete, setPendingDelete] = useState<BroadcastTheme | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredThemes = useMemo(() => {
    let result = themes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (filter === "pinned") result = result.filter((t) => t.pinned)
    if (filter === "custom") result = result.filter((t) => !t.builtin)
    return result
  }, [themes, search, filter])

  const builtinThemes = filteredThemes.filter((t) => t.builtin)
  const customThemes = filteredThemes.filter((t) => !t.builtin)
  const allCustomThemes = themes.filter((t) => !t.builtin)

  const handleNewTheme = () => {
    const firstTheme = themes[0]
    if (firstTheme) {
      useBroadcastStore.getState().duplicateTheme(firstTheme.id)
    }
  }

  const handleImportFile = async (file: File) => {
    try {
      const imported = parseThemeFile(await file.text()).map((t) =>
        useBroadcastStore.getState().importTheme(t)
      )
      toast.success(
        imported.length === 1
          ? `Imported "${imported[0].name}"`
          : `Imported ${imported.length} themes`
      )
    } catch (err) {
      toast.error("Couldn't import theme", {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleExportAll = () => {
    if (allCustomThemes.length === 0) {
      toast.info("No custom themes to export")
      return
    }
    downloadJson("openbeam-themes.json", serializeThemes(allCustomThemes))
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    useBroadcastStore.getState().deleteTheme(pendingDelete.id)
    toast.success(`Deleted "${pendingDelete.name}"`)
    setPendingDelete(null)
  }

  const renderCard = (theme: BroadcastTheme) => (
    <ThemeCard
      key={theme.id}
      theme={theme}
      isMain={theme.id === activeThemeId}
      isAlt={theme.id === altActiveThemeId}
      isEditing={theme.id === editingThemeId}
      onSelect={() => useBroadcastStore.getState().startEditing(theme.id)}
      onRequestDelete={() => setPendingDelete(theme)}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <span className="text-lg font-semibold text-foreground">Themes</span>
        <Button onClick={handleNewTheme}>
          <PlusIcon className="size-4" />
          New
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-4">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search themes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as FilterTab)}
        className="shrink-0 px-3 pb-4"
      >
        <TabsList className="h-7 w-full">
          <TabsTrigger value="all" className="capitalize">all</TabsTrigger>
          <TabsTrigger value="pinned" className="capitalize">pinned</TabsTrigger>
          <TabsTrigger value="custom" className="capitalize">custom</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Import / Export */}
      <div className="flex gap-1.5 px-3 pb-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="theme-import-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImportFile(file)
            e.target.value = ""
          }}
        />
        <Button
          variant="outline"
          className="flex-1 border-border bg-transparent"
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadIcon className="size-2.5" />
          Import
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-border bg-transparent"
          onClick={handleExportAll}
        >
          <DownloadIcon className="size-2.5" />
          Export All
        </Button>
      </div>

      {/* Theme list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pb-4">
          {builtinThemes.length > 0 && (
            <>
              <p className="px-1.5 pt-2 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                Built-in
              </p>
              {builtinThemes.map(renderCard)}
            </>
          )}

          {customThemes.length > 0 && (
            <>
              <p className="px-1.5 pt-3 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                Custom
              </p>
              {customThemes.map(renderCard)}
            </>
          )}

          {filteredThemes.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No themes found
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete "{pendingDelete?.name}"?</DialogTitle>
            <DialogDescription>
              This removes the theme permanently. Any output using it switches back to the default theme.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
