// ─────────────────────────────────────────────────────────────────────────────
// CloudWatch Logs Viewer — Configuration template
// Copy this file to config.ts and fill in your actual values:
//   cp config.example.ts config.ts
// config.ts is gitignored and will never be committed.
// ─────────────────────────────────────────────────────────────────────────────

export interface LogGroupConfig {
  label: string;   // Display name shown in the UI dropdown
  value: string;   // Actual CloudWatch log group name
  region: string;  // AWS region where the log group lives
}

export const LOG_GROUPS: LogGroupConfig[] = [
  {
    label: "Production API",
    value: "/aws/lambda/your-production-function-name",
    region: "us-east-1",
  },
  {
    label: "Staging API",
    value: "/aws/lambda/your-staging-function-name",
    region: "us-east-1",
  },
];

// The AWS CLI profile to use for credentials (run `aws configure --profile <name>`)
export const AWS_PROFILE = "your-aws-profile-name";

// Port the local server will listen on
export const PORT = 3005;
