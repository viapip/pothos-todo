import { builder } from "../builder.js";
import * as SessionCrud from "@/graphql/__generated__/Session";

export const SessionType = builder.prismaNode("Session", {
  id: { field: "id" },
  findUnique: (id) => ({ id }),
  fields: (t) => ({
    ...(() => {
      const { id: _, ...rest } = SessionCrud.SessionObject.fields?.(t) || {}; // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest || {};
    })(),
  }),
});
