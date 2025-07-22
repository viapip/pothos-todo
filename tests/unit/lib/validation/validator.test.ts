/**
 * Tests for validation system
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validate, validateArray, createValidator } from '@/lib/validation/validator.js';

describe('Validation System', () => {
  describe('validate', () => {
    it('should validate valid data', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0)
      });
      
      const data = { email: 'test@example.com', age: 25 };
      const result = validate(schema, data);
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual(data);
    });

    it('should return error for invalid data', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0)
      });
      
      const data = { email: 'invalid-email', age: -5 };
      const result = validate(schema, data);
      
      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Invalid input');
    });

    it('should handle transformation schemas', () => {
      const schema = z.string().transform(s => s.toUpperCase());
      
      const result = validate(schema, 'hello');
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('HELLO');
    });

    it('should handle refinement schemas', () => {
      const schema = z.string().refine(s => s.length >= 3, 'Must be at least 3 characters');
      
      const validResult = validate(schema, 'hello');
      expect(validResult.isOk()).toBe(true);
      
      const invalidResult = validate(schema, 'hi');
      expect(invalidResult.isErr()).toBe(true);
    });
  });

  describe('validateArray', () => {
    it('should validate array of valid items', () => {
      const schema = z.object({
        id: z.string(),
        value: z.number()
      });
      
      const data = [
        { id: '1', value: 10 },
        { id: '2', value: 20 }
      ];
      
      const result = validateArray(schema, data);
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual(data);
    });

    it('should return error if any item is invalid', () => {
      const schema = z.object({
        id: z.string(),
        value: z.number()
      });
      
      const data = [
        { id: '1', value: 10 },
        { id: '2', value: 'invalid' } // Invalid value
      ];
      
      const result = validateArray(schema, data);
      
      expect(result.isErr()).toBe(true);
      expect(result.error.message).toContain('Validation failed for array');
    });

    it('should handle empty array', () => {
      const schema = z.string();
      const result = validateArray(schema, []);
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe('createValidator', () => {
    it('should create reusable validator', () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email()
      });
      
      const validator = createValidator(schema);
      
      const validResult = validator({ name: 'John', email: 'john@example.com' });
      expect(validResult.isOk()).toBe(true);
      
      const invalidResult = validator({ name: '', email: 'invalid' });
      expect(invalidResult.isErr()).toBe(true);
    });

    it('should preserve schema transformations in validator', () => {
      const schema = z.object({
        name: z.string().transform(s => s.trim().toLowerCase())
      });
      
      const validator = createValidator(schema);
      const result = validator({ name: '  JOHN  ' });
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap().name).toBe('john');
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18, 'Must be at least 18'),
        name: z.string().min(1, 'Name is required')
      });
      
      const result = validate(schema, {
        email: 'invalid-email',
        age: 15,
        name: ''
      });
      
      expect(result.isErr()).toBe(true);
      const error = result.error;
      
      expect(error.message).toContain('Invalid input');
      expect(error.context).toBeDefined();
      expect(error.context?.fields).toBeDefined();
    });

    it('should handle unexpected validation errors', () => {
      const schema = z.object({}).refine(() => {
        throw new Error('Unexpected error');
      });
      
      const result = validate(schema, {});
      
      expect(result.isErr()).toBe(true);
      expect(result.error.message).toBe('Validation failed');
    });
  });

  describe('complex schemas', () => {
    it('should handle nested objects', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          profile: z.object({
            age: z.number(),
            bio: z.string().optional()
          })
        })
      });
      
      const data = {
        user: {
          name: 'John',
          profile: {
            age: 25,
            bio: 'Software developer'
          }
        }
      };
      
      const result = validate(schema, data);
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual(data);
    });

    it('should handle arrays with nested validation', () => {
      const schema = z.array(z.object({
        id: z.string().uuid(),
        tags: z.array(z.string().min(1))
      }));
      
      const data = [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          tags: ['work', 'important']
        }
      ];
      
      const result = validate(schema, data);
      
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual(data);
    });
  });
});