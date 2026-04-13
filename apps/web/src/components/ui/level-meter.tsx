import * as React from "react"

import { cn } from "@/lib/utils"

function LevelMeter({
  className,
  level,
  bars = 4,
  ...props
}: React.ComponentProps<"div"> & {
  level: number
  bars?: number
}) {
  return (
    <div
      data-slot="level-meter"
      className={cn("flex items-end gap-0.5", className)}
      {...props}
    >
      {Array.from({ length: bars }, (_, i) => {
        const threshold = (i + 1) / bars
        const active = level >= threshold

        return (
          <span
            key={i}
            className={cn(
              "w-1 rounded-full transition-all duration-75",
              active
                ? i >= bars - 1
                  ? "bg-destructive"
                  : i >= bars - 2
                    ? "bg-primary"
                    : "bg-confidence-high"
                : "bg-muted/30"
            )}
            style={{ height: `${((i + 1) / bars) * 16 + 4}px` }}
          />
        )
      })}
    </div>
  )
}

export { LevelMeter }
