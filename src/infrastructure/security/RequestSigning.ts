import crypto from 'crypto';
import { logger } from '@/logger.js';
import { CacheManager } from '../cache/CacheManager.js';
import type { H3Event } from 'h3';
import { getHeaders, readBody } from 'h3';

export interface SigningKey {
  id: string;
  algorithm: 'hmac-sha256' | 'rsa-sha256' | 'ecdsa-sha256';
  key: string | Buffer;
  userId?: string;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

export interface SignedRequest {
  timestamp: number;
  nonce: string;
  signature: string;
  keyId: string;
  algorithm: string;
  headers: string[];
}

/**
 * Request Signing and Verification System
 * 
 * Provides cryptographic signing of HTTP requests for enhanced security
 * and integrity verification.
 */
export class RequestSigning {
  private static instance: RequestSigning;
  private cache = CacheManager.getInstance();
  private readonly SIGNATURE_HEADER = 'X-Signature';
  private readonly TIMESTAMP_HEADER = 'X-Timestamp';
  private readonly NONCE_HEADER = 'X-Nonce';
  private readonly KEY_ID_HEADER = 'X-Key-Id';

  private constructor() { }

  static getInstance(): RequestSigning {
    if (!RequestSigning.instance) {
      RequestSigning.instance = new RequestSigning();
    }
    return RequestSigning.instance;
  }

  /**
   * Generate a new signing key
   */
  async generateSigningKey(options: {
    algorithm: 'hmac-sha256' | 'rsa-sha256' | 'ecdsa-sha256';
    userId?: string;
    expiresAt?: Date;
  }): Promise<SigningKey> {
    const keyId = crypto.randomUUID();
    let key: string | Buffer;

    switch (options.algorithm) {
      case 'hmac-sha256':
        key = crypto.randomBytes(32).toString('base64');
        break;
      case 'rsa-sha256':
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        key = privateKey;

        // Store public key separately for verification
        await this.cache.set(`signing_key_public:${keyId}`, publicKey, { ttl: 0 });
        break;
      case 'ecdsa-sha256':
        const { publicKey: ecPublicKey, privateKey: ecPrivateKey } = crypto.generateKeyPairSync('ec', {
          namedCurve: 'secp256k1',
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        key = ecPrivateKey;

        // Store public key separately for verification
        await this.cache.set(`signing_key_public:${keyId}`, ecPublicKey, { ttl: 0 });
        break;
      default:
        throw new Error(`Unsupported algorithm: ${options.algorithm}`);
    }

    const signingKey: SigningKey = {
      id: keyId,
      algorithm: options.algorithm,
      key,
      userId: options.userId,
      expiresAt: options.expiresAt,
      isActive: true,
      createdAt: new Date(),
    };

    // Store signing key
    await this.cache.set(`signing_key:${keyId}`, signingKey, { ttl: 0 });

    logger.info('Signing key generated', {
      keyId,
      algorithm: options.algorithm,
      userId: options.userId,
    });

    return signingKey;
  }

  /**
   * Sign a request
   */
  async signRequest(options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    keyId: string;
  }): Promise<Record<string, string>> {
    const signingKey = await this.getSigningKey(options.keyId);
    if (!signingKey) {
      throw new Error('Signing key not found');
    }

    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');

    // Prepare string to sign
    const stringToSign = this.createStringToSign({
      method: options.method,
      url: options.url,
      headers: options.headers,
      body: options.body,
      timestamp,
      nonce,
    });

    // Generate signature
    const signature = this.createSignature(stringToSign, signingKey);

    // Return headers to add to request
    return {
      [this.SIGNATURE_HEADER]: signature,
      [this.TIMESTAMP_HEADER]: timestamp.toString(),
      [this.NONCE_HEADER]: nonce,
      [this.KEY_ID_HEADER]: options.keyId,
    };
  }

  /**
   * Verify a signed request
   */
  async verifyRequest(event: H3Event): Promise<{
    valid: boolean;
    keyId?: string;
    userId?: string;
    errors: string[];
  }> {
    const headers = getHeaders(event);
    const errors: string[] = [];

    // Extract signature headers
    const signature = headers[this.SIGNATURE_HEADER.toLowerCase()];
    const timestamp = headers[this.TIMESTAMP_HEADER.toLowerCase()];
    const nonce = headers[this.NONCE_HEADER.toLowerCase()];
    const keyId = headers[this.KEY_ID_HEADER.toLowerCase()];

    if (!signature || !timestamp || !nonce || !keyId) {
      errors.push('Missing required signature headers');
      return { valid: false, errors };
    }

    // Check timestamp (prevent replay attacks)
    const requestTime = parseInt(timestamp as string);
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(now - requestTime) > maxAge) {
      errors.push('Request timestamp too old or too far in the future');
      return { valid: false, errors };
    }

    // Check nonce (prevent replay attacks)
    const nonceKey = `nonce:${nonce}`;
    const nonceExists = await this.cache.get(nonceKey);
    if (nonceExists) {
      errors.push('Nonce already used');
      return { valid: false, errors };
    }

    // Store nonce to prevent reuse
    await this.cache.set(nonceKey, true, { ttl: maxAge / 1000 });

    // Get signing key
    const signingKey = await this.getSigningKey(keyId as string);
    if (!signingKey) {
      errors.push('Invalid key ID');
      return { valid: false, errors };
    }

    if (!signingKey.isActive) {
      errors.push('Signing key is not active');
      return { valid: false, errors };
    }

    if (signingKey.expiresAt && signingKey.expiresAt < new Date()) {
      errors.push('Signing key has expired');
      return { valid: false, errors };
    }

    // Read request body
    const body = event.node.req.method !== 'GET' ? await readBody(event) : undefined;

    // Recreate string to sign
    const stringToSign = this.createStringToSign({
      method: event.node.req.method || 'GET',
      url: event.node.req.url || '/',
      headers: headers as Record<string, string>,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      timestamp: requestTime,
      nonce: nonce as string,
    });

    // Verify signature
    const isValid = await this.verifySignature(stringToSign, signature as string, signingKey);

    if (!isValid) {
      errors.push('Invalid signature');
      return { valid: false, errors };
    }

    logger.debug('Request signature verified', {
      keyId,
      userId: signingKey.userId,
      method: event.node.req.method,
      url: event.node.req.url,
    });

    return {
      valid: true,
      keyId: keyId as string,
      userId: signingKey.userId,
      errors: [],
    };
  }

  /**
   * Revoke a signing key
   */
  async revokeSigningKey(keyId: string): Promise<boolean> {
    const signingKey = await this.getSigningKey(keyId);
    if (!signingKey) return false;

    signingKey.isActive = false;
    await this.cache.set(`signing_key:${keyId}`, signingKey, { ttl: 0 });

    logger.info('Signing key revoked', { keyId, userId: signingKey.userId });
    return true;
  }

  /**
   * List signing keys for a user
   */
  async listSigningKeys(userId: string): Promise<Omit<SigningKey, 'key'>[]> {
    // In a real implementation, this would query the database
    // For now, return empty array as we're using cache
    return [];
  }

  private async getSigningKey(keyId: string): Promise<SigningKey | null> {
    return await this.cache.get<SigningKey>(`signing_key:${keyId}`);
  }

  private createStringToSign(options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    timestamp: number;
    nonce: string;
  }): string {
    // Create canonical string following AWS Signature V4 style
    const canonicalRequest = [
      options.method.toUpperCase(),
      options.url,
      '', // Query string (simplified)
      this.createCanonicalHeaders(options.headers),
      '', // Signed headers list (simplified)
      this.hashPayload(options.body || ''),
    ].join('\n');

    return [
      'REQUEST-SIGNATURE-V1',
      options.timestamp,
      options.nonce,
      this.hash(canonicalRequest),
    ].join('\n');
  }

  private createCanonicalHeaders(headers: Record<string, string>): string {
    const sortedHeaders = Object.keys(headers)
      .filter(key => key.toLowerCase().startsWith('x-') ||
        ['content-type', 'content-length', 'host'].includes(key.toLowerCase()))
      .sort()
      .map(key => `${key.toLowerCase()}:${headers[key]?.trim() || ''}`)
      .join('\n');

    return sortedHeaders;
  }

  private hashPayload(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  private hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private createSignature(stringToSign: string, signingKey: SigningKey): string {
    switch (signingKey.algorithm) {
      case 'hmac-sha256':
        return crypto
          .createHmac('sha256', signingKey.key as string)
          .update(stringToSign)
          .digest('base64');

      case 'rsa-sha256':
        return crypto
          .sign('sha256', Buffer.from(stringToSign), signingKey.key as string)
          .toString('base64');

      case 'ecdsa-sha256':
        return crypto
          .sign('sha256', Buffer.from(stringToSign), signingKey.key as string)
          .toString('base64');

      default:
        throw new Error(`Unsupported algorithm: ${signingKey.algorithm}`);
    }
  }

  private async verifySignature(stringToSign: string, signature: string, signingKey: SigningKey): Promise<boolean> {
    try {
      switch (signingKey.algorithm) {
        case 'hmac-sha256':
          const expectedSignature = crypto
            .createHmac('sha256', signingKey.key as string)
            .update(stringToSign)
            .digest('base64');
          return crypto.timingSafeEqual(
            Buffer.from(signature, 'base64'),
            Buffer.from(expectedSignature, 'base64')
          );

        case 'rsa-sha256':
        case 'ecdsa-sha256':
          // For asymmetric algorithms, we need the public key
          const publicKey = await this.cache.get<string>(`signing_key_public:${signingKey.id}`);
          if (!publicKey) return false;

          return crypto.verify(
            'sha256',
            Buffer.from(stringToSign),
            publicKey as string,
            Buffer.from(signature, 'base64')
          );

        default:
          return false;
      }
    } catch (error) {
      logger.error('Signature verification error', { error, keyId: signingKey.id });
      return false;
    }
  }
}

export const requestSigning = RequestSigning.getInstance();