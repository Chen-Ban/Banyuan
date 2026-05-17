import Router from '@koa/router'
import { SchemaController } from '../controllers/SchemaController.js'

const router = new Router({ prefix: '/api/apps/:appId/schema' })

// ── Schema 整体 ───────────────────────────────────────────────────────────────
// GET  /api/apps/:appId/schema
router.get('/', SchemaController.getSchema)

// ── Collections ───────────────────────────────────────────────────────────────
// POST   /api/apps/:appId/schema/collections
router.post('/collections', SchemaController.addCollection)

// PUT    /api/apps/:appId/schema/collections/:collectionName
router.put('/collections/:collectionName', SchemaController.updateCollection)

// DELETE /api/apps/:appId/schema/collections/:collectionName
router.delete('/collections/:collectionName', SchemaController.deleteCollection)

// ── Fields ────────────────────────────────────────────────────────────────────
// POST   /api/apps/:appId/schema/collections/:collectionName/fields
router.post('/collections/:collectionName/fields', SchemaController.addField)

// PUT    /api/apps/:appId/schema/collections/:collectionName/fields/:fieldName
router.put('/collections/:collectionName/fields/:fieldName', SchemaController.updateField)

// DELETE /api/apps/:appId/schema/collections/:collectionName/fields/:fieldName
router.delete('/collections/:collectionName/fields/:fieldName', SchemaController.deleteField)

export default router
