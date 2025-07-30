// ./pothos.config.js

/** @type {import('prisma-generator-pothos-codegen').Config} */
module.exports = {
  inputs: {
    outputFilePath: './src/graphql/__generated__/inputs.ts',
    prismaImporter: `\nimport { Prisma } from '@prisma/client'; \nimport type { InputObjectRef } from '@pothos/core'`,
    
    replacer: (code) => {
      // Исправляем проблемы TS2742 путём добавления явных аннотаций типов
      let fixedCode = code;

      // Паттерн для поиска экспортов с builder.inputRef
      const inputRefPattern = /export const (\w+) = builder\.inputRef<PrismaUpdateOperationsInputFilter<Prisma\.(\w+)>, false>\('(\w+)'\)\.implement\(/g;
      
      // Заменяем на явно типизированные версии
      fixedCode = fixedCode.replace(inputRefPattern, (match, constName, prismaType, inputName) => {
        return `export const ${constName}: InputObjectRef<PrismaUpdateOperationsInputFilter<Prisma.${prismaType}>, false> = builder.inputRef<PrismaUpdateOperationsInputFilter<Prisma.${prismaType}>, false>('${inputName}').implement(`;
      });

      return fixedCode;
    },
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