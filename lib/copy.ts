// Copy management utility for SimplyCaster
import copyData from "./copy.json" with { type: "json" };

type CopyData = typeof copyData;
type CopyPath = string;

/**
 * Get copy text by path (e.g., "room.title", "common.loading")
 * Supports interpolation with {{variable}} syntax
 */
export function getCopy(path: CopyPath, variables?: Record<string, string | number>): string {
  const keys = path.split('.');
  let value: any = copyData;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      console.warn(`Copy path not found: ${path}`);
      return path; // Return the path as fallback
    }
  }
  
  if (typeof value !== 'string') {
    console.warn(`Copy path does not resolve to string: ${path}`);
    return path;
  }
  
  // Handle interpolation
  if (variables) {
    return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key]?.toString() || match;
    });
  }
  
  return value;
}

/**
 * Get copy object by path (e.g., "room", "common")
 */
export function getCopySection(path: CopyPath): Record<string, any> {
  const keys = path.split('.');
  let value: any = copyData;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      console.warn(`Copy section not found: ${path}`);
      return {};
    }
  }
  
  if (typeof value !== 'object' || value === null) {
    console.warn(`Copy path does not resolve to object: ${path}`);
    return {};
  }
  
  return value;
}

/**
 * Hook for using copy in components
 */
export function useCopy() {
  return {
    t: getCopy,
    ts: getCopySection,
  };
}

// Export commonly used copy sections for convenience
export const appCopy = getCopySection('app');
export const commonCopy = getCopySection('common');
export const navigationCopy = getCopySection('navigation');
export const errorsCopy = getCopySection('errors');
export const successCopy = getCopySection('success');
export const validationCopy = getCopySection('validation');
export const timeCopy = getCopySection('time');