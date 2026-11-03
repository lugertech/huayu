import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { RotateCw, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/ui/button";
import { NativeSelect, NativeSelectOption } from "@/ui/native-select";

export function previewHTML(html: string) {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return `${doctype?.[0] || "<!doctype html>"}<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https: http:; media-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">${doctype ? html.slice(doctype[0].length) : html}`;
}
export function WebPreview({
  html,
  label = t("results.web.webPagePreview"),
}: {
  html: string;
  label?: string;
}) {
  useLocale();
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [device, setDevice] = useState("auto");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width =
    device === "desktop" ? 1280 : device === "mobile" ? 390 : size.w;
  const scale = Math.min(1, size.w / width);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {device === "mobile" ? (
            <Smartphone className="size-3.5" />
          ) : (
            <Monitor className="size-3.5" />
          )}
          <NativeSelect
            aria-label={t("results.web.previewSize")}
            className="h-7 w-auto min-w-28 text-xs"
            value={device}
            onChange={(event) => setDevice(event.target.value)}
          >
            <NativeSelectOption value="auto">
              {t("results.web.responsive")}
            </NativeSelectOption>
            <NativeSelectOption value="desktop">
              {t("results.web.desktop")}
            </NativeSelectOption>
            <NativeSelectOption value="mobile">
              {t("results.web.mobile")}
            </NativeSelectOption>
          </NativeSelect>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("results.web.reloadWebPreview")}
          onClick={() => setReload((value) => value + 1)}
        >
          <RotateCw />
        </Button>
      </div>
      <div
        ref={area}
        data-result-focus
        tabIndex={-1}
        className="relative min-h-0 flex-1 overflow-hidden bg-muted/40"
      >
        <iframe
          key={`${device}:${reload}`}
          title={label}
          srcDoc={previewHTML(html)}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          className="absolute top-0 border-0 bg-white"
          style={{
            width,
            height: size.h / scale,
            left: Math.max(0, (size.w - width) / 2),
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </div>
  );
}
