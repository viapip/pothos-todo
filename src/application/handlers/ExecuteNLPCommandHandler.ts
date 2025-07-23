import { NLPService } from '../../infrastructure/ai/NLPService.js';
import type { ParsedCommand } from '../../infrastructure/ai/NLPService.js';
import { CreateTodoCommand } from '../commands/CreateTodoCommand.js';
import { UpdateTodoCommand } from '../commands/UpdateTodoCommand.js';
import { CompleteTodoCommand } from '../commands/CompleteTodoCommand.js';
import { DeleteTodoCommand } from '../commands/DeleteTodoCommand.js';
import { CreateTodoHandler } from './CreateTodoHandler.js';
import { UpdateTodoHandler } from './UpdateTodoHandler.js';
import { CompleteTodoHandler } from './CompleteTodoHandler.js';
import { DeleteTodoHandler } from './DeleteTodoHandler.js';
import type { TodoRepository } from '../../domain/repositories/TodoRepository.js';
import { logger } from '@/logger';
import { Priority as PrismaPriority } from '@prisma/client';
import { TodoStatus as PrismaTodoStatus } from '@prisma/client';
import { DueDate } from '../../domain/value-objects/DueDate.js';

export interface ExecuteNLPCommandCommand {
  command: string;
  userId: string;
}

export interface NLPCommandResult {
  success: boolean;
  action: string;
  entity: string;
  result?: any;
  error?: string;
  confidence: number;
  needsClarification?: boolean;
  clarificationMessage?: string;
}

export class ExecuteNLPCommandHandler {
  constructor(
    private nlpService: NLPService,
    private createTodoHandler: CreateTodoHandler,
    private updateTodoHandler: UpdateTodoHandler,
    private completeTodoHandler: CompleteTodoHandler,
    private deleteTodoHandler: DeleteTodoHandler,
    private todoRepository: TodoRepository
  ) { }

  async handle(command: ExecuteNLPCommandCommand): Promise<NLPCommandResult> {
    try {
      // Parse the natural language command
      const parsed = await this.nlpService.parseCommand(command.command, {
        userId: command.userId
      });

      // Check confidence threshold
      if (parsed.confidence < 0.6) {
        return {
          success: false,
          action: parsed.action,
          entity: parsed.entity,
          confidence: parsed.confidence,
          needsClarification: true,
          clarificationMessage: 'I\'m not quite sure what you want to do. Could you please be more specific?'
        };
      }

      // Execute the appropriate action
      let result: any;
      switch (parsed.action) {
        case 'create':
          result = await this.handleCreate(parsed, command.userId);
          break;
        case 'update':
          result = await this.handleUpdate(parsed, command.userId);
          break;
        case 'complete':
          result = await this.handleComplete(parsed, command.userId);
          break;
        case 'delete':
          result = await this.handleDelete(parsed, command.userId);
          break;
        case 'list':
          result = await this.handleList(parsed, command.userId);
          break;
        default:
          throw new Error(`Unknown action: ${parsed.action}`);
      }

      return {
        success: true,
        action: parsed.action,
        entity: parsed.entity,
        result,
        confidence: parsed.confidence
      };
    } catch (error) {
      logger.error('Failed to execute NLP command', {
        command: command.command,
        userId: command.userId,
        error
      });

      return {
        success: false,
        action: 'unknown',
        entity: 'unknown',
        error: error instanceof Error ? error.message : 'Failed to execute command',
        confidence: 0
      };
    }
  }

  private async handleCreate(parsed: ParsedCommand, userId: string): Promise<any> {
    if (!parsed.parameters.title) {
      throw new Error('Title is required to create a todo');
    }

    const createCommand: CreateTodoCommand = CreateTodoCommand.create(
      parsed.parameters.todoId as string,
      parsed.parameters.title,
      userId,
      parsed.parameters.listId as string | null,
      parsed.parameters.priority as PrismaPriority,
      parsed.parameters.dueDate as Date,
      parsed.parameters.tags as string[] || [],
      parsed.parameters.status as PrismaTodoStatus,
    );

    const todo = await this.createTodoHandler.handle(createCommand);

    return todo;
  }

  private async handleUpdate(parsed: ParsedCommand, userId: string): Promise<any> {
    if (!parsed.parameters.todoId) {
      // Try to find a todo by title if no ID is provided
      const todos = await this.todoRepository.findByUserId(userId);
      const matchingTodo = todos.find(t =>
        parsed.parameters.title && t.title.toLowerCase().includes(parsed.parameters.title.toLowerCase())
      );

      if (!matchingTodo) {
        throw new Error('Could not find the todo to update. Please be more specific.');
      }

      parsed.parameters.todoId = matchingTodo.id;
    }

    const updateCommand: UpdateTodoCommand = UpdateTodoCommand.create(
      parsed.parameters.todoId,
      userId,
      {
        title: parsed.parameters.title,
        priority: parsed.parameters.priority as PrismaPriority | null,
        dueDate: parsed.parameters.dueDate as Date,
        todoListId: parsed.parameters.listId as string | null,
        tags: parsed.parameters.tags as string[] || [],
        status: parsed.parameters.status as PrismaTodoStatus,
        updatedBy: userId,
      }
    );

    await this.updateTodoHandler.handle(updateCommand);
    const todo = await this.todoRepository.findById(parsed.parameters.todoId);

    return todo;
  }

  private async handleComplete(parsed: ParsedCommand, userId: string): Promise<any> {
    if (!parsed.parameters.todoId) {
      // Try to find a todo by title if no ID is provided
      const todos = await this.todoRepository.findByUserId(userId);
      const matchingTodo = todos.find(t =>
        parsed.parameters.title && t.title.toLowerCase().includes(parsed.parameters.title.toLowerCase())
      );

      if (!matchingTodo) {
        throw new Error('Could not find the todo to complete. Please be more specific.');
      }

      parsed.parameters.todoId = matchingTodo.id;
    }

    const completeCommand: CompleteTodoCommand = CompleteTodoCommand.create(
      parsed.parameters.todoId,
      userId
    );

    await this.completeTodoHandler.handle(completeCommand);
    const todo = await this.todoRepository.findById(parsed.parameters.todoId);

    return todo;
  }

  private async handleDelete(parsed: ParsedCommand, userId: string): Promise<any> {
    if (!parsed.parameters.todoId) {
      // Try to find a todo by title if no ID is provided
      const todos = await this.todoRepository.findByUserId(userId);
      const matchingTodo = todos.find(t =>
        parsed.parameters.title && t.title.toLowerCase().includes(parsed.parameters.title.toLowerCase())
      );

      if (!matchingTodo) {
        throw new Error('Could not find the todo to delete. Please be more specific.');
      }

      parsed.parameters.todoId = matchingTodo.id;
    }

    const deleteCommand: DeleteTodoCommand = DeleteTodoCommand.create(
      parsed.parameters.todoId,
      userId
    );

    await this.deleteTodoHandler.handle(deleteCommand);

    return { id: parsed.parameters.todoId, deleted: true };
  }

  private async handleList(parsed: ParsedCommand, userId: string): Promise<any> {
    const todos = await this.todoRepository.findByUserId(userId);

    // Apply filters if provided
    let filteredTodos = todos;

    if (parsed.parameters.filter) {
      if (parsed.parameters.filter.status) {
        filteredTodos = filteredTodos.filter(t =>
          t.status.toLowerCase() === parsed.parameters.filter!.status!.toLowerCase()
        );
      }

      if (parsed.parameters.filter.priority) {
        filteredTodos = filteredTodos.filter(t =>
          t.priority?.toLowerCase() === parsed.parameters.filter!.priority!.toLowerCase()
        );
      }

      if (parsed.parameters.filter.search) {
        const searchTerm = parsed.parameters.filter.search.toLowerCase();
        filteredTodos = filteredTodos.filter(t =>
          t.title.toLowerCase().includes(searchTerm) ||
          (t.tags && t.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
      }
    }

    return filteredTodos;
  }
}