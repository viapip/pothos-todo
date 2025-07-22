# API Versioning and Deprecation Framework

The Pothos GraphQL API includes a comprehensive versioning and deprecation framework that enables smooth API evolution while maintaining backward compatibility and providing clear migration paths for clients.

## Overview

### Supported Versions

- **v1** (Deprecated) - Initial API with basic todo functionality
- **v2** (Stable) - Enhanced API with improved data structures
- **v3** (Latest) - Current API with real-time subscriptions and advanced features

### Version Specification

Clients specify their desired API version using HTTP headers:

```bash
# Specify version v2
curl -H "API-Version: v2" http://localhost:4000/graphql

# Alternative header format
curl -H "X-API-Version: v3" http://localhost:4000/graphql
```

If no version is specified, the latest stable version (v3) is used by default.

## Features

### 1. Automatic Deprecation Tracking

The system automatically tracks usage of deprecated fields and provides warnings:

```json
{
  "data": { ... },
  "extensions": {
    "deprecationWarnings": [
      {
        "type": "field",
        "path": "Todo.completed",
        "message": "Field Todo.completed is deprecated: Replaced with status enum",
        "severity": "high",
        "replacement": "status",
        "removedAt": "2025-01-01",
        "count": 1
      }
    ]
  }
}
```

### 2. Client-Specific Migration Assistance

The API provides personalized migration recommendations:

```json
{
  "extensions": {
    "migrationSuggestions": {
      "currentVersion": "v1",
      "latestVersion": "v3",
      "migrationPlan": {
        "steps": ["Update field usage", "Test changes", "Deploy"],
        "estimatedDuration": "2-4 hours",
        "breakingChanges": 2
      },
      "documentationUrl": "/docs/migration/v1-to-v3"
    }
  }
}
```

### 3. Version-Aware Schema Evolution

Fields automatically adapt their behavior based on the client's API version:

```graphql
# v1 client gets boolean field
query {
  todos {
    id
    title
    completed  # Returns true/false
  }
}

# v2+ client gets enum field  
query {
  todos {
    id
    title
    status    # Returns TODO/IN_PROGRESS/COMPLETED
  }
}
```

## Version-Specific Changes

### v1 → v2 Breaking Changes

1. **Todo.completed → Todo.status**
   - **Change**: Boolean `completed` field replaced with `status` enum
   - **Migration**: Map `true` → `"COMPLETED"`, `false` → `"TODO"`
   - **Compatibility**: v1 clients still receive boolean values

2. **User.name → User.firstName + User.lastName**
   - **Change**: Single `name` field split into separate fields
   - **Migration**: Parse existing name into first/last components
   - **Compatibility**: v1 clients still receive concatenated name

3. **Query.allTodos → Query.todos (paginated)**
   - **Change**: Replaced unlimited query with paginated version
   - **Migration**: Use `todos(first: 20)` instead of `allTodos`
   - **Compatibility**: v1 `allTodos` limited to 100 results for safety

### v2 → v3 Enhancements

1. **Real-time Subscriptions**
   - **Addition**: WebSocket-based subscriptions for live updates
   - **New Fields**: `todoUpdates`, `todoListUpdates`, `userPresence`
   - **Compatibility**: Fully backward compatible

2. **Priority Field**
   - **Addition**: Todo priority levels (LOW, MEDIUM, HIGH, URGENT)
   - **Default**: v1/v2 clients see `MEDIUM` priority for all todos
   - **Compatibility**: Fully backward compatible

3. **Advanced Filtering**
   - **Addition**: Priority-based filtering and sorting
   - **Enhancement**: Improved search capabilities
   - **Compatibility**: Fully backward compatible

## Deprecation Policy

### Lifecycle Stages

1. **Stable** - Current production version, fully supported
2. **Deprecated** - Still functional but discouraged, receives deprecation warnings
3. **Sunset** - No longer supported, returns errors

### Timeline

- **Warning Period**: 6 months advance notice of deprecation
- **Sunset Period**: 12 months total lifecycle from deprecation to removal
- **Communication**: Notifications via API responses, email, and documentation

### Severity Levels

- **Low**: Cosmetic changes, optional migrations
- **Medium**: Recommended migrations, performance implications
- **High**: Important changes affecting functionality
- **Critical**: Breaking changes requiring immediate attention

## HTTP Endpoints

### Version Information

```bash
GET /api/version
```

Returns comprehensive version information:

```json
{
  "api": {
    "name": "Pothos Todo GraphQL API",
    "description": "Modern GraphQL API with comprehensive todo management"
  },
  "versions": {
    "supported": ["v1", "v2", "v3"],
    "deprecated": ["v1"],
    "latest": "v3",
    "default": "v3"
  },
  "details": {
    "v1": {
      "status": "deprecated",
      "releaseDate": "2024-01-01",
      "sunsetDate": "2025-01-01"
    }
  }
}
```

### Deprecation Report

```bash
GET /api/version/deprecation-report
```

Returns detailed deprecation usage analysis:

```json
{
  "generatedAt": "2024-12-20T17:43:03.067Z",
  "summary": {
    "totalDeprecatedFields": 3,
    "totalWarningsIssued": 150,
    "clientsAffected": 12,
    "criticalDeprecations": 1
  },
  "deprecatedItems": [
    {
      "path": "Todo.completed",
      "severity": "high",
      "usageCount": 75,
      "affectedClients": ["client-1", "client-2"],
      "sunsetDate": "2025-01-01"
    }
  ],
  "recommendations": [
    {
      "type": "field_migration",
      "priority": "high",
      "title": "Migrate from deprecated Todo.completed",
      "steps": ["Update queries to use status field"],
      "deadline": "2025-01-01"
    }
  ]
}
```

### Migration Plan Generation

```bash
POST /api/version/migration-plan
Content-Type: application/json

{
  "fromVersion": "v1",
  "toVersion": "v3",
  "clientId": "my-app"
}
```

Returns personalized migration plan:

```json
{
  "fromVersion": "v1",
  "toVersion": "v3",
  "estimatedDuration": "2-4 hours",
  "breakingChanges": ["Todo.completed", "User.name"],
  "steps": [
    {
      "id": "1",
      "title": "Update field mappings",
      "description": "Replace deprecated fields with new equivalents",
      "required": true,
      "automatable": false
    }
  ],
  "clientSpecific": {
    "currentUsage": {
      "queriesPerDay": 1000,
      "mostUsedFields": ["Todo.completed", "User.name"]
    },
    "recommendedOrder": ["Update client", "Replace fields", "Test", "Deploy"],
    "estimatedDowntime": "No downtime expected"
  }
}
```

### Query Transformation

```bash
POST /api/version/transform-query
Content-Type: application/json

{
  "query": "query { todos { id title completed } }",
  "fromVersion": "v1", 
  "toVersion": "v3"
}
```

Returns transformed query:

```json
{
  "original": {
    "query": "query { todos { id title completed } }",
    "version": "v1"
  },
  "transformed": {
    "query": "query { todos { id title status } }",
    "version": "v3"
  },
  "changes": [
    {
      "type": "field_replacement",
      "old": "completed",
      "new": "status",
      "reason": "Boolean field replaced with enum"
    }
  ]
}
```

### Usage Analytics

```bash
GET /api/version/analytics?version=v2&days=30
```

Returns version usage statistics and trends.

## GraphQL Version Information

The API provides version information directly through GraphQL:

```graphql
query {
  apiVersion {
    current
    latest
    supported
    deprecated
    clientWarnings {
      type
      path
      message
      severity
      replacement
      count
    }
    migrationRecommendation
  }
}
```

## Client Integration Examples

### JavaScript/TypeScript

```typescript
// GraphQL client with version header
const client = new GraphQLClient('/graphql', {
  headers: {
    'API-Version': 'v3'
  }
});

// Handle deprecation warnings
const response = await client.request(query);
if (response.extensions?.deprecationWarnings) {
  console.warn('API Deprecation Warnings:', response.extensions.deprecationWarnings);
}
```

### React Hook Example

```typescript
import { useGraphQL } from './graphql-client';

function useTodos() {
  // Automatically handles version-specific field mappings
  const { data, warnings } = useGraphQL(`
    query GetTodos {
      todos {
        id
        title
        status  # Will work across all versions
      }
    }
  `);

  // Display deprecation warnings to developers
  useEffect(() => {
    if (warnings?.length > 0) {
      console.group('API Deprecation Warnings');
      warnings.forEach(warning => console.warn(warning));
      console.groupEnd();
    }
  }, [warnings]);

  return data?.todos || [];
}
```

### Migration Workflow

```typescript
// 1. Get current deprecation status
const report = await fetch('/api/version/deprecation-report').then(r => r.json());

// 2. Generate migration plan
const plan = await fetch('/api/version/migration-plan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromVersion: 'v1',
    toVersion: 'v3',
    clientId: 'my-app'
  })
}).then(r => r.json());

// 3. Transform existing queries
const transformedQuery = await fetch('/api/version/transform-query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'query { todos { id completed } }',
    fromVersion: 'v1',
    toVersion: 'v3'
  })
}).then(r => r.json());

console.log('New query:', transformedQuery.transformed.query);
```

## Production Monitoring

### Metrics

The system exposes Prometheus metrics for monitoring:

- `pothos_api_version_usage_total` - Request counts by version
- `pothos_api_deprecation_warnings_total` - Deprecation warning counts
- `pothos_api_active_clients_by_version` - Active clients per version
- `pothos_api_migration_recommendations_total` - Migration recommendations issued

### Grafana Dashboards

Pre-configured dashboards track:
- Version adoption rates
- Deprecation warning trends
- Client migration progress
- Breaking change impact analysis

### Alerting

Recommended alerts:
- Critical deprecation usage spikes
- Version sunset approaching with active usage
- High error rates after version changes
- Client stuck on deprecated versions

## Best Practices

### For API Consumers

1. **Always specify version headers** - Don't rely on defaults
2. **Monitor deprecation warnings** - Set up alerting for your applications
3. **Plan migrations early** - Don't wait until sunset dates
4. **Test version upgrades** - Use staging environments
5. **Implement graceful degradation** - Handle version-specific features

### For API Providers

1. **Maintain backward compatibility** - Avoid breaking changes within versions
2. **Provide clear migration paths** - Document all changes thoroughly
3. **Give adequate notice** - Follow the 6-month warning policy
4. **Monitor usage patterns** - Track which clients need migration help
5. **Automate where possible** - Provide tooling for common migrations

## Troubleshooting

### Common Issues

**Q: Why am I getting deprecation warnings?**
A: Your client is using deprecated fields. Check the `extensions.deprecationWarnings` in your GraphQL responses and plan to migrate to the recommended replacements.

**Q: My queries are failing after a version change**
A: Use the query transformation endpoint to see how your queries should be updated for the new version.

**Q: How do I know which version to use?**
A: Use the latest stable version (v3) for new projects. Existing projects should plan migration from deprecated versions.

**Q: Can I use multiple versions simultaneously?**
A: Yes, different requests can specify different versions. However, we recommend migrating all clients to the same recent version for consistency.

### Support Resources

- **Migration Documentation**: `/docs/migration/`
- **API Reference**: `/api/version`
- **Deprecation Reports**: `/api/version/deprecation-report`
- **Community Support**: GitHub Issues
- **Professional Support**: enterprise@example.com

---

The versioning framework ensures that the Pothos GraphQL API can evolve continuously while maintaining stability and providing clear guidance for client migrations.