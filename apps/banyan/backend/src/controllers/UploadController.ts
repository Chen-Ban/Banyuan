import { Context } from 'koa'
import path from 'path'
import fs from 'fs'

class UploadController {
  async uploadFile(ctx: Context) {
    try {
      const file = ctx.request.files?.file

      if (!file || Array.isArray(file)) {
        ctx.status = 400
        ctx.body = { success: false, message: 'Please upload a single file with field name "file"' }
        return
      }

      const ext = path.extname(file.originalFilename || '')
      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`

      const uploadDir = path.resolve(__dirname, '../../uploads')
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      const targetPath = path.join(uploadDir, filename)
      const reader = fs.createReadStream(file.filepath)
      const writer = fs.createWriteStream(targetPath)
      reader.pipe(writer)

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })

      fs.unlinkSync(file.filepath)

      const url = `/uploads/${filename}`

      ctx.status = 201
      ctx.body = {
        success: true,
        data: { url, filename, originalName: file.originalFilename, size: file.size, mimeType: file.mimetype },
        message: 'File uploaded successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to upload file' }
    }
  }

  async uploadMultiple(ctx: Context) {
    try {
      const files = ctx.request.files?.files

      if (!files) {
        ctx.status = 400
        ctx.body = { success: false, message: 'Please upload files with field name "files"' }
        return
      }

      const fileList = Array.isArray(files) ? files : [files]
      const uploadDir = path.resolve(__dirname, '../../uploads')

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      const results = []

      for (const file of fileList) {
        const ext = path.extname(file.originalFilename || '')
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`
        const targetPath = path.join(uploadDir, filename)

        const reader = fs.createReadStream(file.filepath)
        const writer = fs.createWriteStream(targetPath)
        reader.pipe(writer)

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', resolve)
          writer.on('error', reject)
        })

        fs.unlinkSync(file.filepath)

        results.push({
          url: `/uploads/${filename}`,
          filename,
          originalName: file.originalFilename,
          size: file.size,
          mimeType: file.mimetype,
        })
      }

      ctx.status = 201
      ctx.body = { success: true, data: results, message: `${results.length} file(s) uploaded successfully` }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to upload files' }
    }
  }
}

export default new UploadController()
