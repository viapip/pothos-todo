import { builder } from './builder.js';

export const TodoStatusEnum = builder.enumType('TodoStatus', {
  values: {
    PENDING: {
      value: 'PENDING',
      description: 'Todo is pending and not yet started',
    },
    IN_PROGRESS: {
      value: 'IN_PROGRESS',
      description: 'Todo is currently being worked on',
    },
    COMPLETED: {
      value: 'COMPLETED',
      description: 'Todo has been completed',
    },
    CANCELLED: {
      value: 'CANCELLED',
      description: 'Todo has been cancelled',
    },
  },
});

export const PriorityEnum = builder.enumType('Priority', {
  values: {
    LOW: {
      value: 'LOW',
      description: 'Low priority task',
    },
    MEDIUM: {
      value: 'MEDIUM',
      description: 'Medium priority task',
    },
    HIGH: {
      value: 'HIGH',
      description: 'High priority task',
    },
    URGENT: {
      value: 'URGENT',
      description: 'Urgent priority task',
    },
  },
});