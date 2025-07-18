#!/usr/bin/env node

import { execute } from '@oclif/core';

const args = process.argv.slice(2);

// If no arguments are provided, run the interactive command
if (args.length === 0) {
  process.argv.push('interactive');
}

await execute({ dir: import.meta.url, development: process.env.NODE_ENV === 'development' });