import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 各 provider 的环境变量名和 apiKey.json 字段名映射
 *
 * apiKey.json 格式示例：
 * {
 *   "key": "sk-deepseek-xxx",        ← deepseek 兼容旧字段
 *   "apiKey": "sk-deepseek-xxx",     ← deepseek 兼容旧字段
 *   "deepseekApiKey": "sk-xxx",      ← deepseek 推荐字段
 *   "kimiApiKey": "sk-yyy"           ← kimi 字段
 * }
 */
const PROVIDER_KEY_CONFIG: Record<string, { envVar: string; jsonFields: string[] }> = {
    deepseek: {
        envVar: 'DEEPSEEK_API_KEY',
        jsonFields: ['deepseekApiKey', 'apiKey', 'key'],
    },
    kimi: {
        envVar: 'KIMI_API_KEY',
        jsonFields: ['kimiApiKey'],
    },
}

/**
 * 加载指定 provider 的 API Key
 *
 * 优先级：环境变量 > apiKey.json > 空字符串（Kimi 等可选 provider 不强制报错）
 *
 * @param provider  provider 标识，默认 "deepseek"
 * @param required  是否必须有值，默认 true（找不到时抛错）
 */
export async function loadApiKey(provider = 'deepseek', required = true): Promise<string> {
    const config = PROVIDER_KEY_CONFIG[provider]
    if (!config) {
        if (required) throw new Error(`Unknown provider "${provider}"`)
        return ''
    }

    // 1. 优先读环境变量
    const envKey = process.env[config.envVar]
    if (envKey) return envKey

    // 2. 回退到 apiKey.json（本地开发用）
    //    __dirname 在 CommonJS 模块中指向编译后的 dist/utils/，
    //    开发时通过 tsx 直接运行则指向 src/utils/，两者都用 '../apiKey.json'
    try {
        const filePath = resolve(__dirname, '../apiKey.json')
        const content = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(content) as Record<string, string>
        for (const field of config.jsonFields) {
            if (parsed[field]) return parsed[field]
        }
    } catch {
        // 文件不存在或解析失败，继续走后续逻辑
    }

    // 3. 找不到 key
    if (required) {
        throw new Error(
            `No API key found for provider "${provider}". ` +
            `Set ${config.envVar} env var or add "${config.jsonFields[0]}" to src/apiKey.json.`,
        )
    }
    return ''
}
