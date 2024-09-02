const { findByIds } = require('usb')
class PrintService {
  async print(imgData) {
    //寻找打印机
    const device = findByIds(0x6868, 0x0200)
    //打开打印机
    device.open()
    //声明接口
    device.__claimInterface(0)
    //获取输出端点的传输对象
    const transfer = device.interfaces[0].endpoints[0].makeTransfer(10000, (err, buffer, length) => {
      console.log(err, buffer, length)
    })
    //包装数据
    const initBuffer = Buffer.from([0x1b, 0x40])
    const defineImageData = Buffer.from([
      0x1d,
      0x76,
      0x30,
      0,
      0,
      25,
      200,
      0,
      ...Array.from({ length: 200 * 200 }, () => 1),
    ])
    // const printBuffer = Buffer.from([0x1d, 0x2f, 0])
    const endBuffer = Buffer.from([0x1b, 0x4a, 100])

    transfer.submit(Buffer.concat([initBuffer, defineImageData, endBuffer]))
  }
}

module.exports = new PrintService()
