import OSS from 'ali-oss'

/**
 * 阿里云 OSS 客户端（懒加载单例）
 *
 * 环境变量：
 *   OSS_ACCESS_KEY_ID
 *   OSS_ACCESS_KEY_SECRET
 *   OSS_BUCKET
 *   OSS_REGION
 *   OSS_ENDPOINT（可选，默认由 region 推导）
 *
 * 如果环境变量未配置，服务启动不会报错，
 * 只有在实际调用 OSS 操作时才会抛出异常。
 */
class OssService {
  private _client: OSS | null = null

  private getClient(): OSS {
    if (this._client) return this._client

    const accessKeyId = process.env.OSS_ACCESS_KEY_ID
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET
    const bucket = process.env.OSS_BUCKET
    const region = process.env.OSS_REGION

    if (!accessKeyId || !accessKeySecret || !bucket || !region) {
      throw new Error(
        'Missing OSS config. Required env vars: OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET, OSS_REGION'
      )
    }

    this._client = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
      endpoint: process.env.OSS_ENDPOINT || undefined,
    })

    return this._client
  }

  /**
   * 上传文件到 OSS
   *
   * @param objectKey  OSS 上的存储路径，如 `thumbnails/app_xxx_1234.png`
   * @param filePath   本地文件路径
   * @returns 文件的公开访问 URL
   */
  async upload(objectKey: string, filePath: string): Promise<string> {
    const result = await this.getClient().put(objectKey, filePath)
    // 返回公开访问 URL（需要 Bucket 设置为 public-read 或对应路径有读权限）
    return result.url
  }

  /**
   * 上传 Buffer 到 OSS
   *
   * @param objectKey  OSS 上的存储路径
   * @param buffer     文件内容 Buffer
   * @returns 文件的公开访问 URL
   */
  async uploadBuffer(objectKey: string, buffer: Buffer): Promise<string> {
    const result = await this.getClient().put(objectKey, buffer)
    return result.url
  }

  /**
   * 删除 OSS 上的文件
   */
  async delete(objectKey: string): Promise<void> {
    await this.getClient().delete(objectKey)
  }
}

export default new OssService()
