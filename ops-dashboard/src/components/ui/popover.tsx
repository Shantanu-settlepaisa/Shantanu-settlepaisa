import * as React from "react"
import { cn } from "@/lib/utils"

interface PopoverProps {
  children: React.ReactNode
  content: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Popover({ children, content, open, onOpenChange }: PopoverProps) {
  const [isOpen, setIsOpen] = React.useState(open || false)

  React.useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open)
    }
  }, [open])

  const handleToggle = () => {
    const newState = !isOpen
    setIsOpen(newState)
    onOpenChange?.(newState)
  }

  return (
    <div className="relative inline-block">
      <div onClick={handleToggle}>{children}</div>
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={handleToggle}
          />
          <div className={cn(
            "absolute z-50 mt-2 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none",
            "animate-in fade-in-0 zoom-in-95"
          )}>
            {content}
          </div>
        </>
      )}
    </div>
  )
}

export const PopoverTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const PopoverContent = ({ children }: { children: React.ReactNode }) => <>{children}</>
