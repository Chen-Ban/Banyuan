// Moved to ui/definition.ts — re-export for backward compatibility
export type { UIDefinitionData } from '../ui/definition'
export { fetchUIDefinition, saveUIDefinition } from '../ui/definition'
// Legacy aliases
export type { UIDefinitionData as AppContentData } from '../ui/definition'
export { fetchUIDefinition as fetchAppContent, saveUIDefinition as saveAppContent } from '../ui/definition'
