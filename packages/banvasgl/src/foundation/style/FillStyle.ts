import Color from "./Color";
import { LinearGradient, RadialGradient, ConicGradient } from "./gradient/index";
import Image from "./Image";
import { StyleType } from '@/foundation/constants';
import type { ISerializable } from '@/types';

/** 填充类型枚举：纯色、三种渐变、图片图案 */
export type FillType = "color" | "linearGradient" | "radialGradient" | "conicGradient" | "image";

/**
 * 填充样式
 *
 * 封装 Canvas 2D 的 fillStyle，支持纯色、线性/径向/圆锥渐变以及图片图案五种填充模式。
 * 通过 `fillType` 字段区分当前激活的填充方式，各渐变/图案属性独立存储。
 *
 * @example
 * ```ts
 * // 创建纯色填充
 * const fill = FillStyle.fromHex('#ff0000');
 *
 * // 创建渐变填充
 * const gradientFill = FillStyle.fromLinearGradient(LinearGradient.SUNSET);
 *
 * // 应用到 Canvas 上下文
 * fill.applyToContext(ctx, 200, 100);
 * ctx.fillRect(0, 0, 200, 100);
 * ```
 */
export default class FillStyle implements ISerializable {
  public readonly type: StyleType = StyleType.FILL_STYLE;
  fillType: FillType;
  color: Color;
  linearGradient: LinearGradient | null;
  radialGradient: RadialGradient | null;
  conicGradient: ConicGradient | null;
  image: Image | null;

  /**
   * 构造填充样式
   *
   * 根据传入的选项创建一个填充样式实例，默认为白色纯色填充。
   *
   * @param options - 填充样式配置选项
   * @param options.fillType - 填充类型，默认 "color"
   * @param options.color - 纯色填充颜色，默认 Color.WHITE
   * @param options.linearGradient - 线性渐变对象，默认 null
   * @param options.radialGradient - 径向渐变对象，默认 null
   * @param options.conicGradient - 圆锥渐变对象，默认 null
   * @param options.image - 图片图案对象，默认 null
   * @returns FillStyle 实例
   *
   * @example
   * ```ts
   * const fill = new FillStyle({
   *   fillType: "linearGradient",
   *   linearGradient: new LinearGradient({ angle: 90 })
   * });
   * ```
   */
  constructor(options: {
    fillType?: FillType;
    color?: Color;
    linearGradient?: LinearGradient | null;
    radialGradient?: RadialGradient | null;
    conicGradient?: ConicGradient | null;
    image?: Image | null;
  } = {}) {
    const {
      fillType = "color",
      color = Color.WHITE,
      linearGradient = null,
      radialGradient = null,
      conicGradient = null,
      image = null,
    } = options;

    this.fillType = fillType;
    this.color = color;
    this.linearGradient = linearGradient;
    this.radialGradient = radialGradient;
    this.conicGradient = conicGradient;
    this.image = image;
  }

  /**
   * 应用填充样式到上下文
   *
   * 将当前填充样式应用到 Canvas 2D 渲染上下文。渐变类型需要 width/height 来确定渐变的坐标范围（颜色场大小）。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @param width - 渐变坐标范围宽度，默认 100
   * @param height - 渐变坐标范围高度，默认 100
   * @returns void
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromLinearGradient(LinearGradient.SUNSET);
   * fill.applyToContext(ctx, 200, 150);
   * ctx.fillRect(0, 0, 200, 150);
   * ```
   */
  applyToContext(ctx: CanvasRenderingContext2D, width: number = 100, height: number = 100): void {
    switch (this.fillType) {
      case "color":
        ctx.fillStyle = this.color.rgba;
        break;
      case "linearGradient":
        if (this.linearGradient) {
          ctx.fillStyle = this.linearGradient.createCanvasGradient(ctx, width, height);
        }
        break;
      case "radialGradient":
        if (this.radialGradient) {
          ctx.fillStyle = this.radialGradient.createCanvasGradient(ctx, width, height);
        }
        break;
      case "conicGradient":
        if (this.conicGradient) {
          ctx.fillStyle = this.conicGradient.createCanvasGradient(ctx, width, height);
        }
        break;
      case "image":
        if (this.image) {
          const canvasPattern = this.image.createCanvasPattern(ctx);
          if (canvasPattern) {
            ctx.fillStyle = canvasPattern;
          }
        }
        break;
    }
  }

  /**
   * 设置纯色填充
   *
   * 切换为纯色填充模式，清除所有渐变和图案设置，支持链式调用。
   *
   * @param color - 要设置的填充颜色
   * @returns 当前 FillStyle 实例（链式调用）
   *
   * @example
   * ```ts
   * const fill = new FillStyle();
   * fill.setColor(Color.RED).applyToContext(ctx, 100, 100);
   * ```
   */
  setColor(color: Color): FillStyle {
    this.fillType = "color";
    this.color = color;
    this.clearGradients();
    this.image = null;
    return this;
  }

  /**
   * 设置线性渐变填充
   *
   * 切换为线性渐变填充模式，清除其他渐变和图案设置，支持链式调用。
   *
   * @param gradient - 线性渐变对象
   * @returns 当前 FillStyle 实例（链式调用）
   *
   * @example
   * ```ts
   * const fill = new FillStyle();
   * fill.setLinearGradient(LinearGradient.SUNSET).applyToContext(ctx, 200, 100);
   * ```
   */
  setLinearGradient(gradient: LinearGradient): FillStyle {
    this.fillType = "linearGradient";
    this.clearGradients();
    this.linearGradient = gradient;
    this.image = null;
    return this;
  }

  /**
   * 设置径向渐变填充
   *
   * 切换为径向渐变填充模式，清除其他渐变和图案设置，支持链式调用。
   *
   * @param gradient - 径向渐变对象
   * @returns 当前 FillStyle 实例（链式调用）
   *
   * @example
   * ```ts
   * const fill = new FillStyle();
   * fill.setRadialGradient(RadialGradient.FIRE).applyToContext(ctx, 100, 100);
   * ```
   */
  setRadialGradient(gradient: RadialGradient): FillStyle {
    this.fillType = "radialGradient";
    this.clearGradients();
    this.radialGradient = gradient;
    this.image = null;
    return this;
  }

  /**
   * 设置圆锥渐变填充
   *
   * 切换为圆锥渐变填充模式，清除其他渐变和图案设置，支持链式调用。
   *
   * @param gradient - 圆锥渐变对象
   * @returns 当前 FillStyle 实例（链式调用）
   *
   * @example
   * ```ts
   * const conicGrad = new ConicGradient({ startAngle: 0 });
   * const fill = new FillStyle();
   * fill.setConicGradient(conicGrad).applyToContext(ctx, 100, 100);
   * ```
   */
  setConicGradient(gradient: ConicGradient): FillStyle {
    this.fillType = "conicGradient";
    this.clearGradients();
    this.conicGradient = gradient;
    this.image = null;
    return this;
  }

  /**
   * 设置图片图案填充
   *
   * 切换为图片图案填充模式，清除所有渐变设置，支持链式调用。
   *
   * @param image - 图片图案对象
   * @returns 当前 FillStyle 实例（链式调用）
   *
   * @example
   * ```ts
   * const img = new Image({ src: 'texture.png' });
   * const fill = new FillStyle();
   * fill.setPattern(img).applyToContext(ctx, 200, 200);
   * ```
   */
  setPattern(image: Image): FillStyle {
    this.fillType = "image";
    this.image = image;
    this.clearGradients();
    return this;
  }

  private clearGradients(): void {
    this.linearGradient = null;
    this.radialGradient = null;
    this.conicGradient = null;
  }

  /**
   * 序列化为 JSON
   *
   * 将当前填充样式序列化为可持久化的 JSON 对象，包含所有填充类型的数据。
   *
   * @returns 序列化后的 JSON 对象
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromHex('#ff0000');
   * const json = fill.toJSON();
   * // { fillType: "color", color: {...}, linearGradient: null, ... }
   * ```
   */
  toJSON(): any {
    return {
      fillType: this.fillType,
      color: this.color.toJSON(),
      linearGradient: this.linearGradient?.toJSON() ?? null,
      radialGradient: this.radialGradient?.toJSON() ?? null,
      conicGradient: this.conicGradient?.toJSON() ?? null,
      image: this.image?.toJSON() ?? null,
    }
  }

  /**
   * 从 JSON 反序列化
   *
   * 从 JSON 对象还原一个 FillStyle 实例，自动解析各填充类型的子对象。
   *
   * @param data - 通过 toJSON() 序列化得到的 JSON 对象
   * @returns 还原后的 FillStyle 实例
   *
   * @example
   * ```ts
   * const json = fill.toJSON();
   * const restored = FillStyle.fromJSON(json);
   * console.log(restored.equals(fill)); // true
   * ```
   */
  static fromJSON(data: any): FillStyle {
    return new FillStyle({
      fillType: data.fillType,
      color: Color.fromJSON(data.color),
      linearGradient: data.linearGradient ? LinearGradient.fromJSON(data.linearGradient) : null,
      radialGradient: data.radialGradient ? RadialGradient.fromJSON(data.radialGradient) : null,
      conicGradient: data.conicGradient ? ConicGradient.fromJSON(data.conicGradient) : null,
      image: data.image ? Image.fromJSON(data.image) : null,
    })
  }

  /**
   * 深拷贝填充样式
   *
   * 创建当前填充样式的深拷贝，所有子对象（颜色、渐变、图片）均独立复制。
   *
   * @returns 深拷贝后的新 FillStyle 实例
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromHex('#00ff00');
   * const cloned = fill.copy();
   * cloned.setColor(Color.RED);
   * console.log(fill.color.equals(Color.fromHex('#00ff00'))); // true（原实例不受影响）
   * ```
   */
  copy(): FillStyle {
    return new FillStyle({
      fillType: this.fillType,
      color: this.color.copy(),
      linearGradient: this.linearGradient?.copy() || null,
      radialGradient: this.radialGradient?.copy() || null,
      conicGradient: this.conicGradient?.copy() || null,
      image: this.image?.copy() || null,
    });
  }

  /**
   * 判断填充样式相等
   *
   * 比较两个填充样式是否相等，先比较填充类型，再比较对应类型的具体值。
   *
   * @param other - 要比较的另一个 FillStyle 实例
   * @returns 两个填充样式是否相等
   *
   * @example
   * ```ts
   * const a = FillStyle.fromHex('#ff0000');
   * const b = FillStyle.fromColor(Color.RED);
   * console.log(a.equals(b)); // true
   * ```
   */
  equals(other: FillStyle): boolean {
    if (this.fillType !== other.fillType) return false;

    switch (this.fillType) {
      case "color":
        return this.color.equals(other.color);
      case "linearGradient":
        return this.linearGradient !== null && other.linearGradient !== null &&
               this.linearGradient.equals(other.linearGradient);
      case "radialGradient":
        return this.radialGradient !== null && other.radialGradient !== null &&
               this.radialGradient.equals(other.radialGradient);
      case "conicGradient":
        return this.conicGradient !== null && other.conicGradient !== null &&
               this.conicGradient.equals(other.conicGradient);
      case "image":
        return this.image?.equals(other.image || new Image()) || false;
      default:
        return false;
    }
  }

  // ── 静态工厂方法 ──

  /**
   * 从颜色对象创建填充
   *
   * 使用 Color 对象创建一个纯色填充样式。
   *
   * @param color - Color 颜色对象
   * @returns 纯色填充样式实例
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromColor(Color.RED);
   * ```
   */
  static fromColor(color: Color): FillStyle {
    return new FillStyle({ fillType: "color", color });
  }

  /**
   * 从 HEX 字符串创建填充
   *
   * 使用十六进制颜色字符串创建一个纯色填充样式。
   *
   * @param hex - 十六进制颜色字符串，如 "#ff0000" 或 "#f00"
   * @returns 纯色填充样式实例
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromHex('#3498db');
   * ```
   */
  static fromHex(hex: string): FillStyle {
    return new FillStyle({ fillType: "color", color: Color.fromHex(hex) });
  }

  /**
   * 从 HSL 创建填充
   *
   * 使用 HSL（色相、饱和度、亮度）值创建一个纯色填充样式。
   *
   * @param h - 色相值（0-360）
   * @param s - 饱和度（0-100）
   * @param l - 亮度（0-100）
   * @returns 纯色填充样式实例
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromHSL(210, 80, 50); // 蓝色
   * ```
   */
  static fromHSL(h: number, s: number, l: number): FillStyle {
    return new FillStyle({ fillType: "color", color: Color.fromHSL(h, s, l) });
  }

  /**
   * 从 RGB 创建填充
   *
   * 使用 RGB（红、绿、蓝）值创建一个纯色填充样式，透明度默认为 1。
   *
   * @param r - 红色通道值（0-255）
   * @param g - 绿色通道值（0-255）
   * @param b - 蓝色通道值（0-255）
   * @returns 纯色填充样式实例
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromRGB(255, 128, 0); // 橙色
   * ```
   */
  static fromRGB(r: number, g: number, b: number): FillStyle {
    return new FillStyle({ fillType: "color", color: new Color(r, g, b) });
  }

  /**
   * 从 RGBA 创建填充
   *
   * 使用 RGBA（红、绿、蓝、透明度）值创建一个纯色填充样式。
   *
   * @param r - 红色通道值（0-255）
   * @param g - 绿色通道值（0-255）
   * @param b - 蓝色通道值（0-255）
   * @param a - 透明度（0-1）
   * @returns 纯色填充样式实例
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromRGBA(0, 0, 0, 0.5); // 半透明黑色
   * ```
   */
  static fromRGBA(r: number, g: number, b: number, a: number): FillStyle {
    return new FillStyle({ fillType: "color", color: new Color(r, g, b, a) });
  }

  /**
   * 从线性渐变创建填充
   *
   * 使用 LinearGradient 对象创建一个线性渐变填充样式。
   *
   * @param gradient - 线性渐变对象
   * @returns 线性渐变填充样式实例
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromLinearGradient(LinearGradient.SUNSET);
   * ```
   */
  static fromLinearGradient(gradient: LinearGradient): FillStyle {
    return new FillStyle({ fillType: "linearGradient", linearGradient: gradient });
  }

  /**
   * 从径向渐变创建填充
   *
   * 使用 RadialGradient 对象创建一个径向渐变填充样式。
   *
   * @param gradient - 径向渐变对象
   * @returns 径向渐变填充样式实例
   *
   * @example
   * ```ts
   * const fill = FillStyle.fromRadialGradient(RadialGradient.FIRE);
   * ```
   */
  static fromRadialGradient(gradient: RadialGradient): FillStyle {
    return new FillStyle({ fillType: "radialGradient", radialGradient: gradient });
  }

  /**
   * 从圆锥渐变创建填充
   *
   * 使用 ConicGradient 对象创建一个圆锥渐变填充样式。
   *
   * @param gradient - 圆锥渐变对象
   * @returns 圆锥渐变填充样式实例
   *
   * @example
   * ```ts
   * const conicGrad = new ConicGradient({ startAngle: 0 });
   * const fill = FillStyle.fromConicGradient(conicGrad);
   * ```
   */
  static fromConicGradient(gradient: ConicGradient): FillStyle {
    return new FillStyle({ fillType: "conicGradient", conicGradient: gradient });
  }

  /**
   * 从图片图案创建填充
   *
   * 使用 Image 对象创建一个图片图案填充样式。
   *
   * @param image - 图片图案对象
   * @returns 图片图案填充样式实例
   *
   * @example
   * ```ts
   * const img = new Image({ src: 'pattern.png' });
   * const fill = FillStyle.fromPattern(img);
   * ```
   */
  static fromPattern(image: Image): FillStyle {
    return new FillStyle({ fillType: "image", image });
  }

  // ── 预定义样式 ──
  static readonly TRANSPARENT = new FillStyle({ fillType: "color", color: Color.TRANSPARENT });
  static readonly WHITE = new FillStyle({ fillType: "color", color: Color.WHITE });
  static readonly BLACK = new FillStyle({ fillType: "color", color: Color.BLACK });
  static readonly RED = new FillStyle({ fillType: "color", color: Color.RED });
  static readonly GREEN = new FillStyle({ fillType: "color", color: Color.GREEN });
  static readonly BLUE = new FillStyle({ fillType: "color", color: Color.BLUE });
  static readonly YELLOW = new FillStyle({ fillType: "color", color: Color.YELLOW });
  static readonly CYAN = new FillStyle({ fillType: "color", color: Color.CYAN });
  static readonly MAGENTA = new FillStyle({ fillType: "color", color: Color.MAGENTA });

  // 预定义渐变
  static readonly RAINBOW_GRADIENT = new FillStyle({ fillType: "linearGradient", linearGradient: LinearGradient.HORIZONTAL_RAINBOW });
  static readonly SUNSET_GRADIENT = new FillStyle({ fillType: "linearGradient", linearGradient: LinearGradient.SUNSET });
  static readonly OCEAN_GRADIENT = new FillStyle({ fillType: "linearGradient", linearGradient: LinearGradient.OCEAN });
  static readonly FIRE_GRADIENT = new FillStyle({ fillType: "radialGradient", radialGradient: RadialGradient.FIRE });
}
