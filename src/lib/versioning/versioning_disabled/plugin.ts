/**
 * Pothos Versioning Plugin
 * GraphQL Yoga plugin that integrates API versioning and deprecation tracking
 */

import type { OnExecuteDoneEventPayload, OnSubscribeResultResult, Plugin } from '@envelop/core';
import type { OnContextBuildingEventPayload, OnParseEventPayload, OnValidateEventPayload } from '@envelop/core';
  import { logger } from '../../logger.js';
import { versionManager } from './manager.js';
import type {
  VersionedGraphQLContext,
  ApiVersion,
  VersionContext,
} from './types.js';
import {
  recordGraphqlOperation,
  recordGraphqlError,
} from '../monitoring/metrics.js';
import type { H3Event } from 'h3';
import type { Request } from 'node:http';

// ================================
// Version Resolution Plugin
// ================================

export const versioningPlugin = (): Plugin => {
  return {
    onContextBuilding({ context, extendContext }: OnContextBuildingEventPayload<{
      request: Request;
      h3Event: H3Event<{
        node: {
          req: Request;
        };
      }>;
    }>) {
      // biome-ignore lint/suspicious/noExplicitAny: this is fine
      // Extract version context from request
      const request = context.request || context.h3Event?.node?.req;
      if (!request) return;

      const headers = request.headers || {};
      const versionContext = versionManager.resolveVersion(headers);

      // Create versioned context
      const versionedContext: VersionedGraphQLContext = {
        version: versionContext.requestedVersion,
        clientInfo: {
          id: versionContext.clientId || 'anonymous',
          userAgent: versionContext.userAgent,
        },
        deprecationTracker: versionManager.createDeprecationTracker(versionContext),
        migrationHelper: versionManager.createMigrationHelper(versionContext),
      };

      extendContext(versionedContext);

      logger.debug('Version context established', {
        version: versionContext.requestedVersion,
        clientId: versionContext.clientId,
        userAgent: versionContext.userAgent,
      });
    },

    onParse({ params, extendContext }: OnParseEventPayload<{
      contextValue: VersionedGraphQLContext;
    }>) {
      // biome-ignore lint/suspicious/noExplicitAny: this is fine
      // Track operation parsing
      const versionedContext = params.contextValue as VersionedGraphQLContext;
      if (versionedContext?.version) {
        logger.debug('Parsing GraphQL operation', {
          version: versionedContext.version,
          clientId: versionedContext.clientInfo?.id,
        });
      }
    },

    onValidate({ params, extendContext }: OnValidateEventPayload<{
      contextValue: VersionedGraphQLContext;
    }>) {
      // biome-ignore lint/suspicious/noExplicitAny: this is fine
      // Track validation phase
      const versionedContext = params.contextValue as VersionedGraphQLContext;
      if (versionedContext?.version) {
        logger.debug('Validating GraphQL operation', {
          version: versionedContext.version,
          clientId: versionedContext.clientInfo?.id,
        });
      }
    },

    onExecute() {
      return {
        onExecuteDone({ result, args }: OnExecuteDoneEventPayload<{
          contextValue: VersionedGraphQLContext;
        }>) {
          // biome-ignore lint/suspicious/noExplicitAny: this is fine
          const startTime = Date.now();
          const versionedContext = args.contextValue as VersionedGraphQLContext;

          return () => {
            const duration = (Date.now() - startTime) / 1000;
            const hasErrors = result.errors && result.errors.length > 0;

            // Record operation metrics
            if (versionedContext?.version) {
              recordGraphqlOperation(
                'execute',
                'operation',
                hasErrors ? 'error' : 'success',
                duration
              );

              logger.debug('GraphQL operation completed', {
                version: versionedContext.version,
                clientId: versionedContext.clientInfo?.id,
                duration,
                hasErrors,
                errorCount: result.errors?.length || 0,
              });

              // Track deprecation warnings in response
              if (result.extensions && versionedContext.deprecationTracker) {
                const warnings = versionedContext.deprecationTracker.getWarnings();
                if (warnings.length > 0) {
                  result.extensions.deprecationWarnings = warnings;
                  
                  logger.info('Deprecation warnings added to response', {
                    version: versionedContext.version,
                    clientId: versionedContext.clientInfo?.id,
                    warningCount: warnings.length,
                  });
                }
              }
            }
          };
        },
      };
    },

    onSubscribe() {
      return {
        onSubscribeResult({ result, args }: OnSubscribeResultResult<{
          contextValue: VersionedGraphQLContext;
        }>) {
          const versionedContext = args.contextValue as VersionedGraphQLContext;

          if (versionedContext?.version) {
            logger.debug('GraphQL subscription established', {
              version: versionedContext.version,
              clientId: versionedContext.clientInfo?.id,
            });

            recordGraphqlOperation(
              'subscribe',
              'subscription',
              'success',
              0
            );
          }

          return result;
        },
      };
    },
  };
};

// ================================
// Field-Level Deprecation Plugin
// ================================

export const fieldDeprecationPlugin = (): Plugin => {
  return {
    onExecute() {
      return {
        onExecuteDone({ result, args }: OnExecuteDoneEventPayload<{
          contextValue: VersionedGraphQLContext;
        }>) {
          // biome-ignore lint/suspicious/noExplicitAny: this is fine
          return () => {
            const versionedContext = args.contextValue as VersionedGraphQLContext;
            if (!versionedContext?.deprecationTracker) return;

            // Parse execution result to find deprecated field usage
            if (args.document && args.document.definitions) {
              for (const definition of args.document.definitions) {
                if (definition.kind === 'OperationDefinition' && definition.selectionSet) {
                  this.analyzeSelectionSet(
                    definition.selectionSet,
                    versionedContext.deprecationTracker,
                    versionedContext.version
                  );
                }
              }
            }
          };
        },
      };
    },

    analyzeSelectionSet(selectionSet: any, tracker: any, version: ApiVersion) {
      for (const selection of selectionSet.selections) {
        if (selection.kind === 'Field') {
          const fieldName = selection.name.value;
          
          // Check for known deprecated fields
          this.checkDeprecatedField('Query', fieldName, tracker);
          
          // Recursively analyze nested selections
          if (selection.selectionSet) {
            this.analyzeSelectionSet(selection.selectionSet, tracker, version);
          }
        } else if (selection.kind === 'InlineFragment' && selection.selectionSet) {
          this.analyzeSelectionSet(selection.selectionSet, tracker, version);
        }
      }
    },

    checkDeprecatedField(typeName: string, fieldName: string, tracker: any) {
      if (tracker.shouldWarnClient(`${typeName}.${fieldName}`)) {
        tracker.trackUsage(`${typeName}.${fieldName}`, 'medium');
      }
    },
  };
};

// ================================
// Version Header Plugin
// ================================

export const versionHeaderPlugin = (): Plugin => {
  return {
    onRequestParse({ request, url, setURL, setRequest }) {
      // Add version information to response headers
      const versionHeader = request.headers.get('api-version') || 
                           request.headers.get('x-api-version') || 
                           'v3';

      return ({ result, setResult }) => {
        // This will run after parsing
        return {
          onResultProcess({ request, result, setResult }) {
            // Add version information to response
            if (result.http && result.http.headers) {
              result.http.headers.set('x-api-version', versionHeader);
              result.http.headers.set('x-api-version-latest', 'v3');
              result.http.headers.set('x-api-supported-versions', 'v1,v2,v3');
            }
          },
        };
      };
    },
  };
};

// ================================
// Migration Assistance Plugin
// ================================

export const migrationAssistancePlugin = (): Plugin => {
  return {
    onExecute() {
      return {
                onExecuteDone({ result, args }: OnExecuteDoneEventPayload<{
          contextValue: VersionedGraphQLContext;
        }>) {
          // biome-ignore lint/suspicious/noExplicitAny: this is fine
          return () => {
            const versionedContext = args.contextValue as VersionedGraphQLContext;
            if (!versionedContext?.migrationHelper) return;

            // Add migration suggestions to response extensions
            const warnings = versionedContext.deprecationTracker?.getWarnings() || [];
            if (warnings.length > 0 && versionedContext.version !== 'v3') {
              const migrationPlan = versionedContext.migrationHelper.getMigrationPlan(
                versionedContext.version,
                'v3'
              );

              if (!result.extensions) result.extensions = {};
              result.extensions.migrationSuggestions = {
                currentVersion: versionedContext.version,
                latestVersion: 'v3',
                migrationPlan: {
                  steps: migrationPlan.steps.slice(0, 3), // Show first 3 steps
                  estimatedDuration: migrationPlan.estimatedDuration,
                  breakingChanges: migrationPlan.breakingChanges.length,
                },
                documentationUrl: `/docs/migration/${versionedContext.version}-to-v3`,
              };
            }
          };
        },
      };
    },
  };
};

// ================================
// Combined Versioning Plugin
// ================================

export const createVersioningPlugins = () => {
  return [
    versioningPlugin(),
    fieldDeprecationPlugin(),
    versionHeaderPlugin(),
    migrationAssistancePlugin(),
  ];
};

// ================================
// Pothos Integration Helpers
// ================================

export function createVersionedField<T>(
  typeName: string,
  fieldName: string,
  fieldConfig: any
) {
  return (t: any) => {
    const field = t.field(fieldName, {
      ...fieldConfig,
      resolve: async (parent: any, args: any, context: any, info: any) => {
        const versionedContext = context as VersionedGraphQLContext;
        
        // Check if field is deprecated in current version
        if (versionedContext?.deprecationTracker?.shouldWarnClient(`${typeName}.${fieldName}`)) {
          versionedContext.deprecationTracker.trackUsage(`${typeName}.${fieldName}`, 'medium');
        }

        // Call original resolver
        if (fieldConfig.resolve) {
          return await fieldConfig.resolve(parent, args, context, info);
        }

        return parent[fieldName];
      },
    });

    return field;
  };
}

export function deprecatedField<T>(
  fieldName: string,
  deprecationInfo: {
    reason: string;
    replacement?: string;
    removedAt?: string;
  }
) {
  return (t: any) => {
    return t.field(fieldName, {
      type: 'String', // or appropriate type
      deprecationReason: `${deprecationInfo.reason}${
        deprecationInfo.replacement ? ` Use ${deprecationInfo.replacement} instead.` : ''
      }${
        deprecationInfo.removedAt ? ` Will be removed on ${deprecationInfo.removedAt}.` : ''
      }`,
      resolve: (parent: any, args: any, context: VersionedGraphQLContext) => {
        // Track usage
        if (context.deprecationTracker) {
          context.deprecationTracker.trackUsage(`${parent.constructor.name}.${fieldName}`, 'high');
        }

        return parent[fieldName];
      },
    });
  };
}