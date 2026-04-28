import mongoose, { Schema, Document } from 'mongoose'

/**
 * 单眼验光参数
 */
export interface IEyeOptometry {
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
export interface IPupillaryDistance {
  /** 左眼瞳距（从面部中心到左瞳孔的距离） */
  left: number
  /** 右眼瞳距（从面部中心到右瞳孔的距离） */
  right: number
}

/**
 * 验光参数
 */
export interface IOptometryParams {
  /** 左眼验光参数 */
  left: IEyeOptometry
  /** 右眼验光参数 */
  right: IEyeOptometry
  /** 瞳距 */
  pd: IPupillaryDistance
}

/**
 * 用户文档接口
 */
export interface IUser extends Document {
  /** 用户业务ID */
  userId: string
  /** 用户名 */
  username: string
  /** 头像 */
  avatar?: string
  /** 邮箱 */
  email?: string
  /** 电话 */
  phone?: string
  /** 验光参数 */
  optometry?: IOptometryParams
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 单眼验光参数 Schema
 */
const EyeOptometrySchema = new Schema<IEyeOptometry>({
  sph: { type: Number, required: true },
  cyl: { type: Number, required: true },
  axis: { type: Number, required: true },
  ph: { type: Number, required: true },
  add: { type: Number, required: true },
}, { _id: false })

/**
 * 瞳距参数 Schema
 */
const PupillaryDistanceSchema = new Schema<IPupillaryDistance>({
  left: { type: Number, required: true },
  right: { type: Number, required: true },
}, { _id: false })

/**
 * 验光参数 Schema
 */
const OptometryParamsSchema = new Schema<IOptometryParams>({
  left: { type: EyeOptometrySchema, required: true },
  right: { type: EyeOptometrySchema, required: true },
  pd: { type: PupillaryDistanceSchema, required: true },
}, { _id: false })

/**
 * 用户 Schema
 */
const UserSchema = new Schema<IUser>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    avatar: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^1[3-9]\d{9}$/, 'Please enter a valid phone number'],
    },
    optometry: {
      type: OptometryParamsSchema,
    },
  },
  {
    timestamps: true, // 自动添加 createdAt 和 updatedAt
  }
)

// 创建索引
UserSchema.index({ userId: 1 })
UserSchema.index({ username: 1 })
UserSchema.index({ email: 1 })
UserSchema.index({ phone: 1 })

/**
 * 用户模型
 */
const User = mongoose.model<IUser>('User', UserSchema)

export default User

