/**
 * Electron postinstall 脚本
 *
 * 在 Electron 的 postinstall 阶段设置 ELECTRON_MIRROR 环境变量，
 * 然后执行原始的 install.js 下载 Electron 二进制。
 *
 * 背景：pnpm 不会把 .npmrc 中的 electron_mirror 传递到依赖的
 * postinstall 脚本环境中，导致 @electron/get 直连 GitHub 下载超时。
 * 通过 .pnpmfile.cjs 的 readPackage hook 将 Electron 的 postinstall
 * 替换为本脚本，确保镜像配置生效。
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// pnpm 运行 lifecycle script 时 cwd 是包目录，不是本脚本所在目录
const installScript = path.join(process.cwd(), 'install.js');

if (!fs.existsSync(installScript)) {
  console.error('[electron-postinstall] ERROR: install.js not found at', installScript);
  process.exit(1);
}

const mirror = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/';

console.log('[electron-postinstall] Using mirror:', mirror);

execSync(`node "${installScript}"`, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR: mirror,
    npm_config_electron_mirror: mirror,
  },
  timeout: 180_000,
});
