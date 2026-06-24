/**
 * 内置物料 Seed 脚本
 *
 * 将内置物料数据写入 MongoDB。物料采用嵌套结构（meta + template），
 * 与基础库 @banyuan/banvasgl 的 IMaterial 一致，后端附加 kind / applicationId。
 *
 * kind 三值：render（渲染物料）/ client-flow（客户端流程节点）/ server-flow（服务端流程节点）。
 * 流程节点的 action/value 区分仍由 tags 承担（面板按 tags.includes('value') 分组）。
 *
 * 由于物料结构调整且不做向后兼容，seed 时整体重建内置物料集合。
 *
 * 使用方式：在 startServer() 中 connectDatabase 之后调用 seedBuiltinMaterials()
 */

import { Material } from '../models/index.js'
import type { MaterialKind, ITemplate } from '../models/types/index.js'

// ─── 内置物料数据（从 @banyuan/banvasgl 生成脚本产出，迁移到此处） ──────────────
//
// 此处以扁平结构书写便于阅读，seed 时由 toMaterialDocument() 包装为嵌套结构。

interface BuiltinMaterialSeed {
  id: string
  name: string
  description: string
  tags: string[]
  /** 物料种类：render / client-flow / server-flow */
  kind: MaterialKind
  /** 缩略图（内置物料为 data:image/svg+xml Data URL，用 <img> 渲染） */
  thumbnail?: string
  version: string
  template: ITemplate
}

const BUILTIN_MATERIALS: BuiltinMaterialSeed[] = [
  // ── 圆角矩形 ──
  {
    id: 'builtin.rounded-rect',
    name: '圆角矩形',
    description: '矩形',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%223%22%20y%3D%225%22%20width%3D%2218%22%20height%3D%2214%22%20rx%3D%224%22%20ry%3D%224%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'GRAPHVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'GRAPHVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 100, height: 100 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 100, height: 100 },
          constraintBounds: { x: 0, y: 0, width: 100, height: 100 },
          content: { $type: 'ROUNDED_RECT', $value: { id: '{{id:1}}', type: 'ROUNDED_RECT', x: 0, y: 0, width: 100, height: 100, radii: [12, 12, 12, 12] } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 圆形 ──
  {
    id: 'builtin.circle',
    name: '圆形',
    description: '圆形',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%229%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'GRAPHVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'GRAPHVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 100, height: 100 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 100, height: 100 },
          constraintBounds: { x: 0, y: 0, width: 100, height: 100 },
          content: { $type: 'CIRCLE', $value: { id: '{{id:1}}', type: 'CIRCLE', center: { x: 50, y: 50, z: 0 }, radius: 50 } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 三角形 ──
  {
    id: 'builtin.triangle',
    name: '三角形',
    description: '等边三角形',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpolygon%20points%3D%2212%2C4%2021%2C20%203%2C20%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'GRAPHVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'GRAPHVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 100, height: 86.6025390625 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 100, height: 86.6025390625 },
          constraintBounds: { x: 0, y: 0, width: 100, height: 86.6025390625 },
          content: { $type: 'TRIANGLE', $value: { id: '{{id:1}}', type: 'TRIANGLE', controlPoints: [{ x: 50, y: 0, z: 0 }, { x: 100, y: 86.6025390625, z: 0 }, { x: 0, y: 86.6025390625, z: 0 }] } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 正多边形 ──
  {
    id: 'builtin.regular-polygon',
    name: '正多边形',
    description: '正六边形（可调边数）',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpolygon%20points%3D%2212%2C3%2020.5%2C7.5%2020.5%2C16.5%2012%2C21%203.5%2C16.5%203.5%2C7.5%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'GRAPHVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'GRAPHVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 100, height: 86.60253953933716 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 100, height: 86.60253953933716 },
          constraintBounds: { x: 0, y: 0, width: 100, height: 86.60253953933716 },
          content: { $type: 'REGULAR_POLYGON', $value: { id: '{{id:1}}', type: 'REGULAR_POLYGON', center: { x: 50, y: 50, z: 0 }, radius: 50, sides: 6, rotation: 0 } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 直线 ──
  {
    id: 'builtin.line',
    name: '直线',
    description: '直线',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cline%20x1%3D%224%22%20y1%3D%2220%22%20x2%3D%2220%22%20y2%3D%224%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'GRAPHVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'GRAPHVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 50, height: 50 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 50, height: 50 },
          constraintBounds: { x: 0, y: 0, width: 50, height: 50 },
          content: { $type: 'LINE', $value: { id: '{{id:1}}', type: 'LINE', controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 50, z: 0 }] } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 弧线 ──
  {
    id: 'builtin.arc',
    name: '弧线',
    description: '椭圆弧线',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M4%2018%20A10%2010%200%200%201%2020%2018%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'GRAPHVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'GRAPHVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 100, height: 50 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 100, height: 50 },
          constraintBounds: { x: 0, y: 0, width: 100, height: 50 },
          content: { $type: 'ARC', $value: { id: '{{id:1}}', type: 'ARC', center: { x: 50, y: 50, z: 0 }, xRadius: 50, yRadius: 50, rotation: 0, startAngle: 3.141592653589793, endAngle: 6.283185307179586, clockwise: false } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 二次贝塞尔 ──
  {
    id: 'builtin.quadratic-bezier',
    name: '二次贝塞尔',
    description: '二次贝塞尔曲线（3 个控制点，弧形）',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M3%2018%20Q12%202%2C%2021%2018%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'GRAPHVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'GRAPHVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 120, height: 29.99996566772461 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 120, height: 29.99996566772461 },
          constraintBounds: { x: 0, y: 0, width: 120, height: 29.99996566772461 },
          content: { $type: 'QUADRATIC_BEZIER', $value: { id: '{{id:1}}', type: 'QUADRATIC_BEZIER', controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 60, y: -60, z: 0 }, { x: 120, y: 0, z: 0 }] } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 三次贝塞尔 ──
  {
    id: 'builtin.cubic-bezier',
    name: '三次贝塞尔',
    description: '三次贝塞尔曲线（4 个控制点，S 形）',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M3%2018%20C7%204%2C%2011%204%2C%2012%2012%20S17%2020%2C%2021%206%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'GRAPHVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'GRAPHVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 120, height: 27.70988655090332 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 120, height: 27.70988655090332 },
          constraintBounds: { x: 0, y: 0, width: 120, height: 27.70988655090332 },
          content: { $type: 'CUBIC_BEZIER', $value: { id: '{{id:1}}', type: 'CUBIC_BEZIER', controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 39.599998474121094, y: -48, z: 0 }, { x: 80.4000015258789, y: 48, z: 0 }, { x: 120, y: 0, z: 0 }] } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 文本 ──
  {
    id: 'builtin.text',
    name: '文本',
    description: '文本',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ctext%20x%3D%2212%22%20y%3D%2217%22%20text-anchor%3D%22middle%22%20font-size%3D%2214%22%20fill%3D%22%23c9ccd4%22%20font-weight%3D%22bold%22%20font-family%3D%22sans-serif%22%3ET%3C%2Ftext%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'TEXTVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'TEXTVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 200, height: 24 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 200, height: 24 },
          constraintBounds: { x: 0, y: 0, width: 200, height: 24 },
          content: {
            $type: 'TEXTFIELDS',
            $value: {
              id: '{{id:1}}',
              type: 'TEXTFIELDS',
              paragraphs: [{
                id: '{{id:2}}',
                type: 'TEXTPARAGRAPH',
                texts: [
                  { id: '{{id:3}}', type: 'PRINTABLE_TEXTELEMENT', $class: 'PrintableTextElement', content: '文', options: { color: { r: 0, g: 0, b: 0, a: 1 }, family: 'Arial', size: 16, letterSpacing: 0, style: 'normal', weight: 'normal' } },
                  { id: '{{id:4}}', type: 'PRINTABLE_TEXTELEMENT', $class: 'PrintableTextElement', content: '本', options: { color: { r: 0, g: 0, b: 0, a: 1 }, family: 'Arial', size: 16, letterSpacing: 0, style: 'normal', weight: 'normal' } },
                  { id: '{{id:5}}', type: 'NONPRINTABLE_TEXTELEMENT', $class: 'NonPrintableTextElement' },
                ],
                options: { horizontalAlign: 'LEFT', leading: 1.2, preHeight: 0, postHeight: 0, indentation: 0, preWidth: 0 },
              }],
              options: { verticalAlign: 'TOP', paragraphSpacing: 0, fixedWidth: true, fixedHeight: false },
            },
          },
          editable: true,
          verticalAlign: 'TOP',
        },
      },
      idCount: 6,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 图片 ──
  {
    id: 'builtin.image',
    name: '图片',
    description: '图片',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%223%22%20y%3D%225%22%20width%3D%2218%22%20height%3D%2214%22%20rx%3D%221%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%2F%3E%3Ccircle%20cx%3D%228%22%20cy%3D%2210%22%20r%3D%222%22%20fill%3D%22%23c9ccd4%22%2F%3E%3Cpolyline%20points%3D%223%2C16%209%2C12%2014%2C15%2018%2C11%2021%2C14%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'IMAGEVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'IMAGEVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 200, height: 300 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 200, height: 300 },
          constraintBounds: { x: 0, y: 0, width: 200, height: 300 },
          content: { $type: 'IMAGE', $value: { id: '{{id:1}}', type: 'IMAGE', src: 'https://picsum.photos/200/300', x: 0, y: 0, width: 200, height: 300 } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 视频 ──
  {
    id: 'builtin.video',
    name: '视频',
    description: '视频播放组件',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%222%22%20y%3D%225%22%20width%3D%2215%22%20height%3D%2214%22%20rx%3D%222%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20fill%3D%22none%22%2F%3E%3Cpolyline%20points%3D%2217%2C9%2022%2C6%2022%2C18%2017%2C15%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'VIDEOVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'VIDEOVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 320, height: 180 },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 320, height: 180 },
          constraintBounds: { x: 0, y: 0, width: 320, height: 180 },
          content: { $type: 'VIDEO', $value: { id: '{{id:1}}', type: 'VIDEO', src: '', x: 0, y: 0, width: 320, height: 180, autoplay: false, loop: false, muted: false } },
        },
      },
      idCount: 2,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 弹性容器 ──
  {
    id: 'builtin.flex',
    name: '弹性容器',
    description: '弹性布局容器，子元素自动排列',
    tags: ['builtin'],
    kind: 'render',
    thumbnail:
      'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%222%22%20y%3D%224%22%20width%3D%2220%22%20height%3D%2216%22%20rx%3D%222%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%222%22%20fill%3D%22none%22%2F%3E%3Cline%20x1%3D%229%22%20y1%3D%224%22%20x2%3D%229%22%20y2%3D%2220%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%221.5%22%2F%3E%3Cline%20x1%3D%2216%22%20y1%3D%224%22%20x2%3D%2216%22%20y2%3D%2220%22%20stroke%3D%22%23c9ccd4%22%20stroke-width%3D%221.5%22%2F%3E%3C%2Fsvg%3E',
    version: '1.0.0',
    template: {
      root: {
        $type: 'COMBINEDVIEW',
        $value: {
          id: '{{id:0}}',
          type: 'COMBINEDVIEW',
          visible: true,
          freezed: false,
          data: {},
          events: { onClick: null, onDoubleClick: null, onContextMenu: null, onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null, onDragStart: null, onDrag: null, onDragEnd: null, onFocus: null, onBlur: null },
          lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
          style: { overflow: 'visible', needStructViewport: false, transformOrigin: 'center', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, clipContent: false, opacity: 1, width: 300, height: 100, layoutMode: 'flex' },
          matrix: { transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
          viewport: { x: 0, y: 0, width: 300, height: 100 },
          constraintBounds: { x: 0, y: 0, width: 300, height: 100 },
          content: null,
          children: [],
        },
      },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 流程节点物料（NODEVIEW）
  // 模板格式简化：root.$value 只包含 schema（FlowNode 默认数据），
  // NodeView 的端口/外观由构造函数根据 schema.kind 自动推导。
  // ═══════════════════════════════════════════════════════════════════════

  // ── 客户端 Source 节点（值节点） ──
  {
    id: 'builtin.flow.literal',
    name: '字面量',
    description: '内联字面量值（字符串、数字、布尔等）',
    tags: ['flow', 'value'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'source', kind: 'literal', slots: [{ value: '', output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.context',
    name: '上下文变量',
    description: '从帧栈按路径读取上下文变量',
    tags: ['flow', 'value'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'source', kind: 'context', slots: [{ path: '', output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 客户端 Compute 节点（值节点） ──
  {
    id: 'builtin.flow.math',
    name: '数学运算',
    description: '加/减/乘/除/取模/幂/最值',
    tags: ['flow', 'value'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'math', slots: [{ input: { op: 'add', a: '', b: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.compare',
    name: '比较运算',
    description: '相等/大于/小于/包含等比较',
    tags: ['flow', 'value'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'compare', slots: [{ input: { op: 'eq', a: '', b: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.logic',
    name: '逻辑运算',
    description: '与/或/非逻辑组合',
    tags: ['flow', 'value'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'logic', slots: [{ input: { op: 'and', a: '', b: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.concat',
    name: '字符串拼接',
    description: '拼接多个字符串',
    tags: ['flow', 'value'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'concat', slots: [{ input: { a: '', b: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.format',
    name: '模板格式化',
    description: '模板字符串格式化（{0} {1}...）',
    tags: ['flow', 'value'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'format', slots: [{ input: { template: '', values: [] }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.get',
    name: '字段取值',
    description: '从对象按路径取嵌套字段值',
    tags: ['flow', 'value'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'get', slots: [{ input: { object: '', path: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 客户端 Control 节点（动作节点） ──
  {
    id: 'builtin.flow.condition',
    name: '条件分支',
    description: '根据条件选择执行分支（if / else if / else）',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'control', kind: 'condition', slots: [{ filter: { op: 'and', conditions: [{ left: '', op: 'eq', right: '' }] }, next: '' }, { filter: { op: 'and', conditions: [] }, next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.loop',
    name: '循环',
    description: 'while 循环，条件为真时重复执行循环体',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'control', kind: 'loop', slots: [{ filter: { op: 'and', conditions: [{ left: '', op: 'eq', right: '' }] }, body: { version: '2.0.0', entry: '', nodes: {} }, next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.parallel',
    name: '并行',
    description: '并行执行多个分支',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'control', kind: 'parallel', slots: [{ body: [], mode: 'all', next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.return',
    name: '返回',
    description: '终止子图执行并返回结果',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'control', kind: 'return', slots: [{ input: {}, output: [] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 客户端 Action 节点（动作节点） ──
  {
    id: 'builtin.flow.setVariable',
    name: '设置变量',
    description: '设置帧内局部变量',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'setVariable', slots: [{ input: { target: '', value: '' }, output: [], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.setViewData',
    name: '设置视图数据',
    description: '修改某个 View 的 data 字段值',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'setViewData', slots: [{ input: { viewId: 'self', key: '', value: '' }, output: [], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.setViewVisible',
    name: '显隐控制',
    description: '设置某个 View 的可见性',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'setViewVisible', slots: [{ input: { viewId: 'self', visible: true }, output: [], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.playAnimation',
    name: '播放动画',
    description: '触发某个 View 的预定义动画',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'playAnimation', slots: [{ input: { viewId: 'self', animationId: '' }, output: [], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.navigate',
    name: '跳转页面',
    description: '导航到另一个页面（必须是流程终点）',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'navigate', slots: [{ input: { target: '' }, output: [], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.cloudFunction',
    name: '云函数',
    description: '调用后端云函数',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'cloudFunction', slots: [{ input: { functionId: '', method: 'POST', args: {} }, output: ['status', 'body', 'headers'], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 客户端 Function 节点 ──
  {
    id: 'builtin.flow.function',
    name: '函数',
    description: '内联函数调用，创建新作用域执行子图',
    tags: ['flow', 'action'],
    kind: 'client-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'function', kind: 'function', slots: [{ body: { version: '2.0.0', entry: '', nodes: {} }, next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 服务端 Source 节点（值节点） ──
  {
    id: 'builtin.flow.literal.server',
    name: '字面量',
    description: '内联字面量值（字符串、数字、布尔等）',
    tags: ['flow', 'value'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'source', kind: 'literal', slots: [{ value: '', output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.context.server',
    name: '上下文变量',
    description: '从帧栈按路径读取上下文变量',
    tags: ['flow', 'value'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'source', kind: 'context', slots: [{ path: '', output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 服务端 Compute 节点（值节点） ──
  {
    id: 'builtin.flow.math.server',
    name: '数学运算',
    description: '加/减/乘/除/取模/幂/最值',
    tags: ['flow', 'value'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'math', slots: [{ input: { op: 'add', a: '', b: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.compare.server',
    name: '比较运算',
    description: '相等/大于/小于/包含等比较',
    tags: ['flow', 'value'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'compare', slots: [{ input: { op: 'eq', a: '', b: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.logic.server',
    name: '逻辑运算',
    description: '与/或/非逻辑组合',
    tags: ['flow', 'value'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'logic', slots: [{ input: { op: 'and', a: '', b: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.concat.server',
    name: '字符串拼接',
    description: '拼接多个字符串',
    tags: ['flow', 'value'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'concat', slots: [{ input: { a: '', b: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.format.server',
    name: '模板格式化',
    description: '模板字符串格式化（{0} {1}...）',
    tags: ['flow', 'value'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'format', slots: [{ input: { template: '', values: [] }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.get.server',
    name: '字段取值',
    description: '从对象按路径取嵌套字段值',
    tags: ['flow', 'value'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'compute', kind: 'get', slots: [{ input: { object: '', path: '' }, output: ['value'] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 服务端 Control 节点（动作节点） ──
  {
    id: 'builtin.flow.condition.server',
    name: '条件分支',
    description: '根据条件选择执行分支（if / else if / else）',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'control', kind: 'condition', slots: [{ filter: { op: 'and', conditions: [{ left: '', op: 'eq', right: '' }] }, next: '' }, { filter: { op: 'and', conditions: [] }, next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.loop.server',
    name: '循环',
    description: 'while 循环，条件为真时重复执行循环体',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'control', kind: 'loop', slots: [{ filter: { op: 'and', conditions: [{ left: '', op: 'eq', right: '' }] }, body: { version: '2.0.0', entry: '', nodes: {} }, next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.parallel.server',
    name: '并行',
    description: '并行执行多个分支',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'control', kind: 'parallel', slots: [{ body: [], mode: 'all', next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.return.server',
    name: '返回',
    description: '终止子图执行并返回结果',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'control', kind: 'return', slots: [{ input: {}, output: [] }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 服务端 Action 节点（动作节点） ──
  {
    id: 'builtin.flow.setVariable.server',
    name: '设置变量',
    description: '设置帧内局部变量',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'setVariable', slots: [{ input: { target: '', value: '' }, output: [], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.httpRequest',
    name: 'HTTP 请求',
    description: '发送 HTTP 请求到外部接口',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'httpRequest', slots: [{ input: { url: '', method: 'GET', headers: {}, body: '' }, output: ['status', 'body', 'headers'], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.dbQuery',
    name: '数据库查询',
    description: '从数据库查询数据',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'dbQuery', slots: [{ input: { collection: '', filter: {} }, output: ['rows', 'count'], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.dbInsert',
    name: '数据库插入',
    description: '向数据库插入数据',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'dbInsert', slots: [{ input: { collection: '', document: {} }, output: ['id'], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.dbUpdate',
    name: '数据库更新',
    description: '更新数据库中的数据',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'dbUpdate', slots: [{ input: { collection: '', filter: {}, update: {} }, output: ['matchedCount', 'modifiedCount'], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
  {
    id: 'builtin.flow.dbDelete',
    name: '数据库删除',
    description: '删除数据库中的数据',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'action', kind: 'dbDelete', slots: [{ input: { collection: '', filter: {} }, output: ['deletedCount'], next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },

  // ── 服务端 Function 节点 ──
  {
    id: 'builtin.flow.function.server',
    name: '函数',
    description: '内联函数调用，创建新作用域执行子图',
    tags: ['flow', 'action'],
    kind: 'server-flow',
    version: '2.0.0',
    template: {
      root: { $type: 'NODEVIEW', $value: { schema: { id: '{{id:0}}', category: 'function', kind: 'function', slots: [{ body: { version: '2.0.0', entry: '', nodes: {} }, next: '' }] } } },
      idCount: 1,
      internalIdRefs: [],
      parameters: [],
      assets: [],
    },
  },
]

// ─── Seed 执行函数 ──────────────────────────────────────────────────────────────

/**
 * 将扁平 seed 数据包装为嵌套物料文档（meta + template + kind + applicationId）
 */
function toMaterialDocument(seed: BuiltinMaterialSeed, now: string) {
  return {
    meta: {
      id: seed.id,
      name: seed.name,
      description: seed.description,
      tags: seed.tags,
      thumbnail: seed.thumbnail ?? '',
      source: 'builtin' as const,
      creatorId: 'system',
      createdAt: now,
      updatedAt: now,
      version: seed.version,
    },
    template: seed.template,
    kind: seed.kind,
    // 内置物料不归属任何应用
    applicationId: '',
  }
}

/**
 * 重建内置物料集合
 *
 * 物料结构调整后不做向后兼容：先删除所有 builtin 物料，再整体插入。
 * 用户物料（source !== 'builtin'）不受影响。
 *
 * @returns 写入的物料数量
 */
export async function seedBuiltinMaterials(): Promise<number> {
  const now = new Date().toISOString()

  // 删除旧的内置物料（含旧扁平结构数据）
  await Material.deleteMany({ 'meta.source': 'builtin' })

  const docs = BUILTIN_MATERIALS.map((seed) => toMaterialDocument(seed, now))
  await Material.insertMany(docs)

  return docs.length
}