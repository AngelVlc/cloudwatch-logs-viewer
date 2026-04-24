// ─────────────────────────────────────────────────────────────────────────────
// Log parser — cleans and structures raw CloudWatch log messages
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = "INFO" | "DEBUG" | "ERROR" | "WARN" | "START" | "END" | "REPORT" | "UNKNOWN";

export interface ParsedLogLine {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface ParsedRequest {
  requestId: string;
  fastlyTraceId: string | null;
  logStream: string | null;
  logs: ParsedLogLine[];
}

export interface RawLogEvent {
  timestamp: string;
  logStream: string;
  message: string;
}

// Lines from -- sentry: containing these keywords are noise, drop them
const SENTRY_NOISE_PATTERNS = [/\[Profiler\]/, /\[Tracing\]/];

// Strip ANSI/terminal color codes that appear in SQL debug lines
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function detectLevel(raw: string): LogLevel {
  if (raw.startsWith("START RequestId:")) return "START";
  if (raw.startsWith("END RequestId:")) return "END";
  if (raw.startsWith("REPORT RequestId:")) return "REPORT";
  if (/^I,\s/.test(raw)) return "INFO";
  if (/^D,\s/.test(raw)) return "DEBUG";
  if (/^E,\s/.test(raw)) return "ERROR";
  if (/^W,\s/.test(raw)) return "WARN";
  return "UNKNOWN";
}

function isSentryNoise(message: string): boolean {
  if (!message.includes("-- sentry:")) return false;
  return SENTRY_NOISE_PATTERNS.some((re) => re.test(message));
}

/**
 * Strips redundant prefixes from a Rails-style log message:
 *  - The Ruby logger prefix: `I, [2026-04-23T... #9]  INFO -- : `
 *  - The request ID bracket: `[c35c9eda-826c-41b5-97a8-3209c857eb88] `
 *  - The Fastly trace ID bracket: `[Fastly trace id: ...] `
 *  - The DB role bracket: `[DB Role: reader] ` (kept — it's useful context)
 *  - ANSI color codes
 *  - Trailing/leading whitespace and internal newlines
 */
function cleanMessage(raw: string, requestId: string, fastlyTraceId: string | null): string {
  let msg = raw;

  // Collapse internal newlines to a space
  msg = msg.replace(/\r?\n/g, " ").trim();

  // Strip ANSI color codes
  msg = msg.replace(ANSI_RE, "");

  // Strip Ruby logger prefix: `I, [timestamp #pid]  LEVEL -- source: `
  msg = msg.replace(/^[IDEWF],\s+\[\d{4}-\d{2}-\d{2}T[\d:.]+\s+#\d+\]\s+\S*\s+--\s+[^:]*:\s+/, "");

  // Strip request ID bracket
  if (requestId) {
    msg = msg.replace(new RegExp(`\\[${escapeRegex(requestId)}\\]\\s*`, "g"), "");
  }

  // Strip Fastly trace ID bracket
  if (fastlyTraceId) {
    msg = msg.replace(new RegExp(`\\[Fastly trace id:\\s*${escapeRegex(fastlyTraceId)}\\]\\s*`, "g"), "");
  }

  return msg.trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts request ID and Fastly trace ID from any log line that contains them.
 */
function extractMetadata(events: RawLogEvent[]): { requestId: string; fastlyTraceId: string | null } {
  let requestId = "";
  let fastlyTraceId: string | null = null;

  for (const ev of events) {
    if (!requestId) {
      const m = ev.message.match(/RequestId:\s*([\w-]+)/);
      if (m) requestId = m[1];
    }
    if (!fastlyTraceId) {
      const m = ev.message.match(/\[Fastly trace id:\s*([^\]]+)\]/);
      if (m) fastlyTraceId = m[1].trim();
    }
    if (requestId && fastlyTraceId) break;
  }

  return { requestId, fastlyTraceId };
}

export function parseLogEvents(events: RawLogEvent[]): ParsedRequest {
  const { requestId, fastlyTraceId } = extractMetadata(events);
  const logStream = events[0]?.logStream ?? null;

  const logs: ParsedLogLine[] = [];

  for (const ev of events) {
    const rawMsg = ev.message.replace(/\r?\n/g, " ").trim();

    if (isSentryNoise(rawMsg)) continue;

    const level = detectLevel(rawMsg);
    const message = cleanMessage(rawMsg, requestId, fastlyTraceId);

    if (!message) continue;

    logs.push({ timestamp: ev.timestamp, level, message });
  }

  return { requestId, fastlyTraceId, logStream, logs };
}
