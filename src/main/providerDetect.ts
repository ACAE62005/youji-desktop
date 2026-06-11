import type { Provider } from "./types";

const OUTLOOK_DOMAINS = new Set([
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "passport.com"
]);

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

const QQ_DOMAINS = new Set(["qq.com", "vip.qq.com", "foxmail.com"]);

export function detectProvider(email: string): Provider {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (OUTLOOK_DOMAINS.has(domain)) {
    return "outlook";
  }
  if (GMAIL_DOMAINS.has(domain)) {
    return "gmail";
  }
  if (QQ_DOMAINS.has(domain)) {
    return "qq";
  }
  return "unknown";
}

export function providerLabel(provider: Provider): string {
  if (provider === "outlook") {
    return "Outlook";
  }
  if (provider === "gmail") {
    return "Gmail";
  }
  if (provider === "qq") {
    return "QQ邮箱";
  }
  return "未知";
}
