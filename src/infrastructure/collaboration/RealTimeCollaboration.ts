import { logger } from '@/logger.js';
import { MetricsCollector } from '../monitoring/MetricsCollector.js';
import { hash } from 'ohash';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';

export interface CollaborationSession {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  avatar?: string;
  joinedAt: Date;
  lastActivity: Date;
  cursor?: {
    x: number;
    y: number;
    element?: string;
  };
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  status: 'active' | 'idle' | 'away' | 'disconnected';
}

export interface CollaborationEvent {
  type: 'user_joined' | 'user_left' | 'cursor_moved' | 'selection_changed' | 'content_changed' | 'comment_added' | 'presence_updated';
  sessionId: string;
  userId: string;
  roomId: string;
  timestamp: Date;
  data: any;
}

export interface OperationalTransform {
  id: string;
  type: 'insert' | 'delete' | 'retain' | 'format';
  position: number;
  content?: string;
  length?: number;
  attributes?: Record<string, any>;
  userId: string;
  timestamp: Date;
  version: number;
}

export interface CollaborationRoom {
  id: string;
  name: string;
  type: 'todo' | 'document' | 'canvas' | 'code';
  ownerId: string;
  participants: Map<string, CollaborationSession>;
  document: {
    content: string;
    version: number;
    lastModified: Date;
    operations: OperationalTransform[];
  };
  permissions: {
    canEdit: string[];
    canView: string[];
    canComment: string[];
  };
  settings: {
    maxParticipants: number;
    allowAnonymous: boolean;
    autoSave: boolean;
    conflictResolution: 'operational_transform' | 'last_write_wins' | 'manual';
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  content: string;
  position: {
    line?: number;
    column?: number;
    elementId?: string;
  };
  replies: Comment[];
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class RealTimeCollaboration {
  private static instance: RealTimeCollaboration;
  private rooms = new Map<string, CollaborationRoom>();
  private sessions = new Map<string, CollaborationSession>();
  private websockets = new Map<string, WebSocket>();
  private comments = new Map<string, Comment[]>(); // roomId -> comments
  private metrics: MetricsCollector;
  private presenceInterval?: NodeJS.Timeout;

  private constructor() {
    this.metrics = MetricsCollector.getInstance();
    this.startPresenceTracking();
  }

  public static getInstance(): RealTimeCollaboration {
    if (!RealTimeCollaboration.instance) {
      RealTimeCollaboration.instance = new RealTimeCollaboration();
    }
    return RealTimeCollaboration.instance;
  }

  /**
   * Create a new collaboration room
   */
  public async createRoom(
    name: string,
    type: CollaborationRoom['type'],
    ownerId: string,
    settings?: Partial<CollaborationRoom['settings']>
  ): Promise<CollaborationRoom> {
    const roomId = hash({ name, ownerId, timestamp: Date.now() });

    const room: CollaborationRoom = {
      id: roomId,
      name,
      type,
      ownerId,
      participants: new Map(),
      document: {
        content: '',
        version: 0,
        lastModified: new Date(),
        operations: [],
      },
      permissions: {
        canEdit: [ownerId],
        canView: [ownerId],
        canComment: [ownerId],
      },
      settings: {
        maxParticipants: 50,
        allowAnonymous: false,
        autoSave: true,
        conflictResolution: 'operational_transform',
        ...settings,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rooms.set(roomId, room);
    this.comments.set(roomId, []);

    logger.info('Collaboration room created', {
      roomId,
      name,
      type,
      ownerId,
    });

    this.metrics.recordMetric('collaboration.room.created', 1, {
      type,
      ownerId,
    });

    return room;
  }

  /**
   * Join a collaboration room
   */
  public async joinRoom(
    roomId: string,
    userId: string,
    userName: string,
    websocket: WebSocket,
    avatar?: string
  ): Promise<CollaborationSession> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Check permissions
    if (!this.hasPermission(room, userId, 'canView')) {
      throw new Error('Insufficient permissions to join room');
    }

    // Check room capacity
    if (room.participants.size >= room.settings.maxParticipants) {
      throw new Error('Room is at maximum capacity');
    }

    const sessionId = hash({ roomId, userId, timestamp: Date.now() });

    const session: CollaborationSession = {
      id: sessionId,
      roomId,
      userId,
      userName,
      avatar,
      joinedAt: new Date(),
      lastActivity: new Date(),
      status: 'active',
    };

    // Add to room participants
    room.participants.set(sessionId, session);
    this.sessions.set(sessionId, session);
    this.websockets.set(sessionId, websocket);

    // Setup WebSocket handlers
    this.setupWebSocketHandlers(sessionId, websocket);

    // Broadcast user joined event
    await this.broadcastEvent(roomId, {
      type: 'user_joined',
      sessionId,
      userId,
      roomId,
      timestamp: new Date(),
      data: {
        userName,
        avatar,
      },
    });

    // Send current state to new participant
    await this.sendCurrentState(sessionId);

    logger.info('User joined collaboration room', {
      roomId,
      userId,
      userName,
      sessionId,
    });

    this.metrics.recordMetric('collaboration.user.joined', 1, {
      roomId,
      userId,
    });

    return session;
  }

  /**
   * Leave a collaboration room
   */
  public async leaveRoom(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const room = this.rooms.get(session.roomId);
    if (room) {
      room.participants.delete(sessionId);
    }

    this.sessions.delete(sessionId);
    this.websockets.delete(sessionId);

    // Broadcast user left event
    if (room) {
      await this.broadcastEvent(session.roomId, {
        type: 'user_left',
        sessionId,
        userId: session.userId,
        roomId: session.roomId,
        timestamp: new Date(),
        data: {
          userName: session.userName,
        },
      });
    }

    logger.info('User left collaboration room', {
      roomId: session.roomId,
      userId: session.userId,
      sessionId,
    });

    this.metrics.recordMetric('collaboration.user.left', 1, {
      roomId: session.roomId,
      userId: session.userId,
    });
  }

  /**
   * Apply operational transform
   */
  public async applyOperation(
    sessionId: string,
    operation: Omit<OperationalTransform, 'id' | 'timestamp' | 'version'>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const room = this.rooms.get(session.roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // Check edit permissions
    if (!this.hasPermission(room, session.userId, 'canEdit')) {
      throw new Error('Insufficient permissions to edit');
    }

    // Create full operation
    const fullOperation: OperationalTransform = {
      id: hash({ ...operation, sessionId, timestamp: Date.now() }),
      timestamp: new Date(),
      version: room.document.version + 1,
      ...operation,
    };

    // Apply operational transform
    const transformedOperation = await this.transformOperation(room, fullOperation);
    
    // Update document
    room.document = await this.applyOperationToDocument(room.document, transformedOperation);
    room.document.operations.push(transformedOperation);
    room.updatedAt = new Date();

    // Keep only last 1000 operations
    if (room.document.operations.length > 1000) {
      room.document.operations = room.document.operations.slice(-1000);
    }

    // Broadcast operation to other participants
    await this.broadcastEvent(session.roomId, {
      type: 'content_changed',
      sessionId,
      userId: session.userId,
      roomId: session.roomId,
      timestamp: new Date(),
      data: {
        operation: transformedOperation,
        documentVersion: room.document.version,
      },
    }, [sessionId]); // Exclude sender

    logger.debug('Operation applied', {
      roomId: session.roomId,
      operationType: operation.type,
      version: room.document.version,
    });

    this.metrics.recordMetric('collaboration.operation.applied', 1, {
      roomId: session.roomId,
      operationType: operation.type,
    });
  }

  /**
   * Update user cursor position
   */
  public async updateCursor(
    sessionId: string,
    cursor: CollaborationSession['cursor']
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.cursor = cursor;
    session.lastActivity = new Date();

    // Broadcast cursor update
    await this.broadcastEvent(session.roomId, {
      type: 'cursor_moved',
      sessionId,
      userId: session.userId,
      roomId: session.roomId,
      timestamp: new Date(),
      data: {
        cursor,
        userName: session.userName,
      },
    }, [sessionId]); // Exclude sender
  }

  /**
   * Update user selection
   */
  public async updateSelection(
    sessionId: string,
    selection: CollaborationSession['selection']
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.selection = selection;
    session.lastActivity = new Date();

    // Broadcast selection update
    await this.broadcastEvent(session.roomId, {
      type: 'selection_changed',
      sessionId,
      userId: session.userId,
      roomId: session.roomId,
      timestamp: new Date(),
      data: {
        selection,
        userName: session.userName,
      },
    }, [sessionId]); // Exclude sender
  }

  /**
   * Add a comment
   */
  public async addComment(
    sessionId: string,
    content: string,
    position: Comment['position'],
    parentId?: string
  ): Promise<Comment> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const room = this.rooms.get(session.roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // Check comment permissions
    if (!this.hasPermission(room, session.userId, 'canComment')) {
      throw new Error('Insufficient permissions to comment');
    }

    const commentId = hash({ 
      sessionId, 
      content, 
      position, 
      timestamp: Date.now() 
    });

    const comment: Comment = {
      id: commentId,
      roomId: session.roomId,
      userId: session.userId,
      userName: session.userName,
      content,
      position,
      replies: [],
      resolved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add to comments
    const roomComments = this.comments.get(session.roomId) || [];
    
    if (parentId) {
      // Add as reply
      const parentComment = this.findComment(roomComments, parentId);
      if (parentComment) {
        parentComment.replies.push(comment);
      }
    } else {
      // Add as top-level comment
      roomComments.push(comment);
    }
    
    this.comments.set(session.roomId, roomComments);

    // Broadcast comment added
    await this.broadcastEvent(session.roomId, {
      type: 'comment_added',
      sessionId,
      userId: session.userId,
      roomId: session.roomId,
      timestamp: new Date(),
      data: {
        comment,
        parentId,
      },
    });

    logger.info('Comment added', {
      roomId: session.roomId,
      commentId,
      userId: session.userId,
    });

    this.metrics.recordMetric('collaboration.comment.added', 1, {
      roomId: session.roomId,
      hasParent: !!parentId,
    });

    return comment;
  }

  /**
   * Get room information
   */
  public getRoom(roomId: string): CollaborationRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get room comments
   */
  public getRoomComments(roomId: string): Comment[] {
    return this.comments.get(roomId) || [];
  }

  /**
   * Get collaboration analytics
   */
  public async getCollaborationAnalytics(): Promise<{
    totalRooms: number;
    activeRooms: number;
    totalUsers: number;
    activeUsers: number;
    totalComments: number;
    operationsPerSecond: number;
    averageRoomSize: number;
  }> {
    const totalRooms = this.rooms.size;
    const activeRooms = Array.from(this.rooms.values())
      .filter(room => room.participants.size > 0).length;
    
    const totalUsers = this.sessions.size;
    const activeUsers = Array.from(this.sessions.values())
      .filter(session => session.status === 'active').length;
    
    const totalComments = Array.from(this.comments.values())
      .reduce((sum, comments) => sum + comments.length, 0);
    
    const operationsPerSecond = await this.metrics.getMetric('collaboration.operation.applied') || 0;
    
    const averageRoomSize = totalRooms > 0 ? 
      Array.from(this.rooms.values())
        .reduce((sum, room) => sum + room.participants.size, 0) / totalRooms : 0;

    return {
      totalRooms,
      activeRooms,
      totalUsers,
      activeUsers,
      totalComments,
      operationsPerSecond,
      averageRoomSize,
    };
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(sessionId: string, websocket: WebSocket): void {
    websocket.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleWebSocketMessage(sessionId, message);
      } catch (error) {
        logger.error('WebSocket message handling failed', error as Error, {
          sessionId,
        });
      }
    });

    websocket.on('close', async () => {
      await this.leaveRoom(sessionId);
    });

    websocket.on('error', (error) => {
      logger.error('WebSocket error', error, { sessionId });
    });
  }

  /**
   * Handle WebSocket message
   */
  private async handleWebSocketMessage(sessionId: string, message: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivity = new Date();

    switch (message.type) {
      case 'operation':
        await this.applyOperation(sessionId, message.data);
        break;
        
      case 'cursor':
        await this.updateCursor(sessionId, message.data);
        break;
        
      case 'selection':
        await this.updateSelection(sessionId, message.data);
        break;
        
      case 'comment':
        await this.addComment(
          sessionId, 
          message.data.content, 
          message.data.position,
          message.data.parentId
        );
        break;
        
      case 'presence':
        session.status = message.data.status || 'active';
        await this.broadcastEvent(session.roomId, {
          type: 'presence_updated',
          sessionId,
          userId: session.userId,
          roomId: session.roomId,
          timestamp: new Date(),
          data: {
            status: session.status,
            userName: session.userName,
          },
        }, [sessionId]);
        break;
        
      default:
        logger.warn('Unknown WebSocket message type', {
          type: message.type,
          sessionId,
        });
    }
  }

  /**
   * Broadcast event to room participants
   */
  private async broadcastEvent(
    roomId: string,
    event: CollaborationEvent,
    excludeSessions: string[] = []
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const message = JSON.stringify(event);

    for (const [sessionId, session] of room.participants.entries()) {
      if (excludeSessions.includes(sessionId)) continue;

      const websocket = this.websockets.get(sessionId);
      if (websocket && websocket.readyState === websocket.OPEN) {
        try {
          websocket.send(message);
        } catch (error) {
          logger.error('Failed to send WebSocket message', error as Error, {
            sessionId,
            roomId,
          });
        }
      }
    }
  }

  /**
   * Send current room state to a participant
   */
  private async sendCurrentState(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const room = this.rooms.get(session.roomId);
    if (!room) return;

    const websocket = this.websockets.get(sessionId);
    if (!websocket || websocket.readyState !== websocket.OPEN) return;

    // Send current participants
    const participants = Array.from(room.participants.values())
      .filter(p => p.id !== sessionId)
      .map(p => ({
        id: p.id,
        userId: p.userId,
        userName: p.userName,
        avatar: p.avatar,
        status: p.status,
        cursor: p.cursor,
        selection: p.selection,
      }));

    // Send current document state
    const currentState = {
      type: 'initial_state',
      data: {
        document: {
          content: room.document.content,
          version: room.document.version,
        },
        participants,
        comments: this.comments.get(session.roomId) || [],
      },
    };

    try {
      websocket.send(JSON.stringify(currentState));
    } catch (error) {
      logger.error('Failed to send current state', error as Error, {
        sessionId,
      });
    }
  }

  /**
   * Transform operation based on concurrent operations
   */
  private async transformOperation(
    room: CollaborationRoom,
    operation: OperationalTransform
  ): Promise<OperationalTransform> {
    if (room.settings.conflictResolution !== 'operational_transform') {
      return operation;
    }

    // Find concurrent operations
    const concurrentOps = room.document.operations.filter(
      op => op.version >= operation.version && op.userId !== operation.userId
    );

    if (concurrentOps.length === 0) {
      return operation;
    }

    // Apply operational transform algorithm
    let transformedOp = { ...operation };

    for (const concurrentOp of concurrentOps) {
      transformedOp = this.transformOperationPair(transformedOp, concurrentOp);
    }

    return transformedOp;
  }

  /**
   * Transform two operations against each other
   */
  private transformOperationPair(
    op1: OperationalTransform,
    op2: OperationalTransform
  ): OperationalTransform {
    // Simplified operational transform - in production, use a proper OT library
    if (op1.type === 'insert' && op2.type === 'insert') {
      if (op1.position <= op2.position) {
        return op1;
      } else {
        return {
          ...op1,
          position: op1.position + (op2.content?.length || 0),
        };
      }
    }

    if (op1.type === 'delete' && op2.type === 'insert') {
      if (op1.position < op2.position) {
        return op1;
      } else {
        return {
          ...op1,
          position: op1.position + (op2.content?.length || 0),
        };
      }
    }

    // Add more transformation rules as needed
    return op1;
  }

  /**
   * Apply operation to document
   */
  private async applyOperationToDocument(
    document: CollaborationRoom['document'],
    operation: OperationalTransform
  ): Promise<CollaborationRoom['document']> {
    let content = document.content;

    switch (operation.type) {
      case 'insert':
        if (operation.content) {
          content = content.slice(0, operation.position) + 
                   operation.content + 
                   content.slice(operation.position);
        }
        break;

      case 'delete':
        if (operation.length) {
          content = content.slice(0, operation.position) + 
                   content.slice(operation.position + operation.length);
        }
        break;

      case 'retain':
        // No change to content for retain operations
        break;
    }

    return {
      ...document,
      content,
      version: operation.version,
      lastModified: new Date(),
    };
  }

  /**
   * Check if user has permission
   */
  private hasPermission(
    room: CollaborationRoom,
    userId: string,
    permission: keyof CollaborationRoom['permissions']
  ): boolean {
    return room.permissions[permission].includes(userId) || 
           room.ownerId === userId;
  }

  /**
   * Find comment by ID
   */
  private findComment(comments: Comment[], commentId: string): Comment | undefined {
    for (const comment of comments) {
      if (comment.id === commentId) {
        return comment;
      }
      
      const found = this.findComment(comment.replies, commentId);
      if (found) return found;
    }
    
    return undefined;
  }

  /**
   * Start presence tracking
   */
  private startPresenceTracking(): void {
    this.presenceInterval = setInterval(() => {
      const now = Date.now();
      const idleThreshold = 5 * 60 * 1000; // 5 minutes
      const awayThreshold = 15 * 60 * 1000; // 15 minutes

      for (const [sessionId, session] of this.sessions.entries()) {
        const lastActivity = session.lastActivity.getTime();
        const timeSinceActivity = now - lastActivity;

        let newStatus: CollaborationSession['status'] = 'active';
        
        if (timeSinceActivity > awayThreshold) {
          newStatus = 'away';
        } else if (timeSinceActivity > idleThreshold) {
          newStatus = 'idle';
        }

        if (newStatus !== session.status) {
          session.status = newStatus;
          
          // Broadcast presence update
          this.broadcastEvent(session.roomId, {
            type: 'presence_updated',
            sessionId,
            userId: session.userId,
            roomId: session.roomId,
            timestamp: new Date(),
            data: {
              status: newStatus,
              userName: session.userName,
            },
          }, [sessionId]);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Shutdown collaboration system
   */
  public shutdown(): void {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = undefined;
    }

    // Close all WebSocket connections
    for (const websocket of this.websockets.values()) {
      if (websocket.readyState === websocket.OPEN) {
        websocket.close();
      }
    }

    this.rooms.clear();
    this.sessions.clear();
    this.websockets.clear();
    this.comments.clear();

    logger.info('Real-time collaboration shutdown completed');
  }
}

/**
 * WebSocket handler for collaboration
 */
export function handleCollaborationWebSocket(
  websocket: WebSocket,
  request: IncomingMessage
) {
  const collaboration = RealTimeCollaboration.getInstance();
  const url = new URL(request.url!, `http://${request.headers.host}`);
  
  const roomId = url.searchParams.get('roomId');
  const userId = url.searchParams.get('userId');
  const userName = url.searchParams.get('userName');
  const avatar = url.searchParams.get('avatar') || undefined;

  if (!roomId || !userId || !userName) {
    websocket.close(1008, 'Missing required parameters');
    return;
  }

  // Join room
  collaboration.joinRoom(roomId, userId, userName, websocket, avatar)
    .catch(error => {
      logger.error('Failed to join collaboration room', error, {
        roomId,
        userId,
      });
      websocket.close(1011, 'Failed to join room');
    });
}