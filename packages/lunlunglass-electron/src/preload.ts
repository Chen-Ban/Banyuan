import { contextBridge } from 'electron';

// 暴露受保护的方法给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 可以在这里添加需要暴露给前端的 API
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

// 类型声明（供 TypeScript 使用）
declare global {
  interface Window {
    electronAPI: {
      platform: string;
      versions: {
        node: string;
        chrome: string;
        electron: string;
      };
    };
  }
}

