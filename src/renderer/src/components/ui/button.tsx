import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "gradient"
    size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    {
                        "bg-primary text-primary-foreground hover:bg-primary/90": variant === "default",
                        "bg-destructive text-destructive-foreground hover:bg-destructive/90": variant === "destructive",
                        "border border-white/12 bg-white/6 hover:bg-white/12 hover:text-white": variant === "outline",
                        "bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
                        "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
                        "text-primary underline-offset-4 hover:underline": variant === "link",
                        "bg-[linear-gradient(180deg,#e262ea_0%,#aa43e5_100%)] text-white shadow-[0_16px_34px_rgba(170,67,229,0.36)] hover:brightness-110": variant === "gradient",
                    },
                    {
                        "h-10 px-4 py-2": size === "default",
                        "h-9 rounded-md px-3": size === "sm",
                        "h-11 rounded-full px-8": size === "lg",
                        "h-10 w-10": size === "icon",
                    },
                    className
                )}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
