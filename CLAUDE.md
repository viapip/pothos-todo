# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Pothos GraphQL Federation project using Bun as the JavaScript runtime and H3 as the HTTP framework. The project includes authentication, session management, and GraphQL API.

## Development Commands

### Install Dependencies
```bash
bun install
```

### Run the Application
```bash
bun run start
```

### Type Checking
```bash
bun run check:types
```

### Database Commands
```bash
bun run db:up          # Start PostgreSQL container
bun run db:migrate     # Run Prisma migrations
bun run db:generate    # Generate Prisma client
```

## Project Structure

- `index.ts` - Main server entry point (H3-based)
- `src/api/server/server.ts` - GraphQL Yoga server configuration  
- `src/routes/auth/` - Authentication routes (Google, GitHub OAuth)
- `src/config/` - Configuration management (c12-based)
- `config/` - Environment-specific config files
- `src/lib/auth/` - Authentication utilities and session management

## Configuration System

The project uses **c12** for configuration management with environment-specific overrides:

- `config/base.config.ts` - Base configuration
- `config/development.config.ts` - Development overrides
- `config/production.config.ts` - Production overrides  
- `config/test.config.ts` - Test overrides

### Environment Variables
Configuration uses `.env` files and environment variables:
- Copy `.env.example` to `.env` for local development
- All environment variables are centralized through config files
- **Never access `process.env` directly** - use config functions instead

## Technology Stack

- **Runtime**: Bun v1.2.15+
- **HTTP Framework**: H3 v1.15.3 (Universal HTTP server)
- **Language**: TypeScript 5+
- **GraphQL**: GraphQL Yoga + Pothos schema builder
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: Lucia + Arctic (OAuth providers)
- **Session Management**: H3 sessions with encryption
- **Configuration**: c12 (unified config system)

## Server Architecture

The server uses **H3** as the HTTP framework with the following structure:

1. **H3 Application** (`createApp()`)
2. **Global Middleware**:
   - Request logging
   - Session management (for auth routes)
3. **Auth Routes** (`/auth/*`):
   - Google OAuth (`/auth/google`, `/auth/google/callback`)  
   - GitHub OAuth (`/auth/github`, `/auth/github/callback`)
   - Logout (`/auth/logout`, `/auth/logout/all`)
4. **GraphQL Endpoint** (`/graphql`):
   - GraphQL Yoga integration
   - Prisma-based resolvers

## Authentication System

- **OAuth Providers**: Google, GitHub
- **Session Management**: H3 sessions with secure cookies
- **User Management**: Prisma-based user accounts with provider linking
- **Security**: CSRF protection, PKCE (Google), secure cookies

## Configuration Usage

Always use configuration functions instead of direct environment access:

```typescript
import { getServerConfig, getSessionConfig, getDatabaseConfig } from './src/config/index.js';

// ✅ Correct - use config functions
const serverConfig = getServerConfig();
const sessionConfig = getSessionConfig();

// ❌ Wrong - never access process.env directly
const port = process.env.PORT; // Don't do this
```

## Notes

- Server runs on port 4000 by default (configurable via config)
- GraphQL Playground available at `http://localhost:4000/graphql`
- Authentication endpoints available under `/auth/*`
- All configuration is centralized and environment-aware

## Documentation

- Если необходима документация по пакетам, то сначала смотреть в папку docs/

## Environment Variable Management

- **Important Guidelines**:
  - не использовать process.env в проекте, кроме конфигурации
  - Все получения переменных окружения только через конфигурацию