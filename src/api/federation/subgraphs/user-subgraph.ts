import { builder } from '../../schema/builder.js';
import { UserType } from '../../schema/types/User.js';
import { API_KEY_SCOPES, hasScope } from '@/infrastructure/security/ApiKeyMiddleware.js';
import type { ApiKey } from '@/infrastructure/security/ApiKeyManager.js';

/**
 * User Subgraph for GraphQL Federation
 * 
 * This subgraph handles user-related operations and can be deployed independently
 * while participating in a federated GraphQL gateway.
 */

// Federation key directive for User entity
builder.externalRef('User', builder.selection<{ id: string }>('id')).implement({
  externalFields: (t) => ({
    id: t.exposeID('id'),
  }),
  fields: (t) => ({
    // Federated fields that other subgraphs can extend
    email: t.string({
      resolve: (user) => user.email,
    }),
    
    profile: t.field({
      type: UserProfileType,
      resolve: (user) => ({
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        location: user.location,
        website: user.website,
      }),
    }),
    
    preferences: t.field({
      type: UserPreferencesType,
      resolve: (user) => ({
        theme: user.preferences?.theme || 'light',
        language: user.preferences?.language || 'en',
        timezone: user.preferences?.timezone || 'UTC',
        notifications: user.preferences?.notifications || {},
      }),
    }),
    
    // API management fields
    apiKeys: t.field({
      type: [ApiKeyType],
      resolve: async (user, args, context) => {
        // Only allow users to see their own API keys
        if (context.user?.id !== user.id) return [];
        
        // Use API key manager to get keys
        const { apiKeyManager } = await import('@/infrastructure/security/ApiKeyManager.js');
        return await apiKeyManager.listApiKeys(user.id);
      },
    }),
  }),
});

// User Profile Type
const UserProfileType = builder.objectType('UserProfile', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name', { nullable: true }),
    avatarUrl: t.exposeString('avatarUrl', { nullable: true }),
    bio: t.exposeString('bio', { nullable: true }),
    location: t.exposeString('location', { nullable: true }),
    website: t.exposeString('website', { nullable: true }),
  }),
});

// User Preferences Type
const UserPreferencesType = builder.objectType('UserPreferences', {
  fields: (t) => ({
    theme: t.exposeString('theme'),
    language: t.exposeString('language'),
    timezone: t.exposeString('timezone'),
    notifications: t.field({
      type: NotificationPreferencesType,
      resolve: (prefs) => prefs.notifications,
    }),
  }),
});

const NotificationPreferencesType = builder.objectType('NotificationPreferences', {
  fields: (t) => ({
    email: t.boolean({ resolve: (prefs) => prefs.email ?? true }),
    push: t.boolean({ resolve: (prefs) => prefs.push ?? true }),
    sms: t.boolean({ resolve: (prefs) => prefs.sms ?? false }),
    inApp: t.boolean({ resolve: (prefs) => prefs.inApp ?? true }),
  }),
});

// API Key Type for user management
const ApiKeyType = builder.objectType('ApiKey', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    keyPrefix: t.exposeString('keyPrefix'),
    scopes: t.exposeStringList('scopes'),
    rateLimit: t.field({
      type: RateLimitType,
      resolve: (key) => key.rateLimit,
    }),
    expiresAt: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (key) => key.expiresAt,
    }),
    lastUsedAt: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (key) => key.lastUsedAt,
    }),
    isActive: t.exposeBoolean('isActive'),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (key) => key.createdAt,
    }),
  }),
});

const RateLimitType = builder.objectType('RateLimit', {
  fields: (t) => ({
    rpm: t.exposeInt('rpm'),
    daily: t.exposeInt('daily'),
  }),
});

// User subgraph mutations
builder.mutationFields((t) => ({
  // Update user profile
  updateProfile: t.field({
    type: UserProfileType,
    args: {
      input: t.arg({
        type: builder.inputType('UpdateProfileInput', {
          fields: (t) => ({
            name: t.string({ required: false }),
            bio: t.string({ required: false }),
            location: t.string({ required: false }),
            website: t.string({ required: false }),
          }),
        }),
        required: true,
      }),
    },
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Not authenticated');
      
      // Update user profile in database
      const { default: prisma } = await import('@/lib/prisma.js');
      const updatedUser = await prisma.user.update({
        where: { id: context.user.id },
        data: args.input,
      });
      
      return {
        id: updatedUser.id,
        name: updatedUser.name,
        avatarUrl: updatedUser.avatarUrl,
        bio: updatedUser.bio,
        location: updatedUser.location,
        website: updatedUser.website,
      };
    },
  }),
  
  // Update user preferences
  updatePreferences: t.field({
    type: UserPreferencesType,
    args: {
      input: t.arg({
        type: builder.inputType('UpdatePreferencesInput', {
          fields: (t) => ({
            theme: t.string({ required: false }),
            language: t.string({ required: false }),
            timezone: t.string({ required: false }),
            notifications: t.field({
              type: builder.inputType('NotificationPreferencesInput', {
                fields: (t) => ({
                  email: t.boolean({ required: false }),
                  push: t.boolean({ required: false }),
                  sms: t.boolean({ required: false }),
                  inApp: t.boolean({ required: false }),
                }),
              }),
              required: false,
            }),
          }),
        }),
        required: true,
      }),
    },
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Not authenticated');
      
      // Update preferences in database
      const { default: prisma } = await import('@/lib/prisma.js');
      const currentUser = await prisma.user.findUnique({
        where: { id: context.user.id },
      });
      
      const newPreferences = {
        ...currentUser?.preferences,
        ...args.input,
      };
      
      await prisma.user.update({
        where: { id: context.user.id },
        data: { preferences: newPreferences },
      });
      
      return newPreferences;
    },
  }),
  
  // Generate API key
  generateApiKey: t.field({
    type: ApiKeyGenerationResultType,
    args: {
      input: t.arg({
        type: builder.inputType('GenerateApiKeyInput', {
          fields: (t) => ({
            name: t.string({ required: true }),
            scopes: t.stringList({ required: true }),
            rateLimit: t.field({
              type: builder.inputType('RateLimitInput', {
                fields: (t) => ({
                  rpm: t.int({ required: true }),
                  daily: t.int({ required: true }),
                }),
              }),
              required: false,
            }),
            expiresAt: t.field({ type: 'DateTime', required: false }),
          }),
        }),
        required: true,
      }),
    },
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Not authenticated');
      
      // Check if user has permission to create API keys with these scopes
      const requestedScopes = args.input.scopes;
      const canCreateAdminScopes = hasScope(context.apiKey, API_KEY_SCOPES.ADMIN_WRITE);
      
      if (!canCreateAdminScopes && requestedScopes.some(scope => scope.startsWith('admin:'))) {
        throw new Error('Insufficient permissions to create admin-scoped API keys');
      }
      
      const { apiKeyManager } = await import('@/infrastructure/security/ApiKeyManager.js');
      const result = await apiKeyManager.generateApiKey({
        name: args.input.name,
        userId: context.user.id,
        scopes: requestedScopes,
        rateLimit: args.input.rateLimit,
        expiresAt: args.input.expiresAt,
      });
      
      return {
        key: result.key,
        apiKey: result.apiKey,
      };
    },
  }),
  
  // Revoke API key
  revokeApiKey: t.field({
    type: 'Boolean',
    args: {
      keyId: t.arg.string({ required: true }),
    },
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const { apiKeyManager } = await import('@/infrastructure/security/ApiKeyManager.js');
      return await apiKeyManager.deactivateApiKey(args.keyId);
    },
  }),
}));

const ApiKeyGenerationResultType = builder.objectType('ApiKeyGenerationResult', {
  fields: (t) => ({
    key: t.exposeString('key'),
    apiKey: t.field({
      type: ApiKeyType,
      resolve: (result) => result.apiKey,
    }),
  }),
});

// Federation schema for user subgraph
export const userSubgraphSchema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.0',
});