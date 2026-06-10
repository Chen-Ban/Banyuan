import Color from "./Color";
import FillStyle from "./FillStyle";
import StrokeStyle from "./StrokeStyle";
import ShadowStyle from "./ShadowStyle";
import { StyleType } from "@/foundation/constants";
import type { ISerializable } from '@/types/foundation/serializable';

/**
 * 综合样式容器
 *
 * 聚合 FillStyle、StrokeStyle、ShadowStyle 三大子样式，
 * 提供一键应用到 Canvas 2D Context 的能力。
 *
 * @example
 * ```ts
 * const style = new Style({
 *   fillStyle: FillStyle.fromColor(Color.WHITE),
 *   strokeStyle: StrokeStyle.fromHex('#333', 2),
 * })
 * style.applyToContext(ctx, 200, 100)
 * ```
 */
export default class Style implements ISerializable {
  public readonly type: StyleType = StyleType.STYLE;
  fillStyle: FillStyle;
  strokeStyle: StrokeStyle;
  shadowStyle: ShadowStyle;

  /**
   * 构造综合样式
   *
   * 根据传入的配置项初始化综合样式容器，包含填充、描边、阴影三大子样式。
   * 未指定的子样式使用合理默认值：白色填充、黑色 1px 描边、无阴影。
   *
   * @param options - 样式配置对象
   * @param options.fillStyle - 填充样式，默认白色纯色填充
   * @param options.strokeStyle - 描边样式，默认黑色 1px 实线
   * @param options.shadowStyle - 阴影样式，默认无阴影
   * @returns Style 实例
   * @example
   * ```ts
   * const style = new Style({
   *   fillStyle: new FillStyle({ fillType: 'color', color: Color.BLUE }),
   *   strokeStyle: new StrokeStyle({ color: Color.BLACK, width: 2 }),
   * })
   * ```
   */
  constructor(
    options: {
      fillStyle?: FillStyle;
      strokeStyle?: StrokeStyle;
      shadowStyle?: ShadowStyle;
    } = {},
  ) {
    const {
      fillStyle = new FillStyle({ fillType: "color", color: Color.WHITE }),
      strokeStyle = new StrokeStyle({
        strokeType: "color",
        color: Color.BLACK,
        width: 1,
      }),
      shadowStyle = ShadowStyle.NONE,
    } = options;

    this.fillStyle = fillStyle;
    this.strokeStyle = strokeStyle;
    this.shadowStyle = shadowStyle;
  }

  /**
   * 应用到Canvas上下文
   *
   * 将所有子样式一次性应用到 Canvas 2D 上下文，
   * 依次设置阴影 → 描边 → 填充。width/height 为图形包围盒尺寸，用于渐变颜色场计算。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @param width - 图形包围盒宽度，默认 100
   * @param height - 图形包围盒高度，默认 100
   * @returns void
   * @example
   * ```ts
   * style.applyToContext(ctx, rect.width, rect.height)
   * ctx.fillRect(0, 0, rect.width, rect.height)
   * ctx.strokeRect(0, 0, rect.width, rect.height)
   * ```
   */
  applyToContext(
    ctx: CanvasRenderingContext2D,
    width: number = 100,
    height: number = 100,
  ): void {
    // 应用阴影样式
    this.shadowStyle.applyToContext(ctx);

    // 应用描边样式
    this.strokeStyle.applyToContext(ctx, width, height);

    // 应用填充样式
    this.fillStyle.applyToContext(ctx, width, height);
  }

  /**
   * 设置填充样式
   *
   * 替换当前的填充样式为新的 FillStyle 实例。支持链式调用。
   *
   * @param fillStyle - 新的填充样式
   * @returns 当前 Style 实例（链式调用）
   * @example
   * ```ts
   * style.setFillStyle(FillStyle.fromColor(Color.RED))
   * ```
   */
  setFillStyle(fillStyle: FillStyle): Style {
    this.fillStyle = fillStyle;
    return this;
  }

  /**
   * 设置描边样式
   *
   * 替换当前的描边样式为新的 StrokeStyle 实例。支持链式调用。
   *
   * @param strokeStyle - 新的描边样式
   * @returns 当前 Style 实例（链式调用）
   * @example
   * ```ts
   * style.setStrokeStyle(StrokeStyle.fromHex('#FF0000', 3))
   * ```
   */
  setStrokeStyle(strokeStyle: StrokeStyle): Style {
    this.strokeStyle = strokeStyle;
    return this;
  }

  /**
   * 设置阴影样式
   *
   * 替换当前的阴影样式为新的 ShadowStyle 实例。支持链式调用。
   *
   * @param shadowStyle - 新的阴影样式
   * @returns 当前 Style 实例（链式调用）
   * @example
   * ```ts
   * style.setShadowStyle(ShadowStyle.SOFT_DROP)
   * ```
   */
  setShadowStyle(shadowStyle: ShadowStyle): Style {
    this.shadowStyle = shadowStyle;
    return this;
  }

  /**
   * 设置填充颜色
   *
   * 快捷方法，直接设置填充子样式的颜色而无需创建新的 FillStyle。支持链式调用。
   *
   * @param color - 要设置的填充颜色
   * @returns 当前 Style 实例（链式调用）
   * @example
   * ```ts
   * style.setFillColor(Color.BLUE)
   * ```
   */
  setFillColor(color: Color): Style {
    this.fillStyle.setColor(color);
    return this;
  }

  /**
   * 设置描边颜色
   *
   * 快捷方法，直接设置描边子样式的颜色而无需创建新的 StrokeStyle。支持链式调用。
   *
   * @param color - 要设置的描边颜色
   * @returns 当前 Style 实例（链式调用）
   * @example
   * ```ts
   * style.setStrokeColor(Color.RED)
   * ```
   */
  setStrokeColor(color: Color): Style {
    this.strokeStyle.setColor(color);
    return this;
  }

  /**
   * 设置描边宽度
   *
   * 快捷方法，直接设置描边子样式的线宽而无需创建新的 StrokeStyle。支持链式调用。
   *
   * @param width - 描边线宽（像素）
   * @returns 当前 Style 实例（链式调用）
   * @example
   * ```ts
   * style.setStrokeWidth(3)
   * ```
   */
  setStrokeWidth(width: number): Style {
    this.strokeStyle.setWidth(width);
    return this;
  }

  /**
   * 启用投影阴影
   *
   * 快捷方法，启用 drop-shadow 效果，可自定义偏移、模糊和透明度参数。支持链式调用。
   *
   * @param offsetX - 阴影水平偏移量，默认 2
   * @param offsetY - 阴影垂直偏移量，默认 2
   * @param blur - 阴影模糊半径，默认 4
   * @param opacity - 阴影透明度，默认 0.3
   * @returns 当前 Style 实例（链式调用）
   * @example
   * ```ts
   * style.enableShadow(4, 4, 8, 0.5)
   * ```
   */
  enableShadow(
    offsetX: number = 2,
    offsetY: number = 2,
    blur: number = 4,
    opacity: number = 0.3,
  ): Style {
    this.shadowStyle = ShadowStyle.dropShadow(offsetX, offsetY, blur, opacity);
    return this;
  }

  /**
   * 禁用阴影
   *
   * 快捷方法，将阴影样式重置为无阴影状态。支持链式调用。
   *
   * @returns 当前 Style 实例（链式调用）
   * @example
   * ```ts
   * style.disableShadow()
   * ```
   */
  disableShadow(): Style {
    this.shadowStyle = ShadowStyle.NONE;
    return this;
  }

  /**
   * 序列化为JSON
   *
   * 将综合样式及其所有子样式序列化为纯 JSON 对象，支持持久化存储。
   *
   * @returns 包含 fillStyle、strokeStyle、shadowStyle 的 JSON 对象
   * @example
   * ```ts
   * const json = style.toJSON()
   * localStorage.setItem('style', JSON.stringify(json))
   * ```
   */
  toJSON(): any {
    return {
      fillStyle: this.fillStyle.toJSON(),
      strokeStyle: this.strokeStyle.toJSON(),
      shadowStyle: this.shadowStyle.toJSON(),
    };
  }

  /**
   * 从JSON反序列化
   *
   * 从 JSON 对象重建 Style 实例，是 toJSON 的逆操作。
   * 会递归重建所有子样式（FillStyle、StrokeStyle、ShadowStyle）。
   *
   * @param data - 由 toJSON 生成的 JSON 对象
   * @returns 重建的 Style 实例
   * @example
   * ```ts
   * const json = style.toJSON()
   * const restored = Style.fromJSON(json)
   * console.log(style.equals(restored)) // true
   * ```
   */
  static fromJSON(data: any): Style {
    return new Style({
      fillStyle: FillStyle.fromJSON(data.fillStyle),
      strokeStyle: StrokeStyle.fromJSON(data.strokeStyle),
      shadowStyle: ShadowStyle.fromJSON(data.shadowStyle),
    });
  }

  /**
   * 深拷贝
   *
   * 创建当前综合样式的完整深拷贝，包含所有子样式的独立副本。
   *
   * @returns 当前 Style 的深拷贝实例
   * @example
   * ```ts
   * const copy = style.copy()
   * copy.setFillColor(Color.RED) // 不影响原始 style
   * ```
   */
  copy(): Style {
    return new Style({
      fillStyle: this.fillStyle.copy(),
      strokeStyle: this.strokeStyle.copy(),
      shadowStyle: this.shadowStyle.copy(),
    });
  }

  /**
   * 判断相等
   *
   * 逐子样式比较两个综合样式是否完全相等，包含填充、描边、阴影三个维度的比较。
   *
   * @param other - 要比较的另一个 Style 实例
   * @returns 如果所有子样式都相等则返回 true，否则返回 false
   * @example
   * ```ts
   * const a = new Style()
   * const b = a.copy()
   * console.log(a.equals(b)) // true
   * ```
   */
  equals(other: Style): boolean {
    return (
      this.fillStyle.equals(other.fillStyle) &&
      this.strokeStyle.equals(other.strokeStyle) &&
      this.shadowStyle.equals(other.shadowStyle)
    );
  }

  /**
   * 创建一个新 Style，用 computedStyle 中非 null 的子样式覆盖当前样式。
   *
   * 用于 View 层渲染管线：defaultStyle.withOverrides(computedStyle) → mergedStyle。
   * 不修改当前实例，返回新实例。
   *
   * @param overrides - 覆盖配置，fill/stroke/shadow 为 null 时保留当前值
   * @returns 合并后的新 Style 实例
   * @example
   * ```ts
   * const merged = defaultStyle.withOverrides({
   *   fill: computedStyle.fill,       // FillStyle | null
   *   stroke: computedStyle.stroke,   // StrokeStyle | null
   *   shadow: computedStyle.shadow,   // ShadowStyle | null
   * })
   * graph.render(ctx, merged)
   * ```
   */
  withOverrides(overrides: {
    fill?: FillStyle | null;
    stroke?: StrokeStyle | null;
    shadow?: ShadowStyle | null;
  }): Style {
    return new Style({
      fillStyle: overrides.fill ?? this.fillStyle,
      strokeStyle: overrides.stroke ?? this.strokeStyle,
      shadowStyle: overrides.shadow ?? this.shadowStyle,
    });
  }

  // ── 预定义样式 ──
  static readonly DEFAULT = new Style();
  static readonly FILL_ONLY = new Style({
    fillStyle: new FillStyle({ fillType: "color", color: Color.WHITE }),
    strokeStyle: new StrokeStyle({
      strokeType: "color",
      color: Color.TRANSPARENT,
      width: 0,
    }),
  });
  static readonly STROKE_ONLY = new Style({
    fillStyle: new FillStyle({ fillType: "color", color: Color.TRANSPARENT }),
    strokeStyle: new StrokeStyle({
      strokeType: "color",
      color: Color.BLACK,
      width: 1,
    }),
  });
  static readonly FILL_AND_STROKE = new Style({
    fillStyle: new FillStyle({ fillType: "color", color: Color.WHITE }),
    strokeStyle: new StrokeStyle({
      strokeType: "color",
      color: Color.BLACK,
      width: 1,
    }),
  });
  static readonly WITH_SHADOW = new Style({
    fillStyle: new FillStyle({ fillType: "color", color: Color.WHITE }),
    strokeStyle: new StrokeStyle({
      strokeType: "color",
      color: Color.BLACK,
      width: 1,
    }),
    shadowStyle: ShadowStyle.SOFT_DROP,
  });
}
