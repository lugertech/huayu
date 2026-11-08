import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleContext } from "@/i18n";
import { Markdown } from "./Markdown";

describe("Markdown interface language", () => {
  it("uses the surrounding canvas language for an image without alternative text", () => {
    const output = renderToStaticMarkup(
      <LocaleContext value="en">
        <Markdown>{"保留正文\n\n![](https://example.com/a.png)"}</Markdown>
      </LocaleContext>,
    );
    expect(output).toContain("<span>Image</span>");
    expect(output).toContain("保留正文");
    expect(output).not.toContain("<span>图片</span>");
  });
});
