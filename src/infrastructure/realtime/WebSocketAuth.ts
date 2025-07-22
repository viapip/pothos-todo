import { verifySessionToken } from '@/lib/auth/lucia';
import { logger } from '@/logger';
import type { IncomingMessage } from 'http';
import type { User } from '@prisma/client';

export interface WebSocketContext {
  user: User | null;
  sessionId: string | null;
  connectionId: string;
}

export async function authenticateWebSocket(
  request: IncomingMessage
): Promise<WebSocketContext | null> {
  try {
    // Extract session token from cookies or authorization header
    const cookies = parseCookies(request.headers.cookie || '');
    const sessionToken = cookies['auth-session'] || extractBearerToken(request.headers.authorization);
    
    if (!sessionToken) {
      logger.warn('WebSocket connection attempt without session token');
      return null;
    }
    
    // Verify the session token
    const sessionData = await verifySessionToken(sessionToken);
    if (!sessionData) {
      logger.warn('Invalid session token for WebSocket connection');
      return null;
    }
    const { user, session } = sessionData;
    
    if (!user || !session) {
      logger.warn('Invalid session token for WebSocket connection');
      return null;
    }
    
    const connectionId = generateConnectionId();
    
    logger.info('WebSocket authenticated', {
      userId: user.id,
      sessionId: session.id,
      connectionId
    });
    
    return {
      user,
      sessionId: session.id,
      connectionId
    };
  } catch (error) {
    logger.error('WebSocket authentication error', { error });
    return null;
  }
}

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

function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function generateConnectionId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}