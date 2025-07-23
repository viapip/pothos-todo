import { OpenAI } from 'openai';
import { logger } from '@/logger';
import { PrismaClient, type Embedding, Priority as PrismaPriority, TodoStatus as PrismaTodoStatus } from '@prisma/client';
import { VectorStore } from './VectorStore';

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

export class EmbeddingService {
  private static instance: EmbeddingService | null = null;
  private openai: OpenAI | null = null;
  private vectorStore: VectorStore;

  private readonly DEFAULT_MODEL = 'text-embedding-3-small';
  private readonly DEFAULT_DIMENSIONS = 1536;

  private constructor(
    private prisma: PrismaClient
  ) {
    this.vectorStore = VectorStore.getInstance();
  }

  public static getInstance(prisma: PrismaClient): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService(prisma);
    }
    return EmbeddingService.instance;
  }

  public initialize(apiKey: string): void {
    if (!apiKey) {
      logger.warn('OpenAI API key not provided, embeddings will be disabled');
      return;
    }

    this.openai = new OpenAI({ apiKey });
    logger.info('Embedding service initialized');
  }

  public async generateEmbedding(
    text: string,
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const model = options.model || this.DEFAULT_MODEL;
    const dimensions = options.dimensions || this.DEFAULT_DIMENSIONS;

    try {
      const response = await this.openai.embeddings.create({
        model,
        input: text,
        dimensions,
      });

      const embedding = response.data[0]?.embedding || [];

      return {
        embedding,
        model,
        dimensions,
      };
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  public async embedAndStore(
    entityType: string,
    entityId: string,
    content: string,
    metadata: Record<string, any> = {}
  ): Promise<Embedding> {
    // Generate embedding
    const { embedding, model, dimensions } = await this.generateEmbedding(content);

    // Store in database
    const embeddingRecord = await this.prisma.embedding.upsert({
      where: {
        entityType_entityId: {
          entityType,
          entityId,
        },
      },
      update: {
        content,
        embedding,
        model,
        dimensions,
      },
      create: {
        entityType,
        entityId,
        content,
        embedding,
        model,
        dimensions,
      },
    });

    // Store in vector database
    await this.vectorStore.upsert(entityType + 's', [{
      id: entityId,
      vector: embedding,
      payload: {
        entityType,
        entityId,
        content,
        ...metadata,
      },
    }]);

    logger.info(`Stored embedding for ${entityType}:${entityId}`);

    return embeddingRecord;
  }

  public async searchSimilar(
    entityType: string,
    query: string,
    limit: number = 10,
    filter?: Record<string, any>
  ): Promise<Array<{ id: string; score: number; content: string; metadata: Record<string, any> }>> {
    // Generate query embedding
    const { embedding } = await this.generateEmbedding(query);

    // Search in vector database
    const results = await this.vectorStore.search(
      entityType + 's',
      embedding,
      { limit, filter }
    );

    return results.map(result => ({
      id: result.id,
      score: result.score,
      content: result.payload.content as string,
      metadata: result.payload,
    }));
  }

  public async updateEmbedding(
    entityType: string,
    entityId: string,
    newContent: string,
    metadata: Record<string, any> = {}
  ): Promise<Embedding> {
    return this.embedAndStore(entityType, entityId, newContent, metadata);
  }

  public async deleteEmbedding(
    entityType: string,
    entityId: string
  ): Promise<void> {
    // Delete from database
    await this.prisma.embedding.delete({
      where: {
        entityType_entityId: {
          entityType,
          entityId,
        },
      },
    });

    // Delete from vector database
    await this.vectorStore.delete(entityType + 's', [entityId]);

    logger.info(`Deleted embedding for ${entityType}:${entityId}`);
  }

  public async embedTodo(
    todoId: string,
    title: string,
    userId: string,
    status: PrismaTodoStatus,
    priority: PrismaPriority | null
  ): Promise<Embedding> {
    const content = `Todo: ${title}`;
    const metadata = {
      userId,
      status,
      priority,
      type: 'todo',
    };

    return this.embedAndStore('todo', todoId, content, metadata);
  }

  public async embedTodoList(
    todoListId: string,
    title: string,
    userId: string
  ): Promise<Embedding> {
    const content = `Todo List: ${title}`;
    const metadata = {
      userId,
      type: 'todoList',
    };

    return this.embedAndStore('todoList', todoListId, content, metadata);
  }

  public async findSimilarTodos(
    query: string,
    userId: string,
    limit: number = 10
  ): Promise<Array<{ id: string; score: number; content: string; metadata: any }>> {
    return this.searchSimilar('todo', query, limit, {
      must: [{ key: 'userId', match: { value: userId } }],
    });
  }

  public async findSimilarTodoLists(
    query: string,
    userId: string,
    limit: number = 10
  ): Promise<Array<{ id: string; score: number; content: string; metadata: any }>> {
    return this.searchSimilar('todoList', query, limit, {
      must: [{ key: 'userId', match: { value: userId } }],
    });
  }
}