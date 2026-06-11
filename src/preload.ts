import { contextBridge, ipcRenderer } from "electron";
import type { AccountCredentialUpdate, AccountRecord, AppSettings, ImportResponse, SearchInput, SearchResponse, UpdateStatus } from "./main/types";

const api = {
  listAccounts: (): Promise<AccountRecord[]> => ipcRenderer.invoke("accounts:list"),
  importAccounts: (text: string): Promise<ImportResponse> => ipcRenderer.invoke("accounts:import", text),
  updateAccount: (input: AccountCredentialUpdate): Promise<AccountRecord[]> => ipcRenderer.invoke("accounts:update", input),
  checkAccount: (email: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("accounts:check", email),
  deleteAccount: (email: string): Promise<AccountRecord[]> => ipcRenderer.invoke("accounts:delete", email),
  clearAccounts: (): Promise<AccountRecord[]> => ipcRenderer.invoke("accounts:clear"),
  searchMail: (input: SearchInput): Promise<SearchResponse> => ipcRenderer.invoke("mail:search", input),
  generateGmailRefreshToken: (input: { clientId: string; clientSecret?: string }): Promise<{ email: string; refreshToken: string; accessToken: string }> =>
    ipcRenderer.invoke("oauth:gmail-refresh-token", input),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("settings:set", settings),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke("updates:check"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("updates:install"),
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  }
};

contextBridge.exposeInMainWorld("mailBridge", api);

export type MailBridge = typeof api;
