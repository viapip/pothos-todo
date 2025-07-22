/**
 * Pothos Versioning Plugin - TEMPORARILY DISABLED
 * GraphQL Yoga plugin that integrates API versioning and deprecation tracking
 */

// Temporarily disable all versioning functionality due to type compatibility issues
export const versioningPlugin = () => ({ });
export const fieldDeprecationPlugin = () => ({ });
export const versionHeaderPlugin = () => ({ });
export const migrationAssistancePlugin = () => ({ });

export const createVersioningPlugins = () => [];

// Disabled helper functions
export function createVersionedField() { return () => null; }
export function deprecatedField() { return () => null; }
