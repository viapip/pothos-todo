import { EventEmitter } from 'events';
import { createHash, randomBytes, createCipher, createDecipher } from 'crypto';
import { logger } from '@/logger.js';
import { MetricsSystem } from '../observability/Metrics.js';
import { SecurityAuditSystem } from '../security/SecurityAudit.js';

export interface QuantumKey {
  id: string;
  algorithm: 'kyber' | 'dilithium' | 'falcon' | 'sphincs';
  publicKey: Uint8Array;
  privateKey?: Uint8Array;
  createdAt: Date;
  expiresAt: Date;
  usage: 'encryption' | 'signing' | 'key_exchange';
  quantumSafe: boolean;
}

export interface QuantumSignature {
  algorithm: string;
  signature: Uint8Array;
  publicKey: Uint8Array;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface QuantumEncryptionResult {
  ciphertext: Uint8Array;
  keyId: string;
  algorithm: string;
  metadata: {
    encryptedAt: Date;
    keyVersion: number;
    quantumResistant: boolean;
  };
}

export interface PostQuantumConfig {
  enableKeyRotation: boolean;
  keyRotationInterval: number; // milliseconds
  hybridMode: boolean; // Use both classical and post-quantum
  preferredAlgorithms: {
    encryption: string[];
    signing: string[];
    keyExchange: string[];
  };
  quantumThreatLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Quantum-Ready Cryptography System
 * Implements post-quantum cryptographic algorithms and hybrid security
 */
export class QuantumCryptographySystem extends EventEmitter {
  private static instance: QuantumCryptographySystem;
  private config: PostQuantumConfig;
  private keyStore: Map<string, QuantumKey> = new Map();
  private signatureStore: Map<string, QuantumSignature> = new Map();
  private metrics: MetricsSystem;
  private audit: SecurityAuditSystem;
  private keyRotationTimer?: NodeJS.Timeout;

  // Simulated post-quantum algorithms (in production, would use actual implementations)
  private quantumAlgorithms = {
    kyber: {
      keyGen: () => this.simulateKyberKeyGen(),
      encrypt: (data: Uint8Array, key: Uint8Array) => this.simulateKyberEncrypt(data, key),
      decrypt: (ciphertext: Uint8Array, key: Uint8Array) => this.simulateKyberDecrypt(ciphertext, key),
    },
    dilithium: {
      keyGen: () => this.simulateDilithiumKeyGen(),
      sign: (data: Uint8Array, key: Uint8Array) => this.simulateDilithiumSign(data, key),
      verify: (signature: Uint8Array, data: Uint8Array, key: Uint8Array) => this.simulateDilithiumVerify(signature, data, key),
    },
    falcon: {
      keyGen: () => this.simulateFalconKeyGen(),
      sign: (data: Uint8Array, key: Uint8Array) => this.simulateFalconSign(data, key),
      verify: (signature: Uint8Array, data: Uint8Array, key: Uint8Array) => this.simulateFalconVerify(signature, data, key),
    },
    sphincs: {
      keyGen: () => this.simulateSphincsKeyGen(),
      sign: (data: Uint8Array, key: Uint8Array) => this.simulateSphincsSign(data, key),
      verify: (signature: Uint8Array, data: Uint8Array, key: Uint8Array) => this.simulateSphincsVerify(signature, data, key),
    },
  };

  private constructor(config: PostQuantumConfig) {
    super();
    this.config = config;
    this.metrics = MetricsSystem.getInstance();
    this.audit = SecurityAuditSystem.getInstance();
    
    this.initializeQuantumSecurity();
  }

  static initialize(config: PostQuantumConfig): QuantumCryptographySystem {
    if (!QuantumCryptographySystem.instance) {
      QuantumCryptographySystem.instance = new QuantumCryptographySystem(config);
    }
    return QuantumCryptographySystem.instance;
  }

  static getInstance(): QuantumCryptographySystem {
    if (!QuantumCryptographySystem.instance) {
      throw new Error('QuantumCryptographySystem not initialized');
    }
    return QuantumCryptographySystem.instance;
  }

  /**
   * Generate post-quantum key pair
   */
  async generateQuantumKey(
    algorithm: QuantumKey['algorithm'],
    usage: QuantumKey['usage'],
    expirationHours: number = 24
  ): Promise<QuantumKey> {
    logger.info('Generating post-quantum key', { algorithm, usage });

    const keyPair = this.quantumAlgorithms[algorithm]?.keyGen() || 
      this.generateFallbackKeyPair();

    const key: QuantumKey = {
      id: `qk_${Date.now()}_${randomBytes(8).toString('hex')}`,
      algorithm,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expirationHours * 3600000),
      usage,
      quantumSafe: true,
    };

    this.keyStore.set(key.id, key);

    // Audit key generation
    this.audit.logEvent({
      timestamp: new Date(),
      eventType: 'security_event',
      result: 'success',
      details: {
        action: 'quantum_key_generation',
        keyId: key.id,
        algorithm,
        usage,
        quantumSafe: true,
      },
    });

    // Record metrics
    this.metrics.record('quantum_keys_generated', 1, {
      algorithm,
      usage,
    });

    this.emit('key:generated', key);
    return key;
  }

  /**
   * Encrypt data with post-quantum algorithms
   */
  async quantumEncrypt(
    data: string | Uint8Array,
    keyId?: string,
    algorithm?: QuantumKey['algorithm']
  ): Promise<QuantumEncryptionResult> {
    const plaintext = typeof data === 'string' ? 
      new TextEncoder().encode(data) : data;

    // Use provided key or generate ephemeral key
    const key = keyId ? this.keyStore.get(keyId) : 
      await this.generateQuantumKey(
        algorithm || this.config.preferredAlgorithms.encryption[0] as QuantumKey['algorithm'],
        'encryption',
        1 // 1 hour for ephemeral keys
      );

    if (!key) {
      throw new Error('Quantum key not found');
    }

    // Hybrid encryption if enabled
    if (this.config.hybridMode) {
      return this.hybridEncrypt(plaintext, key);
    }

    // Pure post-quantum encryption
    const ciphertext = this.quantumAlgorithms[key.algorithm]?.encrypt(
      plaintext, 
      key.privateKey!
    ) || this.fallbackEncrypt(plaintext, key.privateKey!);

    const result: QuantumEncryptionResult = {
      ciphertext,
      keyId: key.id,
      algorithm: key.algorithm,
      metadata: {
        encryptedAt: new Date(),
        keyVersion: 1,
        quantumResistant: true,
      },
    };

    // Record metrics
    this.metrics.record('quantum_encryptions', 1, {
      algorithm: key.algorithm,
    });

    return result;
  }

  /**
   * Decrypt data with post-quantum algorithms
   */
  async quantumDecrypt(
    encryptionResult: QuantumEncryptionResult
  ): Promise<Uint8Array> {
    const key = this.keyStore.get(encryptionResult.keyId);
    if (!key) {
      throw new Error('Quantum key not found for decryption');
    }

    // Check key expiration
    if (key.expiresAt < new Date()) {
      throw new Error('Quantum key expired');
    }

    // Hybrid decryption if this was hybrid encrypted
    if (this.config.hybridMode && encryptionResult.metadata.quantumResistant) {
      return this.hybridDecrypt(encryptionResult, key);
    }

    // Pure post-quantum decryption
    const plaintext = this.quantumAlgorithms[key.algorithm]?.decrypt(
      encryptionResult.ciphertext,
      key.privateKey!
    ) || this.fallbackDecrypt(encryptionResult.ciphertext, key.privateKey!);

    // Record metrics
    this.metrics.record('quantum_decryptions', 1, {
      algorithm: key.algorithm,
    });

    return plaintext;
  }

  /**
   * Create quantum-resistant digital signature
   */
  async quantumSign(
    data: string | Uint8Array,
    keyId?: string,
    algorithm?: QuantumKey['algorithm']
  ): Promise<QuantumSignature> {
    const message = typeof data === 'string' ? 
      new TextEncoder().encode(data) : data;

    // Use provided key or generate signing key
    const key = keyId ? this.keyStore.get(keyId) : 
      await this.generateQuantumKey(
        algorithm || this.config.preferredAlgorithms.signing[0] as QuantumKey['algorithm'],
        'signing'
      );

    if (!key || key.usage !== 'signing') {
      throw new Error('Invalid signing key');
    }

    // Create signature
    const signature = this.quantumAlgorithms[key.algorithm]?.sign(
      message,
      key.privateKey!
    ) || this.fallbackSign(message, key.privateKey!);

    const quantumSig: QuantumSignature = {
      algorithm: key.algorithm,
      signature,
      publicKey: key.publicKey,
      timestamp: new Date(),
      metadata: {
        keyId: key.id,
        quantumResistant: true,
        hybridMode: this.config.hybridMode,
      },
    };

    // Store signature
    const sigId = `sig_${Date.now()}_${randomBytes(4).toString('hex')}`;
    this.signatureStore.set(sigId, quantumSig);

    // Record metrics
    this.metrics.record('quantum_signatures_created', 1, {
      algorithm: key.algorithm,
    });

    return quantumSig;
  }

  /**
   * Verify quantum-resistant digital signature
   */
  async quantumVerify(
    signature: QuantumSignature,
    data: string | Uint8Array
  ): Promise<boolean> {
    const message = typeof data === 'string' ? 
      new TextEncoder().encode(data) : data;

    try {
      const isValid = this.quantumAlgorithms[signature.algorithm]?.verify(
        signature.signature,
        message,
        signature.publicKey
      ) || this.fallbackVerify(signature.signature, message, signature.publicKey);

      // Record metrics
      this.metrics.record('quantum_verifications', 1, {
        algorithm: signature.algorithm,
        result: isValid ? 'valid' : 'invalid',
      });

      // Audit verification
      this.audit.logEvent({
        timestamp: new Date(),
        eventType: 'security_event',
        result: isValid ? 'success' : 'failure',
        details: {
          action: 'quantum_signature_verification',
          algorithm: signature.algorithm,
          valid: isValid,
        },
      });

      return isValid;
    } catch (error) {
      logger.error('Quantum signature verification failed', error);
      return false;
    }
  }

  /**
   * Perform quantum key exchange
   */
  async quantumKeyExchange(
    peerPublicKey: Uint8Array,
    algorithm?: QuantumKey['algorithm']
  ): Promise<{ sharedSecret: Uint8Array; keyId: string }> {
    const keyExchangeAlg = algorithm || 
      this.config.preferredAlgorithms.keyExchange[0] as QuantumKey['algorithm'];

    // Generate ephemeral key pair for key exchange
    const ephemeralKey = await this.generateQuantumKey(keyExchangeAlg, 'key_exchange', 1);

    // Perform key exchange (simplified - in reality would use proper KEM algorithms)
    const sharedSecret = this.performKeyExchange(
      ephemeralKey.privateKey!,
      peerPublicKey,
      keyExchangeAlg
    );

    logger.info('Quantum key exchange completed', {
      algorithm: keyExchangeAlg,
      keyId: ephemeralKey.id,
    });

    return {
      sharedSecret,
      keyId: ephemeralKey.id,
    };
  }

  /**
   * Rotate all quantum keys
   */
  async rotateQuantumKeys(): Promise<{ rotated: number; failed: number }> {
    logger.info('Starting quantum key rotation...');

    let rotated = 0;
    let failed = 0;

    for (const [keyId, key] of this.keyStore) {
      try {
        // Generate new key with same parameters
        const newKey = await this.generateQuantumKey(
          key.algorithm,
          key.usage,
          24
        );

        // Update references (in production, would update all encrypted data)
        this.keyStore.delete(keyId);
        
        rotated++;
      } catch (error) {
        logger.error(`Failed to rotate key ${keyId}`, error);
        failed++;
      }
    }

    // Record metrics
    this.metrics.record('quantum_keys_rotated', rotated);
    this.metrics.record('quantum_key_rotation_failures', failed);

    this.emit('keys:rotated', { rotated, failed });
    return { rotated, failed };
  }

  /**
   * Get quantum cryptography status
   */
  getQuantumStatus(): {
    keysActive: number;
    signaturesActive: number;
    algorithmDistribution: Record<string, number>;
    threatLevel: string;
    hybridMode: boolean;
    nextRotation?: Date;
  } {
    const keysByAlgorithm: Record<string, number> = {};
    
    for (const key of this.keyStore.values()) {
      keysByAlgorithm[key.algorithm] = (keysByAlgorithm[key.algorithm] || 0) + 1;
    }

    return {
      keysActive: this.keyStore.size,
      signaturesActive: this.signatureStore.size,
      algorithmDistribution: keysByAlgorithm,
      threatLevel: this.config.quantumThreatLevel,
      hybridMode: this.config.hybridMode,
      nextRotation: this.config.enableKeyRotation ? 
        new Date(Date.now() + this.config.keyRotationInterval) : undefined,
    };
  }

  /**
   * Initialize quantum security
   */
  private initializeQuantumSecurity(): void {
    logger.info('Initializing quantum-ready cryptography system', {
      hybridMode: this.config.hybridMode,
      threatLevel: this.config.quantumThreatLevel,
    });

    // Start key rotation if enabled
    if (this.config.enableKeyRotation) {
      this.keyRotationTimer = setInterval(
        () => this.rotateQuantumKeys(),
        this.config.keyRotationInterval
      );
    }

    // Generate initial master keys
    this.generateInitialKeys();
  }

  /**
   * Generate initial master keys
   */
  private async generateInitialKeys(): Promise<void> {
    // Generate keys for each preferred algorithm
    for (const encAlg of this.config.preferredAlgorithms.encryption) {
      await this.generateQuantumKey(encAlg as QuantumKey['algorithm'], 'encryption');
    }

    for (const sigAlg of this.config.preferredAlgorithms.signing) {
      await this.generateQuantumKey(sigAlg as QuantumKey['algorithm'], 'signing');
    }

    for (const kexAlg of this.config.preferredAlgorithms.keyExchange) {
      await this.generateQuantumKey(kexAlg as QuantumKey['algorithm'], 'key_exchange');
    }
  }

  /**
   * Hybrid encryption combining classical and post-quantum
   */
  private hybridEncrypt(
    data: Uint8Array,
    quantumKey: QuantumKey
  ): QuantumEncryptionResult {
    // Classical encryption first
    const classicalKey = randomBytes(32);
    const classicalCipher = createCipher('aes-256-gcm', classicalKey);
    const classicalCiphertext = Buffer.concat([
      classicalCipher.update(data),
      classicalCipher.final(),
    ]);

    // Then encrypt the classical key with quantum algorithm
    const quantumCiphertext = this.quantumAlgorithms[quantumKey.algorithm]?.encrypt(
      classicalKey,
      quantumKey.privateKey!
    ) || this.fallbackEncrypt(classicalKey, quantumKey.privateKey!);

    // Combine both
    const combined = new Uint8Array(quantumCiphertext.length + classicalCiphertext.length + 4);
    const view = new DataView(combined.buffer);
    view.setUint32(0, quantumCiphertext.length);
    combined.set(quantumCiphertext, 4);
    combined.set(classicalCiphertext, 4 + quantumCiphertext.length);

    return {
      ciphertext: combined,
      keyId: quantumKey.id,
      algorithm: quantumKey.algorithm,
      metadata: {
        encryptedAt: new Date(),
        keyVersion: 1,
        quantumResistant: true,
      },
    };
  }

  /**
   * Hybrid decryption
   */
  private hybridDecrypt(
    result: QuantumEncryptionResult,
    quantumKey: QuantumKey
  ): Uint8Array {
    const combined = result.ciphertext;
    const view = new DataView(combined.buffer);
    const quantumLength = view.getUint32(0);
    
    const quantumCiphertext = combined.slice(4, 4 + quantumLength);
    const classicalCiphertext = combined.slice(4 + quantumLength);

    // Decrypt classical key with quantum algorithm
    const classicalKey = this.quantumAlgorithms[quantumKey.algorithm]?.decrypt(
      quantumCiphertext,
      quantumKey.privateKey!
    ) || this.fallbackDecrypt(quantumCiphertext, quantumKey.privateKey!);

    // Decrypt data with classical key
    const classicalDecipher = createDecipher('aes-256-gcm', Buffer.from(classicalKey));
    const plaintext = Buffer.concat([
      classicalDecipher.update(classicalCiphertext),
      classicalDecipher.final(),
    ]);

    return new Uint8Array(plaintext);
  }

  /**
   * Perform key exchange (simplified simulation)
   */
  private performKeyExchange(
    privateKey: Uint8Array,
    peerPublicKey: Uint8Array,
    algorithm: QuantumKey['algorithm']
  ): Uint8Array {
    // Simplified key exchange - in reality would use proper KEM
    const combined = new Uint8Array(privateKey.length + peerPublicKey.length);
    combined.set(privateKey, 0);
    combined.set(peerPublicKey, privateKey.length);
    
    const hash = createHash('sha256');
    hash.update(combined);
    return new Uint8Array(hash.digest());
  }

  // Simulated post-quantum algorithm implementations
  // In production, would use actual implementations like liboqs

  private simulateKyberKeyGen() {
    return {
      publicKey: randomBytes(1568),  // Kyber-1024 public key size
      privateKey: randomBytes(3168), // Kyber-1024 private key size
    };
  }

  private simulateKyberEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
    const encrypted = new Uint8Array(data.length + 32);
    encrypted.set(data, 0);
    encrypted.set(randomBytes(32), data.length); // Simulated overhead
    return encrypted;
  }

  private simulateKyberDecrypt(ciphertext: Uint8Array, key: Uint8Array): Uint8Array {
    return ciphertext.slice(0, -32); // Remove simulated overhead
  }

  private simulateDilithiumKeyGen() {
    return {
      publicKey: randomBytes(1952),  // Dilithium-5 public key size
      privateKey: randomBytes(4880), // Dilithium-5 private key size
    };
  }

  private simulateDilithiumSign(data: Uint8Array, key: Uint8Array): Uint8Array {
    const hash = createHash('sha256');
    hash.update(data);
    hash.update(key);
    return new Uint8Array(hash.digest());
  }

  private simulateDilithiumVerify(signature: Uint8Array, data: Uint8Array, key: Uint8Array): boolean {
    const expectedSig = this.simulateDilithiumSign(data, key);
    return signature.every((byte, i) => byte === expectedSig[i]);
  }

  private simulateFalconKeyGen() {
    return {
      publicKey: randomBytes(1793),  // Falcon-1024 public key size
      privateKey: randomBytes(2305), // Falcon-1024 private key size
    };
  }

  private simulateFalconSign(data: Uint8Array, key: Uint8Array): Uint8Array {
    const hash = createHash('sha512');
    hash.update(data);
    hash.update(key);
    return new Uint8Array(hash.digest());
  }

  private simulateFalconVerify(signature: Uint8Array, data: Uint8Array, key: Uint8Array): boolean {
    const expectedSig = this.simulateFalconSign(data, key);
    return signature.every((byte, i) => byte === expectedSig[i]);
  }

  private simulateSphincsKeyGen() {
    return {
      publicKey: randomBytes(64),   // SPHINCS+ public key size
      privateKey: randomBytes(128), // SPHINCS+ private key size
    };
  }

  private simulateSphincsSign(data: Uint8Array, key: Uint8Array): Uint8Array {
    return randomBytes(49856); // SPHINCS+ signature size
  }

  private simulateSphincsVerify(signature: Uint8Array, data: Uint8Array, key: Uint8Array): boolean {
    return signature.length === 49856; // Simplified verification
  }

  // Fallback implementations using classical cryptography
  private generateFallbackKeyPair() {
    return {
      publicKey: randomBytes(32),
      privateKey: randomBytes(32),
    };
  }

  private fallbackEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
    const cipher = createCipher('aes-256-gcm', Buffer.from(key));
    return new Uint8Array(Buffer.concat([cipher.update(data), cipher.final()]));
  }

  private fallbackDecrypt(ciphertext: Uint8Array, key: Uint8Array): Uint8Array {
    const decipher = createDecipher('aes-256-gcm', Buffer.from(key));
    return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  }

  private fallbackSign(data: Uint8Array, key: Uint8Array): Uint8Array {
    const hash = createHash('sha256');
    hash.update(data);
    hash.update(key);
    return new Uint8Array(hash.digest());
  }

  private fallbackVerify(signature: Uint8Array, data: Uint8Array, key: Uint8Array): boolean {
    const expectedSig = this.fallbackSign(data, key);
    return signature.every((byte, i) => byte === expectedSig[i]);
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
    }
    
    // Securely clear sensitive data
    this.keyStore.clear();
    this.signatureStore.clear();
    
    logger.info('Quantum cryptography system shutdown complete');
  }
}