import { connectDatabase, disconnectDatabase } from '../config/database'
import { User, Product, Order, OrderStatus, IUser, IProduct } from '../models'

/**
 * 生成随机字符串
 */
function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 生成随机数字
 */
function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 生成随机日期（过去一年内）
 */
function randomDate(): Date {
  const now = new Date()
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
  const randomTime = oneYearAgo.getTime() + Math.random() * (now.getTime() - oneYearAgo.getTime())
  return new Date(randomTime)
}

/**
 * 填充用户数据
 */
async function seedUsers(count: number = 20): Promise<IUser[]> {
  console.log(`开始填充 ${count} 个用户...`)
  const users: IUser[] = []

  const firstNames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴']
  const lastNames = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀兰', '霞', '平']

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]
    const username = `${firstName}${lastName}${i + 1}`
    const userId = `USER${String(i + 1).padStart(6, '0')}`

    const user = new User({
      userId,
      username,
      email: `user${i + 1}@example.com`,
      phone: `1${randomNumber(3, 9)}${randomNumber(100000000, 999999999)}`,
      optometry: {
        left: {
          sph: randomNumber(-10, 5) * 0.25,
          cyl: randomNumber(-5, 0) * 0.25,
          axis: randomNumber(0, 180),
          ph: randomNumber(20, 35),
          add: randomNumber(0, 3) * 0.25,
        },
        right: {
          sph: randomNumber(-10, 5) * 0.25,
          cyl: randomNumber(-5, 0) * 0.25,
          axis: randomNumber(0, 180),
          ph: randomNumber(20, 35),
          add: randomNumber(0, 3) * 0.25,
        },
        pd: {
          left: randomNumber(28, 35),
          right: randomNumber(28, 35),
        },
      },
    })

    users.push(user)
  }

  await User.insertMany(users)
  console.log(`✓ 成功填充 ${count} 个用户`)
  return users
}

/**
 * 填充商品数据
 */
async function seedProducts(count: number = 30): Promise<IProduct[]> {
  console.log(`开始填充 ${count} 个商品...`)
  const products: IProduct[] = []

  const productNames = [
    '经典款眼镜框',
    '时尚太阳镜',
    '防蓝光眼镜',
    '运动眼镜',
    '商务眼镜',
    '复古圆框眼镜',
    '方形眼镜框',
    '飞行员款眼镜',
    '无框眼镜',
    '半框眼镜',
    '金属眼镜框',
    '塑料眼镜框',
    '钛合金眼镜',
    '儿童眼镜',
    '老花镜',
  ]

  const specs = ['标准', '大号', '小号', '加宽', '加高']
  const materials = ['金属', '塑料', '钛合金', '板材']

  for (let i = 0; i < count; i++) {
    const name = `${productNames[Math.floor(Math.random() * productNames.length)]} ${i + 1}号`
    const sku = `SKU${String(i + 1).padStart(6, '0')}`
    const spec = `${specs[Math.floor(Math.random() * specs.length)]}-${materials[Math.floor(Math.random() * materials.length)]}`

    const product = new Product({
      name,
      sku,
      unitPrice: randomNumber(100, 2000),
      description: `这是一款优质的${name}，采用优质材料制作，适合日常佩戴。`,
      stock: randomNumber(0, 500),
      spec,
    })

    products.push(product)
  }

  await Product.insertMany(products)
  console.log(`✓ 成功填充 ${count} 个商品`)
  return products
}

/**
 * 填充订单数据
 */
async function seedOrders(count: number = 50, users: IUser[], products: IProduct[]) {
  console.log(`开始填充 ${count} 个订单...`)
  const orders = []

  const statuses = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.COMPLETED, OrderStatus.CANCELLED]

  for (let i = 0; i < count; i++) {
    // 随机选择一个用户
    const user = users[Math.floor(Math.random() * users.length)]
    if (!user) continue

    // 随机选择1-5个商品
    const itemCount = randomNumber(1, 5)
    const selectedProducts: IProduct[] = []
    for (let j = 0; j < itemCount; j++) {
      const product = products[Math.floor(Math.random() * products.length)]
      if (product && !selectedProducts.find((p) => p._id.toString() === product._id.toString())) {
        selectedProducts.push(product)
      }
    }

    if (selectedProducts.length === 0) continue

    // 构建订单项
    const items = selectedProducts.map((product) => {
      const quantity = randomNumber(1, 3)
      const price = product.unitPrice
      const subtotal = quantity * price
      return {
        productId: product._id,
        product: {
          id: product._id.toString(),
          name: product.name,
          sku: product.sku,
          unitPrice: product.unitPrice,
          spec: product.spec,
        },
        quantity,
        price,
        subtotal,
      }
    })

    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0)
    const orderId = `ORD${Date.now()}${String(i).padStart(4, '0')}`

    const order = new Order({
      orderId,
      userId: user._id,
      userUserId: user.userId,
      username: user.username,
      items,
      totalAmount,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      remark: randomNumber(0, 10) > 7 ? `备注信息：${randomString(20)}` : undefined,
      createdAt: randomDate(),
    })

    orders.push(order)
  }

  await Order.insertMany(orders)
  console.log(`✓ 成功填充 ${count} 个订单`)
  return orders
}

/**
 * 主函数：填充数据库
 */
async function seedDatabase() {
  try {
    console.log('开始连接数据库...')
    await connectDatabase()
    console.log('✓ 数据库连接成功')

    // 清空现有数据（可选）
    const shouldClear = process.argv.includes('--clear')
    if (shouldClear) {
      console.log('清空现有数据...')
      await User.deleteMany({})
      await Product.deleteMany({})
      await Order.deleteMany({})
      console.log('✓ 数据已清空')
    }

    // 填充数据
    const users = await seedUsers(20)
    const products = await seedProducts(30)
    const orders = await seedOrders(50, users, products)

    console.log('\n数据库填充完成！')
    console.log(`- 用户: ${users.length} 个`)
    console.log(`- 商品: ${products.length} 个`)
    console.log(`- 订单: ${orders.length} 个`)

    await disconnectDatabase()
    process.exit(0)
  } catch (error) {
    console.error('填充数据库时出错:', error)
    process.exit(1)
  }
}

// 如果直接运行此文件，执行填充
if (require.main === module) {
  seedDatabase()
}

export default seedDatabase

