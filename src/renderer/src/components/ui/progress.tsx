import * as React from "react"
import { cn } from "../../lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: number
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
    ({ className, value, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "relative h-3 w-full overflow-hidden rounded-full bg-black/18 p-[2px]",
                className
            )}
            {...props}
        >
            <div
                className="h-full w-full flex-1 rounded-full bg-[linear-gradient(90deg,#ffffff_0%,#c7ceff_40%,#79dfff_100%)] transition-all"
                style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
            />
        </div>
    )
)
Progress.displayName = "Progress"

export { Progress }
