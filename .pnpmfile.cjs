/**
 * pnpm hooks — 在依赖安装前修改 manifest
 *
 * 主要修复：Electron 在 pnpm 下 .npmrc 的 electron_mirror 不生效，
 * 将 postinstall 替换为 scripts/electron-postinstall.js 确保镜像下载。
 */

const path = require('path');

function readPackage(pkg) {
  if (pkg.name === 'electron') {
    // 使用正斜杠避免 JSON 转义问题（Windows 上 path.join 返回反斜杠）
    const postinstallScript = path.join(__dirname, 'scripts', 'electron-postinstall.js').replace(/\\/g, '/');
    pkg.scripts = pkg.scripts || {};
    pkg.scripts.postinstall = `node "${postinstallScript}"`;
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
