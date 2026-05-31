/**
 * 相地 · SubAgent 子图工厂
 *
 * 统一的 Subagent 执行函数，根据配置支持纯 LLM 或 think↔tools 循环。
 */

import type { ZodSchema } from 'zod';
import type { LLMClient, LLMResponse } from '../../core/llmTypes.js';
import type { StreamCallback, ToolDefinition, Message } from '../../core/types.js';
import type { ToolRegistry } from '../../core/ToolRegistry.js';
import type { SubAgentLLMConfig } from './state.js';

export interface SubAgentConfig<TInput, TOutput> {
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  llmConfig: SubAgentLLMConfig;
  streamCallback?: StreamCallback;
  outputValidator: ZodSchema<TOutput>;
  maxValidationRetries?: number;
  roleName: string;
}

export interface SubAgentRunResult<TOutput> {
  output: TOutput;
  reasoning: string;
  messages: Message[];
  iterations: number;
  durationMs: number;
}

/**
 * 执行一个 SubAgent 子任务
 *
 * - maxIterations=1 + 空 ToolRegistry → 纯 LLM 单次调用（PMAgent）
 * - maxIterations>1 + 非空 ToolRegistry → think↔tools Agentic Loop
 */
export async function runSubAgent<TInput, TOutput>(
  config: SubAgentConfig<TInput, TOutput>,
  input: TInput,
  systemPrompt: string,
  agentMemory: string,
  conversationContext: string,
  signal?: AbortSignal,
): Promise<SubAgentRunResult<TOutput>> {
  const startTime = Date.now();
  const { llmClient, toolRegistry, llmConfig, outputValidator, maxValidationRetries = 2, roleName } = config;

  const messages: Message[] = [];

  // Inject memory context
  if (agentMemory) {
    messages.push({ role: 'user', content: agentMemory });
    messages.push({ role: 'assistant', content: '我已理解上下文记忆，准备开始工作。' });
  }

  // Build user message from input
  const inputStr = typeof input === 'string'
    ? input
    : JSON.stringify(input, null, 2);
  const userContent = conversationContext
    ? `${conversationContext}\n\n---\n\n请基于以下结构化输入完成任务，严格按规定 JSON 格式输出：\n\n${inputStr}`
    : `请基于以下结构化输入完成任务，严格按规定 JSON 格式输出：\n\n${inputStr}`;
  messages.push({ role: 'user', content: userContent });

  // Get tool definitions from registry
  const tools: ToolDefinition[] = toolRegistry.getDefinitions();

  let iteration = 0;
  let validationAttempts = 0;

  while (iteration < llmConfig.maxIterations + maxValidationRetries) {
    if (signal?.aborted) throw new Error(`SubAgent ${roleName} aborted`);

    iteration++;

    // Call LLM
    const response: LLMResponse = await llmClient.createMessage({
      model: llmConfig.model,
      max_tokens: llmConfig.maxTokens,
      temperature: llmConfig.temperature,
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Extract tool_use items from response content
    const toolUseCalls = response.content.filter(
      (block): block is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        block.type === 'tool_use'
    );

    // Handle tool calls (only within maxIterations budget)
    if (toolUseCalls.length > 0 && iteration <= llmConfig.maxIterations) {
      // Push assistant message with the full content (text + tool_use blocks)
      messages.push({ role: 'assistant', content: response.content });

      for (const toolCall of toolUseCalls) {
        const execResult = await toolRegistry.execute(toolCall.name, toolCall.input);
        messages.push({
          role: 'tool',
          content: [{
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: typeof execResult.result === 'string'
              ? execResult.result
              : JSON.stringify(execResult.result),
            is_error: execResult.is_error,
          }],
        });
      }
      continue;
    }

    // Extract text content from response
    const rawOutput = extractTextFromResponse(response);

    // Try to parse JSON output
    const jsonStr = extractJsonFromText(rawOutput);

    if (!jsonStr) {
      validationAttempts++;
      if (validationAttempts > maxValidationRetries) {
        throw new Error(`SubAgent ${roleName}: no JSON output found after ${maxValidationRetries} retries`);
      }
      messages.push({ role: 'assistant', content: rawOutput });
      messages.push({ role: 'user', content: '你的输出中未包含 JSON。请严格按照规定格式，以 ```json ... ``` 包裹输出结构化 JSON。' });
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(jsonStr);
      const validated = outputValidator.safeParse(parsed);

      if (validated.success) {
        return {
          output: validated.data,
          reasoning: rawOutput.replace(jsonStr, '').trim(),
          messages,
          iterations: iteration,
          durationMs: Date.now() - startTime,
        };
      }

      // Validation failed
      validationAttempts++;
      if (validationAttempts > maxValidationRetries) {
        throw new Error(
          `SubAgent ${roleName}: output validation failed after ${maxValidationRetries} retries. ` +
          `Errors: ${JSON.stringify(validated.error.issues)}`
        );
      }

      messages.push({ role: 'assistant', content: rawOutput });
      messages.push({
        role: 'user',
        content: `输出格式验证失败，请修正以下问题后重新输出：\n${validated.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`,
      });
    } catch (e: unknown) {
      if (e instanceof SyntaxError) {
        validationAttempts++;
        if (validationAttempts > maxValidationRetries) {
          throw new Error(`SubAgent ${roleName}: JSON parse failed after retries`);
        }
        messages.push({ role: 'assistant', content: rawOutput });
        messages.push({ role: 'user', content: '输出不是合法 JSON，请重新输出。' });
        continue;
      }
      throw e;
    }
  }

  throw new Error(`SubAgent ${roleName}: max iterations (${llmConfig.maxIterations}) exceeded`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTextFromResponse(response: LLMResponse): string {
  return response.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map(block => block.text)
    .join('');
}

function extractJsonFromText(text: string): string | null {
  // Try ```json ... ``` first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) return codeBlockMatch[1]!.trim();

  // Try raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return null;
}
