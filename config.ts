// ─────────────────────────────────────────────────────────────────────────────
// CloudWatch Viewer — Configuration
// Fill in your actual values before running.
// ─────────────────────────────────────────────────────────────────────────────

export interface LogGroupConfig {
  label: string;   // Display name shown in the UI dropdown
  value: string;   // Actual CloudWatch log group name
  region: string;  // AWS region where the log group lives
}

export const LOG_GROUPS: LogGroupConfig[] = [
  {
    label: "Active Job Lambda",
    value: "/aws/lambda/ProductionBackend-LambdaActiveJob35C978F1-Lp2JpGJK6XLl",
    region: "us-east-1",
  },
  {
    label: "Lambda Web",
    value: "/aws/lambda/ProductionBackend-LambdaWeb6AEB62BA-GsDbLkEaeXqu",
    region: "us-east-1",
  },
];

// The AWS CLI profile to use for credentials (run `aws configure --profile <name>`)
export const AWS_PROFILE = "production";

// Port the local server will listen on
export const PORT = 3000;
