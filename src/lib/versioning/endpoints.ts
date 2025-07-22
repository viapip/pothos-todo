/**
 * HTTP Endpoints for API Versioning Management
 * RESTful endpoints for version information, deprecation reports, and client guidance
 */

import { logger } from '../../logger.js';
import { 
  versionRegistry, 
  deprecationManager, 
  versionManager 
} from './manager.js';
import type { 
  ApiVersion,
  VersionUsageStats,
  DeprecationReport,
  MigrationRecommendation 
} from './types.js';

// ================================
// Version Information Endpoint
// ================================

export function createVersionInfoEndpoint() {
  return async (event: any) => {
    try {
      const supportedVersions = versionRegistry.getSupportedVersions();
      const deprecatedVersions = versionRegistry.getDeprecatedVersions();
      const latestVersion = versionRegistry.getLatestVersion();

      const versionInfo = {
        api: {
          name: 'Pothos Todo GraphQL API',
          description: 'Modern GraphQL API with comprehensive todo management',
          documentation: 'https://docs.example.com/api',
        },
        versions: {
          supported: supportedVersions,
          deprecated: deprecatedVersions,
          latest: latestVersion,
          default: 'v3',
        },
        details: Object.fromEntries(
          supportedVersions.map(version => [
            version,
            versionRegistry.getVersion(version)
          ])
        ),
        usage: {
          howToSpecify: {
            header: 'Include "API-Version: v3" or "X-API-Version: v3" header',
            parameter: 'Not supported - use headers only',
            default: 'Latest stable version (v3) is used when no version header is provided'
          },
          examples: {
            curl: 'curl -H "API-Version: v3" https://api.example.com/graphql',
            javascript: 'fetch("/graphql", { headers: { "API-Version": "v3" } })',
          },
        },
        deprecation: {
          policy: {
            warningPeriod: '6 months',
            sunsetPeriod: '12 months',
            notificationChannels: ['api-notifications@example.com'],
          },
          activeWarnings: deprecationManager.generateDeprecationReport().summary,
        },
        migration: {
          guides: {
            'v1-to-v2': '/docs/migration/v1-to-v2',
            'v2-to-v3': '/docs/migration/v2-to-v3',
            'v1-to-v3': '/docs/migration/v1-to-v3',
          },
          tools: {
            migrationPlan: 'POST /api/version/migration-plan',
            queryTransform: 'POST /api/version/transform-query',
            deprecationReport: 'GET /api/version/deprecation-report',
          },
        },
      };

      return new Response(JSON.stringify(versionInfo, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    } catch (error) {
      logger.error('Version info endpoint error', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to retrieve version information',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

// ================================
// Deprecation Report Endpoint
// ================================

export function createDeprecationReportEndpoint() {
  return async (event: any) => {
    try {
      const report = deprecationManager.generateDeprecationReport();
      
      // Add additional analysis
      const enhancedReport = {
        ...report,
        analysis: {
          riskLevel: calculateRiskLevel(report),
          urgentActions: getUrgentActions(report),
          migrationPriorities: getMigrationPriorities(report),
        },
        nextSteps: generateNextSteps(report),
      };

      return new Response(JSON.stringify(enhancedReport, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache', // Always fetch fresh data
        },
      });
    } catch (error) {
      logger.error('Deprecation report endpoint error', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to generate deprecation report',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

// ================================
// Client Migration Plan Endpoint
// ================================

export function createMigrationPlanEndpoint() {
  return async (event: any) => {
    try {
      const request = event.node?.req || event.request;
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const body = await request.json();
      const { fromVersion, toVersion, clientId } = body;

      if (!fromVersion || !toVersion) {
        return new Response(JSON.stringify({
          error: 'Missing required parameters',
          message: 'fromVersion and toVersion are required',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Validate versions
      const supportedVersions = versionRegistry.getSupportedVersions();
      if (!supportedVersions.includes(fromVersion) || !supportedVersions.includes(toVersion)) {
        return new Response(JSON.stringify({
          error: 'Invalid version',
          message: `Supported versions: ${supportedVersions.join(', ')}`,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Create version context for migration helper
      const versionContext = {
        requestedVersion: fromVersion,
        clientId,
        acceptsDeprecation: true,
        migrationMode: true,
      };

      const migrationHelper = versionManager.createMigrationHelper(versionContext);
      const plan = migrationHelper.getMigrationPlan(fromVersion, toVersion);

      // Enhance plan with client-specific recommendations
      const enhancedPlan = {
        ...plan,
        clientSpecific: {
          id: clientId,
          currentUsage: clientId ? await getClientUsagePatterns(clientId) : null,
          recommendedOrder: generateMigrationOrder(plan),
          estimatedDowntime: calculateDowntime(plan),
        },
        validation: {
          testQueries: generateTestQueries(fromVersion, toVersion),
          rollbackSteps: generateRollbackSteps(fromVersion, toVersion),
        },
      };

      logger.info('Migration plan generated', {
        fromVersion,
        toVersion,
        clientId,
        stepsCount: plan.steps.length,
      });

      return new Response(JSON.stringify(enhancedPlan, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=300', // Cache for 5 minutes per client
        },
      });
    } catch (error) {
      logger.error('Migration plan endpoint error', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to generate migration plan',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

// ================================
// Query Transformation Endpoint
// ================================

export function createQueryTransformEndpoint() {
  return async (event: any) => {
    try {
      const request = event.node?.req || event.request;
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const body = await request.json();
      const { query, fromVersion, toVersion } = body;

      if (!query || !fromVersion || !toVersion) {
        return new Response(JSON.stringify({
          error: 'Missing required parameters',
          message: 'query, fromVersion, and toVersion are required',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Create version context for migration helper
      const versionContext = {
        requestedVersion: fromVersion,
        acceptsDeprecation: true,
        migrationMode: true,
      };

      const migrationHelper = versionManager.createMigrationHelper(versionContext);
      const transformedQuery = migrationHelper.generateMigrationQuery(query, fromVersion, toVersion);

      const result = {
        original: {
          query,
          version: fromVersion,
        },
        transformed: {
          query: transformedQuery,
          version: toVersion,
        },
        changes: analyzeQueryChanges(query, transformedQuery, fromVersion, toVersion),
        warnings: validateTransformedQuery(transformedQuery),
      };

      return new Response(JSON.stringify(result, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
        },
      });
    } catch (error) {
      logger.error('Query transform endpoint error', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to transform query',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

// ================================
// Usage Analytics Endpoint
// ================================

export function createUsageAnalyticsEndpoint() {
  return async (event: any) => {
    try {
      const url = new URL(event.node?.req?.url || event.request?.url);
      const version = url.searchParams.get('version');
      const days = parseInt(url.searchParams.get('days') || '30');
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      let analytics: any = {};

      if (version) {
        // Single version analytics
        analytics = versionManager.getVersionUsageStats(version as ApiVersion, startDate, endDate);
      } else {
        // All versions analytics
        const supportedVersions = versionRegistry.getSupportedVersions();
        analytics = {
          period: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          versions: Object.fromEntries(
            await Promise.all(
              supportedVersions.map(async v => [
                v,
                versionManager.getVersionUsageStats(v, startDate, endDate)
              ])
            )
          ),
          summary: generateUsageSummary(supportedVersions, startDate, endDate),
        };
      }

      return new Response(JSON.stringify(analytics, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
        },
      });
    } catch (error) {
      logger.error('Usage analytics endpoint error', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to retrieve usage analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

// ================================
// Helper Functions
// ================================

function calculateRiskLevel(report: DeprecationReport): 'low' | 'medium' | 'high' | 'critical' {
  if (report.summary.criticalDeprecations > 0) return 'critical';
  if (report.summary.totalWarningsIssued > 100) return 'high';
  if (report.summary.clientsAffected > 10) return 'medium';
  return 'low';
}

function getUrgentActions(report: DeprecationReport): string[] {
  const actions: string[] = [];
  
  const criticalItems = report.deprecatedItems.filter(item => item.severity === 'critical');
  if (criticalItems.length > 0) {
    actions.push(`Immediate migration required for ${criticalItems.length} critical deprecated fields`);
  }

  const soonToExpire = report.deprecatedItems.filter(
    item => item.sunsetDate && new Date(item.sunsetDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );
  if (soonToExpire.length > 0) {
    actions.push(`${soonToExpire.length} deprecated fields will be removed within 30 days`);
  }

  return actions;
}

function getMigrationPriorities(report: DeprecationReport): MigrationRecommendation[] {
  return report.recommendations
    .sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    })
    .slice(0, 5); // Top 5 priorities
}

function generateNextSteps(report: DeprecationReport): string[] {
  const steps: string[] = [];
  
  if (report.summary.criticalDeprecations > 0) {
    steps.push('1. Address critical deprecations immediately');
    steps.push('2. Test migrations in development environment');
    steps.push('3. Plan production deployment with rollback strategy');
  } else {
    steps.push('1. Review deprecation warnings with development team');
    steps.push('2. Create migration timeline based on sunset dates');
    steps.push('3. Update client applications to use recommended replacements');
  }
  
  steps.push('4. Monitor deprecation metrics after changes');
  steps.push('5. Schedule regular deprecation report reviews');
  
  return steps;
}

async function getClientUsagePatterns(clientId: string): Promise<any> {
  // This would query actual usage data
  return {
    queriesPerDay: 1000,
    mostUsedFields: ['Todo.completed', 'User.name'],
    errorRate: 0.02,
    lastActivity: new Date().toISOString(),
  };
}

function generateMigrationOrder(plan: any): string[] {
  return [
    'Update client to handle new response structure',
    'Replace deprecated fields in queries',
    'Test all functionality with new version',
    'Deploy with monitoring and rollback plan',
    'Remove deprecated field usage completely',
  ];
}

function calculateDowntime(plan: any): string {
  return plan.breakingChanges.length > 0 ? '5-10 minutes' : 'No downtime expected';
}

function generateTestQueries(fromVersion: ApiVersion, toVersion: ApiVersion): string[] {
  const queries = [
    'query { todos { id title status } }',
    'query { user(id: "test") { id firstName lastName } }',
  ];

  if (toVersion === 'v3') {
    queries.push('subscription { todoUpdates { todo { id title status priority } } }');
  }

  return queries;
}

function generateRollbackSteps(fromVersion: ApiVersion, toVersion: ApiVersion): string[] {
  return [
    'Stop traffic to new version',
    'Revert client applications to previous version',
    'Verify all functionality is working',
    'Monitor error rates and performance',
    'Plan remediation for next migration attempt',
  ];
}

function analyzeQueryChanges(oldQuery: string, newQuery: string, fromVersion: ApiVersion, toVersion: ApiVersion): any[] {
  const changes: any[] = [];
  
  if (oldQuery.includes('completed') && newQuery.includes('status')) {
    changes.push({
      type: 'field_replacement',
      old: 'completed',
      new: 'status',
      reason: 'Boolean field replaced with enum for better state management',
    });
  }

  if (oldQuery.includes('name') && newQuery.includes('firstName lastName')) {
    changes.push({
      type: 'field_split',
      old: 'name',
      new: 'firstName, lastName',
      reason: 'Single name field split for better user management',
    });
  }

  return changes;
}

function validateTransformedQuery(query: string): string[] {
  const warnings: string[] = [];
  
  if (query.includes('allTodos')) {
    warnings.push('Query uses deprecated allTodos field. Consider using paginated todos query.');
  }

  if (query.length > 2000) {
    warnings.push('Query is very large and may impact performance. Consider splitting into multiple queries.');
  }

  return warnings;
}

function generateUsageSummary(versions: ApiVersion[], startDate: Date, endDate: Date): any {
  // This would aggregate real analytics data
  return {
    totalRequests: 50000,
    activeVersions: versions.length,
    migrationTrend: 'increasing',
    recommendedActions: [
      'Most clients are using v3 - consider sunsetting v1',
      'High deprecation warning rate suggests migration campaigns needed',
    ],
  };
}