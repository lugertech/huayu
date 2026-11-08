import { Dialog } from "@base-ui/react/dialog";
import type { ReactElement } from "react";

export const Root = Dialog.Root;
export const Portal = Dialog.Portal;
export const Overlay = Dialog.Backdrop;
export const Content = Dialog.Popup;
export const Title = Dialog.Title;
export const Description = Dialog.Description;
export function Close({
  asChild,
  children,
  ...props
}: Dialog.Close.Props & { asChild?: boolean }) {
  return (
    <Dialog.Close
      {...props}
      render={asChild ? (children as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </Dialog.Close>
  );
}
