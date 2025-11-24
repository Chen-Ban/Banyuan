import electron from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';

const { app, BrowserWindow } = electron;
type BrowserWindow = InstanceType<typeof electron.BrowserWindow>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // 加载前端应用
  if (isDev) {
    // 开发环境：连接到 Vite 开发服务器
    const port = process.env.VITE_PORT || '5173';
    const devServerUrl = `http://localhost:${port}`;
    
    // 等待开发服务器就绪后再加载
    const loadDevServer = () => {
      mainWindow?.loadURL(devServerUrl).catch(() => {
        // 如果加载失败，等待 1 秒后重试
        console.log(`等待开发服务器启动在 ${devServerUrl}...`);
        setTimeout(loadDevServer, 1000);
      });
    };
    
    loadDevServer();
    // 打开开发者工具
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载构建后的静态文件
    mainWindow.loadFile(
      path.join(__dirname, '../../lunlunglass-frontend/dist/index.html')
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 当 Electron 完成初始化并准备创建浏览器窗口时调用
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // 在 macOS 上，当点击 dock 图标且没有其他窗口打开时，
    // 通常在应用程序中重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 当所有窗口都被关闭时退出应用
app.on('window-all-closed', () => {
  app.quit();
});

// 安全设置：防止导航到外部 URL
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // 在开发环境中允许导航到 localhost（任何端口）
    if (isDev && parsedUrl.hostname === 'localhost') {
      return;
    }
    
    // 在生产环境中，只允许加载本地文件
    if (!isDev && !parsedUrl.protocol.startsWith('file:')) {
      event.preventDefault();
    }
  });
  
  // 防止打开新窗口
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

