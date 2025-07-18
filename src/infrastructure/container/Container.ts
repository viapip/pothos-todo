import { PrismaClient } from '@prisma/client';
import { PrismaTodoRepository } from '../persistence/PrismaTodoRepository.js';
import { PrismaTodoListRepository } from '../persistence/PrismaTodoListRepository.js';
import { PrismaUserRepository } from '../persistence/PrismaUserRepository.js';
import { PrismaEventStore } from '../events/PrismaEventStore.js';
import { InMemoryEventPublisher } from '../events/InMemoryEventPublisher.js';
import { EventHandlerRegistry } from '../events/EventHandlerRegistry.js';
import { CreateTodoHandler } from '../../application/handlers/CreateTodoHandler.js';
import { UpdateTodoHandler } from '../../application/handlers/UpdateTodoHandler.js';
import { CompleteTodoHandler } from '../../application/handlers/CompleteTodoHandler.js';
import { DeleteTodoHandler } from '../../application/handlers/DeleteTodoHandler.js';

export class Container {
  private static instance: Container;
  
  private readonly _prisma: PrismaClient;
  private readonly _todoRepository: PrismaTodoRepository;
  private readonly _todoListRepository: PrismaTodoListRepository;
  private readonly _userRepository: PrismaUserRepository;
  private readonly _eventStore: PrismaEventStore;
  private readonly _eventPublisher: InMemoryEventPublisher;
  private readonly _eventHandlerRegistry: EventHandlerRegistry;
  
  private readonly _createTodoHandler: CreateTodoHandler;
  private readonly _updateTodoHandler: UpdateTodoHandler;
  private readonly _completeTodoHandler: CompleteTodoHandler;
  private readonly _deleteTodoHandler: DeleteTodoHandler;

  private constructor() {
    this._prisma = new PrismaClient();
    
    this._todoRepository = new PrismaTodoRepository(this._prisma);
    this._todoListRepository = new PrismaTodoListRepository(this._prisma);
    this._userRepository = new PrismaUserRepository(this._prisma);
    
    this._eventStore = new PrismaEventStore(this._prisma);
    this._eventPublisher = new InMemoryEventPublisher(this._eventStore);
    this._eventHandlerRegistry = new EventHandlerRegistry(this._eventPublisher);
    
    this._createTodoHandler = new CreateTodoHandler(this._todoRepository, this._eventPublisher);
    this._updateTodoHandler = new UpdateTodoHandler(this._todoRepository, this._eventPublisher);
    this._completeTodoHandler = new CompleteTodoHandler(this._todoRepository, this._eventPublisher);
    this._deleteTodoHandler = new DeleteTodoHandler(this._todoRepository, this._eventPublisher);
  }

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  get prisma(): PrismaClient {
    return this._prisma;
  }

  get todoRepository(): PrismaTodoRepository {
    return this._todoRepository;
  }

  get todoListRepository(): PrismaTodoListRepository {
    return this._todoListRepository;
  }

  get userRepository(): PrismaUserRepository {
    return this._userRepository;
  }

  get eventStore(): PrismaEventStore {
    return this._eventStore;
  }

  get eventPublisher(): InMemoryEventPublisher {
    return this._eventPublisher;
  }

  get createTodoHandler(): CreateTodoHandler {
    return this._createTodoHandler;
  }

  get updateTodoHandler(): UpdateTodoHandler {
    return this._updateTodoHandler;
  }

  get completeTodoHandler(): CompleteTodoHandler {
    return this._completeTodoHandler;
  }

  get deleteTodoHandler(): DeleteTodoHandler {
    return this._deleteTodoHandler;
  }

  async disconnect(): Promise<void> {
    await this._prisma.$disconnect();
  }
}