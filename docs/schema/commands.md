# Schema Commands Reference

Complete reference for all GraphQL schema export commands.

## schema

Export GraphQL schemas to Schema Definition Language (SDL) format.

### Synopsis

```bash
bun run pothos schema [OPTIONS]
```

### Description

The `schema` command exports your Pothos GraphQL schemas to SDL format. By default, it exports the main schema to `.output/schema.graphql`.

### Options

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--main` | `-m` | boolean | `false` | Print main GraphQL schema only |
| `--federation` | `-f` | boolean | `false` | Print federation GraphQL schema only |
| `--all` | `-a` | boolean | `false` | Print both main and federation schemas |
| `--output` | `-o` | string | `.output` | Output directory path |
| `--preview` | `-p` | boolean | `false` | Preview schema without writing to file |
| `--verbose` | `-v` | boolean | `false` | Show detailed output |

### Flag Relationships

- `--main`, `--federation`, and `--all` are mutually exclusive
- If no schema type flag is provided, defaults to `--main`
- `--preview` can be combined with schema type flags to preview specific schemas
- `--output` is ignored when using `--preview`

### Examples

#### Basic Usage
```bash
# Export main schema (default behavior)
bun run pothos schema

# Explicitly export main schema
bun run pothos schema --main
```

#### Schema Type Selection
```bash
# Export federation schema
bun run pothos schema --federation

# Export both schemas
bun run pothos schema --all
```

#### Preview Mode
```bash
# Preview main schema without saving
bun run pothos schema --preview

# Preview federation schema
bun run pothos schema --federation --preview

# Preview both schemas
bun run pothos schema --all --preview
```

#### Custom Output
```bash
# Custom output directory
bun run pothos schema --output dist/schemas

# Verbose output with details
bun run pothos schema --verbose

# Combined options
bun run pothos schema --all --output schemas --verbose
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Schema generation failed |
| `1` | File system error (permissions, etc.) |

### Output Files

Depending on the flags used, the command generates:

| Schema Type | Flag | Output File |
|-------------|------|-------------|
| Main | `--main` or default | `{output}/schema.graphql` |
| Federation | `--federation` | `{output}/federation-schema.graphql` |
| Both | `--all` | Both files above |

## schema:menu

Interactive menu for schema operations.

### Synopsis

```bash
bun run pothos schema:menu
```

### Description

Opens an interactive menu providing guided access to all schema operations. This is automatically called when using the main interactive CLI.

### Menu Options

1. **Print Main Schema** - Export main GraphQL schema to SDL
2. **Print Federation Schema** - Export federation schema to SDL  
3. **Print All Schemas** - Export both schemas to SDL
4. **Preview Main Schema** - View schema without saving
5. **Preview Federation Schema** - View federation schema without saving
6. **Custom Options** - Configure output path and options
7. **Back to Main Menu** - Return to the main CLI menu

### Interactive Workflow

```bash
bun run pothos
# Select "Schema - Print GraphQL schemas to SDL format"
# Choose desired operation from submenu
# Configure options if using "Custom Options"
# Operation executes with progress feedback
# Option to perform another schema operation
```

## Error Handling

### Common Errors

#### Schema Loading Failed
```
❌ Failed to print main schema: Error loading schema
```
**Cause**: Schema definition has syntax errors or missing imports  
**Solution**: Check your schema files for TypeScript/import errors

#### Permission Denied
```
❌ Failed to print main schema: EACCES: permission denied
```
**Cause**: Cannot write to output directory  
**Solution**: Check directory permissions or use a different output path

#### Invalid Arguments
```
❌ --main and --federation cannot be used together
```
**Cause**: Mutually exclusive flags were used together  
**Solution**: Use only one schema type flag at a time

### Debugging

Use `--verbose` flag for detailed output:
```bash
bun run pothos schema --all --verbose
```

This provides:
- Schema generation progress
- File sizes and locations
- Detailed error messages
- Timing information

## Advanced Usage

### Scripting

The schema command is designed to work well in scripts:

```bash
#!/bin/bash
# Generate schemas and check for changes
bun run pothos schema --all --output schemas

if git diff --quiet schemas/; then
  echo "No schema changes"
else
  echo "Schema changes detected"
  git add schemas/
  git commit -m "Update GraphQL schemas"
fi
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Generate GraphQL Schemas
  run: bun run pothos schema --all --output dist/schemas

- name: Upload Schema Artifacts
  uses: actions/upload-artifact@v3
  with:
    name: graphql-schemas
    path: dist/schemas/
```

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
bun run pothos schema --all
git add .output/
```

## See Also

- [Schema Overview](README.md) - General schema documentation
- [CLI Reference](../cli/README.md) - Complete CLI documentation  
- [Examples](examples.md) - Usage examples and workflows