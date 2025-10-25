import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App } from '@/core/app'
import type { AppOptions } from '@/core/app'
import type { RendererOptions } from '@/core/renderer/Renderer'
import { BaseCamera, Circle, Color, CombinedView, FillStyle, GraphView, Point3, Rectangle, Scene, Style, Texts, TextView } from '@/core'
import { event2Point } from '@/utils/utils'

export interface UseBanvasOptions {
    width?: number
    height?: number
    appOptions?: AppOptions
    rendererOptions?: RendererOptions
}

type SerializedSceneJSON = string

interface UseBanvasResult {
	Banvas: React.ReactElement
	app: App | null
}

export default function useBanvas(serializedScenes: SerializedSceneJSON[] = [], _options: UseBanvasOptions = {}): UseBanvasResult {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const containerRef = useRef<HTMLDivElement | null>(null)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const [app, setApp] = useState<App | null>(null)
	const initializedRef = useRef<boolean>(false)

	// 统一设置画布逻辑尺寸与样式尺寸
	const applyCanvasSize = useCallback(() => {
		const canvas = canvasRef.current
		if (!canvas) return { logicWidth: 0, logicHeight: 0 }
		const dpr = (typeof window !== 'undefined') ? (window.devicePixelRatio || 1) : 1
		const cssWidth = _options.width ?? ((canvas.clientWidth) || 300)
		const cssHeight = _options.height ?? ((canvas.clientHeight) || 150)
		canvas.style.width = `${cssWidth}px`
		canvas.style.height = `${cssHeight}px`
		const logicWidth = Math.round(cssWidth * dpr)
		const logicHeight = Math.round(cssHeight * dpr)
		if (canvas.width !== logicWidth) canvas.width = logicWidth
		if (canvas.height !== logicHeight) canvas.height = logicHeight
		return { logicWidth, logicHeight }
	}, [_options.width, _options.height])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas || initializedRef.current) return

        applyCanvasSize()
		// 初始化 App 与 Renderer
		const _app = App.create(canvas, _options.appOptions ?? {}, _options.rendererOptions ?? {})
		_app.launch({})
		// 通过序列化的 Scene JSON 初始化
		if (Array.isArray(serializedScenes) && serializedScenes.length > 0) {
			_app.initFromSerializedScenes(serializedScenes)
		}
		setApp(_app)
		initializedRef.current = true

        try {
            // 创建基础相机
            const camera = new BaseCamera()
            
            // 创建新页面（场景）
            const scene = new Scene(camera)
      
            const rect = new GraphView(new Rectangle(50,50,50,50))
            const text =  new TextView(Texts.simple("123456789101112131415"),{
              layoutArea:new Rectangle(50,50,50,50)
            })
            text.translate(100,100)
      
      
            const anchor = new GraphView(new Circle(new Point3(5,5,0),5,new Style(new FillStyle("color",new Color(255,0,0,1))))).translate(250,50)
      
            const combinedView = new CombinedView([rect,text])
            scene.addChild(combinedView)
            scene.addChild(anchor)
      
            // 添加场景到应用
            _app.addScene(scene)
            
            // 导航到新页面
            _app.navigateTo(scene) 
            
            combinedView.translate(50,50)
            
            // 延迟渲染，确保场景完全设置好
            _app.render()
      
          } catch (error) {
            console.error('Failed to create page and draw content:', error)
          }

		return () => {
			// 清理函数
			if (_app) {
				try {
					_app.destroy()
				} catch (error) {
					console.warn('Failed to destroy app in cleanup:', error)
				}
			}
			setApp(null)
			initializedRef.current = false
		}
	}, []) // 空依赖数组，只在组件挂载时执行一次

	// 当尺寸参数变化时，更新画布尺寸与渲染器
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas || !app || !initializedRef.current) return
		applyCanvasSize()
	}, [app])

    //绑定事件
    useEffect(()=>{
        const canvas = canvasRef.current
        if(!canvas || !app)return
        // 绑定事件
		const unbind = bindEvents(canvas)

		return () => {
			unbind && unbind()
		}
    },[app])

    	// 事件绑定与卸载
	const bindEvents = useCallback((canvas: HTMLCanvasElement) => {
		// 鼠标事件
		const onMouseDown = (e: MouseEvent) => {
			
            if(!app) return
            const point = event2Point(e)
            const scene = app.getCurrentScene()
            scene?.children.forEach(view=>{
				const res = view.interact(point)
				console.log('交互结果',res);
				
			})
            
            
		}
		const onMouseMove = (e: MouseEvent) => {
		}
		const onMouseUp = (e: MouseEvent) => {
		}
		const onWheel = (e: WheelEvent) => {
			// 阻止页面滚动
			e.preventDefault()
		}
		const onContextMenu = (e: MouseEvent) => {
			e.preventDefault()
		}

		// 拖拽事件
		const onDragOver = (e: DragEvent) => {
			e.preventDefault()
		}
		const onDrop = (e: DragEvent) => {
			e.preventDefault()
		}

		canvas.addEventListener('mousedown', onMouseDown, { passive: true })
		canvas.addEventListener('mousemove', onMouseMove, { passive: true })
		canvas.addEventListener('mouseup', onMouseUp, { passive: true })
		canvas.addEventListener('wheel', onWheel, { passive: false })
		canvas.addEventListener('contextmenu', onContextMenu, { passive: false })
		canvas.addEventListener('dragover', onDragOver)
		canvas.addEventListener('drop', onDrop)

		// 键盘/输入事件绑定到隐身 input
		const input = inputRef.current
		const onInput = (e: Event) => {
			// TODO: 分发到当前 Scene/View（预留）
		}
		const onCompositionStart = (e: CompositionEvent) => {
		}
		const onCompositionUpdate = (e: CompositionEvent) => {
		}
		const onCompositionEnd = (e: CompositionEvent) => {
		}
		const onKeyDown = (e: KeyboardEvent) => {
		}
		const onKeyUp = (e: KeyboardEvent) => {
		}
		if (input) {
			input.addEventListener('input', onInput)
			input.addEventListener('compositionstart', onCompositionStart)
			input.addEventListener('compositionupdate', onCompositionUpdate)
			input.addEventListener('compositionend', onCompositionEnd)
			input.addEventListener('keydown', onKeyDown as any)
			input.addEventListener('keyup', onKeyUp as any)
		}

		return () => {
			canvas.removeEventListener('mousedown', onMouseDown as any)
			canvas.removeEventListener('mousemove', onMouseMove as any)
			canvas.removeEventListener('mouseup', onMouseUp as any)
			canvas.removeEventListener('wheel', onWheel as any)
			canvas.removeEventListener('contextmenu', onContextMenu as any)
			canvas.removeEventListener('dragover', onDragOver as any)
			canvas.removeEventListener('drop', onDrop as any)
			if (input) {
				input.removeEventListener('input', onInput as any)
				input.removeEventListener('compositionstart', onCompositionStart as any)
				input.removeEventListener('compositionupdate', onCompositionUpdate as any)
				input.removeEventListener('compositionend', onCompositionEnd as any)
				input.removeEventListener('keydown', onKeyDown as any)
				input.removeEventListener('keyup', onKeyUp as any)
			}
		}
	}, [app])

	const canvasEl = useMemo(() => (
		<div ref={containerRef} style={{ position: 'relative', width: _options.width ? `${_options.width}px` : '100%', height: _options.height ? `${_options.height}px` : '100%' }}>
			<canvas ref={canvasRef} style={{ width: _options.width ? `${_options.width}px` : '100%', height: _options.height ? `${_options.height}px` : '100%', display: 'block' }} />
			<input
				ref={inputRef}
				type="text"
				style={{ position: 'absolute', left: 0, top: 0, width: 100, height: 20 ,zIndex:-9999}}
			/>
		</div>
	), [_options.width, _options.height])

	return { Banvas: canvasEl, app }
}

