// ─────────────────────────────────────────────────────────────────────────────
// Express server
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { LOG_GROUPS, PORT } from "../config.js";
import { fetchLogsByRequestId } from "./cloudwatch.js";
import { parseLogEvents } from "./parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve the frontend from /client
app.use(express.static(path.join(__dirname, "..", "client")));

// ── GET /api/config ─────────────────────────────────────────────────────────
// Returns available log groups for the UI dropdown
app.get("/api/config", (_req, res) => {
  res.json({ logGroups: LOG_GROUPS.map((g) => ({ label: g.label, value: g.value })) });
});

// ── GET /api/logs ────────────────────────────────────────────────────────────
// Query params:
//   - requestId  (required)
//   - logGroup   (required, must match a configured log group value)
//   - startTime  (required, ISO 8601 string)
//   - endTime    (required, ISO 8601 string)
app.get("/api/logs", async (req, res) => {
  const { requestId, logGroup, startTime, endTime } = req.query;

  if (
    typeof requestId !== "string" ||
    typeof logGroup !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string"
  ) {
    res.status(400).json({ error: "Missing required query params: requestId, logGroup, startTime, endTime" });
    return;
  }

  const groupConfig = LOG_GROUPS.find((g) => g.value === logGroup);
  if (!groupConfig) {
    res.status(400).json({ error: `Unknown log group: ${logGroup}` });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: "Invalid startTime or endTime (use ISO 8601)" });
    return;
  }
  if (end <= start) {
    res.status(400).json({ error: "endTime must be after startTime" });
    return;
  }

  try {
    const rawEvents = await fetchLogsByRequestId({
      logGroupName: groupConfig.value,
      region: groupConfig.region,
      requestId,
      startTime: start,
      endTime: end,
    });

    if (rawEvents.length === 0) {
      res.json({ found: false, requestId });
      return;
    }

    const parsed = parseLogEvents(rawEvents);
    res.json({
      found: true,
      selectedLogGroup: {
        label: groupConfig.label,
        value: groupConfig.value,
      },
      ...parsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cloudwatch-viewer] Error fetching logs:", message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`CloudWatch Viewer running at http://localhost:${PORT}`);
});
