/**
 * Tests for Result type system
 */

import { describe, it, expect } from 'vitest';
import { Ok, Err, Errors, toAppError, ErrorCode } from '@/lib/result/types.js';

describe('Result Types', () => {
  describe('Ok', () => {
    it('should create successful result', () => {
      const result = new Ok('success');
      
      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
      expect(result.unwrap()).toBe('success');
    });

    it('should handle null values', () => {
      const result = new Ok(null);
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(null);
    });
  });

  describe('Err', () => {
    it('should create error result', () => {
      const error = Errors.validation('Test error');
      const result = new Err(error);
      
      expect(result.isErr()).toBe(true);
      expect(result.isOk()).toBe(false);
      expect(result.error).toBe(error);
    });

    it('should unwrap error', () => {
      const error = Errors.validation('Test error');
      const result = new Err(error);
      
      expect(() => result.unwrap()).toThrow('Test error');
    });
  });

  describe('Errors factory', () => {
    it('should create validation error', () => {
      const error = Errors.validation('Invalid input');
      
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid input');
    });

    it('should create not found error', () => {
      const error = Errors.notFound('User', '123');
      
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.message).toBe('User with id 123 not found');
    });

    it('should create unauthorized error', () => {
      const error = Errors.unauthorized();
      
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.message).toBe('Authentication required');
    });

    it('should create forbidden error', () => {
      const error = Errors.forbidden();
      
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
      expect(error.message).toBe('Insufficient permissions');
    });
  });

  describe('toAppError', () => {
    it('should convert Error to AppError', () => {
      const error = new Error('Test error');
      const appError = toAppError(error);
      
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
      expect(appError.message).toBe('Test error');
    });

    it('should convert string to AppError', () => {
      const appError = toAppError('String error');
      
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
      expect(appError.message).toBe('String error');
    });

    it('should pass through AppError unchanged', () => {
      const original = Errors.validation('Original error');
      const converted = toAppError(original);
      
      expect(converted).toBe(original);
    });

    it('should handle unknown error types', () => {
      const appError = toAppError({ custom: 'error' });
      
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
      expect(appError.message).toBe('Unknown error occurred');
    });
  });

  describe('Result chaining', () => {
    it('should chain successful operations', () => {
      const result = new Ok(5)
        .map(x => x * 2)
        .map(x => x.toString());
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('10');
    });

    it('should short-circuit on error', () => {
      const error = Errors.validation('Invalid');
      const result = new Err<number>(error)
        .map(x => x * 2)
        .map(x => x.toString());
      
      expect(result.isErr()).toBe(true);
      expect(result.error).toBe(error);
    });

    it('should handle async chaining', async () => {
      const asyncOperation = (x: number) => 
        Promise.resolve(new Ok(x * 3));
      
      const result = await new Ok(4)
        .asyncMap(asyncOperation);
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(12);
    });
  });
});