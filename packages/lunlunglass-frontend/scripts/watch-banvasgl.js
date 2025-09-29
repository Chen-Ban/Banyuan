import { execSync } from 'child_process';
import chokidar from 'chokidar';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const banvasglSrcPath = path.resolve(__dirname, '../../BanvasGL/src');
const banvasglBuildPath = path.resolve(__dirname, '../../BanvasGL');

console.log('👀 正在监听 BanvasGL 源码变化...');
console.log(`📁 监听目录: ${banvasglSrcPath}`);

chokidar.watch(banvasglSrcPath, {
  ignored: /node_modules/,
  persistent: true
}).on('change', (filePath) => {
  console.log(`🔄 BanvasGL 文件变化: ${path.relative(banvasglSrcPath, filePath)}`);
  try {
    execSync('npm run build', { 
      cwd: banvasglBuildPath,
      stdio: 'inherit'
    });
    console.log('✅ BanvasGL 构建完成');
  } catch (error) {
    console.error('❌ BanvasGL 构建失败:', error.message);
  }
});

console.log('🚀 监听已启动，现在可以编辑 BanvasGL 源码文件了！');
