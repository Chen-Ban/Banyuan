// Moved to dataSchema/collections.ts — re-export for backward compatibility
export type { FieldType, FieldDef, CollectionDef, DataSchemaDefinition } from '../dataSchema/collections'
export {
  fetchDataSchema,
  addCollection,
  updateCollection,
  deleteCollection,
  addField,
  updateField,
  deleteField,
} from '../dataSchema/collections'
// Legacy alias
export type { DataSchemaDefinition as AppSchema } from '../dataSchema/collections'
export { fetchDataSchema as fetchSchema } from '../dataSchema/collections'
