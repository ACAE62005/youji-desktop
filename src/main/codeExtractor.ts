const CODE_PATTERNS = [
  /(?:验证码|校验码|动态码|安全码|verification code|security code|code)[^\dA-Za-z]{0,12}([A-Za-z0-9]{4,8})/i,
  /\b([0-9]{4,8})\b/,
  /\b([A-Z0-9]{5,8})\b/
];

export function extractCode(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  for (const pattern of CODE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export function normalizeSnippet(value: string, maxLength = 180): string {
  const normalized = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
