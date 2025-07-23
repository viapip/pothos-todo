import type { Plugin } from 'graphql-yoga';
import {
  GraphQLSchema,
  getNamedType,
  ValidationContext,
  type DocumentNode,
  visit,
  visitWithTypeInfo,
  TypeInfo,
  type FieldNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  GraphQLError,
} from 'graphql';
import { logger } from '@/logger.js';
import type { SchemaTypes } from '@pothos/core';

// Extend Pothos field options with complexity options  
export interface QueryComplexityOptions {
  /**
   * Maximum allowed complexity score
   */
  maxComplexity?: number;

  /**
   * Default complexity for fields without explicit complexity
   */
  defaultComplexity?: number;

  /**
   * Default multiplier for list fields
   */
  defaultListMultiplier?: number;

  /**
   * Custom complexity estimators by field
   */
  estimators?: {
    [typeName: string]: {
      [fieldName: string]: ComplexityEstimator;
    };
  };

  /**
   * Callback when query exceeds complexity
   */
  onExceededComplexity?: (complexity: number, maxComplexity: number, query: string) => void;
}

export type ComplexityEstimator = (args: Record<string, any>, childComplexity: number) => number;

declare module '@pothos/core' {
  export interface FieldOptions<Types extends SchemaTypes = SchemaTypes, ParentShape = unknown, Type = unknown, Nullable = false, Args extends {} = {}, ResolveReturnShape = unknown> {
    complexity?: number | ComplexityEstimator;
  }
}

/**
 * Calculate query complexity
 */
export function calculateQueryComplexity(
  schema: GraphQLSchema,
  document: DocumentNode,
  variables: Record<string, any> = {},
  options: QueryComplexityOptions = {}
): number {
  const {
    defaultComplexity = 1,
    defaultListMultiplier = 10,
    estimators = {},
  } = options;

  const typeInfo = new TypeInfo(schema);
  const fragments: Record<string, FragmentDefinitionNode> = {};

  // Collect fragments
  visit(document, {
    FragmentDefinition(node) {
      fragments[node.name.value] = node;
    },
  });

  let complexity = 0;

  visit(
    document,
    visitWithTypeInfo(typeInfo, {
      Field(node: FieldNode) {
        const fieldDef = typeInfo.getFieldDef();
        if (!fieldDef) return;

        const parentType = typeInfo.getParentType();
        if (!parentType) return;

        const typeName = parentType.name;
        const fieldName = fieldDef.name;

        // Get field complexity
        let fieldComplexity = defaultComplexity;

        // Check custom estimators
        if (estimators[typeName]?.[fieldName]) {
          const args = getArgumentValues(node, variables);
          const childComplexity = node.selectionSet
            ? calculateSelectionSetComplexity(
              node.selectionSet,
              typeInfo,
              fragments,
              variables,
              options
            )
            : 0;
          fieldComplexity = estimators[typeName][fieldName](args, childComplexity);
        } else if (fieldDef.extensions?.complexity) {
          const complexityConfig = fieldDef.extensions.complexity;
          if (typeof complexityConfig === 'number') {
            fieldComplexity = complexityConfig;
          } else if (typeof complexityConfig === 'function') {
            const args = getArgumentValues(node, variables);
            const childComplexity = node.selectionSet
              ? calculateSelectionSetComplexity(
                node.selectionSet,
                typeInfo,
                fragments,
                variables,
                options
              )
              : 0;
            fieldComplexity = complexityConfig(args, childComplexity);
          }
        }

        // Apply list multiplier
        const fieldType = getNamedType(fieldDef.type);
        if (fieldDef.type.toString().includes('[')) {
          const args = getArgumentValues(node, variables);
          const limit = args.limit || args.first || args.last || defaultListMultiplier;
          fieldComplexity *= Math.min(limit, 1000); // Cap at 1000 to prevent abuse
        }

        complexity += fieldComplexity;
      },
    })
  );

  return complexity;
}

/**
 * Calculate selection set complexity
 */
function calculateSelectionSetComplexity(
  selectionSet: SelectionSetNode,
  typeInfo: TypeInfo,
  fragments: Record<string, FragmentDefinitionNode>,
  variables: Record<string, any>,
  options: QueryComplexityOptions
): number {
  let complexity = 0;

  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      // Field complexity is handled by the main visitor
      complexity += 1;
    } else if (selection.kind === 'InlineFragment') {
      complexity += calculateSelectionSetComplexity(
        selection.selectionSet,
        typeInfo,
        fragments,
        variables,
        options
      );
    } else if (selection.kind === 'FragmentSpread') {
      const fragment = fragments[selection.name.value];
      if (fragment) {
        complexity += calculateSelectionSetComplexity(
          fragment.selectionSet,
          typeInfo,
          fragments,
          variables,
          options
        );
      }
    }
  }

  return complexity;
}

/**
 * Get argument values from field node
 */
function getArgumentValues(
  node: FieldNode,
  variables: Record<string, any>
): Record<string, any> {
  const args: Record<string, any> = {};

  if (node.arguments) {
    for (const arg of node.arguments) {
      const name = arg.name.value;
      const value = arg.value;

      if (value.kind === 'Variable') {
        args[name] = variables[value.name.value];
      } else if (value.kind === 'IntValue') {
        args[name] = parseInt(value.value, 10);
      } else if (value.kind === 'FloatValue') {
        args[name] = parseFloat(value.value);
      } else if (value.kind === 'StringValue') {
        args[name] = value.value;
      } else if (value.kind === 'BooleanValue') {
        args[name] = value.value;
      } else if (value.kind === 'NullValue') {
        args[name] = null;
      } else if (value.kind === 'ListValue') {
        args[name] = value.values.map((v: any) => {
          if (v.kind === 'IntValue') return parseInt(v.value, 10);
          if (v.kind === 'StringValue') return v.value;
          return v.value;
        });
      }
    }
  }

  return args;
}

/**
 * Create query complexity plugin
 */
export function createQueryComplexityPlugin(options: QueryComplexityOptions = {}): Plugin {
  const {
    maxComplexity = 1000,
    onExceededComplexity,
  } = options;

  return {
    onValidate({ addValidationRule }) {
      addValidationRule((context: ValidationContext) => {
        return {
          Document(node: DocumentNode) {
            const complexity = calculateQueryComplexity(
              context.getSchema(),
              node,
              {}, // Variables will be provided at execution time
              options
            );

            if (complexity > maxComplexity) {
              const queryStr = node.loc?.source.body || 'Unknown query';

              logger.warn('Query complexity exceeded', {
                complexity,
                maxComplexity,
                query: queryStr.substring(0, 200) + '...',
              });

              if (onExceededComplexity) {
                onExceededComplexity(complexity, maxComplexity, queryStr);
              }

              context.reportError(
                new GraphQLError(
                  `Query complexity ${complexity} exceeds maximum allowed complexity ${maxComplexity}`
                )
              );
            }
          },
        };
      });
    },

    onExecute({ args }) {
      // Recalculate with actual variables
      const complexity = calculateQueryComplexity(
        args.schema,
        args.document,
        args.variableValues as Record<string, any>,
        options
      );

      if (complexity > maxComplexity) {
        throw new Error(
          `Query complexity ${complexity} exceeds maximum allowed complexity ${maxComplexity}`
        );
      }

      // Add complexity to context for logging
      if (args.contextValue) {
        (args.contextValue as any).queryComplexity = complexity;
      }

      logger.debug('Query complexity calculated', {
        complexity,
        maxComplexity,
        operationName: args.operationName,
      });
    },
  };
}

/**
 * Common complexity estimators
 */
export const complexityEstimators = {
  /**
   * Multiplier based on limit/first/last arguments
   */
  multiplierFromArgs: (multiplier = 1): ComplexityEstimator => {
    return (args, childComplexity) => {
      const limit = args.limit || args.first || args.last || 10;
      return multiplier * limit + childComplexity * limit;
    };
  },

  /**
   * Fixed complexity regardless of arguments
   */
  fixed: (complexity: number): ComplexityEstimator => {
    return () => complexity;
  },

  /**
   * Complexity based on child selections
   */
  childBased: (base = 1): ComplexityEstimator => {
    return (args, childComplexity) => base + childComplexity;
  },
};