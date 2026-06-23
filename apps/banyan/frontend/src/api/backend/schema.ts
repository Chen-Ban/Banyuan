// Moved to dataSchema/collections.ts — re-export for backward compatibility
export {
  FieldType,
  FieldDef,
  CollectionDef,
  DataSchemaDefinition,
  fetchDataSchema,
  addCollection,
  updateCollection,
  deleteCollection,
  addField,
  updateField,
  deleteField,
} from '../dataSchema/collections'
// Legacy alias
export { DataSchemaDefinition as AppSchema, fetchDataSchema as fetchSchema } from '../dataSchema/collections'
