# 📡 GraphQL Subscriptions

Real-time GraphQL subscriptions using Server-Sent Events (SSE) for the Pothos Todo application.

## 🌟 Features

- **Real-time Todo Updates**: Live notifications when todos are created, updated, or deleted
- **Todo List Updates**: Real-time updates for entire todo lists  
- **User Presence**: Live user online/offline status tracking
- **Server-Sent Events**: Uses SSE for reliable real-time communication
- **Memory-based Pub/Sub**: In-memory event system with Redis fallback support
- **Type-safe**: Full TypeScript support with Pothos schema generation

## 🚀 Available Subscriptions

### 1. Todo Updates
Subscribe to real-time todo changes within a specific todo list:

```graphql
subscription TodoUpdates($todoListId: String!) {
  todoUpdates(todoListId: $todoListId) {
    todo {
      id
      title
      status
      priority
      dueDate
    }
    action        # TODO_CREATED, TODO_UPDATED, TODO_DELETED
    userId        # User who made the change
    timestamp     # When the change occurred
  }
}
```

### 2. Todo List Updates
Subscribe to todo list-level changes:

```graphql
subscription TodoListUpdates($todoListId: String!) {
  todoListUpdates(todoListId: $todoListId) {
    todoList {
      id
      title
      description
    }
    action        # TODO_LIST_UPDATED
    userId        # User who made the change
    timestamp     # When the change occurred
  }
}
```

### 3. User Presence
Subscribe to user online/offline status:

```graphql
subscription UserPresence {
  userPresence {
    userId        # User ID
    isOnline      # Online status
    timestamp     # When status changed
  }
}
```

## 🔧 Client Integration

### JavaScript/Browser (Server-Sent Events)
```javascript
const subscription = `
  subscription {
    todoUpdates(todoListId: "my-list-id") {
      todo { id title status }
      action
      userId
    }
  }
`;

const eventSource = new EventSource(
  `http://localhost:4000/graphql/stream?query=${encodeURIComponent(subscription)}`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Todo update:', data.data.todoUpdates);
};
```

### GraphQL Client Libraries

#### Apollo Client
```javascript
import { gql, useSubscription } from '@apollo/client';

const TODO_UPDATES = gql`
  subscription TodoUpdates($todoListId: String!) {
    todoUpdates(todoListId: $todoListId) {
      todo { id title status }
      action
      userId
      timestamp
    }
  }
`;

function TodoSubscription({ todoListId }) {
  const { data, loading } = useSubscription(TODO_UPDATES, {
    variables: { todoListId },
  });
  
  if (data?.todoUpdates) {
    console.log('Real-time update:', data.todoUpdates);
  }
  
  return <div>{/* Your UI */}</div>;
}
```

#### urql
```javascript
import { useSubscription } from 'urql';

const TodoUpdates = `
  subscription ($todoListId: String!) {
    todoUpdates(todoListId: $todoListId) {
      todo { id title status }
      action
      userId
    }
  }
`;

function TodoComponent({ todoListId }) {
  const [result] = useSubscription(
    { query: TodoUpdates, variables: { todoListId } }
  );
  
  const { data } = result;
  
  // Handle real-time updates
  useEffect(() => {
    if (data?.todoUpdates) {
      console.log('Todo updated:', data.todoUpdates);
    }
  }, [data]);
  
  return <div>{/* Your UI */}</div>;
}
```

## 🔗 Connection Endpoints

- **GraphiQL Playground**: `http://localhost:4000/graphql` (supports subscriptions)
- **SSE Stream**: `http://localhost:4000/graphql/stream`
- **WebSocket** (if configured): `ws://localhost:4000/graphql`

## 📋 Event Types

| Event Type | Description | Trigger |
|------------|-------------|---------|
| `TODO_CREATED` | New todo created | `createTodo` mutation |
| `TODO_UPDATED` | Todo modified | `updateTodo`, `completeTodo` mutations |
| `TODO_DELETED` | Todo removed | `deleteTodo` mutation |
| `TODO_LIST_UPDATED` | Todo list changed | Todo list mutations |
| `USER_ONLINE_STATUS` | User presence changed | User connects/disconnects |

## 🛠️ Testing

### Using the Test Client
1. Open `examples/subscription-client.html` in your browser
2. Make sure the server is running: `bun run start`
3. Connect to a subscription
4. Create/update todos to see real-time events

### Manual Testing with curl
```bash
# Subscribe to todo updates (SSE)
curl -N -H "Accept: text/event-stream" \
  "http://localhost:4000/graphql/stream?query=subscription{todoUpdates(todoListId:\"test\"){todo{id title}action}}"

# In another terminal, trigger an event
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{createTodo(input:{title:\"Test\",todoListId:\"test\"}){id title}}"}'
```

### GraphiQL Playground
1. Go to `http://localhost:4000/graphql`
2. Write a subscription query
3. Click the "Execute" button
4. In another tab/window, execute mutations to trigger events

## 🏗️ Architecture

### Components
- **SubscriptionManager**: In-memory pub/sub system
- **GraphQL Schema**: Pothos-generated subscription types
- **Event Publishers**: Mutation resolvers publish events
- **SSE Handler**: Yoga GraphQL SSE plugin

### Flow
1. Client subscribes to a GraphQL subscription
2. Server creates an SSE stream connection
3. Mutation occurs (e.g., create todo)
4. Mutation resolver publishes event to SubscriptionManager
5. SubscriptionManager broadcasts to all subscribers
6. Subscribed clients receive real-time updates

### Scalability
- **Current**: In-memory pub/sub (single server)
- **Future**: Redis pub/sub for horizontal scaling
- **Connection Management**: Automatic cleanup of stale connections

## 🔐 Security & Authentication

- **Authentication Required**: Most subscriptions require valid user session
- **Authorization**: Users only see updates for their own data
- **Rate Limiting**: Built-in connection limits and cleanup
- **CORS**: Configured for cross-origin subscription requests

## 📊 Monitoring

The subscription manager provides stats and metrics:
```javascript
// Get subscription statistics
const stats = subscriptionManager.getStats();
console.log(stats);
// Output: { totalTopics: 5, totalSubscriptions: 23, totalUsers: 8, ... }
```

## 🚀 Next Steps

1. **Redis Integration**: Add Redis pub/sub for multi-server deployments
2. **WebSocket Support**: Add WebSocket transport alongside SSE
3. **Connection Pooling**: Optimize connection management
4. **Subscription Filtering**: Add more granular subscription filters
5. **Metrics Dashboard**: Real-time subscription metrics UI

## 🐛 Troubleshooting

### Common Issues

1. **Subscriptions not working**
   - Ensure server is running with `bun run start`
   - Check that port 4000 is not blocked
   - Verify authentication if required

2. **Events not received**
   - Check console for JavaScript errors
   - Verify the subscription query syntax
   - Ensure the todo list ID exists

3. **Connection drops**
   - Check network stability
   - Look for server restart events
   - Monitor server logs for errors

### Debug Mode
Enable debug logging:
```bash
NODE_ENV=development bun run start
```

This enables detailed subscription logs including connection events and message flow.