import { z } from 'zod';
import { Priority, TodoStatus } from '@prisma/client';

// Base schemas for reuse
export const todoIdSchema = z.string().uuid();
export const userIdSchema = z.string().uuid();
export const todoListIdSchema = z.string().uuid().nullable();

// Title validation - must be non-empty and reasonable length
export const todoTitleSchema = z.string()
  .trim()
  .min(1, 'Title cannot be empty')
  .max(200, 'Title must be less than 200 characters');

// Description validation
export const todoDescriptionSchema = z.string()
  .trim()
  .max(1000, 'Description must be less than 1000 characters')
  .nullable();

// Status validation
export const todoStatusSchema = z.nativeEnum(TodoStatus);

// Priority validation
export const todoPrioritySchema = z.nativeEnum(Priority);

// Due date validation - must be in the future for new todos
export const todoDueDateSchema = z.date()
  .nullable()
  .refine((date) => {
    if (!date) return true;
    return date > new Date();
  }, 'Due date must be in the future');

// Tags validation
export const todoTagsSchema = z.array(
  z.string().trim().min(1).max(50)
).max(10, 'Maximum 10 tags allowed').default([]);

// Create todo input validation
export const createTodoSchema = z.object({
  title: todoTitleSchema,
  description: todoDescriptionSchema.default(null),
  priority: todoPrioritySchema.default(Priority.MEDIUM),
  dueDate: todoDueDateSchema.default(null),
  tags: todoTagsSchema,
  todoListId: todoListIdSchema.default(null),
});

// Update todo input validation
export const updateTodoSchema = z.object({
  title: todoTitleSchema.optional(),
  description: todoDescriptionSchema.optional(),
  status: todoStatusSchema.optional(),
  priority: todoPrioritySchema.optional(),
  dueDate: z.date().nullable().optional(), // Can be any date for updates
  tags: todoTagsSchema.optional(),
  todoListId: todoListIdSchema.optional(),
});

// Complete todo validation
export const completeTodoSchema = z.object({
  todoId: todoIdSchema,
});

// Delete todo validation
export const deleteTodoSchema = z.object({
  todoId: todoIdSchema,
});

// Query filters validation
export const todoFiltersSchema = z.object({
  status: todoStatusSchema.optional(),
  priority: todoPrioritySchema.optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
  todoListId: todoListIdSchema.optional(),
  dueBefore: z.date().optional(),
  dueAfter: z.date().optional(),
});

// Pagination validation
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// Sort options validation
export const todoSortSchema = z.object({
  field: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'title']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

// Export types
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type TodoFilters = z.infer<typeof todoFiltersSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type TodoSortInput = z.infer<typeof todoSortSchema>;