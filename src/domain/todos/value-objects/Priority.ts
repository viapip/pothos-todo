export enum PriorityEnum {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class Priority {
  private readonly _value: PriorityEnum;

  constructor(value: PriorityEnum) {
    this._value = value;
  }

  get value(): PriorityEnum {
    return this._value;
  }

  public static low(): Priority {
    return new Priority(PriorityEnum.LOW);
  }

  public static medium(): Priority {
    return new Priority(PriorityEnum.MEDIUM);
  }

  public static high(): Priority {
    return new Priority(PriorityEnum.HIGH);
  }

  public static urgent(): Priority {
    return new Priority(PriorityEnum.URGENT);
  }

  public isLow(): boolean {
    return this._value === PriorityEnum.LOW;
  }

  public isMedium(): boolean {
    return this._value === PriorityEnum.MEDIUM;
  }

  public isHigh(): boolean {
    return this._value === PriorityEnum.HIGH;
  }

  public isUrgent(): boolean {
    return this._value === PriorityEnum.URGENT;
  }

  public getNumericValue(): number {
    const priorityValues = {
      [PriorityEnum.LOW]: 1,
      [PriorityEnum.MEDIUM]: 2,
      [PriorityEnum.HIGH]: 3,
      [PriorityEnum.URGENT]: 4,
    };
    return priorityValues[this._value];
  }

  public equals(other: Priority): boolean {
    return this._value === other._value;
  }
}