/* Parse and render external signal text (Nitter HTML → readable UI). */

import { useMemo } from "react";

/** @typedef {{ text: string, imageUrl: string | null }} ParsedSignalContent */

function decodeHtmlEntities(value) {
  if (!value || typeof document === "undefined") {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }
  const el = document.createElement("textarea");
  el.innerHTML = value;
  return el.value;
}

function collapseWhitespace(text) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseWithDom(raw) {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const img = doc.querySelector("img");
  const imageUrl = img?.getAttribute("src")?.trim() || null;
  img?.remove();

  doc.querySelectorAll("br").forEach((node) => {
    node.replaceWith(doc.createTextNode("\n"));
  });

  doc.querySelectorAll("a").forEach((anchor) => {
    const href = (anchor.getAttribute("href") || "").trim();
    const label = (anchor.textContent || "").trim();
    let replacement = label || href;
    if (href && label && label !== href && !label.endsWith("…")) {
      replacement = `${label}\n${href}`;
    } else if (href && !label) {
      replacement = href;
    }
    anchor.replaceWith(doc.createTextNode(replacement));
  });

  doc.querySelectorAll("p").forEach((p) => {
    const text = (p.textContent || "").trim();
    p.replaceWith(doc.createTextNode(text ? `${text}\n\n` : "\n"));
  });

  return collapseWhitespace(decodeHtmlEntities(doc.body.textContent || ""));
}

function parseWithRegex(raw) {
  let text = raw;
  const imgMatch = text.match(/<img[^>]+src=["']([^"']+)["']/i);
  const imageUrl = imgMatch?.[1]?.trim() || null;

  text = text.replace(/<img[^>]*>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const label = inner.replace(/<[^>]+>/g, "").trim();
    if (label && label !== href && !label.endsWith("…")) return `${label}\n${href}`;
    return href || label;
  });
  text = text.replace(/<\/?p>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  return { text: collapseWhitespace(decodeHtmlEntities(text)), imageUrl };
}

/**
 * Turn Nitter/RSS HTML into plain text + optional card image URL.
 * @param {string | null | undefined} raw
 * @returns {ParsedSignalContent}
 */
export function parseExternalSignalContent(raw) {
  if (!raw) return { text: "", imageUrl: null };
  const input = String(raw).trim();
  if (!/<[a-z][\s\S]*>/i.test(input)) {
    return { text: collapseWhitespace(decodeHtmlEntities(input)), imageUrl: null };
  }

  if (typeof DOMParser !== "undefined") {
    try {
      const text = parseWithDom(input);
      const imgMatch = input.match(/<img[^>]+src=["']([^"']+)["']/i);
      return { text, imageUrl: imgMatch?.[1]?.trim() || null };
    } catch {
      return parseWithRegex(input);
    }
  }
  return parseWithRegex(input);
}

/** First line as headline; rest as body (for cards). */
export function splitSignalHeadline(raw) {
  const { text, imageUrl } = parseExternalSignalContent(raw);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { headline: "", body: null, imageUrl };
  if (lines.length === 1) return { headline: lines[0], body: null, imageUrl };
  return { headline: lines[0], body: lines.slice(1).join("\n"), imageUrl };
}

/**
 * Readable signal body: plain text, line breaks, optional Nitter card image.
 */
export function ExternalSignalBody({
  raw,
  imageUrl: imageUrlOverride,
  showImage = true,
  style,
  imageStyle,
}) {
  const parsed = useMemo(() => {
    const base = parseExternalSignalContent(raw);
    if (imageUrlOverride) base.imageUrl = imageUrlOverride;
    return base;
  }, [raw, imageUrlOverride]);

  if (!parsed.text && !parsed.imageUrl) return null;

  return (
    <div style={style}>
      {parsed.text && (
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.5,
          }}
        >
          {parsed.text}
        </div>
      )}
      {showImage && parsed.imageUrl && (
        <img
          src={parsed.imageUrl}
          alt=""
          loading="lazy"
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 280,
            marginTop: parsed.text ? 10 : 0,
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
            objectFit: "cover",
            ...imageStyle,
          }}
        />
      )}
    </div>
  );
}
