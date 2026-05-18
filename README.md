# CloudWatch Logs Viewer

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

`config.ts` is gitignored. Copy the example and fill in your actual values:

```bash
cp config.example.ts config.ts
```

Then edit `config.ts`:

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

## Production Installation (macOS launchd)

Install the app as a persistent background service on macOS:

### Install

```bash
./scripts/install-production.sh <install-directory> <plist-name> <port>
```

Example:

```bash
./scripts/install-production.sh ~/global/cloudwatch-viewer-installations/production com.cloudwatch-viewer.plist 3128
```

Example:

```bash
./scripts/install-production.sh ~/cloudwatch-viewer/production com.cloudwatch-viewer.production.plist
```

This will:

1. Build the project
2. Install to the specified directory
3. Create a `launchd` plist at `~/Library/LaunchAgents/<plist-name>`
4. Start the service automatically

### Manage the service

```bash
# Check status
launchctl list | grep <service-label>

# View logs
tail -f <install-directory>/logs/stdout.log

# Stop the service
launchctl unload ~/Library/LaunchAgents/<plist-name>

# Restart (e.g. after config changes)
launchctl unload ~/Library/LaunchAgents/<plist-name>
launchctl load ~/Library/LaunchAgents/<plist-name>

# Uninstall completely
launchctl unload ~/Library/LaunchAgents/<plist-name>
rm ~/Library/LaunchAgents/<plist-name>
rm -rf <install-directory>
```
