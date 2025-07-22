/**
 * Zod validation schemas for input validation
 */

import { z } from "zod";
import validator from "validator";

/**
 * Custom Zod refinements and transformers
 */

// Email validation using validator.js
export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .max(320, "Email is too long")
  .refine((email) => validator.isEmail(email), {
    message: "Invalid email format",
  });

// Password validation
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password is too long")
  .refine(
    (password) =>
      validator.isStrongPassword(password, {
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
      }),
    {
      message:
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
    }
  );

// URL validation
export const urlSchema = z
  .string()
  .min(1, "URL is required")
  .refine((url) => validator.isURL(url), {
    message: "Invalid URL format",
  });

// UUID validation
export const uuidSchema = z
  .string()
  .min(1, "ID is required")
  .refine((id) => validator.isUUID(id), {
    message: "Invalid UUID format",
  });

// Slug validation (URL-safe identifier)
export const slugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(100, "Slug is too long")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must contain only lowercase letters, numbers, and hyphens"
  );

// HTML sanitization
export const htmlSchema = z
  .string()
  .transform((html) => validator.escape(html));

// Phone number validation
export const phoneSchema = z
  .string()
  .min(1, "Phone number is required")
  .refine((phone) => validator.isMobilePhone(phone), {
    message: "Invalid phone number format",
  });

/**
 * User-related schemas
 */

export const CreateUserSchema = z
  .object({
    email: emailSchema,
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name is too long")
      .transform((name) => name.trim()),
    password: passwordSchema.optional(),
    googleId: z.string().optional(),
    githubId: z.string().optional(),
  })
  .refine(
    (data) => {
      // Either password or OAuth ID must be provided
      return data.password || data.googleId || data.githubId;
    },
    {
      message: "Either password or OAuth provider ID must be provided",
      path: ["password"],
    }
  );

export const UpdateUserSchema = z.object({
  email: emailSchema.optional(),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name is too long")
    .transform((name) => name.trim())
    .optional(),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Todo-related schemas
 */

export const CreateTodoSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title is too long")
    .transform((title) => title.trim()),
  description: z
    .string()
    .max(1000, "Description is too long")
    .transform((desc) => desc.trim())
    .optional(),
  completed: z.boolean().default(false),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  dueDate: z.date().optional(),
  tags: z
    .array(
      z
        .string()
        .min(1)
        .max(50)
        .transform((tag) => tag.trim().toLowerCase())
    )
    .max(10, "Too many tags")
    .optional(),
  todoListId: uuidSchema.optional(),
});

export const UpdateTodoSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title is too long")
    .transform((title) => title.trim())
    .optional(),
  description: z
    .string()
    .max(1000, "Description is too long")
    .transform((desc) => desc?.trim() || null)
    .nullable()
    .optional(),
  completed: z.boolean().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.date().optional(),
  tags: z
    .array(
      z
        .string()
        .min(1)
        .max(50)
        .transform((tag) => tag.trim().toLowerCase())
    )
    .max(10, "Too many tags")
    .optional(),
});

/**
 * TodoList-related schemas
 */

export const CreateTodoListSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title is too long")
    .transform((title) => title.trim()),
  description: z
    .string()
    .max(500, "Description is too long")
    .transform((desc) => desc?.trim() || null)
    .nullable()
    .optional(),
  isPublic: z.boolean().default(false),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (must be hex color)")
    .optional(),
});

export const UpdateTodoListSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title is too long")
    .transform((title) => title.trim())
    .optional(),
  description: z
    .string()
    .max(500, "Description is too long")
    .transform((desc) => desc?.trim() || null)
    .nullable()
    .optional(),
  isPublic: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (must be hex color)")
    .optional(),
});

/**
 * Query parameter schemas
 */

export const PaginationSchema = z.object({
  page: z
    .string()
    .default("1")
    .transform((val) => parseInt(val, 10))
    .refine((num) => num > 0, "Page must be positive"),
  limit: z
    .string()
    .default("10")
    .transform((val) => parseInt(val, 10))
    .refine((num) => num > 0 && num <= 100, "Limit must be between 1 and 100"),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const TodoQuerySchema = z
  .object({
    completed: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    todoListId: uuidSchema.optional(),
    search: z
      .string()
      .max(100, "Search query is too long")
      .transform((query) => query.trim())
      .optional(),
    tags: z
      .string()
      .transform((tags) =>
        tags.split(",").map((tag) => tag.trim().toLowerCase())
      )
      .optional(),
    dueBefore: z.date().optional(),
    dueAfter: z.date().optional(),
  })
  .and(PaginationSchema);

export const TodoListQuerySchema = z
  .object({
    isPublic: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    search: z
      .string()
      .max(100, "Search query is too long")
      .transform((query) => query.trim())
      .optional(),
  })
  .and(PaginationSchema);

/**
 * File upload schemas
 */

export const FileUploadSchema = z.object({
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename is too long")
    .refine((filename) => {
      const allowedExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".pdf",
        ".doc",
        ".docx",
      ];
      const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
      return allowedExtensions.includes(ext);
    }, "File type not allowed"),
  size: z
    .number()
    .positive("File size must be positive")
    .max(10 * 1024 * 1024, "File size cannot exceed 10MB"), // 10MB limit
  mimeType: z.string().refine((mimeType) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    return allowedMimeTypes.includes(mimeType);
  }, "MIME type not allowed"),
});

/**
 * Authentication schemas
 */

export const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

export const RegisterSchema = z
  .object({
    email: emailSchema,
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name is too long")
      .transform((name) => name.trim()),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm password is required"),
    agreedToTerms: z
      .boolean()
      .refine((agreed) => agreed, "You must agree to the terms of service"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const ForgotPasswordSchema = z.object({
  email: emailSchema,
});

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * API schemas
 */

export const ApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "API key name is required")
    .max(100, "API key name is too long")
    .transform((name) => name.trim()),
  scopes: z
    .array(z.enum(["read", "write", "admin"]))
    .min(1, "At least one scope is required"),
  expiresAt: z.date().optional(),
});

/**
 * Webhook schemas
 */

export const WebhookSchema = z.object({
  url: urlSchema,
  events: z
    .array(
      z.enum([
        "todo.created",
        "todo.updated",
        "todo.deleted",
        "todolist.created",
        "todolist.updated",
        "todolist.deleted",
      ])
    )
    .min(1, "At least one event type is required"),
  secret: z
    .string()
    .min(16, "Webhook secret must be at least 16 characters")
    .max(256, "Webhook secret is too long")
    .optional(),
  active: z.boolean().default(true),
});

/**
 * Environment variable schemas
 */

export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z
    .string()
    .default("4000")
    .transform((val) => parseInt(val, 10))
    .refine(
      (num) => num > 0 && num < 65536,
      "Port must be between 1 and 65535"
    ),
  DATABASE_URL: z.string().url("Invalid database URL"),
  REDIS_URL: z.string().url("Invalid Redis URL").optional(),
  SESSION_SECRET: z
    .string()
    .min(32, "Session secret must be at least 32 characters"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

/**
 * Export type inferrers for schemas
 */
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type CreateTodoInput = z.infer<typeof CreateTodoSchema>;
export type UpdateTodoInput = z.infer<typeof UpdateTodoSchema>;
export type CreateTodoListInput = z.infer<typeof CreateTodoListSchema>;
export type UpdateTodoListInput = z.infer<typeof UpdateTodoListSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type TodoQueryInput = z.infer<typeof TodoQuerySchema>;
export type TodoListQueryInput = z.infer<typeof TodoListQuerySchema>;
export type FileUploadInput = z.infer<typeof FileUploadSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type ApiKeyInput = z.infer<typeof ApiKeySchema>;
export type WebhookInput = z.infer<typeof WebhookSchema>;
export type EnvInput = z.infer<typeof EnvSchema>;
