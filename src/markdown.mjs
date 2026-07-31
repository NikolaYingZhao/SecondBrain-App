import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function renderMarkdown(page) {
  const source = page.body
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
      const resolved = page.linkMap[target.trim()];
      const text = label || target;
      if (resolved?.kind === "page") {
        return `<a class="wiki-link embed-link" href="#" data-page-id="${encodeURIComponent(resolved.id)}">附件：${text}</a>`;
      }
      return `<span class="wiki-link unresolved">附件：${text}</span>`;
    })
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
      const cleanTarget = target.trim();
      const resolved = page.linkMap[cleanTarget];
      const text = label || cleanTarget;
      if (resolved?.kind === "page") {
        return `<a class="wiki-link" href="#" data-page-id="${encodeURIComponent(resolved.id)}">${text}</a>`;
      }
      if (resolved?.kind === "brain") {
        return `<a class="wiki-link brain-link" href="#" data-brain="${resolved.id}">${text}</a>`;
      }
      return `<span class="wiki-link unresolved" title="尚未创建目标页面">${text}</span>`;
    })
    .replace(/==([^=\n]+)==/g, "<mark>$1</mark>");

  const html = marked.parse(source, { gfm: true, breaks: false })
    .replace(/<blockquote>\s*<p>\[!(\w+)\](?:\s*([^\n<]*))?/gi, (_match, type, title) =>
      `<blockquote class="callout callout-${type.toLowerCase()}"><p class="callout-title">${title || type}`
    );

  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img", "mark", "details", "summary", "input"
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "target", "rel", "class", "data-page-id", "data-brain"],
      blockquote: ["class"],
      code: ["class"],
      img: ["src", "alt", "title", "width", "height"],
      input: ["type", "checked", "disabled"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => {
        if (/^https?:\/\//i.test(attribs.href || "")) {
          return {
            tagName,
            attribs: { ...attribs, target: "_blank", rel: "noreferrer" }
          };
        }
        return { tagName, attribs };
      }
    }
  });
}
