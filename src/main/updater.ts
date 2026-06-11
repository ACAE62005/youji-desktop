import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import type { UpdateStatus } from "./types";

const UPDATE_STATUS_CHANNEL = "updates:status";

let mainWindow: BrowserWindow | null = null;
let latestStatus: UpdateStatus | null = null;
let checking = false;
let registered = false;
let configuredFeedUrl: string | null = null;

function status(input: Omit<UpdateStatus, "currentVersion">): UpdateStatus {
  return {
    currentVersion: app.getVersion(),
    ...input
  };
}

function publishStatus(nextStatus: UpdateStatus): UpdateStatus {
  latestStatus = nextStatus;
  mainWindow?.webContents.send(UPDATE_STATUS_CHANNEL, nextStatus);
  return nextStatus;
}

function updateInfoStatus(state: UpdateStatus["state"], info: UpdateInfo, message: string): UpdateStatus {
  return status({
    state,
    version: info.version,
    releaseDate: info.releaseDate,
    message
  });
}

function readableUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/app-update\.yml|latest\.yml|publish|provider|repository/i.test(message)) {
    return "还没有配置更新发布源。请先在 package.json 里配置 GitHub Releases 或通用更新地址。";
  }
  if (/net::|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return "检查更新失败，请确认网络连接和发布源地址可访问。";
  }
  return message || "检查更新失败。";
}

function missingFeedStatus(): UpdateStatus {
  return status({
    state: "disabled",
    message: "还没有配置更新发布源。请先上传安装包、blockmap 和 latest.yml，再填写 GitHub Release 下载地址。"
  });
}

function readUpdateFeedUrl(): string | null {
  const envUrl = process.env.YOUJI_UPDATE_URL?.trim();
  if (envUrl) {
    return envUrl;
  }

  const configPaths = app.isPackaged
    ? [path.join(process.resourcesPath, "update-config.json")]
    : [path.join(app.getAppPath(), "build", "update-config.json")];

  for (const configPath of configPaths) {
    try {
      const raw = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw) as { url?: unknown };
      const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
      if (url) {
        return url;
      }
    } catch {
      // Missing or invalid update config should fall back to packaged publish metadata.
    }
  }

  return null;
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return publishStatus(
      status({
        state: "disabled",
        message: "开发模式不会检查线上更新，请打包安装后再检查。"
      })
    );
  }

  if (!configuredFeedUrl) {
    return publishStatus(missingFeedStatus());
  }

  if (checking) {
    return (
      latestStatus ??
      status({
        state: "checking",
        message: "正在检查更新..."
      })
    );
  }

  checking = true;
  publishStatus(
    status({
      state: "checking",
      message: "正在检查更新..."
    })
  );

  try {
    await autoUpdater.checkForUpdates();
    return (
      latestStatus ??
      status({
        state: "not-available",
        message: "当前已经是最新版本。"
      })
    );
  } catch (error) {
    return publishStatus(
      status({
        state: "error",
        message: readableUpdateError(error)
      })
    );
  } finally {
    checking = false;
  }
}

export function setupAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;
  configuredFeedUrl = readUpdateFeedUrl();
  if (configuredFeedUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: configuredFeedUrl });
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    publishStatus(
      status({
        state: "checking",
        message: "正在检查更新..."
      })
    );
  });

  autoUpdater.on("update-available", (info) => {
    publishStatus(updateInfoStatus("available", info, `发现新版本 ${info.version}，正在下载。`));
  });

  autoUpdater.on("update-not-available", (info) => {
    publishStatus(updateInfoStatus("not-available", info, "当前已经是最新版本。"));
  });

  autoUpdater.on("download-progress", (progress) => {
    publishStatus(
      status({
        state: "downloading",
        percent: Math.round(progress.percent),
        message: `正在下载更新 ${Math.round(progress.percent)}%`
      })
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    publishStatus(updateInfoStatus("downloaded", info, `新版本 ${info.version} 已下载，重启后安装。`));
  });

  autoUpdater.on("error", (error) => {
    publishStatus(
      status({
        state: "error",
        message: readableUpdateError(error)
      })
    );
  });

  if (!registered) {
    registered = true;
    ipcMain.handle("app:version", () => app.getVersion());
    ipcMain.handle("updates:check", () => checkForUpdates());
    ipcMain.handle("updates:install", () => {
      publishStatus(
        status({
          state: "installing",
          message: "正在重启并安装更新..."
        })
      );
      autoUpdater.quitAndInstall(false, true);
    });
  }

  window.webContents.once("did-finish-load", () => {
    if (!app.isPackaged) {
      publishStatus(
        status({
          state: "idle",
          message: "可以检查更新。"
        })
      );
      return;
    }

    if (!configuredFeedUrl) {
      return;
    }

    publishStatus(
      status({
        state: "idle",
        message: "可以检查更新。"
      })
    );
    if (app.isPackaged) {
      setTimeout(() => {
        void checkForUpdates();
      }, 2500);
    }
  });
}
