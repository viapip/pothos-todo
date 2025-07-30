// Domain Layer Exports
// Aggregates
export { Todo } from './aggregates/Todo.js'
export { TodoList } from './aggregates/TodoList.js'
export { User } from './aggregates/User.js'
export { AggregateRoot } from './aggregates/base/AggregateRoot.js'
export { Entity } from './aggregates/base/Entity.js'

// Value Objects
export { DueDate } from './value-objects/DueDate.js'
export { Priority, PriorityEnum } from './value-objects/Priority.js'
export { TodoStatus, TodoStatusEnum } from './value-objects/TodoStatus.js'

// Events
export { DomainEvent } from './events/DomainEvent.js'
export { TodoAssigned } from './events/TodoAssigned.js'
export { TodoCompleted } from './events/TodoCompleted.js'
export { TodoCreated } from './events/TodoCreated.js'
export { TodoDeleted } from './events/TodoDeleted.js'
export { TodoUpdated } from './events/TodoUpdated.js'

// Repository Interfaces
export type { TodoRepository } from './repositories/TodoRepository.js'
export type { TodoListRepository } from './repositories/TodoListRepository.js'
export type { UserRepository } from './repositories/UserRepository.js'