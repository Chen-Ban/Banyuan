import Color from "./Color";
import Gradient from "./Gradient";
import Image from "./Image";
import { STYLETYPE } from '@/core/constants';
import type { ISerializable } from '@/core/interfaces';

export type FillType = "color" | "gradient" | "image";

export default class FillStyle implements ISerializable {
  public readonly type: STYLETYPE = STYLETYPE.FILL_STYLE;
  fillType: FillType;
  color: Color;
  gradient: Gradient | null;
  image: Image | null;

  constructor(options: {
    fillType?: FillType;
    color?: Color;
    gradient?: Gradient | null;
    image?: Image | null;
  } = {}) {
    const {
      fillType = "color",
      color = Color.WHITE,
      gradient = null,
      image = null,
    } = options;

    this.fillType = fillType;
    this.color = color;
    this.gradient = gradient;
    this.image = image;
  }

  // 应用样式到 Canvas 上下文
  applyToContext(ctx: CanvasRenderingContext2D, width: number = 100, height: number = 100): void {
    switch (this.fillType) {
      case "color":
        ctx.fillStyle = this.color.rgba;
        break;
      case "gradient":
        if (this.gradient) {
          const canvasGradient = this.gradient.createCanvasGradient(ctx, width, height);
          if (canvasGradient) {
            ctx.fillStyle = canvasGradient;
          }
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

  // 设置为纯色填充
  setColor(color: Color): FillStyle {
    this.fillType = "color";
    this.color = color;
    this.gradient = null;
    this.image = null;
    return this;
  }

  // 设置为渐变填充
  setGradient(gradient: Gradient): FillStyle {
    this.fillType = "gradient";
    this.gradient = gradient;
    this.image = null;
    return this;
  }

  // 设置为图案填充
  setPattern(image: Image): FillStyle {
    this.fillType = "image";
    this.image = image;
    this.gradient = null;
    return this;
  }

  // ── 序列化 ──
  toJSON(): any {
    return {
      fillType: this.fillType,
      color: this.color.toJSON(),
      gradient: this.gradient?.toJSON() ?? null,
      image: this.image?.toJSON() ?? null,
    }
  }

  static fromJSON(data: any): FillStyle {
    return new FillStyle({
      fillType: data.fillType,
      color: Color.fromJSON(data.color),
      gradient: data.gradient ? Gradient.fromJSON(data.gradient) : null,
      image: data.image ? Image.fromJSON(data.image) : null,
    })
  }

  // 复制样式
  copy(): FillStyle {
    return new FillStyle({
      fillType: this.fillType,
      color: this.color.copy(),
      gradient: this.gradient?.copy() || null,
      image: this.image?.copy() || null,
    });
  }

  // 克隆并修改
  clone(): FillStyle {
    return this.copy();
  }

  // 比较是否相等
  equals(other: FillStyle): boolean {
    if (this.fillType !== other.fillType) return false;

    switch (this.fillType) {
      case "color":
        return this.color.equals(other.color);
      case "gradient":
        return this.gradient?.equals(other.gradient || new Gradient()) || false;
      case "image":
        return this.image?.equals(other.image || new Image()) || false;
      default:
        return false;
    }
  }

  // 静态工厂方法
  static fromColor(color: Color): FillStyle {
    return new FillStyle({
      fillType: "color",
      color,
    });
  }

  static fromHex(hex: string): FillStyle {
    return new FillStyle({
      fillType: "color",
      color: Color.fromHex(hex),
    });
  }

  static fromHSL(h: number, s: number, l: number): FillStyle {
    return new FillStyle({
      fillType: "color",
      color: Color.fromHSL(h, s, l),
    });
  }

  static fromRGB(r: number, g: number, b: number): FillStyle {
    return new FillStyle({
      fillType: "color",
      color: new Color(r, g, b),
    });
  }

  static fromRGBA(r: number, g: number, b: number, a: number): FillStyle {
    return new FillStyle({
      fillType: "color",
      color: new Color(r, g, b, a),
    });
  }

  static fromGradient(gradient: Gradient): FillStyle {
    return new FillStyle({
      fillType: "gradient",
      color: Color.WHITE,
      gradient,
    });
  }

  static fromPattern(image: Image): FillStyle {
    return new FillStyle({
      fillType: "image",
      color: Color.WHITE,
      image,
    });
  }

  // 预定义样式
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
  static readonly RAINBOW_GRADIENT = new FillStyle({ fillType: "gradient", color: Color.WHITE, gradient: Gradient.HORIZONTAL_RAINBOW });
  static readonly SUNSET_GRADIENT = new FillStyle({ fillType: "gradient", color: Color.WHITE, gradient: Gradient.SUNSET });
  static readonly OCEAN_GRADIENT = new FillStyle({ fillType: "gradient", color: Color.WHITE, gradient: Gradient.OCEAN });
  static readonly FIRE_GRADIENT = new FillStyle({ fillType: "gradient", color: Color.WHITE, gradient: Gradient.FIRE });
}
