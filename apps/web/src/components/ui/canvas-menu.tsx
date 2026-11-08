import { useLocale } from "@/i18n";
import { Menu } from "@base-ui/react/menu";
import type { ReactElement } from "react";

export const Root = Menu.Root;
export const Portal = Menu.Portal;
export function Trigger({
  asChild,
  children,
  ...props
}: Menu.Trigger.Props & { asChild?: boolean }) {
  useLocale();
  return (
    <Menu.Trigger
      {...props}
      render={asChild ? (children as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </Menu.Trigger>
  );
}
export function Content({
  sideOffset = 4,
  align = "center",
  side = "bottom",
  children,
  ...props
}: Menu.Popup.Props &
  Pick<Menu.Positioner.Props, "sideOffset" | "align" | "side">) {
  useLocale();
  return (
    <Menu.Positioner
      sideOffset={sideOffset}
      align={align}
      side={side}
      className="z-[1000]"
    >
      <Menu.Popup {...props}>{children}</Menu.Popup>
    </Menu.Positioner>
  );
}
export function Item({
  onSelect,
  ...props
}: Menu.Item.Props & { onSelect?: () => void }) {
  useLocale();
  return <Menu.Item {...props} onClick={onSelect} />;
}
