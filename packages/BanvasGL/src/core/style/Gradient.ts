import Color from './Color'

export type GradientStop = {
  color: Color
  position: number // 0-1
}

export type GradientType = 'linear' | 'radial' | 'conic'

export default class Gradient {
  type: GradientType
  stops: GradientStop[]
  
  // Linear gradient properties
  x0: number
  y0: number
  x1: number
  y1: number
  
  // Radial gradient properties
  cx: number
  cy: number
  r: number
  fx?: number
  fy?: number
  fr?: number
  
  // Conic gradient properties
  angle: number // in radians

  constructor(
    type: GradientType = 'linear',
    stops: GradientStop[] = [],
    x0: number = 0,
    y0: number = 0,
    x1: number = 100,
    y1: number = 0
  ) {
    this.type = type
    this.stops = [...stops]
    this.x0 = x0
    this.y0 = y0
    this.x1 = x1
    this.y1 = y1
    this.cx = 0
    this.cy = 0
    this.r = 50
    this.angle = 0
  }

  // 添加颜色停止点
  addStop(color: Color, position: number): Gradient {
    const stop: GradientStop = { color, position: Math.max(0, Math.min(1, position)) }
    this.stops.push(stop)
    this.stops.sort((a, b) => a.position - b.position)
    return this
  }

  // 移除颜色停止点
  removeStop(index: number): Gradient {
    if (index >= 0 && index < this.stops.length) {
      this.stops.splice(index, 1)
    }
    return this
  }

  // 设置线性渐变方向
  setLinearDirection(x0: number, y0: number, x1: number, y1: number): Gradient {
    this.type = 'linear'
    // 限定坐标值在0-100范围内
    this.x0 = Math.max(0, Math.min(100, x0))
    this.y0 = Math.max(0, Math.min(100, y0))
    this.x1 = Math.max(0, Math.min(100, x1))
    this.y1 = Math.max(0, Math.min(100, y1))
    return this
  }

  // 设置径向渐变
  setRadial(cx: number, cy: number, r: number, fx?: number, fy?: number, fr?: number): Gradient {
    this.type = 'radial'
    // 限定坐标值在0-100范围内
    this.cx = Math.max(0, Math.min(100, cx))
    this.cy = Math.max(0, Math.min(100, cy))
    this.r = Math.max(0, Math.min(100, r))
    this.fx = fx !== undefined ? Math.max(0, Math.min(100, fx)) : undefined
    this.fy = fy !== undefined ? Math.max(0, Math.min(100, fy)) : undefined
    this.fr = fr !== undefined ? Math.max(0, Math.min(100, fr)) : undefined
    return this
  }

  // 设置圆锥渐变
  setConic(angle: number = 0): Gradient {
    this.type = 'conic'
    this.angle = angle
    return this
  }

  // 创建 Canvas 渐变对象
  createCanvasGradient(ctx: CanvasRenderingContext2D, width: number = 100, height: number = 100): CanvasGradient | null {
    let gradient: CanvasGradient | null = null

    switch (this.type) {
      case 'linear':
        gradient = ctx.createLinearGradient(
          this.x0 * width / 100,
          this.y0 * height / 100,
          this.x1 * width / 100,
          this.y1 * height / 100
        )
        break
      
      case 'radial':
        if (this.fx !== undefined && this.fy !== undefined && this.fr !== undefined) {
          gradient = ctx.createRadialGradient(
            this.fx * width / 100,
            this.fy * height / 100,
            this.fr * Math.min(width, height) / 100,
            this.cx * width / 100,
            this.cy * height / 100,
            this.r * Math.min(width, height) / 100
          )
        } else {
          gradient = ctx.createRadialGradient(
            this.cx * width / 100,
            this.cy * height / 100,
            0,
            this.cx * width / 100,
            this.cy * height / 100,
            this.r * Math.min(width, height) / 100
          )
        }
        break
      
      case 'conic':
        // Canvas 2D 不直接支持圆锥渐变，使用径向渐变模拟
        gradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.min(width, height) / 2
        )
        break
    }

    if (gradient) {
      this.stops.forEach(stop => {
        gradient.addColorStop(stop.position, stop.color.rgba)
      })
    }

    return gradient
  }

  // 复制渐变
  copy(): Gradient {
    const gradient = new Gradient(this.type, this.stops, this.x0, this.y0, this.x1, this.y1)
    gradient.cx = this.cx
    gradient.cy = this.cy
    gradient.r = this.r
    gradient.fx = this.fx
    gradient.fy = this.fy
    gradient.fr = this.fr
    gradient.angle = this.angle
    return gradient
  }

  // 比较是否相等
  equals(other: Gradient): boolean {
    if (this.type !== other.type || this.stops.length !== other.stops.length) {
      return false
    }

    for (let i = 0; i < this.stops.length; i++) {
      if (!this.stops[i].color.equals(other.stops[i].color) || 
          this.stops[i].position !== other.stops[i].position) {
        return false
      }
    }

    return this.x0 === other.x0 && this.y0 === other.y0 &&
           this.x1 === other.x1 && this.y1 === other.y1 &&
           this.cx === other.cx && this.cy === other.cy &&
           this.r === other.r && this.angle === other.angle
  }

  // 静态工厂方法
  static linear(x0: number, y0: number, x1: number, y1: number, stops: GradientStop[] = []): Gradient {
    return new Gradient('linear', stops, x0, y0, x1, y1)
  }

  static radial(cx: number, cy: number, r: number, stops: GradientStop[] = [], fx?: number, fy?: number, fr?: number): Gradient {
    const gradient = new Gradient('radial', stops)
    return gradient.setRadial(cx, cy, r, fx, fy, fr)
  }

  static conic(angle: number = 0, stops: GradientStop[] = []): Gradient {
    const gradient = new Gradient('conic', stops)
    return gradient.setConic(angle)
  }

  // 预定义渐变
  static readonly HORIZONTAL_RAINBOW = new Gradient('linear', [
    { color: Color.RED, position: 0 },
    { color: Color.YELLOW, position: 0.2 },
    { color: Color.GREEN, position: 0.4 },
    { color: Color.CYAN, position: 0.6 },
    { color: Color.BLUE, position: 0.8 },
    { color: Color.MAGENTA, position: 1 }
  ], 0, 0, 100, 0)

  static readonly VERTICAL_RAINBOW = new Gradient('linear', [
    { color: Color.RED, position: 0 },
    { color: Color.YELLOW, position: 0.2 },
    { color: Color.GREEN, position: 0.4 },
    { color: Color.CYAN, position: 0.6 },
    { color: Color.BLUE, position: 0.8 },
    { color: Color.MAGENTA, position: 1 }
  ], 0, 0, 0, 100)

  static readonly DIAGONAL_RAINBOW = new Gradient('linear', [
    { color: Color.RED, position: 0 },
    { color: Color.YELLOW, position: 0.2 },
    { color: Color.GREEN, position: 0.4 },
    { color: Color.CYAN, position: 0.6 },
    { color: Color.BLUE, position: 0.8 },
    { color: Color.MAGENTA, position: 1 }
  ], 0, 0, 100, 100)

  static readonly RADIAL_RAINBOW = new Gradient('radial', [
    { color: Color.RED, position: 0 },
    { color: Color.YELLOW, position: 0.2 },
    { color: Color.GREEN, position: 0.4 },
    { color: Color.CYAN, position: 0.6 },
    { color: Color.BLUE, position: 0.8 },
    { color: Color.MAGENTA, position: 1 }
  ]).setRadial(50, 50, 50)

  static readonly SUNSET = new Gradient('linear', [
    { color: new Color(255, 94, 77), position: 0 },
    { color: new Color(255, 154, 0), position: 0.5 },
    { color: new Color(255, 206, 84), position: 1 }
  ], 0, 0, 0, 100)

  static readonly OCEAN = new Gradient('linear', [
    { color: new Color(0, 119, 190), position: 0 },
    { color: new Color(0, 180, 216), position: 0.5 },
    { color: new Color(144, 224, 239), position: 1 }
  ], 0, 0, 0, 100)

  static readonly FIRE = new Gradient('radial', [
    { color: new Color(255, 255, 255), position: 0 },
    { color: new Color(255, 255, 0), position: 0.3 },
    { color: new Color(255, 100, 0), position: 0.7 },
    { color: new Color(139, 0, 0), position: 1 }
  ]).setRadial(50, 50, 50)
}
