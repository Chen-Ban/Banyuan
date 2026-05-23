import Color from "./Color";
import { STYLETYPE } from "@/foundation/constants";
import type { ISerializable } from "@/types";

/**
 * 阴影样式
 *
 * 描述：表示图形元素的阴影效果，支持颜色、偏移、模糊半径、透明度等属性配置，
 * 并提供 CSS 阴影字符串生成、Canvas 2D 上下文应用、序列化/反序列化等能力。
 *
 * @example
 * ```ts
 * const shadow = new ShadowStyle({ color: Color.BLACK, offsetX: 2, offsetY: 2, blur: 4, opacity: 0.3, enabled: true });
 * shadow.applyToContext(ctx);
 * ```
 */
export default class ShadowStyle implements ISerializable {
  public readonly type: STYLETYPE = STYLETYPE.SHADOW_STYLE;
  color: Color;
  offsetX: number;
  offsetY: number;
  blur: number;
  opacity: number;
  enabled: boolean;

  /**
   * 构造阴影样式
   *
   * 描述：创建一个 ShadowStyle 实例，所有属性均可选并提供默认值。
   *
   * @param options - 阴影样式配置对象
   * @param options.color - 阴影颜色，默认为 Color.BLACK
   * @param options.offsetX - 水平偏移量（px），默认为 0
   * @param options.offsetY - 垂直偏移量（px），默认为 0
   * @param options.blur - 模糊半径（px），最小为 0，默认为 0
   * @param options.opacity - 透明度，范围 [0, 1]，默认为 0.5
   * @param options.enabled - 是否启用阴影，默认为 false
   * @returns ShadowStyle 实例
   *
   * @example
   * ```ts
   * const shadow = new ShadowStyle({ color: Color.RED, offsetX: 3, offsetY: 3, blur: 6, opacity: 0.4, enabled: true });
   * ```
   */
  constructor(
    options: {
      color?: Color;
      offsetX?: number;
      offsetY?: number;
      blur?: number;
      opacity?: number;
      enabled?: boolean;
    } = {},
  ) {
    const {
      color = Color.BLACK,
      offsetX = 0,
      offsetY = 0,
      blur = 0,
      opacity = 0.5,
      enabled = false,
    } = options;

    this.color = color;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.blur = Math.max(0, blur);
    this.opacity = Math.max(0, Math.min(1, opacity));
    this.enabled = enabled;
  }

  /**
   * 获取 CSS 阴影字符串
   *
   * 描述：将当前阴影样式转换为 CSS box-shadow 格式的字符串，未启用时返回 "none"。
   *
   * @returns CSS 阴影值字符串，如 "2px 2px 4px rgba(0, 0, 0, 0.3)" 或 "none"
   *
   * @example
   * ```ts
   * const shadow = ShadowStyle.dropShadow(2, 2, 4, 0.3);
   * console.log(shadow.cssShadow); // "2px 2px 4px rgba(0, 0, 0, 0.3)"
   * ```
   */
  get cssShadow(): string {
    if (!this.enabled) return "none";

    const { r, g, b } = this.color;
    return `${this.offsetX}px ${this.offsetY}px ${this.blur}px rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${this.opacity})`;
  }

  /**
   * 设置颜色
   *
   * 描述：设置阴影的颜色，返回当前实例以支持链式调用。
   *
   * @param color - 新的阴影颜色
   * @returns 当前 ShadowStyle 实例
   *
   * @example
   * ```ts
   * shadow.setColor(Color.RED).setBlur(8);
   * ```
   */
  setColor(color: Color): ShadowStyle {
    this.color = color;
    return this;
  }

  /**
   * 设置偏移
   *
   * 描述：设置阴影的水平和垂直偏移量，返回当前实例以支持链式调用。
   *
   * @param offsetX - 水平偏移量（px）
   * @param offsetY - 垂直偏移量（px）
   * @returns 当前 ShadowStyle 实例
   *
   * @example
   * ```ts
   * shadow.setOffset(4, 4);
   * ```
   */
  setOffset(offsetX: number, offsetY: number): ShadowStyle {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    return this;
  }

  /**
   * 设置模糊半径
   *
   * 描述：设置阴影的模糊半径，值会被限制为非负数，返回当前实例以支持链式调用。
   *
   * @param blur - 模糊半径（px），负值会被修正为 0
   * @returns 当前 ShadowStyle 实例
   *
   * @example
   * ```ts
   * shadow.setBlur(10);
   * ```
   */
  setBlur(blur: number): ShadowStyle {
    this.blur = Math.max(0, blur);
    return this;
  }

  /**
   * 设置透明度
   *
   * 描述：设置阴影的透明度，值会被限制在 [0, 1] 范围内，返回当前实例以支持链式调用。
   *
   * @param opacity - 透明度值，范围 [0, 1]
   * @returns 当前 ShadowStyle 实例
   *
   * @example
   * ```ts
   * shadow.setOpacity(0.7);
   * ```
   */
  setOpacity(opacity: number): ShadowStyle {
    this.opacity = Math.max(0, Math.min(1, opacity));
    return this;
  }

  /**
   * 启用/禁用阴影
   *
   * 描述：设置阴影是否启用，返回当前实例以支持链式调用。
   *
   * @param enabled - 是否启用阴影
   * @returns 当前 ShadowStyle 实例
   *
   * @example
   * ```ts
   * shadow.setEnabled(true);
   * ```
   */
  setEnabled(enabled: boolean): ShadowStyle {
    this.enabled = enabled;
    return this;
  }

  /**
   * 应用样式到 Canvas 上下文
   *
   * 描述：将阴影样式属性应用到 Canvas 2D 渲染上下文。启用时设置阴影属性，禁用时重置为透明。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @returns void
   *
   * @example
   * ```ts
   * const ctx = canvas.getContext('2d')!;
   * shadow.applyToContext(ctx);
   * ctx.fillRect(10, 10, 100, 100);
   * ```
   */
  applyToContext(ctx: CanvasRenderingContext2D): void {
    if (this.enabled) {
      const { r, g, b } = this.color;
      ctx.shadowColor = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${this.opacity})`;
      ctx.shadowOffsetX = this.offsetX;
      ctx.shadowOffsetY = this.offsetY;
      ctx.shadowBlur = this.blur;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
    }
  }

  // ── 序列化 ──

  /**
   * 序列化为 JSON
   *
   * 描述：将阴影样式实例序列化为可持久化的 JSON 对象。
   *
   * @returns 包含所有阴影属性的 JSON 对象
   *
   * @example
   * ```ts
   * const json = shadow.toJSON();
   * // { color: {...}, offsetX: 2, offsetY: 2, blur: 4, opacity: 0.3, enabled: true }
   * ```
   */
  toJSON(): any {
    return {
      color: this.color.toJSON(),
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      blur: this.blur,
      opacity: this.opacity,
      enabled: this.enabled,
    };
  }

  /**
   * 从 JSON 反序列化
   *
   * 描述：从 JSON 数据还原一个 ShadowStyle 实例。
   *
   * @param data - 包含阴影属性的 JSON 对象
   * @returns 还原后的 ShadowStyle 实例
   *
   * @example
   * ```ts
   * const shadow = ShadowStyle.fromJSON({ color: { r: 0, g: 0, b: 0 }, offsetX: 2, offsetY: 2, blur: 4, opacity: 0.3, enabled: true });
   * ```
   */
  static fromJSON(data: any): ShadowStyle {
    return new ShadowStyle({
      color: Color.fromJSON(data.color),
      offsetX: data.offsetX,
      offsetY: data.offsetY,
      blur: data.blur,
      opacity: data.opacity,
      enabled: data.enabled,
    });
  }

  /**
   * 复制样式
   *
   * 描述：深拷贝当前阴影样式，返回一个属性完全相同的新实例。
   *
   * @returns 新的 ShadowStyle 实例（深拷贝）
   *
   * @example
   * ```ts
   * const copy = shadow.copy();
   * copy.setBlur(20); // 不影响原实例
   * ```
   */
  copy(): ShadowStyle {
    return new ShadowStyle({
      color: this.color.copy(),
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      blur: this.blur,
      opacity: this.opacity,
      enabled: this.enabled,
    });
  }

  /**
   * 比较是否相等
   *
   * 描述：判断当前阴影样式与另一个阴影样式是否在所有属性上完全相等。
   *
   * @param other - 用于比较的另一个 ShadowStyle 实例
   * @returns 两者所有属性相等时返回 true，否则返回 false
   *
   * @example
   * ```ts
   * const a = ShadowStyle.dropShadow();
   * const b = a.copy();
   * console.log(a.equals(b)); // true
   * ```
   */
  equals(other: ShadowStyle): boolean {
    return (
      this.color.equals(other.color) &&
      this.offsetX === other.offsetX &&
      this.offsetY === other.offsetY &&
      this.blur === other.blur &&
      this.opacity === other.opacity &&
      this.enabled === other.enabled
    );
  }

  // 静态工厂方法

  /**
   * 从十六进制颜色创建阴影
   *
   * 描述：通过十六进制颜色字符串及偏移、模糊、透明度参数快速创建一个已启用的阴影样式。
   *
   * @param hex - 十六进制颜色字符串（如 "#FF0000"）
   * @param offsetX - 水平偏移量（px），默认为 0
   * @param offsetY - 垂直偏移量（px），默认为 0
   * @param blur - 模糊半径（px），默认为 0
   * @param opacity - 透明度，范围 [0, 1]，默认为 0.5
   * @returns 已启用的 ShadowStyle 实例
   *
   * @example
   * ```ts
   * const shadow = ShadowStyle.fromHex("#333333", 2, 2, 6, 0.4);
   * ```
   */
  static fromHex(
    hex: string,
    offsetX: number = 0,
    offsetY: number = 0,
    blur: number = 0,
    opacity: number = 0.5,
  ): ShadowStyle {
    return new ShadowStyle({
      color: Color.fromHex(hex),
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    });
  }

  /**
   * 从 HSL 颜色创建阴影
   *
   * 描述：通过 HSL 颜色值及偏移、模糊、透明度参数快速创建一个已启用的阴影样式。
   *
   * @param h - 色相，范围 [0, 360]
   * @param s - 饱和度，范围 [0, 100]
   * @param l - 亮度，范围 [0, 100]
   * @param offsetX - 水平偏移量（px），默认为 0
   * @param offsetY - 垂直偏移量（px），默认为 0
   * @param blur - 模糊半径（px），默认为 0
   * @param opacity - 透明度，范围 [0, 1]，默认为 0.5
   * @returns 已启用的 ShadowStyle 实例
   *
   * @example
   * ```ts
   * const shadow = ShadowStyle.fromHSL(210, 80, 50, 3, 3, 8, 0.5);
   * ```
   */
  static fromHSL(
    h: number,
    s: number,
    l: number,
    offsetX: number = 0,
    offsetY: number = 0,
    blur: number = 0,
    opacity: number = 0.5,
  ): ShadowStyle {
    return new ShadowStyle({
      color: Color.fromHSL(h, s, l),
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    });
  }

  /**
   * 从 RGB 颜色创建阴影
   *
   * 描述：通过 RGB 颜色值及偏移、模糊、透明度参数快速创建一个已启用的阴影样式。
   *
   * @param r - 红色通道，范围 [0, 255]
   * @param g - 绿色通道，范围 [0, 255]
   * @param b - 蓝色通道，范围 [0, 255]
   * @param offsetX - 水平偏移量（px），默认为 0
   * @param offsetY - 垂直偏移量（px），默认为 0
   * @param blur - 模糊半径（px），默认为 0
   * @param opacity - 透明度，范围 [0, 1]，默认为 0.5
   * @returns 已启用的 ShadowStyle 实例
   *
   * @example
   * ```ts
   * const shadow = ShadowStyle.fromRGB(100, 100, 100, 2, 2, 5, 0.4);
   * ```
   */
  static fromRGB(
    r: number,
    g: number,
    b: number,
    offsetX: number = 0,
    offsetY: number = 0,
    blur: number = 0,
    opacity: number = 0.5,
  ): ShadowStyle {
    return new ShadowStyle({
      color: new Color(r, g, b),
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    });
  }

  /**
   * 创建投影效果
   *
   * 描述：创建常见的投影（drop shadow）效果，使用黑色阴影并默认启用。
   *
   * @param offsetX - 水平偏移量（px），默认为 2
   * @param offsetY - 垂直偏移量（px），默认为 2
   * @param blur - 模糊半径（px），默认为 4
   * @param opacity - 透明度，范围 [0, 1]，默认为 0.3
   * @returns 已启用的黑色投影 ShadowStyle 实例
   *
   * @example
   * ```ts
   * const shadow = ShadowStyle.dropShadow(3, 3, 6, 0.4);
   * ```
   */
  static dropShadow(
    offsetX: number = 2,
    offsetY: number = 2,
    blur: number = 4,
    opacity: number = 0.3,
  ): ShadowStyle {
    return new ShadowStyle({
      color: Color.BLACK,
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    });
  }

  /**
   * 创建发光效果
   *
   * 描述：创建无偏移的发光（glow）效果，通过指定颜色和模糊半径实现光晕。
   *
   * @param color - 发光颜色，默认为 Color.WHITE
   * @param blur - 模糊半径（px），默认为 10
   * @param opacity - 透明度，范围 [0, 1]，默认为 0.8
   * @returns 已启用的发光 ShadowStyle 实例
   *
   * @example
   * ```ts
   * const glow = ShadowStyle.glow(Color.BLUE, 12, 0.6);
   * ```
   */
  static glow(
    color: Color = Color.WHITE,
    blur: number = 10,
    opacity: number = 0.8,
  ): ShadowStyle {
    return new ShadowStyle({
      color,
      offsetX: 0,
      offsetY: 0,
      blur,
      opacity,
      enabled: true,
    });
  }

  /**
   * 创建内阴影效果
   *
   * 描述：创建内阴影（inner shadow）效果，模拟元素内部的凹陷感。
   *
   * @param color - 内阴影颜色，默认为 Color.BLACK
   * @param offsetX - 水平偏移量（px），默认为 1
   * @param offsetY - 垂直偏移量（px），默认为 1
   * @param blur - 模糊半径（px），默认为 2
   * @param opacity - 透明度，范围 [0, 1]，默认为 0.5
   * @returns 已启用的内阴影 ShadowStyle 实例
   *
   * @example
   * ```ts
   * const inner = ShadowStyle.innerShadow(Color.BLACK, 2, 2, 4, 0.3);
   * ```
   */
  static innerShadow(
    color: Color = Color.BLACK,
    offsetX: number = 1,
    offsetY: number = 1,
    blur: number = 2,
    opacity: number = 0.5,
  ): ShadowStyle {
    return new ShadowStyle({
      color,
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    });
  }

  // 预定义样式
  /** 无阴影 */
  static readonly NONE = new ShadowStyle({
    color: Color.BLACK,
    offsetX: 0,
    offsetY: 0,
    blur: 0,
    opacity: 0,
    enabled: false,
  });
  /** 柔和投影 */
  static readonly SOFT_DROP = ShadowStyle.dropShadow(2, 2, 4, 0.3);
  /** 硬投影 */
  static readonly HARD_DROP = ShadowStyle.dropShadow(2, 2, 0, 0.5);
  /** 白色发光 */
  static readonly GLOW_WHITE = ShadowStyle.glow(Color.WHITE, 10, 0.8);
  /** 蓝色发光 */
  static readonly GLOW_BLUE = ShadowStyle.glow(Color.BLUE, 8, 0.6);
  /** 内阴影 */
  static readonly INNER_SHADOW = ShadowStyle.innerShadow();
}
