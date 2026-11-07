import { useLayoutEffect, useState, type ReactNode } from "react";
import { t, useLocale } from "@/i18n";

export function LoadingRegion({
  id,
  loading,
  empty = false,
  error = false,
  placeholder,
  children,
}: {
  id: string;
  loading: boolean;
  empty?: boolean;
  error?: boolean;
  placeholder: ReactNode;
  children: ReactNode;
}) {
  useLocale();
  const [visible, setVisible] = useState(false);
  const [Skeleton, setSkeleton] =
    useState<typeof import("./loading-skeleton").LoadingSkeleton>();
  useLayoutEffect(() => {
    if (!loading) return;
    let pending = true;
    setVisible(false);
    setSkeleton(undefined);
    const timer = window.setTimeout(() => {
      setVisible(true);
      void import("./loading-skeleton").then(
        ({ LoadingSkeleton }) => {
          // Do not replace content that already arrived while the module loaded.
          if (pending) setSkeleton(() => LoadingSkeleton);
        },
        () => {
          // The static placeholder can cover this wait without animation.
        },
      );
    }, 150);
    return () => {
      pending = false;
      window.clearTimeout(timer);
    };
  }, [id, loading]);
  return (
    <div
      className="loading-region"
      data-skeleton-visible={visible}
      aria-busy={loading || undefined}
    >
      {Skeleton ? (
        <Skeleton
          id={id}
          loading={loading}
          empty={!loading && empty}
          emptyMessage={children}
          error={!loading && error ? children : undefined}
          label={t("common.loading")}
        >
          {loading ? placeholder : children}
        </Skeleton>
      ) : loading ? (
        <>
          <span className="sr-only">{t("common.loading")}</span>
          <div className="loading-region-placeholder" aria-hidden="true" inert>
            {placeholder}
          </div>
        </>
      ) : (
        children
      )}
    </div>
  );
}
