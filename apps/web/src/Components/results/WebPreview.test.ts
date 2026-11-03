import { describe, expect, it } from "vite-plus/test";
import { previewHTML } from "./WebPreview";
describe("generated website preview", () => {
  it("keeps standards mode while putting the network policy before generated scripts", () => {
    const source =
      '<!doctype html><html><head><style>body{margin:0}</style></head><body><script>document.body.dataset.ready="yes"</script></body></html>';
    const output = previewHTML(source);
    expect(output.toLowerCase().startsWith("<!doctype html>")).toBe(true);
    expect(output.indexOf("Content-Security-Policy")).toBeLessThan(
      output.indexOf("<script>"),
    );
    expect(output).toContain("connect-src 'none'");
    expect(output).toContain("form-action 'none'");
    expect(output).toContain(source.slice("<!doctype html>".length));
  });
  it("previews HTML fragments with a doctype without altering their content", () => {
    expect(previewHTML("<h1>片段</h1>")).toMatch(/^<!doctype html>/);
    expect(previewHTML("<h1>片段</h1>")).toContain("<h1>片段</h1>");
  });
});
