import { defineWebSocketHandler } from 'h3';
import type { Peer, Message } from 'crossws';
import { logger } from '../logger.js';
import { verifySessionToken } from '../lib/auth/lucia.js';
import { PubSubManager } from '../infrastructure/realtime/PubSubManager.js';
import { Container } from '../infrastructure/container/Container.js';

interface AuthenticatedPeer extends Peer {
  userId?: string;
  sessionId?: string;
  user?: any;
}

const pubsubManager = PubSubManager.getInstance();
const container = Container.getInstance();
const activePeers = new Map<string, AuthenticatedPeer>();

export const websocketHandler = defineWebSocketHandler({
  async upgrade(request) {
    // Extract session token from cookies
    const cookies = parseCookies(request.headers.get('cookie') || '');
    const sessionToken = cookies['auth-session'];
    
    if (!sessionToken) {
      logger.warn('WebSocket upgrade attempt without session token');
      return { status: 401, statusText: 'Unauthorized' };
    }
    
    try {
      // Verify the session token
      const sessionData = await verifySessionToken(sessionToken);
      if (!sessionData) {
        logger.warn('Invalid session token for WebSocket upgrade');
        return { status: 401, statusText: 'Unauthorized' };
      }
      const { user, session } = sessionData;
      
      if (!user || !session) {
        logger.warn('Invalid session token for WebSocket upgrade');
        return { status: 401, statusText: 'Unauthorized' };
      }
      
      // Add user info to request headers for later access
      request.headers.set('x-user-id', user.id);
      request.headers.set('x-session-id', session.id);
      
      logger.info('WebSocket upgrade authenticated', {
        userId: user.id,
        sessionId: session.id,
      });
      
      return; // Allow upgrade
    } catch (error) {
      logger.error('WebSocket authentication error', { error });
      return { status: 401, statusText: 'Authentication failed' };
    }
  },

  async open(peer: AuthenticatedPeer) {
    // Get user info from headers set during upgrade
    const userId = peer.request?.headers.get('x-user-id');
    const sessionId = peer.request?.headers.get('x-session-id');
    
    if (!userId || !sessionId) {
      peer.close(1008, 'Authentication required');
      return;
    }
    
    // Store authenticated info on peer
    peer.userId = userId;
    peer.sessionId = sessionId;
    
    // Track the peer
    activePeers.set(peer.id, peer);
    pubsubManager.addUserConnection(userId, peer.id);
    
    // Get user details and publish online event
    const user = await container.prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (user) {
      peer.user = user;
      await pubsubManager.publishUserOnline(userId, user);
    }
    
    logger.info('WebSocket connection opened', {
      peerId: peer.id,
      userId,
      sessionId,
    });
    
    // Send welcome message
    peer.send(JSON.stringify({
      type: 'welcome',
      connectionId: peer.id,
      userId,
    }));
  },

  async message(peer: AuthenticatedPeer, message: Message) {
    if (!peer.userId) {
      peer.close(1008, 'Authentication required');
      return;
    }
    
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      // Handle different message types
      switch (data.type) {
        case 'ping':
          peer.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
          
        case 'subscribe':
          // Handle subscription to specific channels
          if (data.channel) {
            peer.subscribe(data.channel);
            logger.info('Peer subscribed to channel', {
              peerId: peer.id,
              channel: data.channel,
            });
          }
          break;
          
        case 'unsubscribe':
          // Handle unsubscription from channels
          if (data.channel) {
            peer.unsubscribe(data.channel);
            logger.info('Peer unsubscribed from channel', {
              peerId: peer.id,
              channel: data.channel,
            });
          }
          break;
          
        case 'typing':
          // Handle typing indicators
          if (data.listId) {
            await pubsubManager.publishUserTyping(peer.userId, data.listId, data.todoId);
          }
          break;
          
        case 'activity':
          // Handle user activity updates
          if (data.activity) {
            await pubsubManager.publishUserActivity(peer.userId, data.activity, data.metadata);
          }
          break;
          
        default:
          logger.warn('Unknown message type', { type: data.type, peerId: peer.id });
      }
    } catch (error) {
      logger.error('Error processing WebSocket message', {
        error,
        peerId: peer.id,
        message,
      });
    }
  },

  async close(peer: AuthenticatedPeer, details) {
    logger.info('WebSocket connection closed', {
      peerId: peer.id,
      userId: peer.userId,
      code: details.code,
      reason: details.reason,
    });
    
    // Clean up
    activePeers.delete(peer.id);
    
    if (peer.userId) {
      pubsubManager.removeUserConnection(peer.userId, peer.id);
      
      // If user has no more connections, publish offline event
      if (pubsubManager.getUserConnectionCount(peer.userId) === 0) {
        await pubsubManager.publishUserOffline(peer.userId);
      }
    }
  },

  error(peer: AuthenticatedPeer, error) {
    logger.error('WebSocket error', {
      peerId: peer.id,
      userId: peer.userId,
      error,
    });
  },
});

// Helper function to parse cookies
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  
  return cookies;
}

// Export function to broadcast to all connected peers
export function broadcastToChannel(channel: string, message: any) {
  const messageStr = JSON.stringify(message);
  
  activePeers.forEach(peer => {
    // Check if peer is subscribed to this channel
    try {
      peer.publish(channel, messageStr);
    } catch (error) {
      logger.error('Error broadcasting to channel', { channel, peerId: peer.id, error });
    }
  });
}

// Export function to send message to specific user
export function sendToUser(userId: string, message: any) {
  const messageStr = JSON.stringify(message);
  
  activePeers.forEach(peer => {
    if (peer.userId === userId) {
      peer.send(messageStr);
    }
  });
}