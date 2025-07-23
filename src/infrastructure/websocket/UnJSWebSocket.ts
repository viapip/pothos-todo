/**
 * Enhanced WebSocket server using UnJS unws with advanced features
 * Provides real-time communication with authentication and room management
 */

import { createServer as createWebSocketServer } from 'ws';
import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { z } from 'zod';
import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';

export interface WebSocketMessage {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
  userId?: string;
  room?: string;
}

export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  userId?: string;
  rooms: Set<string>;
  metadata: Record<string, any>;
  lastActivity: Date;
  authenticated: boolean;
}

export interface WebSocketRoom {
  id: string;
  name: string;
  clients: Set<string>;
  metadata: Record<string, any>;
  created: Date;
  persistent: boolean;
}

export interface MessageHandler {
  type: string;
  schema?: z.ZodSchema;
  authenticate?: boolean;
  rateLimit?: {
    max: number;
    windowMs: number;
  };
  handler: (client: WebSocketClient, message: WebSocketMessage) => Promise<void> | void;
}

/**
 * Enhanced WebSocket server with rooms and authentication
 */
export class UnJSWebSocketServer {
  private server?: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private rooms: Map<string, WebSocketRoom> = new Map();
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();
  private config: any;

  constructor(config?: any) {
    this.config = config || configManager.getConfig();
    this.setupValidationSchemas();
    this.setupDefaultHandlers();
  }

  /**
   * Setup validation schemas for WebSocket messages
   */
  private setupValidationSchemas(): void {
    // Base message schema
    const messageSchema = z.object({
      id: z.string().uuid(),
      type: z.string().min(1),
      data: z.any(),
      timestamp: z.date().optional(),
      room: z.string().optional(),
    });

    validationService.registerSchema('wsMessage', messageSchema);

    // Authentication message schema
    const authSchema = z.object({
      token: z.string().min(1),
      userId: z.string().min(1),
    });

    validationService.registerSchema('wsAuth', authSchema);

    // Join room schema
    const joinRoomSchema = z.object({
      roomId: z.string().min(1),
      password: z.string().optional(),
    });

    validationService.registerSchema('wsJoinRoom', joinRoomSchema);

    // Chat message schema
    const chatSchema = z.object({
      message: z.string().min(1).max(1000),
      room: z.string().min(1),
    });

    validationService.registerSchema('wsChat', chatSchema);
  }

  /**
   * Setup default message handlers
   */
  private setupDefaultHandlers(): void {
    // Authentication handler
    this.registerHandler({
      type: 'auth',
      schema: z.object({
        token: z.string().min(1),
        userId: z.string().min(1),
      }),
      handler: async (client, message) => {
        try {
          // Validate token (simplified - would use real JWT validation)
          const { token, userId } = message.data;
          
          if (this.validateAuthToken(token, userId)) {
            client.userId = userId;
            client.authenticated = true;
            client.metadata.authTime = new Date();

            await this.sendToClient(client.id, {
              id: stringUtils.random(8),
              type: 'auth_success',
              data: { userId, authenticated: true },
              timestamp: new Date(),
            });

            logger.info('Client authenticated', { clientId: client.id, userId });
          } else {
            await this.sendToClient(client.id, {
              id: stringUtils.random(8),
              type: 'auth_error',
              data: { error: 'Invalid credentials' },
              timestamp: new Date(),
            });
          }
        } catch (error) {
          logger.error('Authentication error', { clientId: client.id, error });
        }
      }
    });

    // Join room handler
    this.registerHandler({
      type: 'join_room',
      schema: z.object({
        roomId: z.string().min(1),
        password: z.string().optional(),
      }),
      authenticate: true,
      handler: async (client, message) => {
        const { roomId, password } = message.data;
        
        try {
          const room = await this.joinRoom(client.id, roomId, password);
          
          await this.sendToClient(client.id, {
            id: stringUtils.random(8),
            type: 'room_joined',
            data: { 
              roomId: room.id, 
              roomName: room.name,
              clientCount: room.clients.size 
            },
            timestamp: new Date(),
          });

          // Notify other clients in the room
          await this.broadcastToRoom(roomId, {
            id: stringUtils.random(8),
            type: 'user_joined',
            data: { 
              userId: client.userId,
              clientId: client.id 
            },
            timestamp: new Date(),
          }, client.id);

          logger.info('Client joined room', { 
            clientId: client.id, 
            userId: client.userId, 
            roomId 
          });

        } catch (error) {
          await this.sendToClient(client.id, {
            id: stringUtils.random(8),
            type: 'room_error',
            data: { error: String(error) },
            timestamp: new Date(),
          });
        }
      }
    });

    // Leave room handler
    this.registerHandler({
      type: 'leave_room',
      authenticate: true,
      handler: async (client, message) => {
        const { roomId } = message.data;
        
        if (client.rooms.has(roomId)) {
          await this.leaveRoom(client.id, roomId);
          
          await this.sendToClient(client.id, {
            id: stringUtils.random(8),
            type: 'room_left',
            data: { roomId },
            timestamp: new Date(),
          });
        }
      }
    });

    // Chat message handler
    this.registerHandler({
      type: 'chat_message',
      schema: z.object({
        message: z.string().min(1).max(1000),
        room: z.string().min(1),
      }),
      authenticate: true,
      rateLimit: { max: 10, windowMs: 60000 }, // 10 messages per minute
      handler: async (client, message) => {
        const { message: chatMessage, room: roomId } = message.data;
        
        if (!client.rooms.has(roomId)) {
          await this.sendToClient(client.id, {
            id: stringUtils.random(8),
            type: 'chat_error',
            data: { error: 'Not in room' },
            timestamp: new Date(),
          });
          return;
        }

        // Broadcast to room
        await this.broadcastToRoom(roomId, {
          id: stringUtils.random(8),
          type: 'chat_message',
          data: {
            message: chatMessage,
            userId: client.userId,
            room: roomId,
            timestamp: new Date(),
          },
          timestamp: new Date(),
        });

        logger.debug('Chat message sent', { 
          userId: client.userId, 
          roomId, 
          messageLength: chatMessage.length 
        });
      }
    });

    // Ping handler for keep-alive
    this.registerHandler({
      type: 'ping',
      handler: async (client, message) => {
        await this.sendToClient(client.id, {
          id: stringUtils.random(8),
          type: 'pong',
          data: { timestamp: new Date() },
          timestamp: new Date(),
        });
      }
    });

    // Get room info handler
    this.registerHandler({
      type: 'room_info',
      authenticate: true,
      handler: async (client, message) => {
        const { roomId } = message.data;
        const room = this.rooms.get(roomId);
        
        if (!room || !client.rooms.has(roomId)) {
          await this.sendToClient(client.id, {
            id: stringUtils.random(8),
            type: 'room_error',
            data: { error: 'Room not found or not member' },
            timestamp: new Date(),
          });
          return;
        }

        const roomInfo = {
          id: room.id,
          name: room.name,
          clientCount: room.clients.size,
          created: room.created,
          persistent: room.persistent,
        };

        await this.sendToClient(client.id, {
          id: stringUtils.random(8),
          type: 'room_info',
          data: roomInfo,
          timestamp: new Date(),
        });
      }
    });
  }

  /**
   * Start the WebSocket server
   */
  async start(port: number = 3001, host: string = 'localhost'): Promise<void> {
    try {
      this.server = createWebSocketServer({ 
        port,
        host 
      });

      this.server.on('connection', (ws) => {
        this.handleConnection(ws);
        
        ws.on('message', (message) => this.handleMessage(ws, message));
        ws.on('close', () => this.handleDisconnection(ws));
        ws.on('error', (error) => this.handleError(ws, error));
      });

      logger.info('WebSocket server started', { port, host });
      
      // Setup cleanup interval
      setInterval(() => this.cleanup(), 60000); // Every minute

    } catch (error) {
      logger.error('Failed to start WebSocket server', { port, host, error });
      throw error;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: any): void {
    const clientId = stringUtils.random(16);
    
    const client: WebSocketClient = {
      id: clientId,
      socket: ws,
      rooms: new Set(),
      metadata: {},
      lastActivity: new Date(),
      authenticated: false,
    };

    this.clients.set(clientId, client);
    
    // Store client ID in socket for easy access
    (ws as any).clientId = clientId;

    logger.info('Client connected', { clientId, totalClients: this.clients.size });

    // Send welcome message
    this.sendToClient(clientId, {
      id: stringUtils.random(8),
      type: 'welcome',
      data: { 
        clientId,
        serverTime: new Date(),
        features: ['authentication', 'rooms', 'chat', 'file_sharing']
      },
      timestamp: new Date(),
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(ws: any): void {
    const clientId = (ws as any).clientId;
    const client = this.clients.get(clientId);
    
    if (client) {
      // Leave all rooms
      for (const roomId of client.rooms) {
        this.leaveRoom(clientId, roomId, false);
      }
      
      this.clients.delete(clientId);
      
      logger.info('Client disconnected', { 
        clientId, 
        userId: client.userId,
        totalClients: this.clients.size 
      });
    }
  }

  /**
   * Handle WebSocket errors
   */
  private handleError(ws: any, error: any): void {
    const clientId = (ws as any).clientId;
    logger.error('WebSocket error', { clientId, error: String(error) });
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(ws: any, message: any): Promise<void> {
    const clientId = (ws as any).clientId;
    const client = this.clients.get(clientId);
    
    if (!client) {
      logger.warn('Message from unknown client', { clientId });
      return;
    }

    client.lastActivity = new Date();

    try {
      const messageData = typeof message === 'string' 
        ? JSON.parse(message) 
        : JSON.parse(message.toString());

      // Validate base message structure
      const validation = await validationService.validate('wsMessage', messageData);
      if (!validation.success) {
        await this.sendToClient(clientId, {
          id: stringUtils.random(8),
          type: 'validation_error',
          data: { errors: validation.errors },
          timestamp: new Date(),
        });
        return;
      }

      const wsMessage: WebSocketMessage = {
        ...messageData,
        timestamp: new Date(),
        userId: client.userId,
      };

      // Find message handler
      const handler = this.messageHandlers.get(wsMessage.type);
      if (!handler) {
        await this.sendToClient(clientId, {
          id: stringUtils.random(8),
          type: 'unknown_message_type',
          data: { type: wsMessage.type },
          timestamp: new Date(),
        });
        return;
      }

      // Check authentication requirement
      if (handler.authenticate && !client.authenticated) {
        await this.sendToClient(clientId, {
          id: stringUtils.random(8),
          type: 'auth_required',
          data: { messageType: wsMessage.type },
          timestamp: new Date(),
        });
        return;
      }

      // Check rate limiting
      if (handler.rateLimit && !this.checkRateLimit(clientId, handler.rateLimit)) {
        await this.sendToClient(clientId, {
          id: stringUtils.random(8),
          type: 'rate_limit_exceeded',
          data: { messageType: wsMessage.type },
          timestamp: new Date(),
        });
        return;
      }

      // Validate message data with handler schema
      if (handler.schema) {
        const dataValidation = await handler.schema.parseAsync(wsMessage.data);
        wsMessage.data = dataValidation;
      }

      // Call handler
      await handler.handler(client, wsMessage);

    } catch (error) {
      logger.error('Error handling message', { clientId, error });
      
      await this.sendToClient(clientId, {
        id: stringUtils.random(8),
        type: 'message_error',
        data: { error: String(error) },
        timestamp: new Date(),
      });
    }
  }

  /**
   * Register message handler
   */
  registerHandler(handler: MessageHandler): void {
    this.messageHandlers.set(handler.type, handler);
    logger.debug('Message handler registered', { type: handler.type });
  }

  /**
   * Send message to specific client
   */
  async sendToClient(clientId: string, message: WebSocketMessage): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== 1) { // OPEN
      return false;
    }

    try {
      client.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send message to client', { clientId, error });
      return false;
    }
  }

  /**
   * Broadcast message to room
   */
  async broadcastToRoom(
    roomId: string, 
    message: WebSocketMessage, 
    excludeClientId?: string
  ): Promise<number> {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    let sentCount = 0;

    for (const clientId of room.clients) {
      if (clientId !== excludeClientId) {
        const success = await this.sendToClient(clientId, message);
        if (success) sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Broadcast to all authenticated clients
   */
  async broadcastToAll(message: WebSocketMessage, excludeClientId?: string): Promise<number> {
    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      if (clientId !== excludeClientId && client.authenticated) {
        const success = await this.sendToClient(clientId, message);
        if (success) sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Create or get room
   */
  createRoom(roomId: string, name: string, persistent = false): WebSocketRoom {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }

    const room: WebSocketRoom = {
      id: roomId,
      name,
      clients: new Set(),
      metadata: {},
      created: new Date(),
      persistent,
    };

    this.rooms.set(roomId, room);
    logger.info('Room created', { roomId, name, persistent });
    
    return room;
  }

  /**
   * Join room
   */
  async joinRoom(clientId: string, roomId: string, password?: string): Promise<WebSocketRoom> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error('Client not found');
    }

    // Create room if it doesn't exist
    let room = this.rooms.get(roomId);
    if (!room) {
      room = this.createRoom(roomId, roomId, false);
    }

    // Add client to room
    room.clients.add(clientId);
    client.rooms.add(roomId);

    return room;
  }

  /**
   * Leave room
   */
  async leaveRoom(clientId: string, roomId: string, notify = true): Promise<void> {
    const client = this.clients.get(clientId);
    const room = this.rooms.get(roomId);

    if (client && room) {
      room.clients.delete(clientId);
      client.rooms.delete(roomId);

      if (notify) {
        // Notify other clients
        await this.broadcastToRoom(roomId, {
          id: stringUtils.random(8),
          type: 'user_left',
          data: { 
            userId: client.userId,
            clientId 
          },
          timestamp: new Date(),
        }, clientId);
      }

      // Remove empty non-persistent rooms
      if (room.clients.size === 0 && !room.persistent) {
        this.rooms.delete(roomId);
        logger.debug('Empty room removed', { roomId });
      }
    }
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(clientId: string, rateLimit: { max: number; windowMs: number }): boolean {
    const key = `${clientId}:rateLimit`;
    const now = Date.now();
    const limit = this.rateLimits.get(key);

    if (!limit || now > limit.resetTime) {
      this.rateLimits.set(key, { count: 1, resetTime: now + rateLimit.windowMs });
      return true;
    }

    if (limit.count >= rateLimit.max) {
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * Validate authentication token (simplified)
   */
  private validateAuthToken(token: string, userId: string): boolean {
    // Simplified validation - in real app would verify JWT
    return token.length >= 10 && userId.length >= 1;
  }

  /**
   * Cleanup inactive clients and empty rooms
   */
  private cleanup(): void {
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    // Remove inactive clients
    for (const [clientId, client] of this.clients) {
      if (now.getTime() - client.lastActivity.getTime() > inactiveThreshold) {
        if (client.socket.readyState === 1) { // Still open
          client.socket.close();
        }
        this.clients.delete(clientId);
        logger.debug('Inactive client removed', { clientId });
      }
    }

    // Clean up rate limits
    for (const [key, limit] of this.rateLimits) {
      if (now.getTime() > limit.resetTime) {
        this.rateLimits.delete(key);
      }
    }

    logger.debug('Cleanup completed', { 
      activeClients: this.clients.size,
      activeRooms: this.rooms.size 
    });
  }

  /**
   * Get server statistics
   */
  getStats(): {
    clients: number;
    authenticatedClients: number;
    rooms: number;
    messages: number;
  } {
    const authenticatedClients = Array.from(this.clients.values())
      .filter(client => client.authenticated).length;

    return {
      clients: this.clients.size,
      authenticatedClients,
      rooms: this.rooms.size,
      messages: this.messageHandlers.size,
    };
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.server) {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.close();
      }

      this.clients.clear();
      this.rooms.clear();
      this.rateLimits.clear();

      logger.info('WebSocket server stopped');
    }
  }
}

// Export singleton instance
export const webSocketServer = new UnJSWebSocketServer();

// Export types
export type { WebSocketMessage, WebSocketClient, WebSocketRoom, MessageHandler };