import electron from "electron";
import * as path from "path";
import { fileURLToPath } from "url";

const { app, BrowserWindow, Menu } = electron;
type BrowserWindow = InstanceType<typeof electron.BrowserWindow>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// 创建菜单栏
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
            console.log("关于 LunLunGlass POS");
          },
        },
      ],
    },
  ];

  // macOS 特殊处理
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "LunLunGlass POS",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // 加载前端应用
  if (isDev) {
    // 开发环境：连接到 Vite 开发服务器（POS 默认 5174）
    const port = process.env.VITE_PORT || "5174";
    const devServerUrl = `http://localhost:${port}`;

    const loadDevServer = () => {
      mainWindow?.loadURL(devServerUrl).catch(() => {
        console.log(`等待 POS 开发服务器启动在 ${devServerUrl}...`);
        setTimeout(loadDevServer, 1000);
      });
    };

    loadDevServer();
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载构建后的静态文件
    mainWindow.loadFile(path.join(__dirname, "../../frontend/dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 当 Electron 完成初始化并准备创建浏览器窗口时调用
app.on("ready", () => {
  console.log("LunLunGlass POS 启动中...");

  createMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 当所有窗口都被关闭时退出应用
app.on("window-all-closed", () => {
  app.quit();
});

// 安全设置：防止导航到外部 URL
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
