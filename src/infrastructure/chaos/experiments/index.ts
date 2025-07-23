import { ChaosExperiment } from '../ChaosEngineering.js';

/**
 * Predefined chaos experiments for common failure scenarios
 */
export const chaosExperiments: ChaosExperiment[] = [
  // Network Experiments
  {
    id: 'network-latency-edge',
    name: 'Edge Network Latency',
    description: 'Inject latency between edge locations to test geographic resilience',
    type: 'network_latency',
    target: {
      type: 'edge',
      selector: { region: 'us-west' },
    },
    parameters: {
      latency: 500,
      jitter: 100,
    },
    duration: 300000, // 5 minutes
    conditions: [
      { type: 'metric', check: () => true },
    ],
    rollbackOn: [
      { metric: 'responseTime', threshold: 1000, operator: '>' },
      { metric: 'availability', threshold: 95, operator: '<' },
    ],
  },

  {
    id: 'network-partition-regions',
    name: 'Regional Network Partition',
    description: 'Simulate network split between US and EU regions',
    type: 'network_partition',
    target: {
      type: 'network',
      selector: { tags: ['cross-region'] },
    },
    parameters: {
      partitions: ['us-east', 'eu-west'],
    },
    duration: 600000, // 10 minutes
    conditions: [
      { type: 'time', check: () => true },
      { type: 'state', check: () => true },
    ],
    rollbackOn: [
      { metric: 'conflicts', threshold: 100, operator: '>' },
    ],
  },

  // Service Failure Experiments
  {
    id: 'graphql-service-failure',
    name: 'GraphQL Service Degradation',
    description: 'Introduce intermittent failures in GraphQL responses',
    type: 'service_failure',
    target: {
      type: 'service',
      selector: { id: 'graphql-gateway' },
    },
    parameters: {
      failureRate: 0.1, // 10% failure rate
      errorType: 'timeout',
    },
    duration: 180000, // 3 minutes
    conditions: [
      { type: 'metric', check: () => true },
    ],
    rollbackOn: [
      { metric: 'errorRate', threshold: 0.2, operator: '>' },
    ],
  },

  {
    id: 'auth-service-outage',
    name: 'Authentication Service Outage',
    description: 'Simulate complete auth service failure',
    type: 'service_failure',
    target: {
      type: 'service',
      selector: { id: 'auth-service' },
    },
    parameters: {
      failureRate: 1.0, // Complete failure
    },
    duration: 120000, // 2 minutes
    conditions: [
      { type: 'state', check: () => true },
    ],
    rollbackOn: [
      { metric: 'availability', threshold: 90, operator: '<' },
    ],
  },

  // Resource Exhaustion Experiments
  {
    id: 'cpu-spike-edge',
    name: 'Edge CPU Exhaustion',
    description: 'Simulate high CPU usage at edge locations',
    type: 'resource_exhaustion',
    target: {
      type: 'edge',
      selector: { region: 'us-east' },
    },
    parameters: {
      resource: 'cpu',
      usage: 0.85, // 85% CPU
    },
    duration: 300000, // 5 minutes
    conditions: [
      { type: 'metric', check: () => true },
    ],
    rollbackOn: [
      { metric: 'responseTime', threshold: 500, operator: '>' },
    ],
  },

  {
    id: 'memory-leak-simulation',
    name: 'Memory Leak Simulation',
    description: 'Gradually increase memory usage to test OOM handling',
    type: 'resource_exhaustion',
    target: {
      type: 'service',
      selector: { id: 'api-server' },
    },
    parameters: {
      resource: 'memory',
      usage: 0.95, // 95% memory
      gradual: true,
    },
    duration: 600000, // 10 minutes
    conditions: [
      { type: 'state', check: () => true },
    ],
    rollbackOn: [
      { metric: 'availability', threshold: 99, operator: '<' },
    ],
  },

  // Data Experiments
  {
    id: 'replication-lag-injection',
    name: 'Database Replication Lag',
    description: 'Introduce significant replication lag between regions',
    type: 'network_latency',
    target: {
      type: 'database',
      selector: { tags: ['replica'] },
    },
    parameters: {
      latency: 5000, // 5 second lag
      jitter: 1000,
    },
    duration: 480000, // 8 minutes
    conditions: [
      { type: 'metric', check: () => true },
    ],
    rollbackOn: [
      { metric: 'conflicts', threshold: 50, operator: '>' },
    ],
  },

  {
    id: 'cache-invalidation-storm',
    name: 'Cache Invalidation Storm',
    description: 'Trigger massive cache invalidations to test cache rebuild',
    type: 'dependency_failure',
    target: {
      type: 'cache',
      selector: { id: 'cdn-cache' },
    },
    parameters: {
      dependency: 'cache',
      action: 'flush',
    },
    duration: 60000, // 1 minute
    conditions: [
      { type: 'time', check: () => true },
    ],
    rollbackOn: [
      { metric: 'responseTime', threshold: 2000, operator: '>' },
    ],
  },

  // Security Experiments
  {
    id: 'ddos-simulation',
    name: 'DDoS Attack Simulation',
    description: 'Simulate distributed denial of service attack',
    type: 'security_breach',
    target: {
      type: 'edge',
      selector: { region: 'us-east' },
    },
    parameters: {
      type: 'ddos',
      requestsPerSecond: 10000,
      sourceIPs: 1000,
    },
    duration: 300000, // 5 minutes
    conditions: [
      { type: 'state', check: () => true },
    ],
    rollbackOn: [
      { metric: 'availability', threshold: 95, operator: '<' },
    ],
  },

  {
    id: 'auth-token-expiry-storm',
    name: 'Mass Token Expiry',
    description: 'Expire all auth tokens simultaneously',
    type: 'security_breach',
    target: {
      type: 'service',
      selector: { id: 'auth-service' },
    },
    parameters: {
      type: 'token_expiry',
      scope: 'all',
    },
    duration: 180000, // 3 minutes
    conditions: [
      { type: 'metric', check: () => true },
    ],
    rollbackOn: [
      { metric: 'errorRate', threshold: 0.5, operator: '>' },
    ],
  },

  // Time-based Experiments
  {
    id: 'clock-drift-detection',
    name: 'Clock Drift Between Regions',
    description: 'Introduce clock skew to test time synchronization',
    type: 'clock_skew',
    target: {
      type: 'edge',
      selector: { region: 'ap-south' },
    },
    parameters: {
      skew: 3600000, // 1 hour
      drift: 1000, // 1 second per minute
    },
    duration: 600000, // 10 minutes
    conditions: [
      { type: 'state', check: () => true },
    ],
    rollbackOn: [
      { metric: 'conflicts', threshold: 20, operator: '>' },
    ],
  },

  // Cascade Failure Experiments
  {
    id: 'cascade-failure-test',
    name: 'Cascading Service Failure',
    description: 'Test resilience to cascading failures',
    type: 'service_failure',
    target: {
      type: 'service',
      selector: { tags: ['critical'] },
    },
    parameters: {
      failureRate: 0.5,
      cascade: true,
      propagationDelay: 30000, // 30 seconds
    },
    duration: 900000, // 15 minutes
    schedule: {
      interval: 86400000, // Daily
    },
    conditions: [
      { type: 'time', check: () => true },
      { type: 'state', check: () => true },
    ],
    rollbackOn: [
      { metric: 'availability', threshold: 80, operator: '<' },
      { metric: 'errorRate', threshold: 0.3, operator: '>' },
    ],
  },
];

/**
 * Game Day scenarios - comprehensive failure scenarios
 */
export const gameDayScenarios = [
  {
    name: 'Black Friday Simulation',
    description: 'Simulate Black Friday traffic and failures',
    experiments: [
      'cpu-spike-edge',
      'memory-leak-simulation',
      'cache-invalidation-storm',
      'network-latency-edge',
    ],
    duration: 3600000, // 1 hour
  },
  {
    name: 'Regional Disaster',
    description: 'Simulate complete regional outage',
    experiments: [
      'network-partition-regions',
      'replication-lag-injection',
      'auth-service-outage',
    ],
    duration: 1800000, // 30 minutes
  },
  {
    name: 'Security Incident',
    description: 'Simulate coordinated security attack',
    experiments: [
      'ddos-simulation',
      'auth-token-expiry-storm',
      'graphql-service-failure',
    ],
    duration: 2400000, // 40 minutes
  },
];

/**
 * Register all experiments with the chaos engineering system
 */
export function registerAllExperiments(chaosSystem: any): void {
  for (const experiment of chaosExperiments) {
    chaosSystem.registerExperiment(experiment);
  }
}