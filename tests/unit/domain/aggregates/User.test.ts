/**
 * Tests for User domain aggregate
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { User, UserCreated, UserUpdated } from '@/domain/aggregates/User.js';

describe('User Domain Aggregate', () => {
  let user: User;
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const email = 'test@example.com';
  const name = 'Test User';
  const createdAt = new Date('2024-01-01');
  const updatedAt = new Date('2024-01-02');

  beforeEach(() => {
    user = new User(userId, email, name, createdAt, updatedAt);
  });

  describe('construction', () => {
    it('should create user with required properties', () => {
      expect(user.id).toBe(userId);
      expect(user.email).toBe(email);
      expect(user.name).toBe(name);
      expect(user.createdAt).toBe(createdAt);
      expect(user.updatedAt).toBe(updatedAt);
    });

    it('should create user with null name', () => {
      const userWithNullName = new User(userId, email, null, createdAt, updatedAt);
      
      expect(userWithNullName.name).toBeNull();
      expect(userWithNullName.email).toBe(email);
    });
  });

  describe('email updates', () => {
    it('should update email and emit domain event', () => {
      const newEmail = 'updated@example.com';
      
      user.updateEmail(newEmail);
      
      expect(user.email).toBe(newEmail);
      
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(UserUpdated);
      expect((events[0] as UserUpdated).email).toBe(newEmail);
    });

    it('should not emit event if email unchanged', () => {
      user.updateEmail(email); // Same email
      
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(0);
    });

    it('should validate email format', () => {
      expect(() => user.updateEmail('invalid-email')).toThrow('Invalid email format');
    });

    it('should not allow empty email', () => {
      expect(() => user.updateEmail('')).toThrow('Email cannot be empty');
    });
  });

  describe('name updates', () => {
    it('should update name and emit domain event', () => {
      const newName = 'Updated Name';
      
      user.updateName(newName);
      
      expect(user.name).toBe(newName);
      
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(UserUpdated);
      expect((events[0] as UserUpdated).name).toBe(newName);
    });

    it('should allow setting name to null', () => {
      user.updateName(null);
      
      expect(user.name).toBeNull();
      
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(1);
    });

    it('should not emit event if name unchanged', () => {
      user.updateName(name); // Same name
      
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('domain events', () => {
    it('should track multiple events', () => {
      user.updateEmail('new@example.com');
      user.updateName('New Name');
      
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(2);
      
      expect(events[0]).toBeInstanceOf(UserUpdated);
      expect((events[0] as UserUpdated).email).toBe('new@example.com');
      
      expect(events[1]).toBeInstanceOf(UserUpdated);
      expect((events[1] as UserUpdated).name).toBe('New Name');
    });

    it('should clear events after marking as committed', () => {
      user.updateEmail('new@example.com');
      
      expect(user.getUncommittedEvents()).toHaveLength(1);
      
      user.markEventsAsCommitted();
      
      expect(user.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('UserCreated event', () => {
    it('should create event with correct data', () => {
      const event = new UserCreated(userId, email, name);
      
      expect(event.aggregateId).toBe(userId);
      expect(event.eventType).toBe('UserCreated');
      expect(event.email).toBe(email);
      expect(event.name).toBe(name);
      expect(event.version).toBe(1);
    });

    it('should serialize event data correctly', () => {
      const event = new UserCreated(userId, email, name);
      const eventData = event.getEventData();
      
      expect(eventData).toEqual({
        email,
        name
      });
    });
  });

  describe('UserUpdated event', () => {
    it('should create event with email update', () => {
      const newEmail = 'updated@example.com';
      const event = new UserUpdated(userId, newEmail);
      
      expect(event.aggregateId).toBe(userId);
      expect(event.eventType).toBe('UserUpdated');
      expect(event.email).toBe(newEmail);
      expect(event.name).toBeUndefined();
    });

    it('should create event with name update', () => {
      const newName = 'Updated Name';
      const event = new UserUpdated(userId, undefined, newName);
      
      expect(event.email).toBeUndefined();
      expect(event.name).toBe(newName);
    });

    it('should serialize partial update data', () => {
      const event = new UserUpdated(userId, 'new@example.com', undefined);
      const eventData = event.getEventData();
      
      expect(eventData).toEqual({
        email: 'new@example.com',
        name: undefined
      });
    });
  });
});