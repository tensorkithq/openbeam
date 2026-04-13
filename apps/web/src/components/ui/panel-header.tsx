import * as React from "react"

import { cn } from "@/lib/utils"

function PanelHeader({
  className,
  title,
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  title: string
  icon?: React.ReactNode
}) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex min-h-11 items-center justify-between border-b border-border bg-card px-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]",
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </span>
      {children && (
        <div className="flex items-center gap-1">{children}</div>
      )}
    </div>
  )
}

export { PanelHeader }
