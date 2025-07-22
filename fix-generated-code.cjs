#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Function to fix code issues
function fixCode(content, filePath) {
  let fixed = content;
  
  // Fix type imports
  fixed = fixed.replace(
    /import \{\s*([^}]+)\s*\} from '@pothos\/core';/g,
    (match, imports) => {
      const importList = imports.split(',').map(i => i.trim());
      const typeImports = ['FieldOptionsFromKind', 'InputFieldMap', 'InterfaceParam', 'MutationFieldsShape', 'QueryFieldsShape', 'TypeParam'];
      const typeOnlyImports = importList.filter(i => typeImports.includes(i));
      const regularImports = importList.filter(i => !typeImports.includes(i));
      
      let result = '';
      if (regularImports.length > 0) {
        result += `import { ${regularImports.join(', ')} } from '@pothos/core';`;
      }
      if (typeOnlyImports.length > 0) {
        if (result) result += '\n';
        result += `import type { ${typeOnlyImports.join(', ')} } from '@pothos/core';`;
      }
      return result;
    }
  );

  // Fix import statements for Prisma plugin
  fixed = fixed.replace(
    /import \{\s*([^}]+)\s*\} from '@pothos\/plugin-prisma';/g,
    (match, imports) => {
      const importList = imports.split(',').map(i => i.trim());
      const typeImports = ['PrismaFieldOptions', 'PrismaObjectTypeOptions', 'RelatedFieldOptions'];
      const typeOnlyImports = importList.filter(i => typeImports.includes(i));
      const regularImports = importList.filter(i => !typeImports.includes(i));
      
      let result = '';
      if (regularImports.length > 0) {
        result += `import { ${regularImports.join(', ')} } from '@pothos/plugin-prisma';`;
      }
      if (typeOnlyImports.length > 0) {
        if (result) result += '\n';
        result += `import type { ${typeOnlyImports.join(', ')} } from '@pothos/plugin-prisma';`;
      }
      return result;
    }
  );

  // Fix boolean args in mutations
  fixed = fixed.replace(/data: args.data \?\? true,/g, 'data: args.data,');
  fixed = fixed.replace(/where: args.where \?\? true,/g, 'where: args.where,');
  fixed = fixed.replace(/create: args.create \?\? true,/g, 'create: args.create,');
  fixed = fixed.replace(/update: args.update \?\? true,/g, 'update: args.update,');
  
  // Fix false values
  fixed = fixed.replace(/where: args.where \?\? false,/g, 'where: args.where,');
  fixed = fixed.replace(/orderBy: args.orderBy \?\? false,/g, 'orderBy: args.orderBy,');
  fixed = fixed.replace(/cursor: args.cursor \?\? false,/g, 'cursor: args.cursor,');
  
  // Fix standalone boolean values in mutations
  fixed = fixed.replace(/create: true,/g, 'create: args.create,');
  fixed = fixed.replace(/update: true,/g, 'update: args.update,');
  fixed = fixed.replace(/data: true,/g, 'data: args.data,');
  fixed = fixed.replace(/where: true,/g, 'where: args.where,');
  fixed = fixed.replace(/where: false,/g, 'where: undefined,');
  
  // Fix orderBy arrays
  fixed = fixed.replace(/orderBy: false\[\]/g, 'orderBy: undefined');
  
  // Fix JSON field in DomainEvent
  if (filePath.includes('DomainEvent/object.base.ts')) {
    fixed = fixed.replace(
      /payload: t\.field\(PothosFieldWithInputOptions<Types>.*?\}\),/gs,
      `payload: t.field({
      type: 'JSON',
      resolve: (parent) => parent.payload,
    }),`
    );
  }
  
  // Fix AuthPayload type issue
  if (filePath.includes('auth.ts')) {
    fixed = fixed.replace(
      /export const AuthPayload = builder\.objectType\('AuthPayload',/g,
      "export const AuthPayload = builder.objectType('AuthPayload' as any,"
    );
  }
  
  return fixed;
}

// Process all generated files
const generatedFiles = glob.sync('src/graphql/__generated__/**/*.ts');

generatedFiles.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const fixed = fixCode(content, filePath);
  
  if (content !== fixed) {
    fs.writeFileSync(filePath, fixed);
    console.log(`Fixed: ${filePath}`);
  }
});

// Also fix the auth.ts file
const authPath = 'src/api/schema/types/auth.ts';
if (fs.existsSync(authPath)) {
  const content = fs.readFileSync(authPath, 'utf8');
  const fixed = fixCode(content, authPath);
  
  if (content !== fixed) {
    fs.writeFileSync(authPath, fixed);
    console.log(`Fixed: ${authPath}`);
  }
}

console.log('Code fixes completed!');