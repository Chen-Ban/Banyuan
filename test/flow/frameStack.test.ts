/**
 * FrameStack 单元测试
 *
 * 验证帧栈的 enter/leave、steps 继承、local 隔离、
 * returnRef 初始化、outputCache 等行为。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FrameStack } from '@/foundation/flow/context/FrameStack';
import type { FlowSchema } from '@/types/foundation/flow/schema';

function makeSchema(entry: string, nodes: Record<string, any> = {}): FlowSchema {
  return {
    version: '2.0.0',
    entry,
    nodes: nodes as any,
  };
}

describe('FrameStack', () => {
  let stack: FrameStack;

  beforeEach(() => {
    stack = new FrameStack();
  });

  describe('enter / leave 基本操作', () => {
    it('空栈调用 accessor 抛出错误', () => {
      expect(() => stack.in).toThrow('FrameStack: no frames');
      expect(() => stack.local).toThrow('FrameStack: no frames');
      expect(() => stack.nodes).toThrow('FrameStack: no frames');
      expect(() => stack.entry).toThrow('FrameStack: no frames');
      expect(() => stack.returnRef).toThrow('FrameStack: no frames');
    });

    it('enter → 栈深为 1，accessors 可用', () => {
      stack.enter({}, makeSchema('n1'));
      expect(stack.entry).toBe('n1');
      expect(stack.nodes).toEqual({});
      expect(stack.returnRef.value).toEqual({});
      expect(stack.local).toEqual({});
      expect(stack.in).toEqual({});
    });

    it('enter 入参存储为快照（浅拷贝）', () => {
      const inputs = { x: 1, y: 2 };
      stack.enter(inputs, makeSchema('n1'));
      expect(stack.in).toEqual({ x: 1, y: 2 });
      // 修改原始对象不影响帧栈（已做浅拷贝）
      inputs.x = 999;
      expect(stack.in.x).toBe(1);
    });

    it('leave → 恢复空栈', () => {
      stack.enter({}, makeSchema('n1'));
      stack.leave();
      expect(() => stack.in).toThrow('FrameStack: no frames');
    });

    it('enter / leave 嵌套', () => {
      stack.enter({ a: 1 }, makeSchema('outer', { n1: { id: 'n1' } as any }));
      expect(stack.entry).toBe('outer');
      expect(stack.in).toEqual({ a: 1 });

      stack.enter({ b: 2 }, makeSchema('inner', { n2: { id: 'n2' } as any }));
      expect(stack.entry).toBe('inner');
      expect(stack.in).toEqual({ b: 2 });

      stack.leave();
      // 回到 outer 帧
      expect(stack.entry).toBe('outer');
      expect(stack.in).toEqual({ a: 1 });

      stack.leave();
      expect(() => stack.in).toThrow('FrameStack: no frames');
    });
  });

  describe('steps 继承', () => {
    it('初始帧 steps = 0', () => {
      stack.enter({}, makeSchema('n1'));
      expect(stack.steps).toBe(0);
    });

    it('子帧继承父帧 steps', () => {
      stack.enter({}, makeSchema('n1'));
      stack.steps = 100;
      stack.enter({}, makeSchema('n2'));
      expect(stack.steps).toBe(100);
    });

    it('leave 将子帧 steps 写回父帧', () => {
      stack.enter({}, makeSchema('n1'));
      stack.steps = 0;
      stack.enter({}, makeSchema('n2'));
      stack.steps = 50;
      stack.leave();
      expect(stack.steps).toBe(50);
    });

    it('父帧 steps 更大时 leave 不降级', () => {
      stack.enter({}, makeSchema('n1'));
      stack.steps = 100;
      stack.enter({}, makeSchema('n2'));
      stack.steps = 30;
      stack.leave();
      expect(stack.steps).toBe(100);
    });
  });

  describe('local 变量隔离', () => {
    it('每个帧有独立 local', () => {
      stack.enter({}, makeSchema('n1'));
      stack.local.x = 1;
      expect(stack.local.x).toBe(1);

      stack.enter({}, makeSchema('n2'));
      expect(stack.local).toEqual({});
      stack.local.y = 2;

      stack.leave();
      expect(stack.local.x).toBe(1);
      expect((stack as any).local.y).toBeUndefined();
    });
  });

  describe('returnRef', () => {
    it('每个帧初始化 returnRef = {}', () => {
      stack.enter({}, makeSchema('n1'));
      expect(stack.returnRef.value).toEqual({});
    });

    it('可修改 returnRef.value', () => {
      stack.enter({}, makeSchema('n1'));
      stack.returnRef.value = { result: 42 };
      expect(stack.returnRef.value).toEqual({ result: 42 });
    });

    it('嵌套帧各自独立 returnRef', () => {
      stack.enter({}, makeSchema('outer'));
      stack.returnRef.value = { outer: 1 };

      stack.enter({}, makeSchema('inner'));
      stack.returnRef.value = { inner: 2 };

      stack.leave();
      expect(stack.returnRef.value).toEqual({ outer: 1 });
    });
  });

  describe('nodes / entry', () => {
    it('nodes 从 schema 设置', () => {
      const nodes = { n1: { id: 'n1', kind: 'literal' as any } };
      stack.enter({}, makeSchema('start', nodes));
      expect(stack.nodes).toEqual(nodes);
    });

    it('entry 从 schema 设置', () => {
      stack.enter({}, makeSchema('startNode'));
      expect(stack.entry).toBe('startNode');
    });
  });

  describe('outputCache', () => {
    it('setOutput / getOutput 基本操作', () => {
      stack.enter({}, makeSchema('n1'));
      const result = { outputs: { value: 42 }, nextNodeId: 'n2' };
      stack.setOutput('n1', result);
      expect(stack.getOutput('n1')).toEqual(result);
    });

    it('未缓存的 key 返回 undefined', () => {
      stack.enter({}, makeSchema('n1'));
      expect(stack.getOutput('unknown')).toBeUndefined();
    });

    it('leave 后缓存随帧销毁', () => {
      stack.enter({}, makeSchema('outer'));
      stack.setOutput('n1', { outputs: {}, nextNodeId: null });
      expect(stack.getOutput('n1')).toBeDefined();

      stack.enter({}, makeSchema('inner'));
      expect(stack.getOutput('n1')).toBeUndefined();
      stack.setOutput('n2', { outputs: {}, nextNodeId: null });

      stack.leave();
      expect(stack.getOutput('n1')).toBeDefined();
      expect(stack.getOutput('n2')).toBeUndefined();
    });
  });

  describe('steps setter', () => {
    it('设置当前帧 steps', () => {
      stack.enter({}, makeSchema('n1'));
      stack.steps = 42;
      expect(stack.steps).toBe(42);
    });
  });
});
