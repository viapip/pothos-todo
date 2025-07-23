# Query Complexity Analysis

This project implements query complexity analysis to protect the GraphQL API from expensive or malicious queries that could overload the server.

## Overview

Query complexity analysis assigns a cost to each field in a GraphQL query and rejects queries that exceed a maximum complexity threshold. This prevents:

- Deep nested queries
- Queries requesting too many items
- Expensive operations like AI analysis or complex aggregations
- Denial of Service attacks

## Configuration

The query complexity plugin is configured in `src/api/server/server.ts`:

```typescript
createQueryComplexityPlugin({
  maxComplexity: 1000,          // Maximum allowed total complexity
  defaultComplexity: 1,         // Default cost per field
  defaultListMultiplier: 10,    // Default multiplier for list fields
  estimators: { /* ... */ },    // Custom complexity calculators
  onExceededComplexity: (complexity, max, query) => {
    // Custom handling for rejected queries
  }
})
```

## Complexity Calculation

### Basic Fields

Simple fields have a default complexity of 1:

```graphql
query {
  todo(id: "123") {    # Complexity: 1
    id                 # Complexity: 1
    title              # Complexity: 1
  }
}
# Total: 3
```

### List Fields

List fields multiply complexity by the requested limit:

```graphql
query {
  todos(limit: 20) {   # Complexity: 1 + 20 * child
    id                 # Complexity: 1 per item
    title              # Complexity: 1 per item
  }
}
# Total: 1 + 20 * 2 = 41
```

### Custom Complexity

Fields can define custom complexity:

```typescript
// Fixed complexity
todoStats: t.field({
  complexity: 10,  // Always costs 10
  // ...
})

// Dynamic complexity based on arguments
todos: t.field({
  complexity: (args, childComplexity) => {
    const limit = args.limit || 50;
    return 1 + limit * childComplexity;
  },
  // ...
})
```

## Field Complexity Reference

| Query Field | Base Complexity | Notes |
|------------|----------------|-------|
| `todo` | 1 | Simple lookup |
| `todos` | 1 + limit × children | Default limit: 50 |
| `todoStats` | 10 | Fixed cost for aggregation |
| `searchTodos` | 5 + limit × 2 | Embedding search cost |
| `findSimilarTodos` | 5 + limit × (2 + children) | Vector similarity |
| `suggestTodos` | 20 | AI processing |
| `productivityReport` | 50 | Complex AI analysis |

## Usage Examples

### Simple Query (Low Complexity)

```graphql
query GetTodo {
  todo(id: "123") {
    id
    title
    status
  }
}
# Complexity: 4
```

### Moderate Query

```graphql
query GetTodos {
  todos(limit: 10) {
    id
    title
    user {
      name
    }
  }
}
# Complexity: 1 + 10 × 3 = 31
```

### Complex Query (High Complexity)

```graphql
query Dashboard {
  todos(limit: 50) {           # 1 + 50 × children
    id                         # 1
    title                      # 1
    user {                     # 1
      name                     # 1
      todos(limit: 5) {        # 1 + 5 × 2
        id                     # 1
        title                  # 1
      }
    }
  }
  todoStats                    # 10
}
# Complexity: 1 + 50 × (4 + 11) + 10 = 761
```

### Rejected Query (Too Complex)

```graphql
query DeepNested {
  todos(limit: 100) {          # Would exceed 1000 limit
    id
    user {
      todos(limit: 100) {
        user {
          todos(limit: 100) {
            # Too deep!
          }
        }
      }
    }
  }
}
# Complexity: > 1000 (REJECTED)
```

## Error Messages

When a query exceeds the maximum complexity:

```json
{
  "errors": [{
    "message": "Query complexity 1523 exceeds maximum allowed complexity 1000",
    "extensions": {
      "code": "QUERY_TOO_COMPLEX"
    }
  }]
}
```

## Best Practices

### For API Consumers

1. **Use pagination**: Request smaller pages of data
2. **Limit nesting**: Avoid deeply nested queries
3. **Select only needed fields**: Don't request unnecessary data
4. **Use fragments**: Reuse common field selections
5. **Monitor complexity**: Check query complexity during development

### For Developers

1. **Set appropriate costs**: High-cost operations should have high complexity
2. **Consider child complexity**: Parent fields should account for children
3. **Document complexity**: Include complexity info in field descriptions
4. **Monitor patterns**: Track rejected queries to adjust limits
5. **Provide alternatives**: Offer simpler queries for common use cases

## Performance Considerations

- Complexity is calculated during validation (before execution)
- Minimal overhead for simple queries
- Protects against malicious queries before they hit the database
- Works with caching to optimize repeated queries

## Monitoring

Track these metrics:

- Query complexity distribution
- Rejected query count and patterns
- Average complexity by operation
- Complexity calculation time

## Configuration Tuning

Adjust these settings based on your needs:

- `maxComplexity`: Start conservative (1000) and increase if needed
- `defaultListMultiplier`: Based on typical list sizes
- Field-specific costs: Based on actual database/computation costs
- Rate limiting: Combine with rate limiting for additional protection

## Troubleshooting

### Query Rejected Unexpectedly

1. Check the exact complexity calculation in logs
2. Review field-specific complexity settings
3. Consider if the query genuinely needs optimization
4. Temporarily increase limit if necessary

### Performance Issues Despite Complexity Limits

1. Review individual field costs
2. Check for expensive operations with low complexity
3. Consider adding caching for expensive fields
4. Implement DataLoader for N+1 prevention

### Complexity Calculation Taking Too Long

1. Simplify custom complexity estimators
2. Cache complexity calculations for common queries
3. Consider pre-calculating for known queries