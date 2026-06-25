import Router from '@koa/router'
import tenantController from '../controllers/TenantController.js'
import { authMiddleware } from '../middleware/auth.js'

const tenantRouter = new Router({ prefix: '/api/tenants' })

// 所有租户接口都需要认证
tenantRouter.use(authMiddleware)

// 租户 CRUD
tenantRouter.post('/', tenantController.create.bind(tenantController))
tenantRouter.get('/:tenantId', tenantController.getById.bind(tenantController))
tenantRouter.put('/:tenantId', tenantController.update.bind(tenantController))
tenantRouter.delete('/:tenantId', tenantController.remove.bind(tenantController))

// 成员管理
tenantRouter.get('/:tenantId/members', tenantController.listMembers.bind(tenantController))
tenantRouter.post('/:tenantId/invite', tenantController.inviteMember.bind(tenantController))
tenantRouter.post('/:tenantId/accept-invite', tenantController.acceptInvite.bind(tenantController))
tenantRouter.put('/:tenantId/members/:targetUserId', tenantController.updateMemberRole.bind(tenantController))
tenantRouter.delete('/:tenantId/members/:targetUserId', tenantController.removeMember.bind(tenantController))

export default tenantRouter
