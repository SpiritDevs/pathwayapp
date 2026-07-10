import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { SidebarTrigger } from "./ui/sidebar";
import { MenuIcon } from "lucide-react";

export function MobileWorkspaceTopbar({
  title,
  children,
  actions,
  onOpenNavigation,
  className,
}: {
  readonly title?: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly onOpenNavigation?: () => void;
  readonly className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-12 min-h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-3 md:hidden",
        className,
      )}
      data-mobile-workspace-topbar=""
    >
      {onOpenNavigation ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
        >
          <MenuIcon />
        </Button>
      ) : (
        <SidebarTrigger aria-label="Open navigation" />
      )}
      <div className="flex min-w-0 flex-1 items-center">
        {children ?? <span className="truncate text-sm font-semibold">{title}</span>}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}
