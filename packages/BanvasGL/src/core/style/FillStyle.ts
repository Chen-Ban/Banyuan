import Color from "./Color";
import Gradient from "./Gradient";
import Image from "./Image";

export type FillType = "color" | "gradient" | "image";

export default class FillStyle {
  type: FillType;
  color: Color;
  gradient: Gradient | null;
  image: Image | null;

  constructor(options: {
    type?: FillType;
    color?: Color;
    gradient?: Gradient | null;
    image?: Image | null;
  } = {}) {
    const {
      type = "color",
      color = Color.WHITE,
      gradient = null,
      image = null,
    } = options;

    this.type = type;
    this.color = color;
    this.gradient = gradient;
    this.image = image;
  }

  // 应用样式到 Canvas 上下文
  applyToContext(ctx: CanvasRenderingContext2D, width: number = 100, height: number = 100): void {
    switch (this.type) {
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
    this.type = "color";
    this.color = color;
    this.gradient = null;
    this.image = null;
    return this;
  }

  // 设置为渐变填充
  setGradient(gradient: Gradient): FillStyle {
    this.type = "gradient";
    this.gradient = gradient;
    this.image = null;
    return this;
  }

  // 设置为图案填充
  setPattern(image: Image): FillStyle {
    this.type = "image";
    this.image = image;
    this.gradient = null;
    return this;
  }

  // 复制样式
  copy(): FillStyle {
    return new FillStyle({
      type: this.type,
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
    if (this.type !== other.type) return false;

    switch (this.type) {
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
      type: "color",
      color,
    });
  }

  static fromHex(hex: string): FillStyle {
    return new FillStyle({
      type: "color",
      color: Color.fromHex(hex),
    });
  }

  static fromHSL(h: number, s: number, l: number): FillStyle {
    return new FillStyle({
      type: "color",
      color: Color.fromHSL(h, s, l),
    });
  }

  static fromRGB(r: number, g: number, b: number): FillStyle {
    return new FillStyle({
      type: "color",
      color: new Color(r, g, b),
    });
  }

  static fromRGBA(r: number, g: number, b: number, a: number): FillStyle {
    return new FillStyle({
      type: "color",
      color: new Color(r, g, b, a),
    });
  }

  static fromGradient(gradient: Gradient): FillStyle {
    return new FillStyle({
      type: "gradient",
      color: Color.WHITE,
      gradient,
    });
  }

  static fromPattern(image: Image): FillStyle {
    return new FillStyle({
      type: "image",
      color: Color.WHITE,
      image,
    });
  }

  // 预定义样式
  static readonly TRANSPARENT = new FillStyle({ type: "color", color: Color.TRANSPARENT });
  static readonly WHITE = new FillStyle({ type: "color", color: Color.WHITE });
  static readonly BLACK = new FillStyle({ type: "color", color: Color.BLACK });
  static readonly RED = new FillStyle({ type: "color", color: Color.RED });
  static readonly GREEN = new FillStyle({ type: "color", color: Color.GREEN });
  static readonly BLUE = new FillStyle({ type: "color", color: Color.BLUE });
  static readonly YELLOW = new FillStyle({ type: "color", color: Color.YELLOW });
  static readonly CYAN = new FillStyle({ type: "color", color: Color.CYAN });
  static readonly MAGENTA = new FillStyle({ type: "color", color: Color.MAGENTA });

  // 预定义渐变
  static readonly RAINBOW_GRADIENT = new FillStyle({ type: "gradient", color: Color.WHITE, gradient: Gradient.HORIZONTAL_RAINBOW });
  static readonly SUNSET_GRADIENT = new FillStyle({ type: "gradient", color: Color.WHITE, gradient: Gradient.SUNSET });
  static readonly OCEAN_GRADIENT = new FillStyle({ type: "gradient", color: Color.WHITE, gradient: Gradient.OCEAN });
  static readonly FIRE_GRADIENT = new FillStyle({ type: "gradient", color: Color.WHITE, gradient: Gradient.FIRE });
}
