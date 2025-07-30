import { builder } from '../builder.js';
import * as SessionCrud from '@/graphql/__generated__/Session';

export const SessionType = builder.prismaNode('Session', {
  id: { field: 'id' },
  findUnique: (id) => ({ id }),
  fields: (t) => ({
    ...(() => {
      const { id, ...rest } = SessionCrud.SessionObject.fields(t);
      return rest;
    })(),
  }),
}); 