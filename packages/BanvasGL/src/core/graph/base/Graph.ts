import { GRAPHTYPE } from "@/constants"
import Style from "@/core/style/Style"
import { Point3 } from "@/core/math"
import Bounds from "./Bounds"
import {v4 as uuid} from "uuid"

export interface GraphOptions {
    id?: string
    [key: string]: any
}

export default abstract class Graph{
    public id: string
    public abstract type: GRAPHTYPE
    public abstract controlPoints: Point3[] | Float32Array
    public abstract style: Style

    // 私有包围盒缓存
    private _bounds: Bounds | null = null
    private _boundsValid: boolean = false

    public abstract render(ctx: CanvasRenderingContext2D): void
    public abstract copy(): Graph
    protected abstract calculateBounds(): Bounds

    public isGraph(): boolean {
        return true
    }

    constructor(options?: GraphOptions){
        this.id = options?.id || uuid()
    }

    /**
     * 获取包围盒（带缓存机制）
     */
    public getBounds(): Bounds {
        if (!this._boundsValid || this._bounds === null) {
            this._bounds = this.calculateBounds()
            this._boundsValid = true
        }
        return this._bounds
    }

    /**
     * 使包围盒缓存失效
     */
    protected invalidateBounds(): void {
        this._boundsValid = false
        this._bounds = null
    }

    /**
     * 设置边界框（供子类在构造函数中使用）
     */
    protected setBounds(bounds: Bounds): void {
        this._bounds = bounds
        this._boundsValid = true
    }

    /**
     * 强制重新计算包围盒
     */
    public refreshBounds(): Bounds {
        this.invalidateBounds()
        return this.getBounds()
    }

    /**
     * 测试边界框是否正确初始化
     * 用于验证构造函数中的边界框计算
     * 注意：这个方法需要在运行时调用，不能在编译时使用
     */
    public static testBoundsInitialization(): void {
        console.log('=== 测试边界框初始化 ===')
        console.log('注意: 这个方法需要在运行时调用，用于验证边界框计算')
        console.log('现在所有图形类都会在构造函数中自动计算边界框')
        console.log('View在构造时应该能获取到正确的初始尺寸')
    }
}