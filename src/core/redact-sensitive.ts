const SENSITIVE_FIELD_PATTERNS = [
  /(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi,
  /((?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token)\s*[:=]\s*)[^\s,;]+/gi,
];
const KEY_PATTERN = /\b(?:sk|pk)-[a-z0-9_-]{8,}\b/gi;

export function redactSensitiveText(
  value: string,
  secrets: readonly (string | undefined)[] = [],
): string {
  let result = value;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("[REDACTED]");
  }
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    result = result.replace(pattern, (_match, prefix: string) => `${prefix}[REDACTED]`);
  }
  return result.replace(KEY_PATTERN, "[REDACTED]");
}
