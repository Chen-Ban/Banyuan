// 计算任务与结果类型定义
// 这里仅提供一组通用的枚举与接口，后续可以按需扩展具体的 payload / result 结构

export type WorkerTaskType =
  | "generic" // 通用任务
  | "text/layout" // 文本排版/测量相关（TextView / TextParagraph / TextElement）
  | "graph/intersection" // 几何相交、最近点等解析几何计算（IntersectionUtils / AnalyticGraph）
  | "graph/trajectory" // 轨迹采样、切线/法线等（DenseTrajectory）
  | "custom"; // 用户自定义类型

export interface WorkerTask<TPayload = any> {
  id: string;
  type: WorkerTaskType;
  payload: TPayload;
  /** 由上层可选指定一个来源标识（场景/容器/视图ID等），用于调试和统计 */
  sourceId?: string;
}

export interface WorkerResult<TResult = any> {
  id: string;
  type: WorkerTaskType;
  result: TResult;
  error?: string;
}

export type WorkerHandler<TPayload = any, TResult = any> = (payload: TPayload) => TResult | Promise<TResult>;
