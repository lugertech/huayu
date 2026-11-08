import type { ComponentProps } from "react";
import { Skeleton, SkulletProvider } from "skullet/react";

export function LoadingSkeleton(props: ComponentProps<typeof Skeleton>) {
  return (
    <SkulletProvider reveal={{ order: "together", duration: 160, hold: 0 }}>
      <Skeleton {...props} />
    </SkulletProvider>
  );
}
