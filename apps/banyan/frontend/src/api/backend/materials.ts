// Moved to materials/index.ts — re-export for backward compatibility
export type {
  MaterialKind,
  MaterialDocument,
  MaterialListParams,
  CreateMaterialData,
} from '../materials/index'
export {
  fetchMaterials,
  fetchMaterial,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  searchMaterials,
} from '../materials/index'
