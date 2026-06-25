/**
 * API Key 加载工具
 *
 * 从环境变量读取指定 provider 的 API Key。
 * 优先级：环境变量 > 空字符串（可选 provider 不强制报错）
 *
 * 注意：API Key 不再支持 apiKey.json 文件方式，统一使用环境变量。
 * 开发环境通过 .env 文件注入，生产环境通过 OS 环境变量注入。
 */

/**
 * 各 provider 的环境变量名映射
 */
const PROVIDER_KEY_CONFIG: Record<string, { envVar: string }> = {
  deepseek: {
    envVar: 'DEEPSEEK_API_KEY',
  },
  kimi: {
    envVar: 'KIMI_API_KEY',
  },
}

/**
 * 加载指定 provider 的 API Key
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

  // 只从环境变量读取（.env / OS 环境变量）
  const envKey = process.env[config.envVar]
  if (envKey) return envKey

  // 找不到 key
  if (required) {
    throw new Error(
      `No API key found for provider "${provider}". ` +
        `Set ${config.envVar} in your .env file or environment.`,
    )
  }
  return ''
}
