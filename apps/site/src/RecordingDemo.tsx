import { useState } from "react";
import {
  ArrowDown,
  Check,
  FileText,
  Plus,
  VideoCamera,
} from "@phosphor-icons/react";
import { useSiteI18n } from "./i18n";

const excerpts = [
  {
    time: "00:08",
    text: "home.writeTheIdeaDownBeforeDecidingWhereItShouldLead",
  },
  { time: "00:12", text: "home.theseScatteredMomentsCouldBecomeAStory" },
  { time: "00:19", text: "home.recording.thirdExcerpt" },
] as const;

export function RecordingDemo() {
  const { t } = useSiteI18n();
  const [selected, setSelected] = useState(1);
  const [added, setAdded] = useState<number | null>(null);
  return (
    <div
      className="recording-example"
      aria-label={t(
        "home.exampleOfTurningARecordingExcerptIntoCreativeMaterial",
      )}
    >
      <div className="example-heading">
        <span>
          <VideoCamera size={18} />
          {t("home.aMomentOfInspiration")}
        </span>
        <span className="example-label">{t("home.example")}</span>
      </div>
      <div className="recording-wave" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <fieldset className="transcript-choices">
        <legend>{t("home.recording.chooseExcerpt")}</legend>
        {excerpts.map((excerpt, index) => (
          <label
            key={excerpt.time}
            className={`transcript-line ${selected === index ? "active" : ""}`}
          >
            <input
              className="sr-only"
              type="radio"
              name="recording-excerpt"
              checked={selected === index}
              onChange={() => setSelected(index)}
            />
            <time>{excerpt.time}</time>
            <span>{t(excerpt.text)}</span>
            <span className="transcript-check" aria-hidden="true">
              {selected === index && <Check size={12} weight="bold" />}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="example-action">
        <span>{t("home.recording.keepSource")}</span>
        <button
          className="site-button compact"
          disabled={added === selected}
          onClick={() => setAdded(selected)}
        >
          {added === selected ? <Check size={16} /> : <Plus size={16} />}
          {t(
            added === selected
              ? "home.recording.added"
              : "home.recording.addToCanvas",
          )}
        </button>
      </div>
      <div className="example-next" aria-hidden="true">
        <ArrowDown size={20} />
      </div>
      <div className="example-canvas">
        <span className="example-canvas-label">
          {t("home.recording.exampleCanvas")}
        </span>
        <output
          className={`example-material ${added === null ? "is-empty" : ""}`}
          aria-live="polite"
        >
          {added === null ? (
            <>
              <Plus size={24} />
              <p>{t("home.recording.emptyCanvas")}</p>
            </>
          ) : (
            <div key={added} className="material-content">
              <span className="material-type">
                <FileText size={16} />
                {t("home.recording.excerptMaterial")}
                <Check size={14} />
              </span>
              <strong>{t("home.whereAStoryBegins")}</strong>
              <p>{t(excerpts[added].text)}</p>
              <small>
                {t("home.recording.source", { time: excerpts[added].time })}
              </small>
            </div>
          )}
        </output>
      </div>
    </div>
  );
}
