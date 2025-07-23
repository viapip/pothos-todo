import { builder } from '../builder.js';
import {
  TaskAnalysisResult,
  UserProductivityReport,
  SchedulingSuggestions,
  ChatResponse,
  AnalyzeTodoInput,
  ChatWithAIInput,
  ProductivityReportInput
} from '../types/ai.js';
import { aiPipelineService } from '@/infrastructure/ai/AIPipelineService.js';
import prisma from '@/lib/prisma';

export const aiMutations = builder.mutationFields((t) => ({
  analyzeTodo: t.field({
    type: TaskAnalysisResult,
    args: {
      input: t.arg({ type: AnalyzeTodoInput, required: true }),
    },
    authScopes: { authenticated: true },
    resolve: async (_, { input }, { session, user }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      // Verify the todo belongs to the user
      const todo = await prisma.todo.findFirst({
        where: {
          id: input.todoId,
          userId: session.user.id,
        },
      });

      if (!todo) {
        throw new Error('Todo not found or access denied');
      }

      const pipeline = aiPipelineService(prisma);
      const analysis = await pipeline.analyzeTodoCreation(
        todo.id,
        todo.title,
        todo.description,
        session.user.id
      );

      return {
        todoId: todo.id,
        ...analysis,
      };
    },
  }),

  generateProductivityReport: t.field({
    type: UserProductivityReport,
    args: {
      input: t.arg({ type: ProductivityReportInput, required: false }),
    },
    authScopes: { authenticated: true },
    resolve: async (_, { input }, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      const pipeline = aiPipelineService(prisma);
      const report = await pipeline.generateProductivityReport(session.user.id);

      return report;
    },
  }),

  suggestTaskScheduling: t.field({
    type: SchedulingSuggestions,
    authScopes: { authenticated: true },
    resolve: async (_, __, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      const pipeline = aiPipelineService(prisma);
      const suggestions = await pipeline.suggestTaskScheduling(session.user.id);

      return suggestions;
    },
  }),

  chatWithAI: t.field({
    type: ChatResponse,
    args: {
      input: t.arg({ type: ChatWithAIInput, required: true }),
    },
    authScopes: { authenticated: true },
    resolve: async (_, { input }, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      const pipeline = aiPipelineService(prisma);
      const response = await pipeline.chatWithAI(
        input.query,
        session.user.id,
        input.sessionId
      );

      return response;
    },
  }),

  initializeAIServices: t.field({
    type: 'Boolean',
    args: {
      openaiApiKey: t.arg.string({ required: false }),
    },
    authScopes: { admin: true },
    resolve: async (_, { openaiApiKey }) => {
      try {
        const pipeline = aiPipelineService(prisma);
        await pipeline.initialize({
          openaiApiKey,
          enableEmbeddings: true,
          enablePredictions: true,
          enableRAG: true,
          enableInsights: true,
          enableNLP: true,
        });
        return true;
      } catch (error) {
        console.error('Failed to initialize AI services:', error);
        return false;
      }
    },
  }),
}));