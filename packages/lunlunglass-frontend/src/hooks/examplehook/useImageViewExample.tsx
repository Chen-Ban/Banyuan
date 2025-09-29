import { useState, useCallback } from 'react'
import { ImageView } from 'banvasgl'
import { ImageElement } from 'banvasgl'
import { Style } from 'banvasgl'

export const useImageViewExample = () => {
  const [imageView, setImageView] = useState<ImageView | null>(null)

  const createImageView = useCallback((imageUrl?: string) => {
    // 创建图片元素
    const imageElement = new ImageElement(
      0, // x
      0, // y
      imageUrl || 'https://via.placeholder.com/300x200/4CAF50/FFFFFF?text=Sample+Image'
    )

    // 创建图片视图
    const view = new ImageView(imageElement, {
      style: new Style().setPaddingAll(10).setMarginAll(5)
    })

    setImageView(view)
    return view
  }, [])

  const updateImage = useCallback((newImageUrl: string) => {
    if (imageView && imageView.content) {
      imageView.content.setImageSrc(newImageUrl)
    }
  }, [imageView])

  const resizeImage = useCallback((width: number, height: number) => {
    if (imageView && imageView.content) {
      // ImageElement 没有 setSize 方法，需要通过其他方式调整大小
      console.log('ImageElement does not support setSize method')
    }
  }, [imageView])

  return {
    imageView,
    createImageView,
    updateImage,
    resizeImage
  }
}
