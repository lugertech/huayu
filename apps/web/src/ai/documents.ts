import { LocalizedError } from "@/i18n/errors";
export const FILE_EXTENSIONS = [
  "txt",
  "md",
  "csv",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "css",
  "js",
  "pdf",
  "docx",
] as const;

export async function createDocumentBlob(
  text: string,
  extension: string,
): Promise<Blob> {
  if (extension === "docx") {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const document = new Document({
      sections: [
        {
          children: text.split("\n").map(
            (line) =>
              new Paragraph({
                children: [
                  new TextRun({ text: line, font: "Noto Sans CJK SC" }),
                ],
              }),
          ),
        },
      ],
    });
    return Packer.toBlob(document);
  }
  if (extension === "pdf") {
    const { PDFDocument, rgb } = await import("pdf-lib");
    const { default: fontkit } = await import("@pdf-lib/fontkit");
    const response = await fetch("/fonts/NotoSansSC.ttf");
    if (!response.ok)
      throw new LocalizedError({ key: "models.cannotLoadThePdfFont" });
    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    const font = await document.embedFont(await response.arrayBuffer(), {
      subset: true,
    });
    let page = document.addPage([595.28, 841.89]);
    let y = 790;
    const size = 11;
    const lineHeight = 18;
    const width = 495;
    function draw(line: string) {
      if (y < 50) {
        page = document.addPage([595.28, 841.89]);
        y = 790;
      }
      page.drawText(line, { x: 50, y, font, size, color: rgb(0.1, 0.1, 0.1) });
      y -= lineHeight;
    }
    for (const paragraph of text.replace(/\t/g, "    ").split("\n")) {
      let line = "";
      for (const character of paragraph) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) {
          draw(line);
          line = "";
        }
        line += character;
      }
      draw(line);
    }
    return new Blob([new Uint8Array(await document.save())], {
      type: "application/pdf",
    });
  }
  const types: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    xml: "application/xml",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
  };
  if (!types[extension])
    throw new LocalizedError({ key: "models.thisFileFormatCannotBeGenerated" });
  return new Blob([text], { type: `${types[extension]};charset=utf-8` });
}
