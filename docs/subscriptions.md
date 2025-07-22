# Real-time Subscriptions

## Overview

The API supports real-time GraphQL subscriptions via Server-Sent Events (SSE) with fallback to WebSocket. The subscription system is built on a custom EventEmitter-based manager that handles user-specific and filtered subscriptions.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Client      │────│  SSE/WebSocket  │────│  Subscription   │
│   (GraphQL)     │    │    Transport    │    │    Manager      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                            ┌─────────────────┐
                                            │  Event System   │
                                            │ (EventEmitter)  │
                                            └─────────────────┘
```

## Available Subscriptions

### Todo Events
```graphql
subscription TodoCreated {
  todoCreated {
    id
    title
    completed
    user {
      id
      name
    }
  }
}

subscription TodoUpdated($userId: ID) {
  todoUpdated(userId: $userId) {
    id
    title
    completed
    updatedAt
  }
}

subscription TodoDeleted {
  todoDeleted {
    id
    title
  }
}
```

### User Events
```graphql
subscription UserUpdated {
  userUpdated {
    id
    name
    email
    updatedAt
  }
}
```

## Client Implementation

### JavaScript/TypeScript
```typescript
import { createClient } from 'graphql-sse';

const client = createClient({
  url: 'http://localhost:4000/graphql',
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

const unsubscribe = client.subscribe(
  {
    query: `
      subscription TodoCreated {
        todoCreated {
          id
          title
          completed
        }
      }
    `
  },
  {
    next: (data) => console.log('New todo:', data),
    error: (err) => console.error('Subscription error:', err),
    complete: () => console.log('Subscription completed')
  }
);
```

### React Hook
```tsx
import { useSubscription } from '@apollo/client';

function TodoList() {
  const { data, loading, error } = useSubscription(TODO_CREATED_SUBSCRIPTION);

  useEffect(() => {
    if (data?.todoCreated) {
      // Handle new todo
      console.log('New todo created:', data.todoCreated);
    }
  }, [data]);

  return (
    <div>
      {/* Todo list rendering */}
    </div>
  );
}
```

## Server Implementation

### Subscription Manager
The `SubscriptionManager` class handles all subscription lifecycle:

```typescript
import { SubscriptionManager } from '../lib/subscriptions/manager.js';

// Subscribe to events
const subscriptionId = SubscriptionManager.subscribe(
  userId, 
  'todoCreated',
  { filters: { userId } }
);

// Publish events
SubscriptionManager.publish('todoCreated', {
  id: todo.id,
  title: todo.title,
  userId: todo.userId
});

// Unsubscribe
SubscriptionManager.unsubscribe(subscriptionId);
```

### Event Publishing
Events are automatically published from resolvers:

```typescript
// In todo mutation resolver
async createTodo(parent, args, context) {
  const todo = await context.prisma.todo.create({
    data: args.input,
    include: { user: true }
  });

  // Publish to all subscribers
  SubscriptionManager.publish('todoCreated', todo);

  return todo;
}
```

## Configuration

### Transport Configuration
```typescript
// config/base.config.ts
export default {
  subscriptions: {
    transport: 'sse', // 'sse' | 'websocket' | 'auto'
    maxConnections: 1000,
    heartbeatInterval: 30000,
    timeout: 300000
  }
};
```

### Filtering Options
```typescript
// Subscribe with filters
const subscriptionId = SubscriptionManager.subscribe(
  userId,
  'todoUpdated',
  {
    filters: {
      userId: 'specific-user-id',
      completed: false,
      priority: 'high'
    }
  }
);
```

## Security

### Authentication
All subscriptions require valid JWT authentication:

```typescript
// Authentication middleware for subscriptions
async function authenticateSubscription(connectionParams) {
  const token = connectionParams.Authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw new Error('Authentication required');
  }

  const payload = await verifyJWT(token);
  return { userId: payload.sub };
}
```

### Authorization
Users can only subscribe to events they have permission to see:

```typescript
// Authorization check in subscription resolver
subscribe: {
  todoCreated: {
    subscribe: withFilter(
      () => SubscriptionManager.asyncIterator(['todoCreated']),
      (payload, variables, context) => {
        // Only return todos user has access to
        return payload.todoCreated.userId === context.userId ||
               context.user.role === 'admin';
      }
    )
  }
}
```

## Monitoring

### Subscription Metrics
```bash
# Get subscription statistics
curl http://localhost:4000/api/subscriptions/stats

{
  "activeSubscriptions": 42,
  "totalConnections": 15,
  "eventsSentLast24h": 1250,
  "averageConnectionDuration": "00:15:30",
  "subscriptionTypes": {
    "todoCreated": 18,
    "todoUpdated": 12,
    "todoDeleted": 8,
    "userUpdated": 4
  }
}
```

### Performance Monitoring
- Connection count and duration
- Event publishing rate
- Memory usage per subscription
- Error rates and types

## Troubleshooting

### Common Issues

**Connection Drops**
- Check network stability
- Verify heartbeat configuration
- Monitor server resource usage

**Missing Events**
- Verify authentication token
- Check subscription filters
- Review authorization rules

**High Memory Usage**
- Monitor subscription count
- Check for memory leaks
- Review event payload sizes

### Debug Mode
```typescript
// Enable subscription debugging
process.env.DEBUG_SUBSCRIPTIONS = 'true';

// View active subscriptions
SubscriptionManager.getActiveSubscriptions();

// Monitor event flow
SubscriptionManager.on('event', (event) => {
  console.log('Event published:', event);
});
```

## Best Practices

1. **Filter Early**: Apply filters at subscription time, not at event time
2. **Batch Events**: Group related events to reduce network traffic
3. **Handle Reconnection**: Implement automatic reconnection logic
4. **Rate Limiting**: Prevent subscription spam
5. **Clean Up**: Always unsubscribe when components unmount
6. **Error Handling**: Implement proper error recovery
7. **Authentication**: Always validate JWT tokens
8. **Authorization**: Check permissions for each subscription