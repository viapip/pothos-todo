export enum TodoStatusEnum {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class TodoStatus {
  private readonly _value: TodoStatusEnum;

  constructor(value: TodoStatusEnum) {
    this._value = value;
  }

  get value(): TodoStatusEnum {
    return this._value;
  }

  public static pending(): TodoStatus {
    return new TodoStatus(TodoStatusEnum.PENDING);
  }

  public static inProgress(): TodoStatus {
    return new TodoStatus(TodoStatusEnum.IN_PROGRESS);
  }

  public static completed(): TodoStatus {
    return new TodoStatus(TodoStatusEnum.COMPLETED);
  }

  public static cancelled(): TodoStatus {
    return new TodoStatus(TodoStatusEnum.CANCELLED);
  }

  public isPending(): boolean {
    return this._value === TodoStatusEnum.PENDING;
  }

  public isInProgress(): boolean {
    return this._value === TodoStatusEnum.IN_PROGRESS;
  }

  public isCompleted(): boolean {
    return this._value === TodoStatusEnum.COMPLETED;
  }

  public isCancelled(): boolean {
    return this._value === TodoStatusEnum.CANCELLED;
  }

  public canTransitionTo(newStatus: TodoStatus): boolean {
    const transitions: Record<TodoStatusEnum, TodoStatusEnum[]> = {
      [TodoStatusEnum.PENDING]: [TodoStatusEnum.IN_PROGRESS, TodoStatusEnum.CANCELLED],
      [TodoStatusEnum.IN_PROGRESS]: [TodoStatusEnum.COMPLETED, TodoStatusEnum.CANCELLED, TodoStatusEnum.PENDING],
      [TodoStatusEnum.COMPLETED]: [],
      [TodoStatusEnum.CANCELLED]: [TodoStatusEnum.PENDING],
    };

    return transitions[this._value].includes(newStatus.value);
  }

  public equals(other: TodoStatus): boolean {
    return this._value === other._value;
  }
}