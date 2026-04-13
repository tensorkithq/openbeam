import * as React from "react"

import { cn } from "@/lib/utils"

function ConfidenceDot({
  className,
  confidence,
  size = "md",
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  confidence: number
  size?: "sm" | "md"
}) {
  return (
    <span
      data-slot="confidence-dot"
      className={cn(
        "inline-block rounded-full",
        size === "sm" ? "size-1.5" : "size-2",
        confidence > 0.8
          ? "bg-confidence-high shadow-[0_0_4px_oklch(0.72_0.19_149/0.4)]"
          : confidence >= 0.5
            ? "bg-confidence-mid shadow-[0_0_4px_oklch(0.75_0.18_55/0.4)]"
            : "bg-confidence-low shadow-[0_0_4px_oklch(0.63_0.24_25/0.4)]",
        className
      )}
      {...props}
    />
  )
}

export { ConfidenceDot }
