// Todo subgraph temporarily disabled for TypeScript compilation
// TODO: Implement proper Pothos federation subgraph

import { createSchema } from 'graphql-yoga';

export const todoSubgraphSchema = createSchema({
  typeDefs: `
    type Query {
      _placeholder: String
    }
  `,
  resolvers: {
    Query: {
      _placeholder: () => 'Todo subgraph placeholder'
    }
  }
});