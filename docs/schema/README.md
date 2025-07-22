# GraphQL Schema Export

This document explains how to use the schema commands to export your Pothos GraphQL schemas to Schema Definition Language (SDL) format.

## Overview

The schema commands allow you to export your GraphQL schemas to SDL format for various purposes:

- **Schema Documentation**: Generate SDL files for documentation and version control
- **Code Generation**: Use exported schemas with GraphQL code generators
- **Schema Registry**: Upload schemas to GraphQL registries like Apollo Studio
- **Client Development**: Provide SDL files to frontend teams for client-side tooling
- **Schema Validation**: Compare schemas between environments

## Available Schemas

This project provides two different GraphQL schemas:

### Main Schema (`schema.graphql`)
The standard GraphQL schema containing all your types, queries, mutations, and subscriptions. This is the schema that clients typically interact with directly.

### Federation Schema (`federation-schema.graphql`)
A specialized schema formatted for Apollo Federation subgraphs. This includes federation-specific directives and is used when this service participates in a federated GraphQL architecture.

## Command Usage

### Package Scripts (Recommended)

```bash
# Print main schema to .output/schema.graphql
bun run schema

# Print both main and federation schemas
bun run schema:all

# Print federation schema only
bun run schema:federation

# Preview main schema without saving to file
bun run schema:preview
```

### Direct Script Usage

```bash
# Print main schema to .output/schema.graphql
bun run scripts/schema.mjs

# Print main schema (explicit)
bun run scripts/schema.mjs --main

# Print federation schema to .output/federation-schema.graphql  
bun run scripts/schema.mjs --federation

# Print both schemas
bun run scripts/schema.mjs --all

# Preview schema without saving to file
bun run scripts/schema.mjs --preview

# Custom output directory
bun run scripts/schema.mjs --output custom-output

# Verbose output with details
bun run scripts/schema.mjs --verbose
```

### Interactive CLI Usage

Start the interactive CLI and navigate to the Schema menu:

```bash
bun run pothos
# Select "Schema - Print GraphQL schemas to SDL format"
```

The interactive menu provides:
- Print Main Schema
- Print Federation Schema  
- Print All Schemas
- Preview Schema (without saving)
- Custom Options (configure output path and settings)

## Output Files

By default, schemas are exported to the `.output` directory:

```
.output/
├── schema.graphql          # Main GraphQL schema
└── federation-schema.graphql # Federation subgraph schema
```

## Integration Workflows

### Development Workflow
```bash
# Generate schemas after making changes
bun run pothos schema --all --verbose

# Check schema changes with git
git diff .output/
```

### CI/CD Pipeline
```bash
# Generate schemas for deployment
bun run pothos schema --all --output dist/schemas

# Validate schema changes
bun run pothos schema --preview > current-schema.graphql
diff previous-schema.graphql current-schema.graphql
```

### Code Generation
```bash
# Generate schemas for GraphQL code generators
bun run pothos schema --main --output src/generated

# Use with GraphQL Code Generator
npx graphql-codegen --schema .output/schema.graphql
```

## Schema Format

The exported schemas use standard GraphQL Schema Definition Language (SDL):

```graphql
type Query {
  user(id: ID!): User
  users(first: Int, after: String): UserConnection
}

type User {
  id: ID!
  name: String!
  email: String!
}

type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
}
```

## Best Practices

### Version Control
- Include generated schema files in your repository
- Use schema files to track API changes over time
- Review schema diffs during code reviews

### Documentation
- Keep schema files up to date with your code
- Use schema files as living documentation
- Share schema files with client developers

### Automation
- Generate schemas as part of your build process
- Use pre-commit hooks to ensure schemas are current
- Integrate with schema registries for federated architectures

## Troubleshooting

### Common Issues

**Command not found**
```bash
# Make sure you're using the project's CLI
bun run pothos schema
# Not: pothos schema
```

**Permission errors**
```bash
# Ensure output directory is writable
chmod +w .output
```

**Schema validation errors**
- Check your Pothos schema definition for syntax errors
- Ensure all imports are correctly resolved
- Verify your database connection if using Prisma plugin

### Getting Help

- Use `bun run pothos schema --help` for command options
- Check the interactive menu for guided workflows  
- Review the examples in this documentation

## Related Documentation

- [CLI Reference](../cli/README.md) - Complete CLI command reference
- [Pothos Configuration](../prisma-plugin/README.md) - Schema builder setup
- [Federation](../federation/README.md) - Apollo Federation integration