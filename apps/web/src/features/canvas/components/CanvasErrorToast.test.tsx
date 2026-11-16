import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";
import { LocalizedError } from "@/i18n/errors";
import { Editor } from "../engine/editor";
import { createCanvasStore } from "../engine/store";
import { canvasErrorToast } from "./CanvasErrorToast";

it("renders the same upload error in the current canvas language", () => {
  const editor = new Editor(createCanvasStore());
  editor.locale = "zh-CN";
  const toast = canvasErrorToast(
    editor,
    new LocalizedError({ key: "api.errors.documentParserUnavailable" }),
  );
  const localeChanged = vi.fn();
  const unsubscribe = editor.subscribeLocale(localeChanged);

  editor.locale = "en";
  expect(renderToStaticMarkup(toast.title)).toBe("Something went wrong");
  expect(renderToStaticMarkup(toast.description)).toBe(
    "Document parsing is currently unavailable",
  );

  editor.locale = "zh-CN";
  expect(renderToStaticMarkup(toast.title)).toBe("操作失败");
  expect(renderToStaticMarkup(toast.description)).toBe("暂时无法解析文档");
  expect(localeChanged).toHaveBeenCalledTimes(2);

  unsubscribe();
  editor.locale = "en";
  expect(localeChanged).toHaveBeenCalledTimes(2);
});
