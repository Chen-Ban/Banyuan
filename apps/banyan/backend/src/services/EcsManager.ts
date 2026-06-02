import crypto from 'crypto';

const ECS_ENDPOINT = 'ecs.aliyuncs.com';

interface RunInstanceResult {
  instanceId: string;
  privateIp: string;
}

interface AllocateEipResult {
  allocationId: string;
  eipAddress: string;
}

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
    Version: '2014-05-26',
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

async function callEcsApi(
  action: string,
  extraParams: Record<string, string>
): Promise<Record<string, unknown>> {
  const accessKeyId = getEnv('ECS_ACCESS_KEY_ID');
  const accessKeySecret = getEnv('ECS_ACCESS_KEY_SECRET');
  const region = getEnv('ECS_REGION', 'cn-beijing');

  const params: Record<string, string> = {
    ...buildCommonParams(accessKeyId, action),
    RegionId: region,
    ...extraParams,
  };

  const signature = computeSignature('GET', params, accessKeySecret);
  params['Signature'] = signature;

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = `https://${ECS_ENDPOINT}/?${queryString}`;

  const response = await fetch(url, { method: 'GET' });
  const body = await response.text();

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`阿里云 ECS API [${action}] 响应解析失败: ${body}`);
  }

  if (!response.ok || json['Code']) {
    const code = (json['Code'] as string) ?? response.status;
    const message = (json['Message'] as string) ?? body;
    throw new Error(`阿里云 ECS API [${action}] 调用失败 (${code}): ${message}`);
  }

  return json;
}

async function callVpcApi(
  action: string,
  extraParams: Record<string, string>
): Promise<Record<string, unknown>> {
  const accessKeyId = getEnv('ECS_ACCESS_KEY_ID');
  const accessKeySecret = getEnv('ECS_ACCESS_KEY_SECRET');
  const region = getEnv('ECS_REGION', 'cn-beijing');

  const params: Record<string, string> = {
    ...buildCommonParams(accessKeyId, action),
    RegionId: region,
    Version: '2016-04-28',
    ...extraParams,
  };

  const signature = computeSignature('GET', params, accessKeySecret);
  params['Signature'] = signature;

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = `https://vpc.aliyuncs.com/?${queryString}`;

  const response = await fetch(url, { method: 'GET' });
  const body = await response.text();

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`阿里云 VPC API [${action}] 响应解析失败: ${body}`);
  }

  if (!response.ok || json['Code']) {
    const code = (json['Code'] as string) ?? response.status;
    const message = (json['Message'] as string) ?? body;
    throw new Error(`阿里云 VPC API [${action}] 调用失败 (${code}): ${message}`);
  }

  return json;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class EcsManager {
  /**
   * 创建 ECS 实例
   * @param tenantId 租户 ID，用于标记实例
   * @returns 实例 ID 和内网 IP
   */
  async createInstance(tenantId: string): Promise<RunInstanceResult> {
    const instanceType = getEnv('ECS_INSTANCE_TYPE', 'ecs.t6-c1m2.large');
    const imageId = getEnv('ECS_IMAGE_ID');
    const securityGroupId = getEnv('ECS_SECURITY_GROUP_ID');
    const vswitchId = getEnv('ECS_VSWITCH_ID');

    const result = await callEcsApi('RunInstances', {
      ImageId: imageId,
      InstanceType: instanceType,
      SecurityGroupId: securityGroupId,
      VSwitchId: vswitchId,
      InstanceName: `banyuan-tenant-${tenantId}`,
      'Tag.1.Key': 'TenantId',
      'Tag.1.Value': tenantId,
      'Tag.2.Key': 'ManagedBy',
      'Tag.2.Value': 'banyuan',
      InternetMaxBandwidthOut: '0',
      Amount: '1',
      MinAmount: '1',
      InstanceChargeType: 'PostPaid',
      IoOptimized: 'optimized',
      SystemDisk: JSON.stringify({ Category: 'cloud_essd', Size: 40 }),
    });

    const instanceIdSet = result['InstanceIdSets'] as Record<string, unknown> | undefined;
    const instanceIds = (instanceIdSet?.['InstanceIdSet'] as string[]) ?? [];
    if (instanceIds.length === 0) {
      throw new Error('创建 ECS 实例成功但未返回实例 ID');
    }

    const instanceId = instanceIds[0];

    // 查询实例的内网 IP
    await this.waitInstanceRunning(instanceId);

    const descResult = await callEcsApi('DescribeInstances', {
      'InstanceIds': JSON.stringify([instanceId]),
    });

    const instances = descResult['Instances'] as Record<string, unknown> | undefined;
    const instanceList = (instances?.['Instance'] as Array<Record<string, unknown>>) ?? [];
    if (instanceList.length === 0) {
      throw new Error(`实例 ${instanceId} 创建后查询不到详情`);
    }

    const networkInterfaces = instanceList[0]['NetworkInterfaces'] as Record<string, unknown> | undefined;
    const niList = (networkInterfaces?.['NetworkInterface'] as Array<Record<string, unknown>>) ?? [];
    const privateIp = (niList[0]?.['PrimaryIpAddress'] as string) ?? '';

    return { instanceId, privateIp };
  }

  /**
   * 分配弹性公网 IP（EIP）
   * @returns EIP 分配 ID 和公网 IP 地址
   */
  async allocateEip(): Promise<AllocateEipResult> {
    const result = await callVpcApi('AllocateEipAddress', {
      Bandwidth: '10',
      InternetChargeType: 'PayByTraffic',
      InstanceChargeType: 'PostPaid',
    });

    const allocationId = result['AllocationId'] as string;
    const eipAddress = result['EipAddress'] as string;

    if (!allocationId || !eipAddress) {
      throw new Error('分配 EIP 成功但未返回预期字段');
    }

    return { allocationId, eipAddress };
  }

  /**
   * 将 EIP 绑定到 ECS 实例
   * @param instanceId ECS 实例 ID
   * @param allocationId EIP 分配 ID
   */
  async bindEip(instanceId: string, allocationId: string): Promise<void> {
    await callVpcApi('AssociateEipAddress', {
      AllocationId: allocationId,
      InstanceId: instanceId,
      InstanceType: 'EcsInstance',
    });
  }

  /**
   * 通过 Cloud Assistant 在实例上执行初始化脚本
   * @param instanceId ECS 实例 ID
   * @param script 要执行的 Shell 脚本内容
   */
  async runInitScript(instanceId: string, script: string): Promise<void> {
    const encodedScript = Buffer.from(script, 'utf-8').toString('base64');

    const result = await callEcsApi('RunCommand', {
      Type: 'RunShellScript',
      CommandContent: encodedScript,
      ContentEncoding: 'Base64',
      'InstanceId.1': instanceId,
      Timeout: '600',
      EnableParameter: 'false',
    });

    const invokeId = result['InvokeId'] as string;
    if (!invokeId) {
      throw new Error('执行脚本命令已发送但未返回 InvokeId');
    }

    // 等待命令执行完成
    const maxWait = 600_000; // 10 分钟
    const interval = 5_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await sleep(interval);

      const statusResult = await callEcsApi('DescribeInvocationResults', {
        InvokeId: invokeId,
      });

      const invocation = statusResult['Invocation'] as Record<string, unknown> | undefined;
      const results = invocation?.['InvocationResults'] as Record<string, unknown> | undefined;
      const resultList = (results?.['InvocationResult'] as Array<Record<string, unknown>>) ?? [];

      if (resultList.length > 0) {
        const status = resultList[0]['InvocationStatus'] as string;
        if (status === 'Success' || status === 'Finished') {
          return;
        }
        if (status === 'Failed' || status === 'Timeout' || status === 'Stopped') {
          const output = resultList[0]['Output'] as string | undefined;
          const decoded = output ? Buffer.from(output, 'base64').toString('utf-8') : '';
          throw new Error(`远程脚本执行失败 (${status}): ${decoded}`);
        }
      }
    }

    throw new Error(`等待脚本执行超时 (invokeId: ${invokeId})`);
  }

  /**
   * 等待实例进入 Running 状态
   * @param instanceId ECS 实例 ID
   * @param timeout 超时时间（毫秒），默认 5 分钟
   */
  async waitInstanceRunning(instanceId: string, timeout = 300_000): Promise<void> {
    const interval = 5_000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await callEcsApi('DescribeInstances', {
        'InstanceIds': JSON.stringify([instanceId]),
      });

      const instances = result['Instances'] as Record<string, unknown> | undefined;
      const instanceList = (instances?.['Instance'] as Array<Record<string, unknown>>) ?? [];

      if (instanceList.length > 0) {
        const status = instanceList[0]['Status'] as string;
        if (status === 'Running') {
          return;
        }
        if (status === 'Stopped' || status === 'Deleted') {
          throw new Error(`实例 ${instanceId} 状态异常: ${status}`);
        }
      }

      await sleep(interval);
    }

    throw new Error(`等待实例 ${instanceId} 进入 Running 状态超时`);
  }
}
