# GraphQL Yoga

GraphQL Yoga - это полнофункциональный GraphQL сервер с акцентом на простую настройку, производительность и отличный опыт разработчика.

## Установка

```bash
bun add graphql-yoga graphql
```

## Основные концепции

### Базовая настройка

```typescript
import { createServer } from 'http'
import { createYoga, createSchema } from 'graphql-yoga'

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        hello: String!
      }
    `,
    resolvers: {
      Query: {
        hello: () => 'Hello World!'
      }
    }
  })
})

const server = createServer(yoga)
server.listen(4000, () => {
  console.info('Server is running on http://localhost:4000/graphql')
})
```

### Интеграция с Pothos

```typescript
import { createYoga } from 'graphql-yoga'
import { createServer } from 'http'
import { builder } from './schema'

const yoga = createYoga({
  schema: builder.toSchema(),
  context: async ({ request }) => ({
    // Контекст для резолверов
    user: await getUserFromToken(request.headers.get('authorization'))
  })
})

const server = createServer(yoga)
server.listen(4000)
```

## Основные функции

### Подписки (Subscriptions)

```typescript
import { createPubSub } from 'graphql-yoga'

const pubSub = createPubSub()

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        hello: String
      }
      
      type Subscription {
        countdown(from: Int!): Int!
      }
    `,
    resolvers: {
      Subscription: {
        countdown: {
          subscribe: async function* (_, { from }) {
            for (let i = from; i >= 0; i--) {
              await new Promise(resolve => setTimeout(resolve, 1000))
              yield { countdown: i }
            }
          }
        }
      }
    }
  })
})
```

### WebSocket подписки

```typescript
import { useServer } from 'graphql-ws/use/ws'
import { WebSocketServer } from 'ws'

const httpServer = createServer(yoga)
const wsServer = new WebSocketServer({
  server: httpServer,
  path: yoga.graphqlEndpoint
})

useServer(
  {
    execute: (args: any) => args.rootValue.execute(args),
    subscribe: (args: any) => args.rootValue.subscribe(args),
    onSubscribe: async (ctx, msg) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
        ...ctx,
        req: ctx.extra.request,
        socket: ctx.extra.socket,
        params: msg.payload
      })

      const args = {
        schema,
        operationName: msg.payload.operationName,
        document: parse(msg.payload.query),
        variableValues: msg.payload.variables,
        contextValue: await contextFactory(),
        rootValue: {
          execute,
          subscribe
        }
      }

      const errors = validate(args.schema, args.document)
      if (errors.length) return errors
      return args
    }
  },
  wsServer
)
```

### Обработка ошибок

```typescript
import { GraphQLError } from 'graphql'

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        user(id: ID!): User
      }
      
      type User {
        id: ID!
        name: String!
      }
    `,
    resolvers: {
      Query: {
        user: async (_, { id }) => {
          const user = await getUserById(id)
          
          if (!user) {
            throw new GraphQLError(
              `User with id '${id}' not found.`,
              {
                extensions: {
                  code: 'USER_NOT_FOUND',
                  http: {
                    status: 404,
                    headers: {
                      'X-Custom-Header': 'not-found'
                    }
                  }
                }
              }
            )
          }
          
          return user
        }
      }
    }
  }),
  // Маскировка ошибок в продакшене
  maskedErrors: process.env.NODE_ENV === 'production'
})
```

### Загрузка файлов

```typescript
const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      scalar File
      
      type Mutation {
        uploadFile(file: File!): String!
      }
    `,
    resolvers: {
      Mutation: {
        uploadFile: async (_, { file }: { file: File }) => {
          const buffer = Buffer.from(await file.arrayBuffer())
          const filename = `uploads/${Date.now()}-${file.name}`
          
          await fs.promises.writeFile(filename, buffer)
          
          return filename
        }
      }
    }
  })
})
```

### CORS настройка

```typescript
const yoga = createYoga({
  cors: {
    origin: ['http://localhost:3000', 'https://myapp.com'],
    credentials: true,
    allowedHeaders: ['X-Custom-Header'],
    methods: ['POST']
  }
})

// Или динамическая конфигурация
const yoga = createYoga({
  cors: (request) => {
    const origin = request.headers.get('origin')
    return {
      origin: origin || false,
      credentials: true,
      maxAge: 3600
    }
  }
})
```

### Аутентификация

```typescript
const yoga = createYoga({
  context: async ({ request }) => {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!token) {
      return { user: null }
    }
    
    try {
      const user = await verifyToken(token)
      return { user }
    } catch (error) {
      throw new GraphQLError('Invalid token', {
        extensions: {
          code: 'UNAUTHENTICATED',
          http: { status: 401 }
        }
      })
    }
  }
})
```

## Плагины

### Response Caching

```typescript
import { useResponseCache } from '@graphql-yoga/plugin-response-cache'

const yoga = createYoga({
  plugins: [
    useResponseCache({
      // Глобальное кэширование
      session: () => null,
      // TTL по умолчанию - 60 секунд
      ttl: 60_000,
      // Кэшировать только публичные данные
      scopePerSchemaCoordinate: {
        'Query.publicData': 'PUBLIC',
        'Query.privateData': 'PRIVATE'
      }
    })
  ]
})
```

### CSRF Protection

```typescript
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention'

const yoga = createYoga({
  plugins: [
    useCSRFPrevention({
      requestHeaders: ['x-graphql-yoga-csrf']
    })
  ]
})
```

### Persisted Operations

```typescript
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations'

const store = {
  'hash1': '{ users { id name } }',
  'hash2': 'mutation { createUser(name: $name) { id } }'
}

const yoga = createYoga({
  plugins: [
    usePersistedOperations({
      getPersistedOperation(hash: string) {
        return store[hash]
      }
    })
  ]
})
```

## Интеграция с фреймворками

### Next.js

```typescript
// pages/api/graphql.ts (Pages Router)
import { createYoga } from 'graphql-yoga'
import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    // Отключить body parsing для загрузки файлов
    bodyParser: false
  }
}

export default createYoga<{
  req: NextApiRequest
  res: NextApiResponse
}>({
  schema,
  graphqlEndpoint: '/api/graphql'
})
```

### Fastify

```typescript
import Fastify from 'fastify'

const app = Fastify()

// Для загрузки файлов
app.addContentTypeParser('multipart/form-data', {}, (req, payload, done) => done(null))

app.route({
  url: '/graphql',
  method: ['GET', 'POST', 'OPTIONS'],
  handler: async (req, reply) => {
    const response = await yoga.handleNodeRequest(req, {
      req,
      reply
    })
    
    response.headers.forEach((value, key) => {
      reply.header(key, value)
    })
    
    reply.status(response.status)
    reply.send(response.body)
    
    return reply
  }
})
```

## Тестирование

```typescript
import { buildHTTPExecutor } from '@graphql-tools/executor-http'

const executor = buildHTTPExecutor({
  fetch: yoga.fetch
})

const result = await executor({
  document: parse(/* GraphQL */ `
    query {
      hello
    }
  `)
})

console.assert(result.data?.hello === 'Hello World!')
```

## Лучшие практики

1. **Используйте типизированный контекст** для безопасности типов
2. **Настройте маскировку ошибок** в продакшене
3. **Используйте persisted operations** для безопасности
4. **Настройте CORS** правильно для вашего окружения
5. **Используйте подписки через WebSocket** для реального времени
6. **Кэшируйте ответы** где это возможно для производительности

## Полный пример с Pothos

```typescript
import { createYoga } from 'graphql-yoga'
import { createServer } from 'http'
import { useResponseCache } from '@graphql-yoga/plugin-response-cache'
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention'
import { builder } from './pothos-schema'

const yoga = createYoga({
  schema: builder.toSchema(),
  context: async ({ request }) => ({
    prisma,
    user: await getUserFromRequest(request)
  }),
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  },
  plugins: [
    useResponseCache({
      session: (request) => request.headers.get('authorization') || null,
      ttl: 60_000
    }),
    useCSRFPrevention()
  ],
  maskedErrors: process.env.NODE_ENV === 'production'
})

const server = createServer(yoga)

server.listen(4000, () => {
  console.log('GraphQL server running on http://localhost:4000/graphql')
})
```