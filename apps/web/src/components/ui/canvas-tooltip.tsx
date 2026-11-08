import { useLocale } from "@/i18n";
import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

export function Provider({
  children,
  delayDuration = 300,
}: {
  children: ReactNode;
  delayDuration?: number;
}) {
  useLocale();
  return <Tooltip.Provider delay={delayDuration}>{children}</Tooltip.Provider>;
}
export const Root = Tooltip.Root;
export const Portal = Tooltip.Portal;
export const Arrow = Tooltip.Arrow;
export function Trigger({
  asChild,
  children,
  ...props
}: Tooltip.Trigger.Props & { asChild?: boolean }) {
  useLocale();
  return (
    <Tooltip.Trigger
      {...props}
      render={asChild ? (children as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </Tooltip.Trigger>
  );
}
export function Content({
  sideOffset = 4,
  side = "top",
  align = "center",
  children,
  ...props
}: Tooltip.Popup.Props &
  Pick<Tooltip.Positioner.Props, "sideOffset" | "side" | "align">) {
  useLocale();
  return (
    <Tooltip.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      className="z-[1000]"
    >
      <Tooltip.Popup {...props}>{children}</Tooltip.Popup>
    </Tooltip.Positioner>
  );
}
