"use client"

import type React from "react"
import { cn } from "@/lib/utils"

interface EditableTextProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  ariaLabel: string
  /** Render a full-width textarea instead of an inline input. */
  multiline?: boolean
  rows?: number
  /** Stretch the input to fill its container instead of sizing to content. */
  block?: boolean
}

/**
 * A borderless, transparent field that visually matches plain text at rest but
 * is always editable. Inherits the surrounding typography so the layout and
 * appearance stay identical to a static text node.
 */
export function EditableText({
  value,
  onChange,
  className,
  placeholder,
  ariaLabel,
  multiline,
  rows,
  block,
}: EditableTextProps) {
  const base = cn(
    "m-0 border-0 bg-transparent p-0 outline-none focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60",
    className,
  )

  // Inherit typography from the parent so the control looks like text.
  const inheritStyle: React.CSSProperties = {
    font: "inherit",
    letterSpacing: "inherit",
    lineHeight: "inherit",
    color: "inherit",
  }

  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={rows}
        className={cn(base, "w-full resize-none")}
        style={inheritStyle}
      />
    )
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(base, block && "w-full")}
      // `fieldSizing: content` makes inline inputs grow/shrink with their text
      // so short values (like a KPI figure) don't reserve a wide input box.
      style={block ? inheritStyle : { ...inheritStyle, fieldSizing: "content" } as React.CSSProperties}
    />
  )
}
