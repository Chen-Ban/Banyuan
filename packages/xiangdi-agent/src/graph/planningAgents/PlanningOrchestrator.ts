/**
 * 相地 · PlanningOrchestrator
 *
 * 「运筹帷幄之中，决胜千里之外」
 *
 * 调度四个规划子 Agent（PM → Arch → Visual → Task）的串行执行，
 * 支持工具隔离、命名空间记忆注入、SSE 进度推送、降级策略和断点恢复。
 */

import type { LLMClient } from '../../core/llmTypes.js';
import type { StreamCallback, TypedStreamEvent } from '../../core/types.js';
import { ToolRegistry } from '../../core/ToolRegistry.js';
import type { ChangeSpec } from '../../spec/types.js';
import type {
  AgentRole,
  FeatureList,
  PlanningProgressEvent,
  TechPlan,
  VisualSpec,
} from '../../spec/planningTypes.js';
import type {
  CompletedArtifacts,
  PlanningSnapshot,
  RefinementContext,
} from '../resume/types.js';
import { NamespacedMemoryManager, createMemoryManager } from '../../memory/NamespacedMemoryManager.js';
import { SharedMemoryWriter } from '../../memory/SharedMemoryWriter.js';
import { runPMAgent } from './PMAgent.js';
import { runArchAgent } from './ArchAgent.js';
import { runVisualAgent } from './VisualAgent.js';
import { runTaskPlannerAgent } from './TaskPlannerAgent.js';
import { buildPMContext, buildArchContext, buildVisualContext, buildTaskContext } from './SubAgentContextBuilder.js';
import type { PMAgentInput, ArchAgentInput, VisualAgentInput, TaskPlannerInput } from './state.js';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface PlanningOrchestratorConfig {
  llmClient: LLMClient;
  /** 主 ToolRegistry（全量工具），Orchestrator 按需裁剪子集 */
  toolRegistry: ToolRegistry;
  /** 记忆存储根路径 */
  memoryStoragePath: string;
  /** 流事件回调 */
  streamCallback?: StreamCallback;
  /** 默认模型（SubAgent 未指定时使用） */
  defaultModel?: string;
  /** 是否启用降级（Visual/Task 失败时退回 SpecPlanner） */
  enableDegradation?: boolean;
  /** 快照持久化回调（中断时调用） */
  onSnapshotPersist?: (snapshot: PlanningSnapshot) => Promise<void>;
  /** SubAgent 最大重试次数（默认 2，不含首次执行） */
  maxSubAgentRetries?: number;
}

// ─── Orchestrator Output ─────────────────────────────────────────────────────

export interface PlanningResult {
  featureList: FeatureList;
  techPlan: TechPlan;
  visualSpec: VisualSpec;
  changeSpec: ChangeSpec;
  /** 完整的产物记录（含 checkpoint） */
  artifacts: CompletedArtifacts;
  /** 总耗时 ms */
  totalDurationMs: number;
}

export interface PlanningRunOptions {
  signal?: AbortSignal;
  /** 对话历史摘要 */
  conversationContext?: string;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/** 管线中 SubAgent 的工具白名单配置 */
const AGENT_TOOL_WHITELIST: Record<AgentRole, string[]> = {
  pm: [],
  arch: ['knowledge_search', 'get_adr_constraints', 'get_existing_schema'],
  visual: ['get_page_tree', 'get_design_tokens'],
  task: ['get_pages', 'get_page_tree', 'validate_change_spec'],
};

export class PlanningOrchestrator {
  private readonly llmClient: LLMClient;
  private readonly toolRegistry: ToolRegistry;
  private readonly memoryStoragePath: string;
  private readonly streamCallback?: StreamCallback;
  private readonly defaultModel: string;
  private readonly enableDegradation: boolean;
  private readonly onSnapshotPersist?: (snapshot: PlanningSnapshot) => Promise<void>;
  private readonly maxSubAgentRetries: number;

  /** 共享命名空间写入器 */
  private readonly sharedWriter: SharedMemoryWriter;
  /** 命名空间记忆管理器缓存 */
  private memoryManagers = new Map<AgentRole, NamespacedMemoryManager>();

  constructor(config: PlanningOrchestratorConfig) {
    this.llmClient = config.llmClient;
    this.toolRegistry = config.toolRegistry;
    this.memoryStoragePath = config.memoryStoragePath;
    this.streamCallback = config.streamCallback;
    this.defaultModel = config.defaultModel ?? 'deepseek-chat';
    this.enableDegradation = config.enableDegradation ?? true;
    this.onSnapshotPersist = config.onSnapshotPersist;
    this.maxSubAgentRetries = config.maxSubAgentRetries ?? 2;
    this.sharedWriter = new SharedMemoryWriter({ storagePath: config.memoryStoragePath });
  }

  // ─── 主执行方法 ─────────────────────────────────────────────────────────

  /**
   * 完整执行：PM → Arch → Visual → Task
   */
  async run(
    userMessage: string,
    options: PlanningRunOptions = {},
  ): Promise<PlanningResult> {
    const startTime = Date.now();
    const { signal, conversationContext = '' } = options;

    const artifacts: CompletedArtifacts = {};
    let currentAgent: AgentRole = 'pm';

    // 注册 AbortSignal → 自动生成并持久化快照
    const abortCleanup = this.registerAbortHandler(signal, () => currentAgent, artifacts, userMessage);

    // ─── 1. PMAgent ──────────────────────────────────────────────────────
    this.emitProgress({ agent: 'pm', status: 'started' });

    const pmMemory = await this.getMemoryForAgent('pm', userMessage);
    const pmCtx = buildPMContext(userMessage, pmMemory, conversationContext);

    const pmInput: PMAgentInput = {
      userMessage,
      conversationContext: pmCtx.conversationContext,
    };

    const pmResult = await this.withRetry('pm', () => runPMAgent(
      { llmClient: this.llmClient, model: this.defaultModel, streamCallback: this.streamCallback },
      pmInput,
      pmCtx.agentMemory,
      signal,
    ));

    const featureList = pmResult.output;
    artifacts.pm = {
      output: featureList,
      checkpointId: `pm-${Date.now()}`,
      completedAt: Date.now(),
    };

    this.emitProgress({
      agent: 'pm',
      status: 'completed',
      summary: `提取 ${featureList.features.length} 个功能需求`,
      artifactPreview: { featureCount: featureList.features.length },
    });

    await this.saveMemoryForAgent('pm', userMessage, pmResult.reasoning);

    // 写入 shared：用户意图记录
    await this.sharedWriter.writeProjectFact(
      `用户需求意图：${featureList.features.map(f => f.title).join('、')}`,
      0.9,
    );

    currentAgent = 'arch';
    // ─── 2. ArchAgent ────────────────────────────────────────────────────
    this.emitProgress({ agent: 'arch', status: 'started' });

    const archMemory = await this.getMemoryForAgent('arch', `技术方案：${featureList.features.map(f => f.title).join('、')}`);
    const archCtx = buildArchContext(featureList, archMemory);
    const archToolRegistry = this.createSubRegistry('arch');

    const archInput: ArchAgentInput = { featureList };

    const archResult = await this.withRetry('arch', () => runArchAgent(
      { llmClient: this.llmClient, toolRegistry: archToolRegistry, model: this.defaultModel, streamCallback: this.streamCallback },
      archInput,
      archCtx.agentMemory,
      signal,
    ));

    const techPlan = archResult.output;
    artifacts.arch = {
      output: techPlan,
      checkpointId: `arch-${Date.now()}`,
      completedAt: Date.now(),
    };

    this.emitProgress({
      agent: 'arch',
      status: 'completed',
      summary: `${techPlan.viewChanges.length} 个视图变更，${techPlan.schemaChanges.length} 个 Schema 变更`,
      artifactPreview: { viewChanges: techPlan.viewChanges.length, schemaChanges: techPlan.schemaChanges.length },
    });

    await this.saveMemoryForAgent('arch', featureList.features.map(f => f.title).join('、'), archResult.reasoning);

    currentAgent = 'visual';
    // ─── 3. VisualAgent ──────────────────────────────────────────────────
    this.emitProgress({ agent: 'visual', status: 'started' });

    let visualSpec: VisualSpec;
    try {
      const visualMemory = await this.getMemoryForAgent('visual', `视觉设计：${featureList.features.map(f => f.title).join('、')}`);
      const visualCtx = buildVisualContext(featureList, techPlan, visualMemory);
      const visualToolRegistry = this.createSubRegistry('visual');

      const visualInput: VisualAgentInput = { featureList, techPlan };

      const visualResult = await this.withRetry('visual', () => runVisualAgent(
        { llmClient: this.llmClient, toolRegistry: visualToolRegistry, model: this.defaultModel, streamCallback: this.streamCallback },
        visualInput,
        visualCtx.agentMemory,
        signal,
      ));

      visualSpec = visualResult.output;
      artifacts.visual = {
        output: visualSpec,
        checkpointId: `visual-${Date.now()}`,
        completedAt: Date.now(),
      };

      this.emitProgress({
        agent: 'visual',
        status: 'completed',
        summary: `${visualSpec.pages.length} 个页面布局`,
        artifactPreview: { pageCount: visualSpec.pages.length },
      });

      await this.saveMemoryForAgent('visual', featureList.features.map(f => f.title).join('、'), visualResult.reasoning);
    } catch (err) {
      if (this.enableDegradation) {
        this.emitProgress({ agent: 'visual', status: 'failed', summary: `降级：${(err as Error).message}` });
        // Fallback: 生成最小可用 VisualSpec
        visualSpec = this.createFallbackVisualSpec(featureList);
        artifacts.visual = {
          output: visualSpec,
          checkpointId: `visual-fallback-${Date.now()}`,
          completedAt: Date.now(),
        };
      } else {
        throw err;
      }
    }

    currentAgent = 'task';
    // ─── 4. TaskPlannerAgent ─────────────────────────────────────────────
    this.emitProgress({ agent: 'task', status: 'started' });

    let changeSpec: ChangeSpec;
    try {
      const taskMemory = await this.getMemoryForAgent('task', `任务规划：${featureList.features.map(f => f.title).join('、')}`);
      const taskCtx = buildTaskContext(featureList, techPlan, visualSpec, taskMemory);
      const taskToolRegistry = this.createSubRegistry('task');

      const taskInput: TaskPlannerInput = { featureList, techPlan, visualSpec };

      const taskResult = await this.withRetry('task', () => runTaskPlannerAgent(
        { llmClient: this.llmClient, toolRegistry: taskToolRegistry, model: this.defaultModel, streamCallback: this.streamCallback },
        taskInput,
        taskCtx.agentMemory,
        signal,
      ));

      changeSpec = taskResult.output;

      // 填充时间戳
      const now = Date.now();
      if (changeSpec.createdAt === 0) changeSpec.createdAt = now;
      changeSpec.updatedAt = now;

      artifacts.task = {
        output: changeSpec,
        checkpointId: `task-${Date.now()}`,
        completedAt: Date.now(),
      };

      this.emitProgress({
        agent: 'task',
        status: 'completed',
        summary: `${changeSpec.tasks.length} 个执行任务`,
        artifactPreview: { taskCount: changeSpec.tasks.length },
      });

      await this.saveMemoryForAgent('task', featureList.features.map(f => f.title).join('、'), taskResult.reasoning);
    } catch (err) {
      if (this.enableDegradation) {
        this.emitProgress({ agent: 'task', status: 'failed', summary: `降级：${(err as Error).message}` });
        // Fallback: 最小化 ChangeSpec
        changeSpec = this.createFallbackChangeSpec(featureList);
        artifacts.task = {
          output: changeSpec,
          checkpointId: `task-fallback-${Date.now()}`,
          completedAt: Date.now(),
        };
      } else {
        throw err;
      }
    }

    // 全管线完成后写入 shared 经验
    await this.sharedWriter.writeEpisode({
      title: `管线完成：${featureList.features.map(f => f.title).join('、')}`,
      content: `PM(${featureList.features.length}需求) → Arch(${techPlan.viewChanges.length}变更) → Visual(${visualSpec.pages.length}页面) → Task(${changeSpec.tasks.length}任务)`,
      outcome: 'success',
      lessons: [],
      involvedEntities: featureList.features.map(f => f.id),
      tags: ['planning', 'pipeline-complete'],
      importance: 0.8,
    });

    // 清理 abort handler
    abortCleanup?.();

    return {
      featureList,
      techPlan,
      visualSpec,
      changeSpec,
      artifacts,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ─── 断点恢复方法 ───────────────────────────────────────────────────────

  /**
   * 从指定 Agent 恢复执行（前序产物已验证有效）
   */
  async runFrom(
    fromAgent: AgentRole,
    validArtifacts: CompletedArtifacts,
    refinementContext: RefinementContext | undefined,
    userMessage: string,
    options: PlanningRunOptions = {},
  ): Promise<PlanningResult> {
    const startTime = Date.now();
    const { signal, conversationContext = '' } = options;

    const artifacts: CompletedArtifacts = { ...validArtifacts };

    // 确定起始位置
    const pipeline: AgentRole[] = ['pm', 'arch', 'visual', 'task'];
    const startIdx = pipeline.indexOf(fromAgent);

    // 提取有效产物
    let featureList = validArtifacts.pm?.output as FeatureList | undefined;
    let techPlan = validArtifacts.arch?.output as TechPlan | undefined;
    let visualSpec = validArtifacts.visual?.output as VisualSpec | undefined;

    for (let i = startIdx; i < pipeline.length; i++) {
      const agent = pipeline[i]!;

      if (agent === 'pm') {
        this.emitProgress({ agent: 'pm', status: 'started' });
        const pmMemory = await this.getMemoryForAgent('pm', userMessage);
        const pmCtx = buildPMContext(userMessage, pmMemory, conversationContext);
        const pmInput: PMAgentInput = {
          userMessage: refinementContext && fromAgent === 'pm'
            ? `${userMessage}\n\n${refinementContext.instruction}`
            : userMessage,
          previousFeatureList: featureList,
          conversationContext: pmCtx.conversationContext,
        };

        const pmResult = await runPMAgent(
          { llmClient: this.llmClient, model: this.defaultModel },
          pmInput,
          pmCtx.agentMemory,
          signal,
        );
        featureList = pmResult.output;
        artifacts.pm = { output: featureList, checkpointId: `pm-${Date.now()}`, completedAt: Date.now() };
        this.emitProgress({ agent: 'pm', status: 'completed', artifactPreview: { featureCount: featureList.features.length } });
      }

      if (agent === 'arch') {
        if (!featureList) throw new Error('Cannot run ArchAgent without FeatureList');
        this.emitProgress({ agent: 'arch', status: 'started' });
        const archMemory = await this.getMemoryForAgent('arch', featureList.features.map(f => f.title).join('、'));
        const archCtx = buildArchContext(featureList, archMemory, techPlan);
        const archToolRegistry = this.createSubRegistry('arch');
        const archInput: ArchAgentInput = {
          featureList,
          previousTechPlan: refinementContext && fromAgent === 'arch' ? techPlan : undefined,
        };

        const archResult = await runArchAgent(
          { llmClient: this.llmClient, toolRegistry: archToolRegistry, model: this.defaultModel },
          archInput,
          archCtx.agentMemory,
          signal,
        );
        techPlan = archResult.output;
        artifacts.arch = { output: techPlan, checkpointId: `arch-${Date.now()}`, completedAt: Date.now() };
        this.emitProgress({ agent: 'arch', status: 'completed', artifactPreview: { viewChanges: techPlan.viewChanges.length, schemaChanges: techPlan.schemaChanges.length } });
      }

      if (agent === 'visual') {
        if (!featureList || !techPlan) throw new Error('Cannot run VisualAgent without FeatureList and TechPlan');
        this.emitProgress({ agent: 'visual', status: 'started' });
        const visualMemory = await this.getMemoryForAgent('visual', featureList.features.map(f => f.title).join('、'));
        const visualCtx = buildVisualContext(featureList, techPlan, visualMemory, visualSpec);
        const visualToolRegistry = this.createSubRegistry('visual');
        const visualInput: VisualAgentInput = {
          featureList,
          techPlan,
          previousVisualSpec: refinementContext && fromAgent === 'visual' ? visualSpec : undefined,
        };

        const visualResult = await runVisualAgent(
          { llmClient: this.llmClient, toolRegistry: visualToolRegistry, model: this.defaultModel },
          visualInput,
          visualCtx.agentMemory,
          signal,
        );
        visualSpec = visualResult.output;
        artifacts.visual = { output: visualSpec, checkpointId: `visual-${Date.now()}`, completedAt: Date.now() };
        this.emitProgress({ agent: 'visual', status: 'completed', artifactPreview: { pageCount: visualSpec.pages.length } });
      }

      if (agent === 'task') {
        if (!featureList || !techPlan || !visualSpec) throw new Error('Cannot run TaskPlannerAgent without all prior artifacts');
        this.emitProgress({ agent: 'task', status: 'started' });
        const taskMemory = await this.getMemoryForAgent('task', featureList.features.map(f => f.title).join('、'));
        buildTaskContext(featureList, techPlan, visualSpec, taskMemory);
        const taskToolRegistry = this.createSubRegistry('task');
        const taskInput: TaskPlannerInput = { featureList, techPlan, visualSpec };

        const taskResult = await runTaskPlannerAgent(
          { llmClient: this.llmClient, toolRegistry: taskToolRegistry, model: this.defaultModel },
          taskInput,
          taskMemory ?? '',
          signal,
        );
        const changeSpec = taskResult.output;
        const now = Date.now();
        if (changeSpec.createdAt === 0) changeSpec.createdAt = now;
        changeSpec.updatedAt = now;
        artifacts.task = { output: changeSpec, checkpointId: `task-${Date.now()}`, completedAt: Date.now() };
        this.emitProgress({ agent: 'task', status: 'completed', artifactPreview: { taskCount: changeSpec.tasks.length } });
      }
    }

    return {
      featureList: featureList!,
      techPlan: techPlan!,
      visualSpec: visualSpec!,
      changeSpec: artifacts.task!.output,
      artifacts,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ─── Snapshot 生成 ──────────────────────────────────────────────────────

  /**
   * 为中断时生成快照
   */
  createSnapshot(
    interruptedAt: AgentRole | 'execute',
    completedArtifacts: CompletedArtifacts,
    artifactId: string,
    planDescription?: string,
  ): PlanningSnapshot {
    return {
      interruptedAt,
      completedArtifacts,
      interruptedAt_ts: Date.now(),
      artifactId,
      planDescription,
    };
  }

  // ─── 内部方法 ──────────────────────────────────────────────────────────

  /**
   * 工具隔离：为指定 Agent 创建仅含白名单工具的子 ToolRegistry
   */
  private createSubRegistry(agent: AgentRole): ToolRegistry {
    const whitelist = AGENT_TOOL_WHITELIST[agent];
    if (whitelist.length === 0) return new ToolRegistry();

    const sub = new ToolRegistry();
    for (const toolName of whitelist) {
      const handler = this.toolRegistry.getHandler(toolName);
      const definitions = this.toolRegistry.getDefinitions();
      const definition = definitions.find(d => d.name === toolName);
      if (handler && definition) {
        sub.register(definition, handler);
      }
    }
    return sub;
  }

  /**
   * 获取或创建命名空间记忆管理器
   */
  private getMemoryManager(agent: AgentRole): NamespacedMemoryManager {
    let manager = this.memoryManagers.get(agent);
    if (!manager) {
      manager = createMemoryManager(agent, this.memoryStoragePath);
      this.memoryManagers.set(agent, manager);
    }
    return manager;
  }

  /**
   * 为指定 Agent 加载记忆上下文
   */
  private async getMemoryForAgent(agent: AgentRole, taskDescription: string): Promise<string | null> {
    const manager = this.getMemoryManager(agent);
    return manager.loadForTask(taskDescription);
  }

  /**
   * 为指定 Agent 保存执行经验
   */
  private async saveMemoryForAgent(agent: AgentRole, task: string, reasoning: string): Promise<void> {
    const manager = this.getMemoryManager(agent);
    await manager.saveAfterTask({
      title: `${agent} 执行记录：${task.slice(0, 50)}`,
      content: reasoning.slice(0, 500),
      outcome: 'success',
      lessons: [],
      involvedEntities: [],
      tags: [agent, 'planning'],
      importance: 0.6,
    });
  }

  /**
   * 发送 planning_progress SSE 事件
   */
  private emitProgress(event: PlanningProgressEvent): void {
    if (this.streamCallback) {
      const streamEvent: TypedStreamEvent = {
        type: 'planning_progress',
        data: event,
      };
      this.streamCallback(streamEvent);
    }
  }

  /**
   * 注册 AbortSignal → Snapshot 持久化
   * 返回清理函数（任务正常完成时调用）
   */
  private registerAbortHandler(
    signal: AbortSignal | undefined,
    getCurrentAgent: () => AgentRole,
    artifacts: CompletedArtifacts,
    planDescription: string,
  ): (() => void) | undefined {
    if (!signal || !this.onSnapshotPersist) return undefined;

    const handler = () => {
      const snapshot = this.createSnapshot(
        getCurrentAgent(),
        artifacts,
        `planning-${Date.now()}`,
        planDescription,
      );
      // 尽力持久化（abort 后不等待）
      this.onSnapshotPersist!(snapshot).catch(() => { /* best-effort */ });
    };

    signal.addEventListener('abort', handler, { once: true });
    return () => signal.removeEventListener('abort', handler);
  }

  /**
   * 带重试的 SubAgent 执行包装器
   *
   * 对子代理执行进行自动重试（含指数退避），
   * 仅对瞬时错误（网络/超时/LLM 服务暂时不可用）重试，
   * 逻辑错误（如输出格式多次验证失败）不重试。
   */
  private async withRetry<T>(
    agentName: AgentRole,
    fn: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown = null;
    const maxAttempts = this.maxSubAgentRetries + 1; // 首次执行 + N 次重试

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        // 已达最大重试次数
        if (attempt >= maxAttempts) break;

        // 判断是否可重试
        const isRetryable = this.isRetryableError(err);
        if (!isRetryable) break;

        // 指数退避
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        this.emitProgress({
          agent: agentName,
          status: 'started',
          summary: `重试中（第 ${attempt} 次失败: ${err instanceof Error ? err.message : String(err)}），${delay}ms 后重试...`,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * 判断错误是否可重试
   * - 网络/超时/连接类错误 → 可重试
   * - LLM 服务 429/5xx → 可重试
   * - 输出格式验证失败（已内建重试）→ 不重试
   * - 其他逻辑错误 → 不重试
   */
  private isRetryableError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();

    // SubAgent 自身的格式验证失败（已有内建重试，不再外层重试）
    if (msg.includes('output validation failed') || msg.includes('no json output found') || msg.includes('json parse failed')) {
      return false;
    }
    // max iterations exceeded（逻辑问题，不重试）
    if (msg.includes('max iterations') && msg.includes('exceeded')) {
      return false;
    }
    // aborted（用户主动中断，不重试）
    if (msg.includes('aborted')) {
      return false;
    }

    // 网络/超时/服务暂时不可用 → 可重试
    const retryablePatterns = [
      'econnreset', 'econnrefused', 'etimedout', 'enotfound',
      'socket hang up', 'network', 'timeout',
      'rate limit', 'ratelimit', 'too many requests',
      'service unavailable', 'temporarily unavailable',
      '429', '500', '502', '503', '504',
    ];
    return retryablePatterns.some(p => msg.includes(p));
  }

  /**
   * 降级 fallback：最小可用 VisualSpec
   */
  private createFallbackVisualSpec(featureList: FeatureList): VisualSpec {
    return {
      pages: featureList.features.map(f => ({
        name: f.title,
        layoutDescription: f.description,
        hierarchy: '单层',
        informationDensity: 'medium' as const,
      })),
      designTokens: {
        colors: { primary: '#1976D2', background: '#FFFFFF' },
        spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
        borderRadius: { sm: 4, md: 8, lg: 16 },
        typography: {
          h1: { fontSize: 24, fontWeight: 700, lineHeight: 1.4 },
          body: { fontSize: 14, fontWeight: 400, lineHeight: 1.6 },
        },
      },
      componentChoices: featureList.features.map(f => ({
        featureId: f.id,
        componentType: 'CombinedView',
        reason: '降级默认选择',
      })),
    };
  }

  /**
   * 降级 fallback：最小化 ChangeSpec
   */
  private createFallbackChangeSpec(featureList: FeatureList): ChangeSpec {
    const now = Date.now();
    return {
      id: `change-fallback-${now}`,
      title: featureList.features.map(f => f.title).join(' + '),
      proposal: {
        why: featureList.features.map(f => f.userStory).join('；'),
        what: featureList.features.map(f => f.description).join('；'),
        outOfScope: featureList.outOfScope.join('；'),
        successCriteria: featureList.features.flatMap(f => f.acceptanceCriteria),
      },
      specs: featureList.features.flatMap(f => f.acceptanceCriteria.map(ac => `Given 功能 ${f.title}, When 操作, Then ${ac}`)),
      tasks: featureList.features.map((f, i) => ({
        id: `task-${i + 1}`,
        description: `实现功能：${f.title} — ${f.description}`,
        done: false,
      })),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
  }
}
