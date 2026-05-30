import Router from '@koa/router'
import materialController from '../controllers/MaterialController.js'

const router = new Router({
  prefix: '/api/materials',
})

// 搜索接口（放在 /:id 前面避免路由冲突）
router.get(
  '/search',
  materialController.searchMaterials.bind(materialController),
)

router.get(
  '/',
  materialController.getMaterialList.bind(materialController),
)
router.get(
  '/:id',
  materialController.getMaterialById.bind(materialController),
)
router.post(
  '/',
  materialController.createMaterial.bind(materialController),
)
router.put(
  '/:id',
  materialController.updateMaterial.bind(materialController),
)
router.delete(
  '/:id',
  materialController.deleteMaterial.bind(materialController),
)

export default router
