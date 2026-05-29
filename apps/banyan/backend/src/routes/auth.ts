import Router from '@koa/router'
import authController from '../controllers/AuthController.js'
import { authMiddleware } from '../middleware/auth.js'

const router = new Router({ prefix: '/api/auth' })

// 手机号验证码登录（唯一登录方式）
router.post('/sms/send', authController.sendSmsCode.bind(authController))
router.post('/sms/verify', authController.loginByPhone.bind(authController))

// Token 管理
router.post('/refresh', authController.refresh.bind(authController))
router.post('/logout', authController.logout.bind(authController))

// 需要认证的接口
router.get('/me', authMiddleware, authController.me.bind(authController))

export default router
