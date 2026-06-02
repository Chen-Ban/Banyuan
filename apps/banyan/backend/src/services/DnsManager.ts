import crypto from 'crypto';

const DNS_ENDPOINT = 'alidns.aliyuncs.com';

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (!value) {
    throw new Error(`环境变量 ${key} 未设置`);
  }
  return value;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function buildCommonParams(accessKeyId: string, action: string): Record<string, string> {
  return {
    Format: 'JSON',
    Version: '2015-01-09',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Action: action,
  };
}

function computeSignature(
  method: string,
  params: Record<string, string>,
  accessKeySecret: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');

  const stringToSign = `${method}&${percentEncode('/')}&${percentEncode(canonicalQuery)}`;
  const hmac = crypto.createHmac('sha1', `${accessKeySecret}&`);
  hmac.update(stringToSign);
  return hmac.digest('base64');
}

async function callDnsApi(
  action: string,
  extraParams: Record<string, string>
): Promise<Record<string, unknown>> {
  const accessKeyId = getEnv('DNS_ACCESS_KEY_ID', process.env['ECS_ACCESS_KEY_ID']);
  const accessKeySecret = getEnv('DNS_ACCESS_KEY_SECRET', process.env['ECS_ACCESS_KEY_SECRET']);

  const params: Record<string, string> = {
    ...buildCommonParams(accessKeyId, action),
    ...extraParams,
  };

  const signature = computeSignature('GET', params, accessKeySecret);
  params['Signature'] = signature;

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = `https://${DNS_ENDPOINT}/?${queryString}`;

  const response = await fetch(url, { method: 'GET' });
  const body = await response.text();

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`阿里云 DNS API [${action}] 响应解析失败: ${body}`);
  }

  if (!response.ok || json['Code']) {
    const code = (json['Code'] as string) ?? response.status;
    const message = (json['Message'] as string) ?? body;
    throw new Error(`阿里云 DNS API [${action}] 调用失败 (${code}): ${message}`);
  }

  return json;
}

export class DnsManager {
  private readonly domain: string;

  constructor() {
    this.domain = getEnv('DNS_DOMAIN');
  }

  /**
   * 添加 A 记录子域名解析
   * 例如：subdomain.banyuan.club → ip
   * @param subdomain 子域名前缀
   * @param ip 目标 IP 地址
   * @returns 解析记录 ID
   */
  async addSubdomain(subdomain: string, ip: string): Promise<string> {
    const result = await callDnsApi('AddDomainRecord', {
      DomainName: this.domain,
      RR: subdomain,
      Type: 'A',
      Value: ip,
      TTL: '600',
    });

    const recordId = result['RecordId'] as string;
    if (!recordId) {
      throw new Error(`添加子域名 ${subdomain}.${this.domain} 解析成功但未返回 RecordId`);
    }

    return recordId;
  }

  /**
   * 添加通配符解析
   * 例如：*.subdomain.banyuan.club → ip（用于多应用场景）
   * @param subdomain 子域名前缀
   * @param ip 目标 IP 地址
   * @returns 解析记录 ID
   */
  async addWildcard(subdomain: string, ip: string): Promise<string> {
    const result = await callDnsApi('AddDomainRecord', {
      DomainName: this.domain,
      RR: `*.${subdomain}`,
      Type: 'A',
      Value: ip,
      TTL: '600',
    });

    const recordId = result['RecordId'] as string;
    if (!recordId) {
      throw new Error(`添加通配符解析 *.${subdomain}.${this.domain} 成功但未返回 RecordId`);
    }

    return recordId;
  }

  /**
   * 删除解析记录
   * @param recordId 解析记录 ID
   */
  async deleteRecord(recordId: string): Promise<void> {
    await callDnsApi('DeleteDomainRecord', {
      RecordId: recordId,
    });
  }
}
