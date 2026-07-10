import * as React from "react";

import { cn } from "../../lib/utils";

export function Avatar({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({ className, alt = "", ...props }: React.ComponentProps<"img">) {
  return <img alt={alt} className={cn("size-full object-cover", className)} {...props} />;
}

export function AvatarFallback({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex size-full items-center justify-center text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
