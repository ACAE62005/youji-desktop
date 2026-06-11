import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { detectProvider } from "./providerDetect";
import type { AccountCredentialUpdate, AccountRecord, AppSettings, Provider, StoredAccount } from "./types";

interface DataFile {
  accounts: StoredAccount[];
  settings: AppSettings;
}

let dataPath = "";
let data: DataFile | null = null;

const DEFAULT_SETTINGS: AppSettings = {
  defaultLimit: 10,
  defaultKeyword: "",
  requestTimeoutMs: 20000,
  includeSpamOrJunk: false
};

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptyData(): DataFile {
  return {
    accounts: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

function normalizeStoredAccount(account: StoredAccount): StoredAccount {
  const detectedProvider = detectProvider(account.email);
  return {
    ...account,
    provider: account.provider === "unknown" && detectedProvider !== "unknown" ? detectedProvider : account.provider,
    hasClientSecret: Boolean(account.encryptedClientSecret),
    encryptedClientSecret: account.encryptedClientSecret ?? ""
  };
}

function store(): DataFile {
  if (!data) {
    throw new Error("数据库尚未初始化");
  }
  return data;
}

function persistDatabase(): void {
  if (!dataPath || !data) {
    return;
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8");
}

export async function initDatabase(): Promise<DataFile> {
  if (data) {
    return data;
  }

  const dataDir = app.getPath("userData");
  fs.mkdirSync(dataDir, { recursive: true });
  dataPath = path.join(dataDir, "mail-code-data.json");

  if (!fs.existsSync(dataPath)) {
    data = createEmptyData();
    persistDatabase();
    return data;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8")) as Partial<DataFile>;
    data = {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts.map((account) => normalizeStoredAccount(account as StoredAccount)) : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
    };
    persistDatabase();
  } catch {
    const backupPath = `${dataPath}.${Date.now()}.bak`;
    fs.copyFileSync(dataPath, backupPath);
    data = createEmptyData();
    persistDatabase();
  }

  return data;
}

function publicAccount(account: StoredAccount): AccountRecord {
  const { encryptedRefreshToken, encryptedPassword, encryptedClientSecret, ...safeAccount } = account;
  void encryptedRefreshToken;
  void encryptedPassword;
  void encryptedClientSecret;
  return safeAccount;
}

export function listAccounts(): AccountRecord[] {
  return [...store().accounts]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map(publicAccount);
}

export function getStoredAccounts(emails?: string[]): StoredAccount[] {
  const accounts = store().accounts;
  if (!emails || emails.length === 0) {
    return [...accounts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  const wanted = new Set(emails);
  return accounts.filter((account) => wanted.has(account.email));
}

export function upsertAccount(input: {
  email: string;
  provider: Provider;
  clientId: string;
  encryptedClientSecret: string;
  encryptedRefreshToken: string;
  encryptedPassword: string;
  status: AccountRecord["status"];
  lastCheckedAt: string | null;
  errorMessage: string | null;
}): void {
  const timestamp = nowIso();
  const accounts = store().accounts;
  const existing = accounts.find((account) => account.email === input.email);

  if (existing) {
    existing.provider = input.provider;
    existing.clientId = input.clientId;
    existing.encryptedClientSecret = input.encryptedClientSecret;
    existing.hasClientSecret = Boolean(input.encryptedClientSecret);
    existing.encryptedRefreshToken = input.encryptedRefreshToken;
    existing.encryptedPassword = input.encryptedPassword;
    existing.status = input.status;
    existing.lastCheckedAt = input.lastCheckedAt;
    existing.updatedAt = timestamp;
    existing.errorMessage = input.errorMessage;
  } else {
    accounts.push({
      email: input.email,
      provider: input.provider,
      clientId: input.clientId,
      hasClientSecret: Boolean(input.encryptedClientSecret),
      encryptedClientSecret: input.encryptedClientSecret,
      encryptedRefreshToken: input.encryptedRefreshToken,
      encryptedPassword: input.encryptedPassword,
      status: input.status,
      lastCheckedAt: input.lastCheckedAt,
      createdAt: timestamp,
      updatedAt: timestamp,
      errorMessage: input.errorMessage
    });
  }

  persistDatabase();
}

export function updateAccountStatus(email: string, status: AccountRecord["status"], errorMessage: string | null): void {
  const account = store().accounts.find((item) => item.email === email);
  if (!account) {
    return;
  }

  account.status = status;
  account.lastCheckedAt = nowIso();
  account.updatedAt = nowIso();
  account.errorMessage = errorMessage;
  persistDatabase();
}

export function updateAccountCredentials(
  email: string,
  input: Omit<AccountCredentialUpdate, "email"> & {
    encryptedPassword?: string;
    encryptedClientSecret?: string;
    encryptedRefreshToken?: string;
  }
): StoredAccount | null {
  const account = store().accounts.find((item) => item.email === email);
  if (!account) {
    return null;
  }

  const detectedProvider = detectProvider(account.email);
  if (account.provider === "unknown" && detectedProvider !== "unknown") {
    account.provider = detectedProvider;
  }
  account.clientId = input.clientId?.trim() || account.clientId;
  if (input.encryptedPassword !== undefined) {
    account.encryptedPassword = input.encryptedPassword;
  }
  if (input.encryptedClientSecret !== undefined) {
    account.encryptedClientSecret = input.encryptedClientSecret;
    account.hasClientSecret = Boolean(input.encryptedClientSecret);
  }
  if (input.encryptedRefreshToken !== undefined) {
    account.encryptedRefreshToken = input.encryptedRefreshToken;
  }
  account.status = "unchecked";
  account.errorMessage = "凭证已修改，等待重新检测";
  account.updatedAt = nowIso();
  persistDatabase();
  return account;
}

export function deleteAccount(email: string): void {
  store().accounts = store().accounts.filter((account) => account.email !== email);
  persistDatabase();
}

export function clearAccounts(): void {
  store().accounts = [];
  persistDatabase();
}

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store().settings };
}

export function saveSettings(settings: AppSettings): AppSettings {
  store().settings = { ...DEFAULT_SETTINGS, ...settings };
  persistDatabase();
  return getSettings();
}
