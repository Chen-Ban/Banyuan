/**
 * 用户相关类型定义
 */

/**
 * 用户基础信息
 */
export interface User {
  _id?: string
  userId: string
  username: string
  avatar?: string
  email?: string
  phone?: string
  createdAt?: string
}

/**
 * 单眼验光参数
 */
export interface EyeOptometry {
  /** 球镜（Sphere） */
  sph: number
  /** 柱镜（Cylinder） */
  cyl: number
  /** 轴位（Axis） */
  axis: number
  /** 瞳高（Pupil Height） */
  ph: number
  /** 下加光（Addition） */
  add: number
}

/**
 * 瞳距（PD）参数
 */
export interface PupillaryDistance {
  /** 左眼瞳距（从面部中心到左瞳孔的距离） */
  left: number
  /** 右眼瞳距（从面部中心到右瞳孔的距离） */
  right: number
}

/**
 * 验光参数
 */
export interface OptometryParams {
  /** 左眼验光参数 */
  left: EyeOptometry
  /** 右眼验光参数 */
  right: EyeOptometry
  /** 瞳距 */
  pd: PupillaryDistance
}

/**
 * 用户表单数据（用于创建/编辑用户）
 */
export interface UserFormData {
  userId: string
  username: string
  email?: string
  phone?: string
  /** 验光参数 */
  optometry?: OptometryParams
}

/**
 * 用户信息（用于订单中的用户信息）
 */
export interface UserInfo {
  userId: string
  username: string
  email?: string
  phone?: string
}

/**
 * 用户筛选条件
 */
export interface UserFilters {
  username?: string
  userId?: string
  email?: string
  phone?: string
}
