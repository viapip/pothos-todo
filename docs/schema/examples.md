# Schema Command Examples

Practical examples and workflows for using the GraphQL schema export commands.

## Basic Examples

### Export Main Schema

```bash
# Export main schema to .output/schema.graphql
bun run pothos schema

# Same as above (explicit)
bun run pothos schema --main
```

**Output:**
```
✅ Main schema written to .output/schema.graphql
```

### Export Federation Schema

```bash
# Export federation schema to .output/federation-schema.graphql
bun run pothos schema --federation
```

**Output:**
```
✅ Federation schema written to .output/federation-schema.graphql
```

### Export All Schemas

```bash
# Export both schemas
bun run pothos schema --all
```

**Output:**
```
✅ Main schema written to .output/schema.graphql
✅ Federation schema written to .output/federation-schema.graphql
```

## Preview Examples

### Preview Schema Without Saving

```bash
# Preview main schema
bun run pothos schema --preview
```

**Sample Output:**
```
📋 Schema Preview (main):

type Query {
  user(id: ID!): User
  users(first: Int, after: String): UserConnection
  todo(id: ID!): Todo
  todos(first: Int, after: String): TodoConnection
}

type User {
  id: ID!
  name: String!
  email: String!
  todos(first: Int, after: String): TodoConnection
}

type Todo {
  id: ID!
  title: String!
  completed: Boolean!
  user: User!
}...

Full schema: 2847 characters
```

### Preview Federation Schema

```bash
# Preview federation schema
bun run pothos schema --federation --preview
```

## Custom Output Examples

### Custom Output Directory

```bash
# Export to custom directory
bun run pothos schema --all --output dist/schemas
```

**Output:**
```
✅ Main schema written to dist/schemas/schema.graphql
✅ Federation schema written to dist/schemas/federation-schema.graphql
```

### Verbose Output

```bash
# Detailed output with verbose flag
bun run pothos schema --all --verbose
```

**Sample Output:**
```
📦 Printing all GraphQL schemas...

📄 Generating main GraphQL schema...
✅ Main schema written to .output/schema.graphql
Schema size: 2847 characters

📄 Generating federation GraphQL schema...
✅ Federation schema written to .output/federation-schema.graphql
Schema size: 3124 characters

✨ All schemas printed successfully!
```

## Interactive CLI Examples

### Basic Interactive Usage

```bash
# Start interactive CLI
bun run pothos

# Output:
# ┌─────────────────────────────────────────┐
# │                                         │
# │   ____       _   _                      │
# │  |  _ \ ___ | |_| |__   ___  ___        │
# │  | |_) / _ \| __| '_ \ / _ \/ __|       │
# │  |  __/ (_) | |_| | | | (_) \__ \       │
# │  |_|   \___/ \__|_| |_|\___/|___/       │
# │                                         │
# └─────────────────────────────────────────┘
# GraphQL Federation Development Tools
# 
# ? What would you like to do? (Use arrow keys)
# ❯ 🛠️  Development - Start dev server, build watch, etc.
#   📦 Build - Build project, clean, production builds
#   ✅ Check & Validate - TypeScript, lint, package validation
#   🗄️  Database - Migrations, seed, studio, docker
#   📄 Schema - Print GraphQL schemas to SDL format
#   🔧 Services - Docker compose, service management
#   📊 Status - View system status and health
#   ❓ Help - Show help and documentation
#   🚪 Exit - Exit the CLI

# Select "Schema - Print GraphQL schemas to SDL format"
```

### Schema Menu Navigation

```bash
# After selecting Schema option:
# ? What would you like to do with GraphQL schemas? (Use arrow keys)
# ❯ 📄 Print Main Schema - Export main GraphQL schema to SDL
#   🌐 Print Federation Schema - Export federation subgraph schema
#   📦 Print All Schemas - Export both main and federation schemas
#   👁️ Preview Main Schema - View schema without saving
#   👁️ Preview Federation Schema - View federation schema without saving
#   ⚙️ Custom Options - Configure output path and options
#   ↩️ Back to Main Menu

# Select desired operation...
```

### Custom Options Workflow

```bash
# Select "Custom Options" from schema menu:
# ? Which schema(s) would you like to print? (Use arrow keys)
# ❯ Main Schema
#   Federation Schema
#   Both Schemas

# Select "Both Schemas"
# ? Output directory path: (.output) custom-output
# ? Enable verbose output? (Y/n) Y

# Output:
# 📦 Printing all schemas with custom options...
# 
# 📄 Generating main GraphQL schema...
# ✅ Main schema written to custom-output/schema.graphql
# Schema size: 2847 characters
# 
# 📄 Generating federation GraphQL schema...
# ✅ Federation schema written to custom-output/federation-schema.graphql
# Schema size: 3124 characters
# 
# ? Would you like to perform another schema operation? (Y/n)
```

## Workflow Examples

### Development Workflow

```bash
# After making schema changes, regenerate schemas
bun run pothos schema --all --verbose

# Check what changed
git diff .output/

# If changes look good, commit them
git add .output/
git commit -m "Update GraphQL schemas"
```

### Code Generation Workflow

```bash
# Generate schema for GraphQL Code Generator
bun run pothos schema --main --output src/generated

# Run code generation
npx graphql-codegen --schema src/generated/schema.graphql --config codegen.yml
```

### Schema Validation Workflow

```bash
# Generate current schema
bun run pothos schema --main --output current

# Compare with previous version
diff previous/schema.graphql current/schema.graphql

# Example output showing breaking changes:
# 15c15
# < type User {
# ---
# > type User @deprecated {
# 18a19
# >   createdAt: DateTime!
```

### CI/CD Pipeline Example

```bash
#!/bin/bash
# scripts/generate-schemas.sh

echo "Generating GraphQL schemas..."
bun run pothos schema --all --output dist/schemas --verbose

if [ $? -eq 0 ]; then
    echo "✅ Schemas generated successfully"
    
    # Upload to schema registry (example)
    # apollo service:push --schema=dist/schemas/federation-schema.graphql
    
    exit 0
else
    echo "❌ Schema generation failed"
    exit 1
fi
```

### Pre-commit Hook Example

```bash
#!/bin/sh
# .git/hooks/pre-commit

# Generate latest schemas
bun run pothos schema --all

# Add generated files to commit
git add .output/

# Check if schemas actually changed
if git diff --cached --quiet .output/; then
    echo "No schema changes to commit"
else
    echo "Updated schemas added to commit"
fi
```

## Integration Examples

### Package.json Scripts

```json
{
  "scripts": {
    "schema": "bun run pothos schema",
    "schema:all": "bun run pothos schema --all",
    "schema:preview": "bun run pothos schema --preview",
    "schema:federation": "bun run pothos schema --federation",
    "build:schemas": "bun run pothos schema --all --output dist/schemas"
  }
}
```

### Docker Integration

```dockerfile
# Dockerfile example
FROM node:18-alpine

# ... other setup ...

# Generate schemas during build
RUN bun run pothos schema --all --output /app/schemas

# Schemas available at /app/schemas/
```

### GitHub Actions Integration

```yaml
# .github/workflows/schema-check.yml
name: Schema Check

on: [push, pull_request]

jobs:
  schema-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Generate schemas
        run: bun run pothos schema --all --output schemas
      
      - name: Check for schema changes
        run: |
          git diff --exit-code schemas/ || {
            echo "Schema changes detected!"
            echo "Please run 'bun run pothos schema --all' and commit changes"
            exit 1
          }
      
      - name: Upload schema artifacts
        uses: actions/upload-artifact@v3
        with:
          name: graphql-schemas
          path: schemas/
```

## Error Examples

### Schema Generation Error

```bash
bun run pothos schema

# Output:
# ❌ Failed to print main schema: TypeError: Cannot read property 'toSchema' of undefined
#     at printMainSchema (/path/to/schema/print.ts:15:25)
```

**Solution**: Check your schema imports and ensure the schema is properly exported.

### Permission Error

```bash
bun run pothos schema --output /etc/schemas

# Output:
# ❌ Failed to print main schema: EACCES: permission denied, mkdir '/etc/schemas'
```

**Solution**: Use a directory you have write permissions for or run with appropriate permissions.

### Invalid Flag Combination

```bash
bun run pothos schema --main --federation

# Output:
# Error: --main and --federation cannot be used together
```

**Solution**: Use only one schema type flag, or use `--all` to export both schemas.

## Sample Schema Output

### Main Schema Example

```graphql
# .output/schema.graphql

"""
A date-time string at UTC, such as 2007-12-03T10:15:30Z
"""
scalar DateTime

"""
The `JSON` scalar type represents JSON values
"""
scalar JSON

type Query {
  """Get a user by ID"""
  user(id: ID!): User
  
  """Get paginated users"""
  users(first: Int, after: String): UserConnection
  
  """Get a todo by ID"""
  todo(id: ID!): Todo
  
  """Get paginated todos"""
  todos(first: Int, after: String): TodoConnection
}

type User {
  id: ID!
  name: String!
  email: String!
  createdAt: DateTime!
  updatedAt: DateTime!
  
  """User's todos"""
  todos(first: Int, after: String): TodoConnection
}

type Todo {
  id: ID!
  title: String!
  description: String
  completed: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  
  """Todo owner"""
  user: User!
}

type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
}

type UserEdge {
  node: User!
  cursor: String!
}

type TodoConnection {
  edges: [TodoEdge!]!
  pageInfo: PageInfo!
}

type TodoEdge {
  node: Todo!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

### Federation Schema Example

```graphql
# .output/federation-schema.graphql

extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

type Query {
  user(id: ID!): User
  users(first: Int, after: String): UserConnection
  todo(id: ID!): Todo  
  todos(first: Int, after: String): TodoConnection
}

type User @key(fields: "id") {
  id: ID!
  name: String!
  email: String!
  createdAt: DateTime!
  updatedAt: DateTime!
  todos(first: Int, after: String): TodoConnection
}

type Todo @key(fields: "id") {
  id: ID!
  title: String!
  description: String
  completed: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  user: User!
}

# ... rest of schema with federation directives
```

## Tips and Best Practices

1. **Use `--verbose` for debugging** to see detailed output and file sizes
2. **Preview before saving** with `--preview` to check schema changes
3. **Automate schema generation** in your build process and CI/CD
4. **Version control schemas** to track API changes over time
5. **Use federation schema** when building Apollo Federation subgraphs
6. **Custom output paths** for different environments or deployment targets