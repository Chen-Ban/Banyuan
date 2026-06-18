/**
 * Flow Executor 单元测试
 *
 * 每个执行器作为一个独立纯函数测试，通过模拟 ctx 和 cap 验证行为。
 * 覆盖所有 20 个 executor 的正常路径、边界条件和错误路径。
 */

import { describe, it, expect, vi } from 'vitest';
import { NodeKind, MathOp, CompareOp, LogicOp, ParallelMode } from '@/types/foundation/flow/enums';
import type { IRunnerCtx, FrontendCapProxy, BackendCapProxy, CapProxy } from '@/types/foundation/flow/context';
import type { FlowNode, FlowSourceNode } from '@/types/foundation/flow/index';
import type { NodeEvalResult } from '@/types/foundation/flow/executor';
import { FrameStack } from '@/foundation/flow/context/FrameStack';
import { sourceExecutor } from '@/foundation/flow/executors/source';
import {
  mathExecutor,
  compareExecutor,
  logicExecutor,
  concatExecutor,
  formatExecutor,
  getExecutor,
} from '@/foundation/flow/executors/compute';
import {
  conditionExecutor,
  loopExecutor,
  parallelExecutor,
  returnExecutor,
} from '@/foundation/flow/executors/control';
import {
  setVariableExecutor,
  setViewDataExecutor,
  setViewVisibleExecutor,
  playAnimationExecutor,
  navigateExecutor,
  cloudFunctionExecutor,
  httpRequestExecutor,
  dbQueryExecutor,
  dbInsertExecutor,
  dbUpdateExecutor,
  dbDeleteExecutor,
} from '@/foundation/flow/executors/action';
import { functionExecutor } from '@/foundation/flow/executors/function';

// ── 辅助函数 ──

function makeStack(): FrameStack {
  const s = new FrameStack();
  s.enter({}, { version: '2.0.0', entry: 'n1', nodes: {} });
  return s;
}

function makeBaseCtx(overrides: Partial<IRunnerCtx> = {}): IRunnerCtx<CapProxy> {
  const stack = overrides.stack ?? makeStack();
  return {
    stack,
    executors: {},
    cap: {
      httpClient: {
        request: vi.fn().mockResolvedValue({ status: 200, body: {}, headers: {} }),
      },
    },
    runSubGraph: vi.fn().mockResolvedValue({}),
    evaluateFilter: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeSourceNode(kind: NodeKind.Literal | NodeKind.Context, overrides: Partial<FlowSourceNode> = {}): FlowSourceNode {
  if (kind === NodeKind.Literal) {
    return {
      id: 'n1',
      category: 'source' as any,
      kind: NodeKind.Literal,
      slots: [{ input: {}, output: ['value'], value: overrides.slots?.[0]?.value ?? 42 }],
      ...overrides,
    } as any;
  }
  return {
    id: 'n1',
    category: 'source' as any,
    kind: NodeKind.Context,
    slots: [{ input: {}, output: ['value'], path: overrides.slots?.[0]?.path ?? 'in.x' }],
    ...overrides,
  } as any;
}

// ═══════════════════════════════════════════════════════════
// Source Executor
// ═══════════════════════════════════════════════════════════

describe('sourceExecutor', () => {
  it('Literal — 直接返回 value', async () => {
    const node = makeSourceNode(NodeKind.Literal);
    (node.slots[0] as any).value = 'hello';
    const result = await sourceExecutor(node, {}, makeBaseCtx());
    expect(result.outputs).toEqual({ value: 'hello' });
    expect(result.nextNodeId).toBeNull();
  });

  it('Literal — 返回 null', async () => {
    const node = makeSourceNode(NodeKind.Literal);
    (node.slots[0] as any).value = null;
    const result = await sourceExecutor(node, {}, makeBaseCtx());
    expect(result.outputs).toEqual({ value: null });
  });

  it('Literal — 返回 undefined', async () => {
    const node = makeSourceNode(NodeKind.Literal);
    (node.slots[0] as any).value = undefined;
    const result = await sourceExecutor(node, {}, makeBaseCtx());
    expect(result.outputs).toEqual({ value: undefined });
  });

  it('Context — 读 in.*', async () => {
    const stack = makeStack();
    (stack as any).frames[0].in = { x: 100 };
    const node = makeSourceNode(NodeKind.Context);
    (node.slots[0] as any).path = 'in.x';
    const result = await sourceExecutor(node, {}, makeBaseCtx({ stack }));
    expect(result.outputs).toEqual({ value: 100 });
  });

  it('Context — 读整个 in', async () => {
    const stack = makeStack();
    (stack as any).frames[0].in = { x: 1, y: 2 };
    const node = makeSourceNode(NodeKind.Context);
    (node.slots[0] as any).path = 'in';
    const result = await sourceExecutor(node, {}, makeBaseCtx({ stack }));
    expect(result.outputs).toEqual({ value: { x: 1, y: 2 } });
  });

  it('Context — 读 local.*', async () => {
    const stack = makeStack();
    (stack as any).frames[0].local = { count: 5 };
    const node = makeSourceNode(NodeKind.Context);
    (node.slots[0] as any).path = 'local.count';
    const result = await sourceExecutor(node, {}, makeBaseCtx({ stack }));
    expect(result.outputs).toEqual({ value: 5 });
  });

  it('Context — 读整个 local', async () => {
    const stack = makeStack();
    (stack as any).frames[0].local = { a: 1 };
    const node = makeSourceNode(NodeKind.Context);
    (node.slots[0] as any).path = 'local';
    const result = await sourceExecutor(node, {}, makeBaseCtx({ stack }));
    expect(result.outputs).toEqual({ value: { a: 1 } });
  });

  it('Context — vars.* 前缀被剥离', async () => {
    const stack = makeStack();
    (stack as any).frames[0].local = { count: 5 };
    const node = makeSourceNode(NodeKind.Context);
    (node.slots[0] as any).path = 'vars.local.count';
    const result = await sourceExecutor(node, {}, makeBaseCtx({ stack }));
    expect(result.outputs).toEqual({ value: 5 });
  });

  it('Context — 未知 root 返回 undefined', async () => {
    const node = makeSourceNode(NodeKind.Context);
    (node.slots[0] as any).path = 'unknown.x';
    const result = await sourceExecutor(node, {}, makeBaseCtx());
    expect(result.outputs).toEqual({ value: undefined });
  });
});

// ═══════════════════════════════════════════════════════════
// Compute Executors
// ═══════════════════════════════════════════════════════════

describe('mathExecutor', () => {
  it('Add', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Add, a: 3, b: 5 }, {} as any);
    expect(r.outputs?.value).toBe(8);
  });
  it('Sub', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Sub, a: 10, b: 3 }, {} as any);
    expect(r.outputs?.value).toBe(7);
  });
  it('Mul', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Mul, a: 4, b: 5 }, {} as any);
    expect(r.outputs?.value).toBe(20);
  });
  it('Div', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Div, a: 10, b: 2 }, {} as any);
    expect(r.outputs?.value).toBe(5);
  });
  it('Mod', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Mod, a: 10, b: 3 }, {} as any);
    expect(r.outputs?.value).toBe(1);
  });
  it('Pow', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Pow, a: 2, b: 3 }, {} as any);
    expect(r.outputs?.value).toBe(8);
  });
  it('Min', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Min, a: 5, b: 3 }, {} as any);
    expect(r.outputs?.value).toBe(3);
  });
  it('Max', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Max, a: 5, b: 3 }, {} as any);
    expect(r.outputs?.value).toBe(5);
  });
  it('unknown op → 0', async () => {
    const r = await mathExecutor({} as any, { op: 'unknown' as any, a: 1, b: 2 }, {} as any);
    expect(r.outputs?.value).toBe(0);
  });
  it('NaN inputs produce NaN', async () => {
    const r = await mathExecutor({} as any, { op: MathOp.Add, a: 'x' as any, b: 2 }, {} as any);
    expect(isNaN(r.outputs?.value as number)).toBe(true);
  });
});

describe('compareExecutor', () => {
  it('Eq — true', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Eq, a: 5, b: 5 }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Eq — false', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Eq, a: 5, b: 3 }, {} as any);
    expect(r.outputs?.value).toBe(false);
  });
  it('Neq', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Neq, a: 5, b: 3 }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Gt — true', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Gt, a: 10, b: 5 }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Gt — false', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Gt, a: 5, b: 10 }, {} as any);
    expect(r.outputs?.value).toBe(false);
  });
  it('Gte — equal', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Gte, a: 5, b: 5 }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Lt', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Lt, a: 3, b: 5 }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Lte — equal', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Lte, a: 5, b: 5 }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Contains — true', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Contains, a: 'hello world', b: 'world' }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Contains — false', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Contains, a: 'hello', b: 'xyz' }, {} as any);
    expect(r.outputs?.value).toBe(false);
  });
  it('Contains — 数字转字符串', async () => {
    const r = await compareExecutor({} as any, { op: CompareOp.Contains, a: 12345, b: 23 }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('unknown op → false', async () => {
    const r = await compareExecutor({} as any, { op: 'unknown' as any, a: 1, b: 2 }, {} as any);
    expect(r.outputs?.value).toBe(false);
  });
});

describe('logicExecutor', () => {
  it('And — both truthy', async () => {
    const r = await logicExecutor({} as any, { op: LogicOp.And, a: true, b: true }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('And — one falsy', async () => {
    const r = await logicExecutor({} as any, { op: LogicOp.And, a: true, b: false }, {} as any);
    expect(r.outputs?.value).toBe(false);
  });
  it('And — truthy values (非布尔值)', async () => {
    const r = await logicExecutor({} as any, { op: LogicOp.And, a: 1, b: 'yes' }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Or — one truthy', async () => {
    const r = await logicExecutor({} as any, { op: LogicOp.Or, a: false, b: true }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('Or — both falsy', async () => {
    const r = await logicExecutor({} as any, { op: LogicOp.Or, a: false, b: false }, {} as any);
    expect(r.outputs?.value).toBe(false);
  });
  it('Not — true → false', async () => {
    const r = await logicExecutor({} as any, { op: LogicOp.Not, a: true }, {} as any);
    expect(r.outputs?.value).toBe(false);
  });
  it('Not — falsy → true', async () => {
    const r = await logicExecutor({} as any, { op: LogicOp.Not, a: 0 }, {} as any);
    expect(r.outputs?.value).toBe(true);
  });
  it('unknown op → false', async () => {
    const r = await logicExecutor({} as any, { op: 'unknown' as any, a: true, b: true }, {} as any);
    expect(r.outputs?.value).toBe(false);
  });
});

describe('concatExecutor', () => {
  it('basic concat', async () => {
    const r = await concatExecutor({} as any, { a: 'hello', b: 'world' }, {} as any);
    expect(r.outputs?.value).toBe('helloworld');
  });
  it('with separator', async () => {
    const r = await concatExecutor({} as any, { a: 'hello', b: 'world', separator: ' ' }, {} as any);
    expect(r.outputs?.value).toBe('hello world');
  });
  it('null/undefined → empty string', async () => {
    const r = await concatExecutor({} as any, { a: null, b: undefined }, {} as any);
    expect(r.outputs?.value).toBe('');
  });
  it('numbers → strings', async () => {
    const r = await concatExecutor({} as any, { a: 1, b: 2, separator: '-' }, {} as any);
    expect(r.outputs?.value).toBe('1-2');
  });
});

describe('formatExecutor', () => {
  it('simple template', async () => {
    const r = await formatExecutor({} as any, {
      template: 'Hello {name}!',
      values: { name: 'World' },
    }, {} as any);
    expect(r.outputs?.value).toBe('Hello World!');
  });
  it('multiple placeholders', async () => {
    const r = await formatExecutor({} as any, {
      template: '{greeting} {name}!',
      values: { greeting: 'Hi', name: 'Alice' },
    }, {} as any);
    expect(r.outputs?.value).toBe('Hi Alice!');
  });
  it('重复 placeholder', async () => {
    const r = await formatExecutor({} as any, {
      template: '{x} {x} {x}',
      values: { x: 'a' },
    }, {} as any);
    expect(r.outputs?.value).toBe('a a a');
  });
  it('空 values', async () => {
    const r = await formatExecutor({} as any, {
      template: 'fixed',
      values: {},
    }, {} as any);
    expect(r.outputs?.value).toBe('fixed');
  });
  it('空 template → 空字符串', async () => {
    const r = await formatExecutor({} as any, {
      template: '',
      values: { x: 'y' },
    }, {} as any);
    expect(r.outputs?.value).toBe('');
  });
});

describe('getExecutor', () => {
  it('一级属性', async () => {
    const r = await getExecutor({} as any, { object: { a: 1 }, path: 'a' }, {} as any);
    expect(r.outputs?.value).toBe(1);
  });
  it('嵌套属性', async () => {
    const r = await getExecutor({} as any, { object: { a: { b: { c: 42 } } }, path: 'a.b.c' }, {} as any);
    expect(r.outputs?.value).toBe(42);
  });
  it('null object → undefined', async () => {
    const r = await getExecutor({} as any, { object: null, path: 'a.b' }, {} as any);
    expect(r.outputs?.value).toBe(undefined);
  });
  it('undefined object → undefined', async () => {
    const r = await getExecutor({} as any, { object: undefined, path: 'a.b' }, {} as any);
    expect(r.outputs?.value).toBe(undefined);
  });
  it('中途 null → undefined', async () => {
    const r = await getExecutor({} as any, { object: { a: null }, path: 'a.b.c' }, {} as any);
    expect(r.outputs?.value).toBe(undefined);
  });
  it('不存在的属性 → undefined', async () => {
    const r = await getExecutor({} as any, { object: { a: 1 }, path: 'b' }, {} as any);
    expect(r.outputs?.value).toBe(undefined);
  });
  it('空 path → 访问空属性返回 undefined', async () => {
    // String('').split('.') → [''] → cur[''] → undefined
    const r = await getExecutor({} as any, { object: { a: 1 }, path: '' }, {} as any);
    expect(r.outputs?.value).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// Control Executors
// ═══════════════════════════════════════════════════════════

describe('conditionExecutor', () => {
  it('匹配第一个分支', async () => {
    const evaluateFilter = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true); // 不应到达
    const ctx = makeBaseCtx({ evaluateFilter });
    const node = {
      id: 'c1', kind: NodeKind.Condition,
      slots: [
        { filter: { left: 1, op: CompareOp.Eq, right: 1 }, next: 'branch1', input: {}, output: [] },
        { filter: { left: 2, op: CompareOp.Eq, right: 2 }, next: 'branch2', input: {}, output: [] },
      ],
    } as any;
    const r = await conditionExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBe('branch1');
    expect(evaluateFilter).toHaveBeenCalledTimes(1);
  });

  it('匹配第二个分支', async () => {
    const evaluateFilter = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const ctx = makeBaseCtx({ evaluateFilter });
    const node = {
      id: 'c1', kind: NodeKind.Condition,
      slots: [
        { filter: { left: 1, op: CompareOp.Eq, right: 1 }, next: 'branch1', input: {}, output: [] },
        { filter: { left: 2, op: CompareOp.Eq, right: 2 }, next: 'branch2', input: {}, output: [] },
      ],
    } as any;
    const r = await conditionExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBe('branch2');
  });

  it('无匹配分支 → nextNodeId = null', async () => {
    const evaluateFilter = vi.fn().mockResolvedValue(false);
    const ctx = makeBaseCtx({ evaluateFilter });
    const node = {
      id: 'c1', kind: NodeKind.Condition,
      slots: [
        { filter: { left: 1, op: CompareOp.Eq, right: 1 }, next: 'branch1', input: {}, output: [] },
      ],
    } as any;
    const r = await conditionExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBeNull();
  });

  it('空 slots 列表 → null', async () => {
    const ctx = makeBaseCtx();
    const node = { id: 'c1', kind: NodeKind.Condition, slots: [] } as any;
    const r = await conditionExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBeNull();
  });
});

describe('loopExecutor', () => {
  it('循环 3 次', async () => {
    let count = 0;
    const evaluateFilter = vi.fn().mockImplementation(async () => ++count <= 3);
    const runSubGraph = vi.fn().mockResolvedValue({});
    const ctx = makeBaseCtx({ evaluateFilter, runSubGraph });
    const node = {
      id: 'l1', kind: NodeKind.Loop,
      slots: [{
        filter: { left: 1, op: CompareOp.Eq, right: 1 },
        body: { version: '2.0.0', entry: 'b1', nodes: {} },
        next: 'after_loop',
        input: {}, output: [],
      }],
    } as any;
    const r = await loopExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBe('after_loop');
    expect(runSubGraph).toHaveBeenCalledTimes(3);
    expect(evaluateFilter).toHaveBeenCalledTimes(4); // 3 true + 1 false
  });

  it('条件始终为 false → 0 次执行', async () => {
    const evaluateFilter = vi.fn().mockResolvedValue(false);
    const runSubGraph = vi.fn();
    const ctx = makeBaseCtx({ evaluateFilter, runSubGraph });
    const node = {
      id: 'l1', kind: NodeKind.Loop,
      slots: [{ filter: {}, body: { version: '2.0.0', entry: 'b1', nodes: {} }, next: 'after', input: {}, output: [] }],
    } as any;
    const r = await loopExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBe('after');
    expect(runSubGraph).not.toHaveBeenCalled();
  });
});

describe('parallelExecutor', () => {
  const body1 = { version: '2.0.0', entry: 'b1', nodes: {} };
  const body2 = { version: '2.0.0', entry: 'b2', nodes: {} };

  it('ParallelMode.All — 等待全部完成', async () => {
    const runSubGraph = vi.fn().mockResolvedValue({});
    const ctx = makeBaseCtx({ runSubGraph });
    const node = {
      id: 'p1', kind: NodeKind.Parallel,
      slots: [{ body: [body1, body2], mode: ParallelMode.All, next: 'next1', input: {}, output: [] }],
    } as any;
    const r = await parallelExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBe('next1');
    expect(runSubGraph).toHaveBeenCalledTimes(2);
  });

  it('ParallelMode.AllSettled — 即使有错误也继续', async () => {
    const runSubGraph = vi.fn()
      .mockRejectedValueOnce(new Error('branch error'))
      .mockResolvedValueOnce({});
    const ctx = makeBaseCtx({ runSubGraph });
    const node = {
      id: 'p1', kind: NodeKind.Parallel,
      slots: [{ body: [body1, body2], mode: ParallelMode.AllSettled, next: 'next1', input: {}, output: [] }],
    } as any;
    // AllSettled 不应抛出错误
    const r = await parallelExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBe('next1');
  });

  it('ParallelMode.Race — 取最快', async () => {
    let resolve1: (v: any) => void;
    let resolve2: (v: any) => void;
    const p1 = new Promise(r => { resolve1 = r; });
    const p2 = new Promise(r => { resolve2 = r; });
    const runSubGraph = vi.fn()
      .mockReturnValueOnce(p1)
      .mockReturnValueOnce(p2);
    const ctx = makeBaseCtx({ runSubGraph });
    const node = {
      id: 'p1', kind: NodeKind.Parallel,
      slots: [{ body: [body1, body2], mode: ParallelMode.Race, next: 'next1', input: {}, output: [] }],
    } as any;

    const resultPromise = parallelExecutor(node, {}, ctx);
    resolve2!({ winner: 'branch2' });
    const r = await resultPromise;
    expect(r.nextNodeId).toBe('next1');
  });

  it('ParallelMode.Any — 任意一个成功', async () => {
    let resolve1: (v: any) => void;
    let reject2: (v: any) => void;
    const p1 = new Promise(r => { resolve1 = r; });
    const p2 = new Promise((_, r) => { reject2 = r; });
    const runSubGraph = vi.fn()
      .mockReturnValueOnce(p1)
      .mockReturnValueOnce(p2);
    const ctx = makeBaseCtx({ runSubGraph });
    const node = {
      id: 'p1', kind: NodeKind.Parallel,
      slots: [{ body: [body1, body2], mode: ParallelMode.Any, next: 'next1', input: {}, output: [] }],
    } as any;

    const resultPromise = parallelExecutor(node, {}, ctx);
    resolve1!({ ok: true });
    const r = await resultPromise;
    expect(r.nextNodeId).toBe('next1');
  });

  it('空 body → 直接返回', async () => {
    const ctx = makeBaseCtx();
    const node = {
      id: 'p1', kind: NodeKind.Parallel,
      slots: [{ body: [], mode: ParallelMode.All, next: 'next1', input: {}, output: [] }],
    } as any;
    const r = await parallelExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBe('next1');
  });
});

describe('returnExecutor', () => {
  it('将 inputs 写入 returnRef', async () => {
    const stack = makeStack();
    const ctx = makeBaseCtx({ stack });
    const r = await returnExecutor({} as any, { result: 42, meta: 'done' }, ctx);
    expect(ctx.stack.returnRef.value).toEqual({ result: 42, meta: 'done' });
    expect(r.outputs).toEqual({ result: 42, meta: 'done' });
    expect(r.nextNodeId).toBeNull();
  });

  it('空 inputs', async () => {
    const stack = makeStack();
    const ctx = makeBaseCtx({ stack });
    const r = await returnExecutor({} as any, {}, ctx);
    expect(ctx.stack.returnRef.value).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════
// Action Executors — 共享
// ═══════════════════════════════════════════════════════════

describe('setVariableExecutor', () => {
  it('写入 local 变量（plain target）', async () => {
    const stack = makeStack();
    const ctx = makeBaseCtx({ stack });
    const node = {
      id: 'sv1', kind: NodeKind.SetVariable,
      slots: [{ input: { target: 'myVar' }, output: [], next: 'n2' }],
    } as any;
    const r = await setVariableExecutor(node, { value: 100 }, ctx);
    expect(ctx.stack.local.myVar).toBe(100);
    expect(r.nextNodeId).toBe('n2');
  });

  it('写入 vars.local.* → local', async () => {
    const stack = makeStack();
    const ctx = makeBaseCtx({ stack });
    const node = {
      id: 'sv1', kind: NodeKind.SetVariable,
      slots: [{ input: { target: 'vars.local.count' }, output: [], next: 'n2' }],
    } as any;
    const r = await setVariableExecutor(node, { value: 42 }, ctx);
    expect(ctx.stack.local.count).toBe(42);
    expect(r.nextNodeId).toBe('n2');
  });

  it('state.* 已废弃，仅警告不写 local', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stack = makeStack();
    const ctx = makeBaseCtx({ stack });
    const node = {
      id: 'sv1', kind: NodeKind.SetVariable,
      slots: [{ input: { target: 'state.isVisible' }, output: [], next: 'n2' }],
    } as any;
    const r = await setVariableExecutor(node, { value: true }, ctx);
    expect(warnSpy).toHaveBeenCalled();
    expect(ctx.stack.local).toEqual({}); // 不应写入
    expect(r.nextNodeId).toBe('n2');
    warnSpy.mockRestore();
  });

  it('无 next → null', async () => {
    const stack = makeStack();
    const ctx = makeBaseCtx({ stack });
    const node = {
      id: 'sv1', kind: NodeKind.SetVariable,
      slots: [{ input: { target: 'x' }, output: [], next: '' }],
    } as any;
    const r = await setVariableExecutor(node, { value: 1 }, ctx);
    expect(r.nextNodeId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// Action Executors — 前端
// ═══════════════════════════════════════════════════════════

describe('setViewDataExecutor', () => {
  it('调用 cap.setViewData', async () => {
    const setViewData = vi.fn();
    const ctx = makeBaseCtx({ cap: { setViewData } as any });
    const node = {
      id: 'a1', kind: NodeKind.SetViewData,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await setViewDataExecutor(node, { viewId: 'v1', key: 'text', value: 'hello' }, ctx as any);
    expect(setViewData).toHaveBeenCalledWith('v1', 'text', 'hello');
    expect(r.nextNodeId).toBe('n2');
  });

  it('cap.setViewData 不存在时跳过', async () => {
    const ctx = makeBaseCtx({ cap: {} as any });
    const node = {
      id: 'a1', kind: NodeKind.SetViewData,
      slots: [{ input: {}, output: [], next: '' }],
    } as any;
    const r = await setViewDataExecutor(node, { viewId: 'v1', key: 'k', value: 'v' }, ctx as any);
    expect(r.nextNodeId).toBeNull();
  });
});

describe('setViewVisibleExecutor', () => {
  it('调用 cap.setViewVisible', async () => {
    const setViewVisible = vi.fn();
    const ctx = makeBaseCtx({ cap: { setViewVisible } as any });
    const node = {
      id: 'a1', kind: NodeKind.SetViewVisible,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await setViewVisibleExecutor(node, { viewId: 'v1', visible: true }, ctx as any);
    expect(setViewVisible).toHaveBeenCalledWith('v1', true);
    expect(r.nextNodeId).toBe('n2');
  });
});

describe('playAnimationExecutor', () => {
  it('调用 cap.playAnimation', async () => {
    const playAnimation = vi.fn();
    const ctx = makeBaseCtx({ cap: { playAnimation } as any });
    const node = {
      id: 'a1', kind: NodeKind.PlayAnimation,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await playAnimationExecutor(node, { viewId: 'v1', animationId: 'fadeIn' }, ctx as any);
    expect(playAnimation).toHaveBeenCalledWith('v1', 'fadeIn');
    expect(r.nextNodeId).toBe('n2');
  });
});

describe('navigateExecutor', () => {
  it('调用 cap.navigate', async () => {
    const navigate = vi.fn().mockResolvedValue(undefined);
    const ctx = makeBaseCtx({ cap: { navigate } as any });
    const node = {
      id: 'a1', kind: NodeKind.Navigate,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await navigateExecutor(node, { target: '/page2' }, ctx as any);
    expect(navigate).toHaveBeenCalledWith('/page2');
    expect(r.nextNodeId).toBe('n2');
  });
});

describe('cloudFunctionExecutor', () => {
  it('调用 httpClient.request', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, body: { ok: true }, headers: {} });
    const ctx = makeBaseCtx({
      cap: { httpClient: { request } } as any,
    });
    const node = {
      id: 'a1', kind: NodeKind.CloudFunction,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await cloudFunctionExecutor(node, {
      method: 'POST', functionId: 'fn1', args: { x: 1 },
    }, ctx as any);
    expect(request).toHaveBeenCalledWith('POST', '/api/functions/fn1', { 'Content-Type': 'application/json' }, { x: 1 });
    expect(r.outputs).toEqual({ status: 200, body: { ok: true }, headers: {} });
    expect(r.nextNodeId).toBe('n2');
  });

  it('无 httpClient 时抛出错误', async () => {
    const ctx = makeBaseCtx({ cap: {} as any });
    const node = { id: 'a1', kind: NodeKind.CloudFunction, slots: [{ input: {}, output: [] }] } as any;
    await expect(cloudFunctionExecutor(node, {}, ctx as any)).rejects.toThrow('httpClient not available');
  });
});

// ═══════════════════════════════════════════════════════════
// Action Executors — 后端
// ═══════════════════════════════════════════════════════════

describe('httpRequestExecutor', () => {
  it('发送 HTTP 请求', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, body: { data: 'ok' }, headers: { 'x-id': '1' } });
    const ctx = makeBaseCtx({ cap: { httpClient: { request } } as any });
    const node = {
      id: 'a1', kind: NodeKind.HttpRequest,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await httpRequestExecutor(node, {
      method: 'POST', url: 'https://api.example.com', headers: { Authorization: 'Bearer x' }, body: { key: 'val' },
    }, ctx as any);
    expect(request).toHaveBeenCalledWith('POST', 'https://api.example.com', { Authorization: 'Bearer x' }, { key: 'val' });
    expect(r.outputs).toEqual({ status: 200, body: { data: 'ok' }, headers: { 'x-id': '1' } });
    expect(r.nextNodeId).toBe('n2');
  });

  it('默认 method = GET', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, body: null, headers: {} });
    const ctx = makeBaseCtx({ cap: { httpClient: { request } } as any });
    const node = {
      id: 'a1', kind: NodeKind.HttpRequest,
      slots: [{ input: {}, output: [], next: '' }],
    } as any;
    await httpRequestExecutor(node, { url: 'https://example.com' }, ctx as any);
    expect(request).toHaveBeenCalledWith('GET', 'https://example.com', {}, undefined);
  });
});

describe('dbQueryExecutor', () => {
  it('调用 cap.db.query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], count: 1 });
    const ctx = makeBaseCtx({ cap: { db: { query } } as any });
    const node = {
      id: 'a1', kind: NodeKind.DbQuery,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await dbQueryExecutor(node, { collection: 'users', filter: { name: 'Alice' } }, ctx as any);
    expect(query).toHaveBeenCalledWith('users', { name: 'Alice' });
    expect(r.outputs).toEqual({ rows: [{ id: 1 }], count: 1 });
    expect(r.nextNodeId).toBe('n2');
  });

  it('无 db 时抛出错误', async () => {
    const ctx = makeBaseCtx({ cap: {} as any });
    const node = { id: 'a1', kind: NodeKind.DbQuery, slots: [{ input: {}, output: [] }] } as any;
    await expect(dbQueryExecutor(node, {}, ctx as any)).rejects.toThrow('db not available');
  });
});

describe('dbInsertExecutor', () => {
  it('调用 cap.db.insert', async () => {
    const insert = vi.fn().mockResolvedValue({ id: 'new-id' });
    const ctx = makeBaseCtx({ cap: { db: { insert } } as any });
    const node = {
      id: 'a1', kind: NodeKind.DbInsert,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await dbInsertExecutor(node, { collection: 'users', document: { name: 'Bob' } }, ctx as any);
    expect(insert).toHaveBeenCalledWith('users', { name: 'Bob' });
    expect(r.outputs).toEqual({ id: 'new-id' });
    expect(r.nextNodeId).toBe('n2');
  });
});

describe('dbUpdateExecutor', () => {
  it('调用 cap.db.update', async () => {
    const update = vi.fn().mockResolvedValue({ matched: 1, modified: 1 });
    const ctx = makeBaseCtx({ cap: { db: { update } } as any });
    const node = {
      id: 'a1', kind: NodeKind.DbUpdate,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await dbUpdateExecutor(node, {
      collection: 'users', filter: { name: 'Alice' }, update: { $set: { name: 'Alicia' } },
    }, ctx as any);
    expect(update).toHaveBeenCalledWith('users', { name: 'Alice' }, { $set: { name: 'Alicia' } });
    expect(r.outputs).toEqual({ matchedCount: 1, modifiedCount: 1 });
    expect(r.nextNodeId).toBe('n2');
  });
});

describe('dbDeleteExecutor', () => {
  it('调用 cap.db.delete', async () => {
    const del = vi.fn().mockResolvedValue({ deleted: 1 });
    const ctx = makeBaseCtx({ cap: { db: { delete: del } } as any });
    const node = {
      id: 'a1', kind: NodeKind.DbDelete,
      slots: [{ input: {}, output: [], next: 'n2' }],
    } as any;
    const r = await dbDeleteExecutor(node, { collection: 'users', filter: { name: 'Bob' } }, ctx as any);
    expect(del).toHaveBeenCalledWith('users', { name: 'Bob' });
    expect(r.outputs).toEqual({ deletedCount: 1 });
    expect(r.nextNodeId).toBe('n2');
  });
});

// ═══════════════════════════════════════════════════════════
// Function Executor
// ═══════════════════════════════════════════════════════════

describe('functionExecutor', () => {
  it('调用 runSubGraph 并返回结果', async () => {
    const runSubGraph = vi.fn().mockResolvedValue({ sum: 10 });
    const ctx = makeBaseCtx({ runSubGraph });
    const body = { version: '2.0.0', entry: 'b1', nodes: {} };
    const node = {
      id: 'f1', kind: NodeKind.Function,
      slots: [{ body, next: 'n2', input: {}, output: [] }],
    } as any;
    const r = await functionExecutor(node, { a: 3, b: 7 }, ctx);
    expect(runSubGraph).toHaveBeenCalledWith(body, { a: 3, b: 7 });
    expect(r.outputs).toEqual({ sum: 10 });
    expect(r.nextNodeId).toBe('n2');
  });

  it('无 next → null', async () => {
    const runSubGraph = vi.fn().mockResolvedValue({});
    const ctx = makeBaseCtx({ runSubGraph });
    const node = {
      id: 'f1', kind: NodeKind.Function,
      slots: [{ body: { version: '2.0.0', entry: 'b1', nodes: {} }, next: '', input: {}, output: [] }],
    } as any;
    const r = await functionExecutor(node, {}, ctx);
    expect(r.nextNodeId).toBeNull();
  });
});
