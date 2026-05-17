import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * 从 src/apiKey.json 加载 DeepSeek API Key
 *
 * 文件格式：{ "key": "sk-xxx" }
 *
 * apiKey.json 属于部署层机密，已加入 .gitignore，不随代码提交。
 * 生产环境可改为读取环境变量 DEEPSEEK_API_KEY，此处优先读文件以便本地开发。
 */
export async function loadApiKey(): Promise<string> {
    // 优先读环境变量，方便 CI / 生产部署
    const envKey = process.env.DEEPSEEK_API_KEY
    if (envKey) return envKey

    // 回退到 src/apiKey.json（本地开发用）
    // __dirname 在 CommonJS 模块中指向当前文件所在目录（编译后为 dist/utils/）
    // 因此用 resolve(__dirname, '../../src/apiKey.json') 定位到源码目录
    // 开发时通过 ts-node / tsx 直接运行，__dirname 指向 src/utils/，用 '../apiKey.json'
    const filePath = resolve(__dirname, '../apiKey.json')
    const content = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content) as { key?: string; apiKey?: string }
    const key = parsed.key ?? parsed.apiKey
    if (!key) {
        throw new Error(
            `No API key found in ${filePath}. ` +
            `Set DEEPSEEK_API_KEY env var or create src/apiKey.json with { "key": "sk-xxx" }.`,
        )
    }
    return key
}
