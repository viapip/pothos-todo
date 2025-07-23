export class DeleteTodoCommand {
  constructor(
    public readonly id: string,
    public readonly userId: string
  ) { }

  public static create(id: string, userId: string): DeleteTodoCommand {
    if (!id) {
      throw new Error('Todo ID is required');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    return new DeleteTodoCommand(id, userId);
  }
}