import { builder } from '../builder.js';
import prisma from '@/lib/prisma';

builder.queryFields((t) => ({
	currentUser: t.prismaField({
		type: 'User',
		nullable: true,
		resolve: async (query, _parent, _args, context) => {
			// Return the current authenticated user
			if (!context.session?.user) {
				return null;
			}

			// Use Prisma to get full user data
			return prisma.user.findUnique({
				where: { id: context.session.user.id },
				...query,
			});
		},
	}),
}));