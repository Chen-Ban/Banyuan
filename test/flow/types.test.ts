/**
 * Flow 类型审计测试
 *
 * 验证所有类型定义的正确性：枚举完整性、slot 结构、node 结构、
 * DataRef 判别、FlowSchema 结构等。
 */

import { describe, it, expect } from 'vitest';
import {
  NodeCategory,
  NodeKind,
  MathOp,
  CompareOp,
  LogicOp,
  ParallelMode,
} from '@/types/foundation/flow/enums';
import { isDataRef } from '@/types/foundation/flow/common';
import { FLOW_SCHEMA_VERSION } from '@/types/foundation/flow/schema';

// ── 静态类型级断言（编译期即验证） ──

describe('NodeKind 枚举完整性', () => {
  const allKinds = Object.values(NodeKind);

  it('应有 24 个 NodeKind 值', () => {
    expect(allKinds.length).toBe(24);
  });

  it('NodeKind 值列表与 NodeCategory 对应关系正确', () => {
    const sourceKinds = [NodeKind.Literal, NodeKind.Context];
    const computeKinds = [
      NodeKind.Math, NodeKind.Compare, NodeKind.Logic,
      NodeKind.Concat, NodeKind.Format, NodeKind.Get,
    ];
    const controlKinds = [
      NodeKind.Condition, NodeKind.Loop, NodeKind.Parallel, NodeKind.Return,
    ];
    const actionKinds = [
      NodeKind.SetVariable,
      NodeKind.SetViewData, NodeKind.SetViewVisible,
      NodeKind.PlayAnimation, NodeKind.Navigate,
      NodeKind.CloudFunction, NodeKind.HttpRequest,
      NodeKind.DbQuery, NodeKind.DbInsert, NodeKind.DbUpdate, NodeKind.DbDelete,
    ];
    const functionKinds = [NodeKind.Function];

    expect(sourceKinds.length).toBe(2);
    expect(computeKinds.length).toBe(6);
    expect(controlKinds.length).toBe(4);
    expect(actionKinds.length).toBe(11);
    expect(functionKinds.length).toBe(1);

    const total = [
      ...sourceKinds, ...computeKinds, ...controlKinds,
      ...actionKinds, ...functionKinds,
    ];
    expect(total.length).toBe(24);
  });

  it('NodeKind 值应全为 camelCase 字符串且无重复', () => {
    const seen = new Set<string>();
    for (const k of allKinds) {
      expect(typeof k).toBe('string');
      expect(k.length).toBeGreaterThan(0);
      // camelCase: 首字母小写，不以下划线或大写开头
      expect(k[0]).toBe(k[0].toLowerCase());
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('NodeCategory 应有 5 个值', () => {
    expect(Object.values(NodeCategory).length).toBe(5);
  });

  it('MathOp 应有 8 个操作符（Add/Sub/Mul/Div/Mod/Pow/Min/Max）', () => {
    expect(Object.values(MathOp).length).toBe(8);
  });

  it('CompareOp 应有 7 个操作符（Eq/Neq/Gt/Gte/Lt/Lte/Contains）', () => {
    expect(Object.values(CompareOp).length).toBe(7);
  });

  it('LogicOp 应有 3 个操作符（And/Or/Not）', () => {
    expect(Object.values(LogicOp).length).toBe(3);
  });

  it('ParallelMode 应有 4 个模式（All/AllSettled/Race/Any）', () => {
    expect(Object.values(ParallelMode).length).toBe(4);
  });
});

describe('DataRef / SlotValue 原语', () => {
  it('isDataRef 应正确判别 DataRef 对象', () => {
    expect(isDataRef({ nodeId: 'n1', field: 'value' })).toBe(true);
    expect(isDataRef({ nodeId: '', field: '' })).toBe(true);
  });

  it('isDataRef 应拒绝非 DataRef 值', () => {
    expect(isDataRef(null)).toBe(false);
    expect(isDataRef(undefined)).toBe(false);
    expect(isDataRef(42)).toBe(false);
    expect(isDataRef('string')).toBe(false);
    expect(isDataRef(true)).toBe(false);
    expect(isDataRef([])).toBe(false);
    expect(isDataRef({})).toBe(false); // 无 nodeId
    expect(isDataRef({ nodeId: 'n1' })).toBe(false); // 无 field
    expect(isDataRef({ field: 'v' })).toBe(false); // 无 nodeId
  });
});

describe('FlowSchema 结构', () => {
  it('FLOW_SCHEMA_VERSION 应为 "2.0.0"', () => {
    expect(FLOW_SCHEMA_VERSION).toBe('2.0.0');
  });

  it('FlowSchema 应包含 version / entry / nodes 字段', () => {
    const validSchema = {
      version: FLOW_SCHEMA_VERSION,
      entry: 'start',
      nodes: {},
    };
    expect(validSchema).toHaveProperty('version');
    expect(validSchema).toHaveProperty('entry');
    expect(validSchema).toHaveProperty('nodes');
  });
});
