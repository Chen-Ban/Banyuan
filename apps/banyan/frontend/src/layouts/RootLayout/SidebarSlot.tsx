/**
 * SidebarSlot — Sidebar 内容区 Portal 机制
 *
 * 提供一个 Context + Portal 组合，让子页面可以将内容（如 AiBar）
 * 渲染到 Sidebar 的 slot 容器中。
 *
 * 使用方式：
 *   - RootLayout 中用 <SidebarSlotProvider> 包裹
 *   - Sidebar 中渲染 <SidebarSlotTarget /> 作为 portal 目标
 *   - 子页面中用 <SidebarSlotContent>...</SidebarSlotContent> 将内容 portal 过去
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

// ─── Context ────────────────────────────────────────────────────────────────────

interface SidebarSlotCtxValue {
  /** 注册 slot 容器 DOM 节点 */
  registerSlot: (el: HTMLDivElement | null) => void
  /** 当前 slot 容器 DOM 节点 */
  slotEl: HTMLDivElement | null
}

const SidebarSlotCtx = createContext<SidebarSlotCtxValue>({
  registerSlot: () => {},
  slotEl: null,
})

// ─── Provider ───────────────────────────────────────────────────────────────────

export const SidebarSlotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [slotEl, setSlotEl] = useState<HTMLDivElement | null>(null)

  const registerSlot = useCallback((el: HTMLDivElement | null) => {
    setSlotEl(el)
  }, [])

  return (
    <SidebarSlotCtx.Provider value={{ registerSlot, slotEl }}>
      {children}
    </SidebarSlotCtx.Provider>
  )
}

// ─── Target（放在 Sidebar 中，作为 portal 目标容器） ─────────────────────────────

export const SidebarSlotTarget: React.FC = () => {
  const { registerSlot } = useContext(SidebarSlotCtx)

  return (
    <div
      ref={registerSlot}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    />
  )
}

// ─── Content（子页面用此组件将内容 portal 到 Sidebar slot） ──────────────────────

export const SidebarSlotContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { slotEl } = useContext(SidebarSlotCtx)

  if (!slotEl) return null
  return createPortal(children, slotEl)
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export const useSidebarSlot = () => useContext(SidebarSlotCtx)
