# CloudWatch Request Viewer

A local web app to search and view AWS CloudWatch Lambda request logs in a clean, readable format.

Given a request ID and a time range, it queries CloudWatch Logs Insights and displays the results with noise removed:

- Sentry profiler and tracing lines are filtered out
- Ruby logger prefixes are stripped from each line
- Request ID and Fastly trace ID are shown once in a header, not repeated on every line
- Internal newlines in messages are collapsed
- ANSI color codes in SQL debug lines are removed
- Log level badges (INFO, DEBUG, ERROR, WARN, START/END/REPORT)
- Toggles to show/hide DEBUG and START/END/REPORT lines
- One search runs against one selected log group (no cross-group query)

## Requirements

- Node.js 18+
- An AWS CLI profile with read access to CloudWatch Logs (`logs:StartQuery`, `logs:GetQueryResults`)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure log groups and AWS profile

Edit `config.ts` and fill in your values:

```ts
export const LOG_GROUPS = [
  {
    label: "Production API",           // shown in the UI dropdown
    value: "/aws/lambda/my-function",  // actual CloudWatch log group name
    region: "us-east-1",
  },
  // add more log groups as needed
];

export const AWS_PROFILE = "my-aws-profile"; // from ~/.aws/credentials
```

### 3. Start the server

```bash
npm run dev
```

Then open http://localhost:3000 in your browser.

## Usage

1. Paste a **Request ID** (e.g. `c35c9eda-826c-41b5-97a8-3209c857eb88`)
2. Select the **Log Group** from the dropdown
3. Set the **time range** (defaults to the last hour)
4. Click **Search**

Each search is scoped to the selected log group only. If you want to check another group, run a new search after changing the dropdown value.

The app queries CloudWatch Logs Insights and displays:

- A **metadata header** with the request ID, Fastly trace ID, and log stream
- The **log lines** in chronological order, cleaned up and color-coded by level

## Project structure

```
cloudwatch-viewer/
├── config.ts          # Log groups and AWS profile — edit this
├── src/
│   ├── server.ts      # Express server, API endpoints
│   ├── cloudwatch.ts  # CloudWatch Logs Insights queries via AWS SDK v3
│   └── parser.ts      # Log parsing, filtering, and cleaning
└── client/
    └── index.html     # Frontend (no build step required)
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/config` | Returns available log groups for the UI |
| `GET /api/logs?requestId=...&logGroup=...&startTime=...&endTime=...` | Queries and returns parsed logs |

`startTime` and `endTime` accept ISO 8601 strings.
