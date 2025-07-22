import { builder } from '../builder.js';

builder.queryFields((t) => ({
	currentUser: t.prismaField({
		type: 'User',
		nullable: true,
		resolve: async (query, parent, args, context) => {
			// Return the current authenticated user
			if (!context.session?.user) {
				return null;
			}

			// Use Prisma query to get full user data
			return {
				where: { id: context.session.user.id },
				...query,
			};
		},
	}),
}));