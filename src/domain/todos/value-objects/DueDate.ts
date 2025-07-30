export class DueDate {
  private readonly _value: Date;

  constructor(value: Date) {
    if (value < new Date()) {
      throw new Error('Due date cannot be in the past');
    }
    this._value = value;
  }

  get value(): Date {
    return this._value;
  }

  public static fromDate(date: Date): DueDate {
    return new DueDate(date);
  }

  public static fromString(dateString: string): DueDate {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return new DueDate(date);
  }

  public isOverdue(): boolean {
    return this._value < new Date();
  }

  public isDueToday(): boolean {
    const today = new Date();
    return (
      this._value.getDate() === today.getDate() &&
      this._value.getMonth() === today.getMonth() &&
      this._value.getFullYear() === today.getFullYear()
    );
  }

  public isDueSoon(daysThreshold: number = 3): boolean {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
    return this._value <= thresholdDate;
  }

  public daysUntilDue(): number {
    const today = new Date();
    const timeDiff = this._value.getTime() - today.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }

  public equals(other: DueDate): boolean {
    return this._value.getTime() === other._value.getTime();
  }

  public toString(): string {
    return this._value.toISOString();
  }
}