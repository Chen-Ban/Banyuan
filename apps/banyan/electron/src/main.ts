import electron from "electron";
import * as path from "path";
import { fileURLToPath } from "url";
import { PreviewServerOrchestrator } from "./preview/PreviewServerOrchestrator.js";
import type { PreviewServerInput } from "./preview/PreviewServerOrchestrator.js";

const { app, BrowserWindow, Menu, ipcMain } = electron;
type BrowserWindow = InstanceType<typeof electron.BrowserWindow>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// ─── Preview Server 编排器（单例） ────────────────────────────────────────────
const previewOrchestrator = new PreviewServerOrchestrator();

// ─── IPC Handlers 注册 ────────────────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle("preview:start", async (_event, input: PreviewServerInput) => {
    return previewOrchestrator.start(input);
  });

  ipcMain.handle("preview:stop", async (_event, appId: string) => {
    await previewOrchestrator.stop(appId);
  });

  ipcMain.handle("preview:status", async (_event, appId: string) => {
    return previewOrchestrator.getStatus(appId) || null;
  });

  ipcMain.handle("preview:list", async () => {
    return previewOrchestrator.listAll();
  });

  ipcMain.handle("preview:hotUpdate", async (_event, appId: string, patch: { collections?: unknown[]; cloudFunctions?: unknown[] }) => {
    await previewOrchestrator.hotUpdate(appId, patch);
  });
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Banyan",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    const port = process.env.VITE_PORT || "5174";
    const devServerUrl = `http://localhost:${port}`;

    const loadDevServer = () => {
      mainWindow?.loadURL(devServerUrl).catch(() => {
        console.log(`等待开发服务器启动在 ${devServerUrl}...`);
        setTimeout(loadDevServer, 1000);
      });
    };

    loadDevServer();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../frontend/dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── App 生命周期 ──────────────────────────────────────────────────────────────

app.on("ready", () => {
  console.log("🌳 Banyan desktop app ready");

  app.setName("banyan");
  registerIpcHandlers();
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

// 退出前清理所有 Preview Server 进程
app.on("before-quit", () => {
  previewOrchestrator.stopAll().catch((err) => {
    console.error("[PreviewServer] stopAll failed on quit:", err);
  });
});

app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (isDev && parsedUrl.hostname === "localhost") {
      return;
    }

    if (!isDev && !parsedUrl.protocol.startsWith("file:")) {
      event.preventDefault();
    }
  });

  contents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
});
