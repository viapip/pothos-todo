import { builder } from './builder.js';
import { printSubgraphSchema } from '@apollo/subgraph';
import { schema } from './schema.js';

export const federatedSchema = printSubgraphSchema(schema);

export const SERVICE_NAME = 'pothos-todo';
export const SERVICE_VERSION = '1.0.0';

export const federationConfig = {
  serviceName: SERVICE_NAME,
  serviceVersion: SERVICE_VERSION,
  schema: federatedSchema,
};