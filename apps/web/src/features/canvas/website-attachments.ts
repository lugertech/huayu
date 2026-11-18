/** Rewrite media URLs in place without reserializing the user's HTML or running it. */
export async function rewriteWebsiteAttachments(
  html: string,
  rewrite: (url: string) => Promise<string>,
) {
  const references: { start: number; url: string; source: string }[] = [];
  function remember(url: string, start: number) {
    if (!url) return;
    let source = url;
    if (/^https?:\/\//i.test(url) && typeof location !== "undefined") {
      if (!url.startsWith(location.origin + "/")) return;
      source = url.slice(location.origin.length);
    }
    if (
      !/^\/api\/assets\/[\w-]+(?:[?#][^\s]*)?$/.test(source) &&
      !/^data:(image|audio|video)\//i.test(source)
    )
      return;
    references.push({ start, url, source });
  }
  function cssUrls(css: string, offset: number) {
    for (const match of css.matchAll(
      /\/\*[\s\S]*?(?:\*\/|$)|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/gi,
    )) {
      const url = match[1] ?? match[2] ?? match[3];
      if (url) remember(url, offset + match.index + match[0].indexOf(url));
    }
  }
  // Consume quoted attributes as a unit, and never interpret examples inside raw text as tags.
  const markup =
    /<!--[\s\S]*?(?:-->|$)|<([a-z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = markup.exec(html))) {
    if (!tag[1]) continue;
    const name = tag[1].toLowerCase();
    const attrOffset = tag.index + 1 + tag[1].length;
    for (const attr of tag[2].matchAll(
      /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    )) {
      const key = attr[1].toLowerCase();
      const value = attr[2] ?? attr[3] ?? attr[4];
      const offset =
        attrOffset +
        attr.index +
        attr[0].length -
        value.length -
        (attr[4] === undefined ? 1 : 0);
      if (
        ["src", "href", "xlink:href", "poster"].includes(key) ||
        (key === "data" && name === "object")
      ) {
        const url = value.trim();
        remember(url, offset + value.indexOf(url));
      } else if (key === "srcset" || key === "imagesrcset") {
        for (const match of value.matchAll(
          /(?:^|,)\s*(data:[^\s]+?(?=,\s|\s|$)|[^,\s]+)/gi,
        )) {
          const url = match[1].replace(/,+$/, "");
          remember(url, offset + match.index + match[0].indexOf(url));
        }
      } else if (key === "style") cssUrls(value, offset);
    }
    if (["script", "style", "textarea", "title"].includes(name)) {
      const endTag = new RegExp("</" + name + "\\s*>", "gi");
      endTag.lastIndex = markup.lastIndex;
      const end = endTag.exec(html);
      const content = html.slice(markup.lastIndex, end?.index);
      if (name === "style") cssUrls(content, markup.lastIndex);
      if (name === "script") {
        // Websites can assign src from a JS string or JSON field. Keep comments and other code intact.
        const literals =
          /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
        for (const literal of content.matchAll(literals)) {
          const url = literal[1] ?? literal[2] ?? literal[3];
          if (url && !url.includes("${"))
            remember(url, markup.lastIndex + literal.index + 1);
        }
      }
      markup.lastIndex = end ? endTag.lastIndex : html.length;
    }
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const { start, url, source } of references) {
    parts.push(html.slice(cursor, start), await rewrite(source));
    cursor = start + url.length;
  }
  return parts.join("") + html.slice(cursor);
}
