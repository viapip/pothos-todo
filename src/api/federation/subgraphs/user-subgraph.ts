// User subgraph temporarily disabled for TypeScript compilation
// TODO: Implement proper Pothos federation subgraph

import { createSchema } from 'graphql-yoga';

export const userSubgraphSchema = createSchema({
  typeDefs: `
    type Query {
      _placeholder: String
    }
  `,
  resolvers: {
    Query: {
      _placeholder: () => 'User subgraph placeholder'
    }
  }
});