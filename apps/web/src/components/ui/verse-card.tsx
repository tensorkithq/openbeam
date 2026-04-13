import * as React from "react"

import { cn } from "@/lib/utils"

function VerseCard({
  className,
  reference,
  translation,
  text,
  verseNumber,
  empty = false,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  reference?: string
  translation?: string
  text?: string
  verseNumber?: number
  empty?: boolean
}) {
  return (
    <div
      data-slot="verse-card"
      className={cn(
        "w-full aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-[oklch(0.18_0.02_260)] via-[oklch(0.15_0.01_240)] to-[oklch(0.12_0.02_220)] flex flex-col items-center justify-center",
        className
      )}
      {...props}
    >
      {empty ? (
        <p className="text-sm italic text-muted-foreground">
          Select a verse to preview
        </p>
      ) : (
        <>
          {reference && (
            <p className="text-xs font-semibold uppercase tracking-[0.05em] text-primary text-center">
              {reference}
              {translation && ` (${translation})`}
            </p>
          )}
          {text && (
            <p className="mt-3 px-8 font-serif text-base leading-relaxed text-white/90 text-center">
              {verseNumber != null && (
                <sup className="mr-0.5 align-super text-[0.6rem] text-primary/50">
                  {verseNumber}
                </sup>
              )}
              {text}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export { VerseCard }
