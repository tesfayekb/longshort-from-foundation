import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  // ACT-525 R2 (a) — structural containment. `min-w-0` lets the card
  // shrink inside CSS grid/flex parents (default `min-width: auto` prevents
  // shrinking below intrinsic content width, which is the root cause of the
  // KPI-tile bleed at narrow widths). Consumers that need explicit clipping
  // add `overflow-hidden` themselves; we don't force it here so focus rings,
  // radix popovers/tooltips anchored inside a Card still escape correctly.
  <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm min-w-0", className)} {...props} />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  // ACT-525 R2 (a) — default `break-words` + `min-w-0` on card bodies so
  // long technical strings (function names, correlation ids, SQL paths)
  // wrap instead of forcing horizontal overflow. Individual consumers can
  // still opt into `whitespace-nowrap` on specific inline children.
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0 min-w-0 break-words", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
