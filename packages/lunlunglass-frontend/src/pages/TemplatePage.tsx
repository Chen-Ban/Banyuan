import { useMemo, useEffect, useState, useCallback } from 'react'
import { useBanvas } from '../hooks/useBanvas'
import { Scene, BaseCamera, Color, GraphView, Rectangle, TextView, Texts, CombinedView, Circle, Style, FillStyle, Point3, Matrix4 } from 'banvasgl'
import './TemplatePage.css'

const TemplatePage = () => {
  // 使用useMemo缓存options，避免每次渲染都创建新对象
  const banvasOptions = useMemo(() => ({
    width: 800,
    height: 600,
    appOptions: {
      enablePageStack: true,
      maxPageStackSize: 50
    },
    rendererOptions: {
      clearColor: '#fff'
    }
  }), [])

  const { app, canvas } = useBanvas(banvasOptions)


  // 创建页面并绘制内容
  useEffect(() => {
    if (!app) {
      console.log('App not ready yet')
      return
    }

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
      app.addScene(scene)
      
      // 导航到新页面
      app.navigateTo(scene) 
      
      combinedView.translate(50,50).scale(1.25,1.25,1,new Point3(200,0,0)).rotate(0,0,-Math.PI / 4,new Point3(100,100,0))
      
      // 延迟渲染，确保场景完全设置好
      app.render()



      

    } catch (error) {
      console.error('Failed to create page and draw content:', error)
    }
  }, [app])

  return (
    <div className="template-page">
      <div className="template-container">
        <h2>BanvasGL 示例测试页面</h2>
        <p>这是一个使用示例 hooks 的测试页面。</p>
        
        <div className="canvas-section">
          <h3>画布区域</h3>
          <div className="canvas-wrapper">
            {canvas}
          </div>
          <div className="canvas-info">
            <p>应用实例: {app ? '已创建' : '未创建'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TemplatePage
