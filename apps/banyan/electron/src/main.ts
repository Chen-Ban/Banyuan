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

// ─── 菜单 ─────────────────────────────────────────────────────────────────────

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "文件",
      submenu: [
        {
          label: "退出",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
      ],
    },
    {
      label: "视图",
      submenu: [
        {
          label: "刷新",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          },
        },
        {
          label: "强制刷新",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reloadIgnoringCache();
            }
          },
        },
        {
          label: "重启应用",
          accelerator: "CmdOrCtrl+Alt+R",
          click: () => {
            app.relaunch();
            app.exit(0);
          },
        },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "全屏" },
        { type: "separator" },
        { role: "toggleDevTools", label: "开发者工具" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "close", label: "关闭" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于",
          click: () => {
            console.log("关于 Banyan 低代码平台");
          },
        },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: "about", label: "关于" },
        { type: "separator" },
        { role: "services", label: "服务" },
        { type: "separator" },
        { role: "hide", label: "隐藏" },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "显示全部" },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── 窗口创建 ──────────────────────────────────────────────────────────────────

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

  registerIpcHandlers();
  createMenu();
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
