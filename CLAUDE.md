# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Pothos GraphQL Federation project using Bun as the JavaScript runtime. The project appears to be in its initial state with minimal implementation.

## Development Commands

### Install Dependencies
```bash
bun install
```

### Run the Application
```bash
bun run index.ts
```

## Project Structure

- `index.ts` - Main entry point
- `package.json` - Project configuration (minimal, using Bun)
- `tsconfig.json` - TypeScript configuration with strict mode enabled

## TypeScript Configuration

The project uses TypeScript with the following key settings:
- Target: ESNext with latest ECMAScript features
- Module: Preserve (for bundler compatibility)
- Module Resolution: Bundler mode
- Strict mode enabled
- No emit (bundler handles compilation)
- Allows `.ts` imports

## Technology Stack

- **Runtime**: Bun v1.2.15+
- **Language**: TypeScript 5+
- **Framework**: Pothos (GraphQL schema builder) - *To be implemented*
- **GraphQL**: Federation support - *To be implemented*

## Notes

This project is currently a minimal Bun starter template. The actual Pothos GraphQL Federation implementation needs to be developed.

## Documentation

- Если необходима документация по пакетам, то сначала смотреть в папку docs/
