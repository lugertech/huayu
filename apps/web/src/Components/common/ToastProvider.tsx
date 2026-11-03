import { t, useLocale } from "@/i18n";
import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
  dedupeKey?: string;
  action?: { label: string; onClick: () => void };
}
export function ToastProvider({ children }: { children: ReactNode }) {
  useLocale();
  return (
    <Toast.Provider timeout={4500}>
      <>
        {children}
        <Notifications />
      </>
    </Toast.Provider>
  );
}
function Notifications() {
  useLocale();
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-[2000] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2 outline-none">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className={cn(
              "rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg outline-none",
              toast.type === "error" && "border-destructive/40",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Toast.Title className="text-sm font-medium" />
                <Toast.Description className="mt-1 break-words text-sm text-muted-foreground" />
                {toast.actionProps && (
                  <Toast.Action className="mt-3 rounded-md border px-2.5 py-1.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" />
                )}
              </div>
              <Toast.Close
                className="rounded p-1 hover:bg-muted"
                aria-label={t("common.dismissNotification")}
              >
                <X className="size-4" />
              </Toast.Close>
            </div>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
export function useToast() {
  const { add } = Toast.useToastManager();
  const showToast = useCallback(
    (options: ToastOptions) =>
      add({
        title: options.title,
        description: options.description,
        type: options.variant === "destructive" ? "error" : "success",
        timeout: options.duration,
        actionProps: options.action
          ? { children: options.action.label, onClick: options.action.onClick }
          : undefined,
      }),
    [add],
  );
  return { showToast };
}
