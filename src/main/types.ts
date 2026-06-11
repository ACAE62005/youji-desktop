export type Provider = "outlook" | "gmail" | "qq" | "unknown";

export type AccountStatus = "unchecked" | "ok" | "error";

export interface AccountRecord {
  email: string;
  provider: Provider;
  clientId: string;
  hasClientSecret: boolean;
  status: AccountStatus;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
}

export interface StoredAccount extends AccountRecord {
  encryptedRefreshToken: string;
  encryptedPassword: string;
  encryptedClientSecret: string;
}

export interface ParsedImportLine {
  line: number;
  email: string;
  password: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  provider: Provider;
}

export interface ImportResult {
  line: number;
  email: string;
  status: "ok" | "saved" | "error";
  provider: Provider;
  message: string;
}

export interface ImportResponse {
  imported: number;
  failed: number;
  results: ImportResult[];
}

export interface SearchInput {
  accountScope: "all" | "selected";
  selectedEmails: string[];
  keyword: string;
  limit: number;
  includeSpamOrJunk: boolean;
}

export interface MailResult {
  email: string;
  provider: Provider;
  subject: string;
  from: string;
  receivedAt: string;
  code: string | null;
  snippet: string;
}

export interface SearchResponse {
  results: MailResult[];
  errors: Array<{ email: string; message: string }>;
}

export interface AccountCredentialUpdate {
  email: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export interface AppSettings {
  defaultLimit: number;
  defaultKeyword: string;
  requestTimeoutMs: number;
  includeSpamOrJunk: boolean;
}

export interface OAuthCheckResult {
  ok: boolean;
  provider: Provider;
  message: string;
}

export type UpdateState = "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "installing" | "disabled" | "error";

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  version?: string;
  percent?: number;
  releaseDate?: string;
  message: string;
}
