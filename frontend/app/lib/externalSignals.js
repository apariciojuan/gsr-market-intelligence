/** Labels and filters for external signal `source` values from the backend. */

export const SOURCE_FILTERS = [
  { value: "all", label: "All sources" },
  { value: "x", label: "X" },
  { value: "telegram", label: "Telegram" },
  { value: "rss", label: "RSS" },
];

const SOURCE_LABELS = {
  x_profile: "X",
  x_search: "X",
  x_feed: "X",
  telegram_channel: "Telegram",
  telegram_scrape: "Telegram",
  telegram_feed: "Telegram",
  keyword_rss: "RSS",
  resolution_source: "RSS",
};

const SOURCE_PILL = {
  x_profile: "x",
  x_search: "x",
  x_feed: "x",
  telegram_channel: "telegram",
  telegram_scrape: "telegram",
  telegram_feed: "telegram",
  keyword_rss: "rss",
  resolution_source: "rss",
};

/** Map a UI filter chip to the `source` query param (undefined = all). */
export function sourceFilterParam(filter) {
  if (!filter || filter === "all") return undefined;
  return filter;
}

/** Human-readable label for a backend `source` string. */
export function sourceLabel(source) {
  if (!source) return "Unknown";
  return SOURCE_LABELS[source] || source.replace(/_/g, " ");
}

/** StatusPill key for a backend `source` string. */
export function sourcePillKey(source) {
  return SOURCE_PILL[source] || "neutral";
}
