// ─────────────────────────────────────────────────────────────────────────────
// CloudWatch Logs Insights client
// ─────────────────────────────────────────────────────────────────────────────

import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
} from "@aws-sdk/client-cloudwatch-logs";
import { fromIni } from "@aws-sdk/credential-providers";
import { AWS_PROFILE } from "../config.js";
import type { RawLogEvent } from "./parser.js";

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 60; // 30 seconds max

function buildClient(region: string): CloudWatchLogsClient {
  return new CloudWatchLogsClient({
    region,
    credentials: fromIni({ profile: AWS_PROFILE }),
  });
}

/**
 * Fetches all log events for a given request ID within the time range.
 */
export async function fetchLogsByRequestId(params: {
  logGroupName: string;
  region: string;
  requestId: string;
  startTime: Date;
  endTime: Date;
}): Promise<RawLogEvent[]> {
  const client = buildClient(params.region);

  // CloudWatch Logs Insights query — filter by request ID, return all fields sorted by time
  const query = `fields @timestamp, @logStream, @message
| filter @message like /${params.requestId}/
| sort @timestamp asc
| limit 500`;

  const startResult = await client.send(
    new StartQueryCommand({
      logGroupName: params.logGroupName,
      startTime: Math.floor(params.startTime.getTime() / 1000),
      endTime: Math.floor(params.endTime.getTime() / 1000),
      queryString: query,
    })
  );

  const queryId = startResult.queryId;
  if (!queryId) throw new Error("CloudWatch did not return a query ID");

  // Poll until the query completes
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const result = await client.send(new GetQueryResultsCommand({ queryId }));

    const status = result.status;
    if (
      status === QueryStatus.Failed ||
      status === QueryStatus.Cancelled ||
      status === QueryStatus.Timeout
    ) {
      throw new Error(`CloudWatch query ended with status: ${status}`);
    }

    if (status === QueryStatus.Complete) {
      return (result.results ?? []).map((row) => {
        const get = (field: string) =>
          row.find((f) => f.field === field)?.value ?? "";
        return {
          timestamp: get("@timestamp"),
          logStream: get("@logStream"),
          message: get("@message"),
        };
      });
    }
  }

  throw new Error("CloudWatch query timed out after 30 seconds");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
