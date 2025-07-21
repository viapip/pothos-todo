// ./pothos.config.js

/** @type {import('prisma-generator-pothos-codegen').Config} */
module.exports = {
  inputs: {
    outputFilePath: './src/graphql/__generated__/inputs.ts',
  },
  crud: {
    outputDir: './src/graphql/__generated__/',
    inputsImporter: `import * as Inputs from '@/graphql/__generated__/inputs';`,
    resolverImports: `\nimport prisma from '@/lib/prisma';`,
    prismaCaller: 'prisma',
  },
  global: {
    builderLocation: './src/api/schema/builder.ts',
  },
};