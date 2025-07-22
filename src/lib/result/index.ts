/**
 * Comprehensive error handling with Result types
 * 
 * This module provides a robust error handling system using the Result pattern
 * to replace traditional throw/catch error handling with explicit error types.
 * 
 * Key benefits:
 * - Explicit error handling in function signatures
 * - Type-safe error propagation
 * - Composable error handling patterns
 * - Better error context and logging
 * - Circuit breaker and retry patterns
 * 
 * Usage examples:
 * 
 * ```typescript
 * import { safeAsync, Errors, Result } from '@/lib/result';
 * 
 * // Basic async operation with error handling
 * const fetchUser = (id: string): AsyncAppResult<User> => {
 *   return safeAsync(() => prisma.user.findUnique({ where: { id } }))
 *     .andThen((user) => 
 *       user ? Ok(user) : Err(Errors.notFound('User', id))
 *     );
 * };
 * 
 * // Handle the result
 * const result = await fetchUser('123');
 * result.match(
 *   (user) => console.log('User found:', user),
 *   (error) => console.error('Error:', error.message)
 * );
 * 
 * // Combine multiple operations
 * const updateUserProfile = async (userId: string, data: UpdateData) => {
 *   const userResult = await fetchUser(userId);
 *   const validationResult = validateUpdateData(data);
 *   
 *   return combine([userResult, validationResult])
 *     .asyncAndThen(([user, validData]) => 
 *       safeAsync(() => prisma.user.update({
 *         where: { id: userId },
 *         data: validData
 *       }))
 *     );
 * };
 * ```
 */

// Re-export everything from types and utils
export * from './types.js';
export * from './utils.js';

// Commonly used patterns as shortcuts
import { safeAsync, safe, fromPromise, combine, combineAsync } from './utils.js';
import { Errors, type AppResult, type AsyncAppResult } from './types.js';

export {
  // Core utilities
  safeAsync,
  safe,
  fromPromise,
  combine,
  combineAsync,
  
  // Error factories
  Errors,
  
  // Common type aliases
  type AppResult,
  type AsyncAppResult,
};