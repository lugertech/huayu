import { useTranslations } from "@/i18n";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  const { t } = useTranslations();
  return (
    <div className="document-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>{alt || t("common.image")}</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
