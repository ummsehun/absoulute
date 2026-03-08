import * as React from "react"
import { cn } from "../../lib/utils"

const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>

export interface TooltipProps {
    children: React.ReactNode
    content: React.ReactNode
    className?: string
    style?: React.CSSProperties
}

const Tooltip = ({ children, content, className, style }: TooltipProps) => {
    return (
        <div className="relative group inline-block">
            {children}
            <div
                className={cn(
                    "pointer-events-none absolute z-50 flex w-64 flex-col gap-1 rounded-xl border border-white/20 bg-black/60 p-4 shadow-2xl backdrop-blur-xl transition-all opacity-0 group-hover:opacity-100",
                    className
                )}
                style={style}
            >
                {content}
            </div>
        </div>
    )
}

export { Tooltip, TooltipProvider }
