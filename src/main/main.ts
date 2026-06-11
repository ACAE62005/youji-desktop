import { app, BrowserWindow, Menu, ipcMain } from "electron";
import path from "node:path";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  clearAccounts,
  deleteAccount,
  getSettings,
  getStoredAccounts,
  initDatabase,
  listAccounts,
  saveSettings,
  updateAccountCredentials,
  updateAccountStatus,
  upsertAccount
} from "./database";
import { generateGmailRefreshToken } from "./oauthFlow";
import { detectProvider } from "./providerDetect";
import { checkProvider, fetchProviderMessages } from "./providers";
import { setupAutoUpdater } from "./updater";
import type { AccountCredentialUpdate, AppSettings, ImportResponse, ParsedImportLine, SearchInput, SearchResponse } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEED_OAUTH_MESSAGE = "缺少 client_id / refresh_token，暂时不能读取 Outlook/Gmail 邮件";
const NEED_QQ_AUTH_CODE_MESSAGE = "缺少 QQ 邮箱授权码，请使用 qq邮箱----授权码 导入";
const APP_ICON_PATH = path.join(__dirname, "../../build/icon.ico");

function createWindow(): BrowserWindow {
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: "邮迹",
    backgroundColor: "#f6f7fb",
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (app.isPackaged) {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  } else {
    void window.loadURL("http://127.0.0.1:5173");
  }

  return window;
}

function parseImportText(text: string): Array<ParsedImportLine | { line: number; error: string; email?: string }> {
  return text
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter((item) => item.raw.length > 0)
    .map(({ raw, line }) => {
      const parts = raw.split("----").map((part) => part.trim());
      if (parts.length !== 2 && parts.length !== 4 && parts.length < 5) {
        return { line, error: "格式错误，支持 email----password 或 email----password----client_id----client_secret----refresh_token" };
      }

      const [email, password, clientId = "", fourth = "", ...rest] = parts;
      const clientSecret = parts.length >= 5 ? fourth : "";
      const refreshToken = (parts.length >= 5 ? rest.join("----") : fourth).trim();
      if (!EMAIL_PATTERN.test(email)) {
        return { line, email, error: "邮箱格式不正确" };
      }

      return {
        line,
        email,
        password,
        clientId,
        clientSecret,
        refreshToken,
        provider: detectProvider(email)
      };
    });
}

function sanitizeSettings(settings: AppSettings): AppSettings {
  return {
    defaultLimit: Math.max(1, Math.min(Number(settings.defaultLimit) || 10, 50)),
    defaultKeyword: String(settings.defaultKeyword ?? "").slice(0, 100),
    requestTimeoutMs: Math.max(5000, Math.min(Number(settings.requestTimeoutMs) || 20000, 60000)),
    includeSpamOrJunk: Boolean(settings.includeSpamOrJunk)
  };
}

function sanitizeSearchInput(input: SearchInput, settings: AppSettings): SearchInput {
  return {
    accountScope: input.accountScope === "selected" ? "selected" : "all",
    selectedEmails: Array.isArray(input.selectedEmails) ? input.selectedEmails : [],
    keyword: String(input.keyword ?? settings.defaultKeyword).slice(0, 100),
    limit: Math.max(1, Math.min(Number(input.limit) || settings.defaultLimit, 50)),
    includeSpamOrJunk: Boolean(input.includeSpamOrJunk)
  };
}

function missingCredentialMessage(provider: string, clientId: string, clientSecret: string, refreshToken: string, password: string): string | null {
  void clientSecret;
  if (provider === "qq") {
    return password.trim() ? null : NEED_QQ_AUTH_CODE_MESSAGE;
  }
  if (!clientId || !refreshToken) {
    return NEED_OAUTH_MESSAGE;
  }
  return null;
}

function registerIpc(): void {
  ipcMain.handle("accounts:list", () => listAccounts());

  ipcMain.handle("accounts:import", async (_event, text: string): Promise<ImportResponse> => {
    const settings = getSettings();
    const parsed = parseImportText(text);
    const results: ImportResponse["results"] = [];

    for (const item of parsed) {
      if ("error" in item) {
        results.push({
          line: item.line,
          email: item.email ?? "",
          provider: "unknown",
          status: "error",
          message: item.error
        });
        continue;
      }

      const missingMessage = missingCredentialMessage(item.provider, item.clientId, item.clientSecret, item.refreshToken, item.password);
      if (missingMessage) {
        upsertAccount({
          email: item.email,
          provider: item.provider,
          clientId: item.clientId,
          encryptedClientSecret: encryptSecret(item.clientSecret),
          encryptedRefreshToken: encryptSecret(item.refreshToken),
          encryptedPassword: encryptSecret(item.password),
          status: "unchecked",
          lastCheckedAt: null,
          errorMessage: missingMessage
        });

        results.push({
          line: item.line,
          email: item.email,
          provider: item.provider,
          status: "saved",
          message: missingMessage
        });
        continue;
      }

      const check = await checkProvider(
        {
          email: item.email,
          password: item.password,
          clientId: item.clientId,
          clientSecret: item.clientSecret,
          refreshToken: item.refreshToken,
          provider: item.provider
        },
        settings.requestTimeoutMs
      );

      upsertAccount({
        email: item.email,
        provider: item.provider,
        clientId: item.clientId,
        encryptedClientSecret: encryptSecret(item.clientSecret),
        encryptedRefreshToken: encryptSecret(item.refreshToken),
        encryptedPassword: encryptSecret(item.password),
        status: check.ok ? "ok" : "error",
        lastCheckedAt: new Date().toISOString(),
        errorMessage: check.ok ? null : check.message
      });

      results.push({
        line: item.line,
        email: item.email,
        provider: item.provider,
        status: check.ok ? "ok" : "error",
        message: check.message
      });
    }

    return {
      imported: results.filter((result) => result.status === "ok" || result.status === "saved" || (result.status === "error" && result.provider !== "unknown")).length,
      failed: results.filter((result) => result.status === "error").length,
      results
    };
  });

  ipcMain.handle("accounts:check", async (_event, email: string) => {
    const [account] = getStoredAccounts([email]);
    if (!account) {
      return { ok: false, message: "账号不存在" };
    }

    const refreshToken = decryptSecret(account.encryptedRefreshToken);
    const clientSecret = decryptSecret(account.encryptedClientSecret);
    const password = decryptSecret(account.encryptedPassword);
    const missingMessage = missingCredentialMessage(account.provider, account.clientId, clientSecret, refreshToken, password);
    if (missingMessage) {
      updateAccountStatus(account.email, "unchecked", missingMessage);
      return { ok: false, message: missingMessage };
    }

    const check = await checkProvider(
      {
        email: account.email,
        password,
        clientId: account.clientId,
        clientSecret,
        refreshToken,
        provider: account.provider
      },
      getSettings().requestTimeoutMs
    );
    updateAccountStatus(account.email, check.ok ? "ok" : "error", check.ok ? null : check.message);
    return check;
  });

  ipcMain.handle("accounts:update", async (_event, input: AccountCredentialUpdate) => {
    const email = String(input.email ?? "").trim();
    const account = updateAccountCredentials(email, {
      clientId: String(input.clientId ?? "").trim(),
      encryptedPassword: input.password?.trim() ? encryptSecret(input.password.trim()) : undefined,
      encryptedClientSecret: input.clientSecret?.trim() ? encryptSecret(input.clientSecret.trim()) : undefined,
      encryptedRefreshToken: input.refreshToken?.trim() ? encryptSecret(input.refreshToken.trim()) : undefined
    });

    if (!account) {
      return listAccounts();
    }

    const refreshToken = decryptSecret(account.encryptedRefreshToken);
    const clientSecret = decryptSecret(account.encryptedClientSecret);
    const password = decryptSecret(account.encryptedPassword);
    const missingMessage = missingCredentialMessage(account.provider, account.clientId, clientSecret, refreshToken, password);
    if (missingMessage) {
      updateAccountStatus(account.email, "unchecked", missingMessage);
      return listAccounts();
    }

    const check = await checkProvider(
      {
        email: account.email,
        password,
        clientId: account.clientId,
        clientSecret,
        refreshToken,
        provider: account.provider
      },
      getSettings().requestTimeoutMs
    );
    updateAccountStatus(account.email, check.ok ? "ok" : "error", check.ok ? null : check.message);
    return listAccounts();
  });

  ipcMain.handle("accounts:delete", (_event, email: string) => {
    deleteAccount(email);
    return listAccounts();
  });

  ipcMain.handle("accounts:clear", () => {
    clearAccounts();
    return listAccounts();
  });

  ipcMain.handle("mail:search", async (_event, input: SearchInput): Promise<SearchResponse> => {
    const settings = getSettings();
    const safeInput = sanitizeSearchInput(input, settings);
    const accounts = getStoredAccounts(safeInput.accountScope === "selected" ? safeInput.selectedEmails : undefined);
    const results: SearchResponse["results"] = [];
    const errors: SearchResponse["errors"] = [];

    for (const account of accounts) {
      try {
        const refreshToken = decryptSecret(account.encryptedRefreshToken);
        const clientSecret = decryptSecret(account.encryptedClientSecret);
        const password = decryptSecret(account.encryptedPassword);
        const missingMessage = missingCredentialMessage(account.provider, account.clientId, clientSecret, refreshToken, password);
        if (missingMessage) {
          throw new Error(missingMessage);
        }

        const accountResults = await fetchProviderMessages(
          {
            email: account.email,
            password,
            clientId: account.clientId,
            clientSecret,
            refreshToken,
            provider: account.provider
          },
          safeInput,
          settings.requestTimeoutMs
        );
        results.push(...accountResults);
        updateAccountStatus(account.email, "ok", null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ email: account.email, message });
        updateAccountStatus(account.email, "error", message);
      }
    }

    results.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
    return { results: results.slice(0, safeInput.limit * Math.max(1, accounts.length)), errors };
  });

  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", (_event, settings: AppSettings) => saveSettings(sanitizeSettings(settings)));
  ipcMain.handle("oauth:gmail-refresh-token", (_event, input: { clientId: string; clientSecret?: string }) => {
    return generateGmailRefreshToken(input);
  });
}

void app.whenReady().then(async () => {
  await initDatabase();
  registerIpc();
  const window = createWindow();
  setupAutoUpdater(window);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const window = createWindow();
      setupAutoUpdater(window);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
