import { useEffect, useRef, useState } from "react";
import { Headphones, VideoOff } from "lucide-react";
import type { Recording } from "@/api/client";
import { t, useLocale } from "@/i18n";
import { loadRecordingCover } from "./cover";

export function RecordingCover({ recording }: { recording: Recording }) {
  useLocale();
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [cover, setCover] = useState("");
  const [state, setState] = useState<
    "loading" | "image" | "audio" | "unavailable"
  >("loading");
  const { id, asset_id } = recording;
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "200px" },
    );
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let objectUrl = "";
    loadRecordingCover({ id, asset_id }, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setCover(objectUrl);
          setState("image");
        } else setState("audio");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("unavailable");
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, asset_id, visible]);
  return (
    <span
      ref={root}
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-muted/50"
    >
      {state === "image" ? (
        <img
          src={cover}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setState("unavailable")}
        />
      ) : state === "loading" ? (
        <span className="absolute inset-0 bg-muted motion-safe:animate-pulse" />
      ) : (
        <span className="flex flex-col items-center gap-2 text-muted-foreground">
          {state === "audio" ? (
            <Headphones className="size-8" />
          ) : (
            <VideoOff className="size-7" />
          )}
          <span className="text-xs">
            {t(
              state === "audio"
                ? "recordings.audioCover"
                : "recordings.coverUnavailable",
            )}
          </span>
        </span>
      )}
    </span>
  );
}
