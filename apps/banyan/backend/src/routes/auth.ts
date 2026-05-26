import Router from '@koa/router'
import authController from '../controllers/AuthController.js'
import { authMiddleware } from '../middleware/auth.js'

const router = new Router({ prefix: '/api/auth' })

router.post('/register', authController.register.bind(authController))
router.post('/login', authController.login.bind(authController))
router.post('/refresh', authController.refresh.bind(authController))
router.post('/logout', authController.logout.bind(authController))
router.get('/me', authMiddleware, authController.me.bind(authController))
router.post('/sms/send', authController.sendSmsCode.bind(authController))
router.post('/sms/verify', authController.loginByPhone.bind(authController))

export default router
