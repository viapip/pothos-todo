// ./pothos.config.js

/** @type {import('prisma-generator-pothos-codegen').Config} */
module.exports = {
  inputs: {
    outputFilePath: './src/graphql/__generated__/inputs.ts',
    prismaImporter: `import { Prisma } from '@prisma/client';\nimport type { InputObjectRef } from '@pothos/core';`,
    simple: true, // Use simple types instead of complex filter types
    
    replacer: (code) => {
      // Remove @ts-nocheck and fix common issues
      let fixedCode = code.replace('// @ts-nocheck', '// Generated file - TypeScript check enabled');
      
      // Fix DateTime scalar parsing - more robust type checking
      fixedCode = fixedCode.replace(
        /parseValue: \(value: unknown\) => {[\s\S]*?new Date\(value as[^)]+\)[\s\S]*?}/g,
        'parseValue: (value: unknown) => {\n    if (!value) throw new Error("Invalid Date");\n    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {\n      throw new Error("Invalid Date - must be string, number, or Date");\n    }\n    try {\n      const date = new Date(value as string | number | Date);\n      if (isNaN(date.getTime())) throw new Error("Invalid Date");\n      return date;\n    } catch (error) {\n      throw new Error("Invalid Date");\n    }\n  }'
      );

      // Fix JSON scalar to properly handle JsonValue types  
      fixedCode = fixedCode.replace(
        /builder\.scalarType\('JSON',[^}]*serialize:[^}]*}/g,
        'builder.scalarType(\'JSON\', {\n  description: \'JSON scalar type\',\n  parseValue: (value: unknown) => value,\n  serialize: (value: unknown) => value,\n  parseLiteral: (value) => {\n    if (value.kind === \'StringValue\') {\n      try {\n        return JSON.parse(value.value);\n      } catch {\n        throw new Error(\'Invalid JSON\');\n      }\n    }\n    return null;\n  }\n})'
      );
      
      // Fix serialize functions
      fixedCode = fixedCode.replace(
        /serialize: \(value: unknown\) => value \? new Date\([^)]+\) : null/g,
        'serialize: (value: unknown) => value instanceof Date ? value : (value ? new Date(value as string | number | Date) : null)'
      );
      
      // Fix Json scalar name to match builder
      fixedCode = fixedCode.replace(/builder\.scalarType\('Json'/g, "builder.scalarType('JSON'");
      
      // Remove non-existent Prisma field update operations
      const nonExistentTypes = [
        'NullableIntFieldUpdateOperationsInput',
        'BoolFieldUpdateOperationsInput', 
        'NullableBoolFieldUpdateOperationsInput',
        'BigIntFieldUpdateOperationsInput',
        'NullableBigIntFieldUpdateOperationsInput',
        'BytesFieldUpdateOperationsInput',
        'NullableBytesFieldUpdateOperationsInput',
        'FloatFieldUpdateOperationsInput',
        'NullableFloatFieldUpdateOperationsInput',
        'DecimalFieldUpdateOperationsInput',
        'NullableDecimalFieldUpdateOperationsInput'
      ];
      
      // Remove invalid filter entries
      fixedCode = fixedCode.replace(/nullableInt: Prisma\.NullableIntFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/bool: Prisma\.BoolFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/nullableBool: Prisma\.NullableBoolFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/bigInt: Prisma\.BigIntFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/nullableBigInt: Prisma\.NullableBigIntFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/bytes: Prisma\.BytesFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/nullableBytes: Prisma\.NullableBytesFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/float: Prisma\.FloatFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/nullableFloat: Prisma\.NullableFloatFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/decimal: Prisma\.DecimalFieldUpdateOperationsInput;/g, '');
      fixedCode = fixedCode.replace(/nullableDecimal: Prisma\.NullableDecimalFieldUpdateOperationsInput;/g, '');
      
      nonExistentTypes.forEach(type => {
        const pattern = new RegExp(`\\s*${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: Prisma\\.${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`, 'g');
        fixedCode = fixedCode.replace(pattern, '');
      });

      // Fix tracing type compatibility issues
      fixedCode = fixedCode.replace(
        /tracing: \([^)]*parent: [^,]*,/g,
        'tracing: (parent: any,'
      );

      // Fix prismaConnection type issues
      fixedCode = fixedCode.replace(
        /t\.prismaConnection\(/g,
        '(t as any).prismaConnection('
      );

      // Add proper type assertions for generated code
      fixedCode = fixedCode.replace(
        /export const (\w+) = definePrismaObject\(/g,
        'export const $1 = definePrismaObject('
      );

      // Fix input object type annotations for declaration files - more comprehensive
      fixedCode = fixedCode.replace(
        /export const (\w+): InputObjectRef<any> = builder\.inputRef<any, false>\('([^']+)'\)\.implement\(/g,
        'export const $1: InputObjectRef<any, false> = builder.inputRef<any, false>(\'$2\').implement('
      );

      // Fix enum type annotations  
      fixedCode = fixedCode.replace(
        /export const (\w+) = builder\.enumType\(/g,
        'export const $1 = builder.enumType('
      );

      return fixedCode;
    },
  },
  crud: {
    outputDir: './src/graphql/__generated__/',
    inputsImporter: `import * as Inputs from '@/graphql/__generated__/inputs';`,
    resolverImports: `import prisma from '@/lib/prisma';`,
    prismaCaller: 'prisma',
  },
  global: {
    builderLocation: './src/api/schema/builder.ts',
  },
};