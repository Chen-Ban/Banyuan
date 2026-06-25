import electron from "electron";
import * as path from "path";
import { fileURLToPath } from "url";
import { PreviewServerOrchestrator } from "./preview/PreviewServerOrchestrator.js";
import type { PreviewServerInput } from "./preview/PreviewServerOrchestrator.js";

const { app, BrowserWindow, Menu, ipcMain, globalShortcut } = electron;
type BrowserWindow = InstanceType<typeof electron.BrowserWindow>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// 开发模式下抑制 Vite HMR eval 导致的 CSP 安全警告
// 生产打包后不存在 eval 调用，无需此抑制
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

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

    // 开发模式下自动打开 DevTools + 注册快捷键
    mainWindow.webContents.openDevTools();
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

  // 开发模式下注册 DevTools 快捷键（Menu.setApplicationMenu(null) 会移除默认快捷键）
  if (isDev) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) win.webContents.toggleDevTools();
    });
    globalShortcut.register('F12', () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) win.webContents.toggleDevTools();
    });
  }

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
  globalShortcut.unregisterAll();
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
