import prisma from "@/lib/prisma";
import type { User, Session } from "@prisma/client";
import {
  setCookie,
  deleteCookie,
  getCookie,
  useSession,
  type H3Event,
} from "h3";
import { isProduction, getSessionConfig } from "@/config/index.js";
import { getUserById } from "./user.js";
import { getRedisCache } from "../cache/redis.js";

export interface SessionWithUser {
  session: Session;
  user: User;
}

// H3 session data structure
export interface H3SessionData {
  userId: string;
  loginTime: number;
  lastActivity: number;
}

// Custom error classes for H3 sessions
export class H3SessionError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "H3SessionError";
  }
}

export class H3SessionConfigError extends H3SessionError {
  constructor(message: string) {
    super(message, "H3_SESSION_CONFIG_ERROR");
  }
}

export class H3SessionDataError extends H3SessionError {
  constructor(message: string) {
    super(message, "H3_SESSION_DATA_ERROR");
  }
}

// Cached session configuration to avoid repeated parsing
let sessionConfigCache: any = null;

/**
 * Validate session security configuration
 */
function validateSessionSecurity(config: any): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let valid = true;

  // Check if running in production with insecure settings
  if (isProduction()) {
    if (!config.secure) {
      warnings.push("Session cookies should use secure flag in production");
      valid = false;
    }
    if (config.sameSite !== "strict" && config.sameSite !== "lax") {
      warnings.push("Session cookies should use strict or lax sameSite policy");
    }
  }

  // Check session duration
  const maxAgeHours = config.maxAge / 3600;
  if (maxAgeHours > 24) {
    warnings.push(
      `Session duration (${maxAgeHours}h) is longer than 24 hours, consider shorter duration for better security`
    );
  }

  // Check secret strength
  if (config.secret === "fallback-key") {
    warnings.push(
      "Using fallback session secret - set SESSION_SECRET environment variable"
    );
    valid = false;
  }

  if (config.secret.length < 64) {
    warnings.push(
      "Session secret should be at least 64 characters long for optimal security"
    );
  }

  return { valid, warnings };
}

/**
 * Get cached H3 session configuration with enhanced security
 */
function getH3SessionConfig() {
  if (!sessionConfigCache) {
    try {
      const config = getSessionConfig();

      // Validate required configuration
      if (!config.secret) {
        throw new H3SessionConfigError("Session secret is required");
      }
      if (config.secret === "fallback-key") {
        console.error(
          "WARNING: Using fallback session secret. Set SESSION_SECRET environment variable in production!"
        );
      }
      if (config.secret.length < 32) {
        throw new H3SessionConfigError(
          "Session secret must be at least 32 characters long"
        );
      }
      if (!config.name) {
        throw new H3SessionConfigError("Session name is required");
      }
      if (!config.maxAge || config.maxAge <= 0) {
        throw new H3SessionConfigError("Valid session maxAge is required");
      }

      // Validate security configuration
      const securityValidation = validateSessionSecurity(config);
      if (securityValidation.warnings.length > 0) {
        securityValidation.warnings.forEach((warning) => {
          console.warn(`[H3 Session Security]:`, warning);
        });
      }
      if (!securityValidation.valid && isProduction()) {
        throw new H3SessionConfigError(
          "Session configuration does not meet security requirements for production"
        );
      }

      // Enhanced security settings
      sessionConfigCache = {
        password: config.secret,
        name: config.name,
        maxAge: config.maxAge,
        cookie: {
          httpOnly: true,
          secure: config.secure,
          sameSite: config.sameSite,
          // Additional security headers
          priority: "high",
          // Prevent client-side access to session cookie
          partitioned: true,
        },
      };
    } catch (error) {
      if (error instanceof H3SessionError) {
        throw error;
      }
      console.error("Error loading session config:", error);
      throw new H3SessionConfigError("Failed to load session configuration");
    }
  }
  return sessionConfigCache;
}

/**
 * Get or create H3 session with caching
 * Ensures only one session instance per request
 */
export async function getOrCreateH3Session(event: H3Event) {
  try {
    // Validate H3 event
    if (!event) {
      throw new H3SessionDataError("H3Event is required");
    }

    // Check if session already exists in context
    if (event.context.h3Session) {
      return event.context.h3Session;
    }

    // Create and cache session in context
    const config = getH3SessionConfig();
    const session = await useSession(event, config);

    if (!session) {
      throw new H3SessionDataError("Failed to create H3 session");
    }

    event.context.h3Session = session;
    return session;
  } catch (error) {
    if (error instanceof H3SessionError) {
      throw error;
    }
    console.error("Error creating H3 session:", error);
    throw new H3SessionDataError("H3 session creation failed");
  }
}

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Generate a cryptographically secure random session token
 */
export function generateSessionToken(): string {
  // Generate 24 bytes = 192 bits of entropy
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  // Convert to base64url for URL-safe token
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Create a new session for a user
 */
export async function createSession(
  token: string,
  userId: string
): Promise<Session> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRES_IN_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      id: token,
      userId,
      expiresAt,
    },
  });

  return session;
}

/**
 * Validate a session token and return session with user data
 * Uses Redis cache for performance with database fallback
 */
export async function validateSessionToken(
  token: string
): Promise<SessionWithUser | null> {
  try {
    // Try Redis cache first
    let cached: SessionWithUser | null = null;
    try {
      const redisCache = await getRedisCache();
      const cacheKey = `session:${token}`;
      cached = await redisCache.get<SessionWithUser>(cacheKey);

      if (cached) {
        // Verify session is not expired
        const sessionExpiresAt = new Date(cached.session.expiresAt);
        if (new Date() < sessionExpiresAt) {
          // Update last activity in background
          updateSessionActivity(token).catch(console.error);
          return cached;
        } else {
          // Remove expired session from cache
          await redisCache.del(cacheKey);
        }
      }
    } catch (redisError) {
      console.warn("Redis session cache error:", redisError);
      // Continue with database lookup
    }

    // Database lookup
    const result = await prisma.session.findUnique({
      where: { id: token },
      include: { user: true },
    });

    if (!result) {
      return null;
    }

    const { user, ...session } = result;

    // Check if session is expired
    if (new Date() >= session.expiresAt) {
      await invalidateSession(session.id);
      return null;
    }

    // Extend session if it expires in less than 15 days
    const fifteenDaysFromNow = new Date().getTime() + 15 * 24 * 60 * 60 * 1000;
    if (session.expiresAt.getTime() < fifteenDaysFromNow) {
      const newExpiresAt = new Date(
        Date.now() + SESSION_EXPIRES_IN_SECONDS * 1000
      );
      await prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: newExpiresAt },
      });
      session.expiresAt = newExpiresAt;
    }

    const sessionWithUser = { session, user };

    // Cache the session for 1 hour
    try {
      const redisCache = await getRedisCache();
      const cacheKey = `session:${token}`;
      await redisCache.set(cacheKey, sessionWithUser, 3600);
    } catch (redisError) {
      console.warn("Failed to cache session in Redis:", redisError);
    }

    return sessionWithUser;
  } catch (error) {
    console.error("Error validating session:", error);
    return null;
  }
}

/**
 * Update session activity timestamp (background operation)
 */
async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        expiresAt: new Date(Date.now() + SESSION_EXPIRES_IN_SECONDS * 1000),
      },
    });
  } catch (error) {
    console.warn("Failed to update session activity:", error);
  }
}

/**
 * Invalidate a specific session
 * Removes from both database and Redis cache
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  try {
    // Remove from database
    await prisma.session.delete({
      where: { id: sessionId },
    });

    // Remove from Redis cache
    try {
      const redisCache = await getRedisCache();
      await redisCache.del(`session:${sessionId}`);
    } catch (redisError) {
      console.warn("Failed to remove session from Redis cache:", redisError);
    }
  } catch (error) {
    // Session might not exist, which is fine
    console.warn("Session deletion failed:", error);
  }
}

/**
 * Invalidate all sessions for a user
 * Removes from both database and Redis cache
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  try {
    // Get all session IDs first for cache cleanup
    const sessions = await prisma.session.findMany({
      where: { userId },
      select: { id: true },
    });

    // Remove from database
    await prisma.session.deleteMany({
      where: { userId },
    });

    // Remove from Redis cache
    try {
      const redisCache = await getRedisCache();
      const cacheKeys = sessions.map((s) => `session:${s.id}`);
      if (cacheKeys.length > 0) {
        await Promise.all(cacheKeys.map((key) => redisCache.del(key)));
      }
    } catch (redisError) {
      console.warn(
        "Failed to remove user sessions from Redis cache:",
        redisError
      );
    }
  } catch (error) {
    console.error("Error invalidating user sessions:", error);
  }
}

/**
 * Set session token cookie using H3
 */
export function setSessionTokenCookie(
  event: H3Event,
  token: string,
  expiresAt: Date
): void {
  setCookie(event, "session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: isProduction(),
  });
}

/**
 * Delete session token cookie using H3
 */
export function deleteSessionTokenCookie(event: H3Event): void {
  deleteCookie(event, "session", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction(),
  });
}

/**
 * Get session token from H3 event cookies
 */
export function getSessionToken(event: H3Event): string | null {
  return getCookie(event, "session") || null;
}

/**
 * Get current session from request (for middleware/context)
 */
export async function getCurrentSession(
  token: string | null
): Promise<SessionWithUser | null> {
  if (!token) return null;

  return validateSessionToken(token);
}

/**
 * Get current session from H3 event (extracts token from cookies)
 */
export async function getCurrentSessionFromEvent(
  event: H3Event
): Promise<SessionWithUser | null> {
  const token = getSessionToken(event);
  return getCurrentSession(token);
}

// ========================================
// H3 Session Management Functions
// ========================================

/**
 * Get current session using H3 useSession
 */
export async function getCurrentSessionFromEventH3(
  event: H3Event
): Promise<SessionWithUser | null> {
  try {
    const session = await getOrCreateH3Session(event);

    // Check if user is logged in
    if (!session.data?.userId) {
      return null;
    }

    // Validate session data structure
    if (typeof session.data.userId !== "string") {
      console.error("Invalid session data structure:", session.data);
      await session.clear();
      return null;
    }

    // Get user from database using userId from session
    const user = await getUserById(session.data.userId);
    if (!user) {
      // Clear invalid session - user no longer exists
      console.warn(
        `Session user ${session.data.userId} not found, clearing session`
      );
      await session.clear();
      return null;
    }

    // Update last activity
    await session.update({
      ...session.data,
      lastActivity: Date.now(),
    } as H3SessionData);

    // Return compatible format for GraphQL context
    const sessionConfig = getSessionConfig();
    return {
      session: {
        id: sessionConfig.name,
        userId: user.id,
        expiresAt: new Date(Date.now() + sessionConfig.maxAge * 1000),
      } as Session,
      user,
    };
  } catch (error) {
    if (error instanceof H3SessionError) {
      console.error(`H3 Session Error (${error.code}):`, error.message);
    } else {
      console.error("Error getting H3 session:", error);
    }
    return null;
  }
}

/**
 * Create a new H3 session for a user
 */
export async function createH3Session(
  event: H3Event,
  userId: string
): Promise<SessionWithUser | null> {
  try {
    // Validate input parameters
    if (!userId || typeof userId !== "string") {
      throw new H3SessionDataError("Valid userId is required");
    }

    const session = await getOrCreateH3Session(event);

    // Get user from database
    const user = await getUserById(userId);
    if (!user) {
      throw new H3SessionDataError(`User with id ${userId} not found`);
    }

    // Set session data
    const sessionData: H3SessionData = {
      userId,
      loginTime: Date.now(),
      lastActivity: Date.now(),
    };

    await session.update(sessionData);

    // Return compatible format
    const sessionConfig = getSessionConfig();
    return {
      session: {
        id: sessionConfig.name,
        userId: user.id,
        expiresAt: new Date(Date.now() + sessionConfig.maxAge * 1000),
      } as Session,
      user,
    };
  } catch (error) {
    if (error instanceof H3SessionError) {
      console.error(`H3 Session Error (${error.code}):`, error.message);
      throw error; // Re-throw H3SessionError for caller handling
    } else {
      console.error("Error creating H3 session:", error);
      return null;
    }
  }
}

/**
 * Clear H3 session
 */
export async function clearH3Session(event: H3Event): Promise<void> {
  try {
    // Try to get existing session first (don't create new one if none exists)
    if (event.context.h3Session) {
      await event.context.h3Session.clear();
      delete event.context.h3Session;
    } else {
      // If no cached session, create one to clear any server-side session
      const session = await getOrCreateH3Session(event);
      await session.clear();
      delete event.context.h3Session;
    }
  } catch (error) {
    if (error instanceof H3SessionError) {
      console.error(`H3 Session Error (${error.code}):`, error.message);
    } else {
      console.error("Error clearing H3 session:", error);
    }
    // Don't throw error - clearing session should be resilient
  }
}

/**
 * Update H3 session activity
 */
export async function updateH3SessionActivity(event: H3Event): Promise<void> {
  try {
    // Only update activity if session already exists (don't create new sessions)
    if (!event.context.h3Session) {
      return; // No existing session to update
    }

    const session = event.context.h3Session;

    if (session.data?.userId) {
      await session.update({
        ...session.data,
        lastActivity: Date.now(),
      } as H3SessionData);
    }
  } catch (error) {
    if (error instanceof H3SessionError) {
      console.error(`H3 Session Error (${error.code}):`, error.message);
    } else {
      console.error("Error updating H3 session activity:", error);
    }
    // Don't throw error - activity update should be resilient
  }
}

// ========================================
// Unified Session Lifecycle Management
// ========================================

/**
 * Unified H3 Session Manager
 * Provides a consistent interface for all session operations
 */
export class H3SessionManager {
  private event: H3Event;

  constructor(event: H3Event) {
    this.event = event;
  }

  /**
   * Get current session data
   */
  async getCurrentSession(): Promise<SessionWithUser | null> {
    return getCurrentSessionFromEventH3(this.event);
  }

  /**
   * Create session for user
   */
  async createSession(userId: string): Promise<SessionWithUser | null> {
    return createH3Session(this.event, userId);
  }

  /**
   * Update session activity
   */
  async updateActivity(): Promise<void> {
    return updateH3SessionActivity(this.event);
  }

  /**
   * Clear current session
   */
  async clearSession(): Promise<void> {
    return clearH3Session(this.event);
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getCurrentSession();
    return session !== null;
  }

  /**
   * Get current user from session
   */
  async getCurrentUser(): Promise<User | null> {
    const session = await this.getCurrentSession();
    return session?.user || null;
  }

  /**
   * Session lifecycle: login user and create session
   */
  async loginUser(userId: string): Promise<SessionWithUser | null> {
    try {
      // Clear any existing session first
      await this.clearSession();

      // Create new session
      const session = await this.createSession(userId);

      if (session) {
        console.log(`User ${userId} logged in successfully`);
      }

      return session;
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  }

  /**
   * Session lifecycle: logout user and clear session
   */
  async logoutUser(): Promise<void> {
    try {
      const currentSession = await this.getCurrentSession();
      if (currentSession) {
        console.log(`User ${currentSession.user.id} logged out`);
      }

      await this.clearSession();
    } catch (error) {
      console.error("Logout failed:", error);
      throw error;
    }
  }

  /**
   * Validate and refresh session if needed
   */
  async validateAndRefreshSession(): Promise<SessionWithUser | null> {
    try {
      const session = await this.getCurrentSession();

      if (session) {
        // Update activity for active sessions
        await this.updateActivity();
      }

      return session;
    } catch (error) {
      console.error("Session validation failed:", error);
      // Clear invalid session
      await this.clearSession();
      return null;
    }
  }
}

/**
 * Create H3 Session Manager instance
 */
export function createH3SessionManager(event: H3Event): H3SessionManager {
  return new H3SessionManager(event);
}
