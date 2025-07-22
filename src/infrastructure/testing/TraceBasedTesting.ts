import { context, trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { getTracer } from '../telemetry/telemetry.js';
import { performanceMonitor } from '../telemetry/PerformanceMonitor.js';
import { logger } from '@/logger.js';

export interface TraceTestOptions {
  name: string;
  timeout?: number;
  expectedDuration?: number;
  expectedSpans?: string[];
  assertMetrics?: (metrics: any) => void;
}

export interface TraceTestResult {
  passed: boolean;
  duration: number;
  spanCount: number;
  errors: string[];
  metrics: any;
}

/**
 * Trace-based testing utilities for performance and behavior validation
 */
export class TraceBasedTesting {
  private tracer = getTracer('trace-testing');
  private testResults = new Map<string, TraceTestResult[]>();

  /**
   * Run a traced test
   */
  async runTest<T>(
    options: TraceTestOptions,
    testFn: () => Promise<T>
  ): Promise<{ result: T; testResult: TraceTestResult }> {
    const startTime = Date.now();
    const errors: string[] = [];
    const spanStack: string[] = [];

    // Create root test span
    const testSpan = this.tracer.startSpan(`test.${options.name}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'test.name': options.name,
        'test.timeout': options.timeout || 30000,
      },
    });

    // Set up span processor to track spans
    const originalStartSpan = this.tracer.startSpan.bind(this.tracer);
    this.tracer.startSpan = (name: string, options?: any) => {
      spanStack.push(name);
      return originalStartSpan(name, options);
    };

    return context.with(trace.setSpan(context.active(), testSpan), async () => {
      try {
        // Run test with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Test timeout after ${options.timeout}ms`)),
            options.timeout || 30000
          );
        });

        const result = await Promise.race([testFn(), timeoutPromise]);

        const duration = Date.now() - startTime;

        // Check duration expectations
        if (options.expectedDuration && duration > options.expectedDuration) {
          errors.push(
            `Test took ${duration}ms, expected less than ${options.expectedDuration}ms`
          );
        }

        // Check expected spans
        if (options.expectedSpans) {
          for (const expectedSpan of options.expectedSpans) {
            if (!spanStack.some(span => span.includes(expectedSpan))) {
              errors.push(`Expected span '${expectedSpan}' was not created`);
            }
          }
        }

        // Get performance metrics
        const metrics = await performanceMonitor.getMetrics();

        // Run custom assertions
        if (options.assertMetrics) {
          try {
            options.assertMetrics(metrics);
          } catch (error) {
            errors.push(`Metric assertion failed: ${error}`);
          }
        }

        testSpan.setStatus({ code: SpanStatusCode.OK });

        const testResult: TraceTestResult = {
          passed: errors.length === 0,
          duration,
          spanCount: spanStack.length,
          errors,
          metrics,
        };

        // Store result
        const results = this.testResults.get(options.name) || [];
        results.push(testResult);
        this.testResults.set(options.name, results);

        return { result, testResult };
      } catch (error) {
        testSpan.recordException(error as Error);
        testSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });

        errors.push(`Test failed: ${(error as Error).message}`);

        const testResult: TraceTestResult = {
          passed: false,
          duration: Date.now() - startTime,
          spanCount: spanStack.length,
          errors,
          metrics: {},
        };

        throw error;
      } finally {
        testSpan.end();
        // Restore original startSpan
        this.tracer.startSpan = originalStartSpan;
      }
    });
  }

  /**
   * Run a performance benchmark
   */
  async benchmark<T>(
    name: string,
    iterations: number,
    testFn: () => Promise<T>
  ): Promise<{
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    p95Duration: number;
    p99Duration: number;
  }> {
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { testResult } = await this.runTest(
        {
          name: `${name}_iteration_${i}`,
          timeout: 60000,
        },
        testFn
      );

      durations.push(testResult.duration);

      // Add small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Calculate statistics
    durations.sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      averageDuration: avg,
      minDuration: durations[0] || 0,
      maxDuration: durations[durations.length - 1] || 0,
      p95Duration: durations[p95Index] || 0,
      p99Duration: durations[p99Index] || 0,
    };
  }

  /**
   * Create a traced test suite
   */
  createSuite(suiteName: string) {
    const suite = {
      tests: [] as Array<{
        name: string;
        fn: () => Promise<any>;
        options: TraceTestOptions;
      }>,

      test(name: string, options: TraceTestOptions, fn: () => Promise<any>) {
        suite.tests.push({ name, fn, options });
        return suite;
      },

      run: async () => {
        const testingInstance = this; // Capture 'this' reference
        const results: any[] = [];
        logger.info(`Running test suite: ${suiteName}`);

        for (const test of suite.tests) {
          try {
            const { testResult } = await testingInstance.runTest(test.options, test.fn);
            results.push({
              name: test.name,
              ...testResult,
            });

            if (testResult.passed) {
              logger.info(`✓ ${test.name} (${testResult.duration}ms)`);
            } else {
              logger.error(`✗ ${test.name}`, { errors: testResult.errors });
            }
          } catch (error) {
            logger.error(`✗ ${test.name} - ${error}`);
            results.push({
              name: test.name,
              passed: false,
              errors: [(error as Error).message],
            });
          }
        }

        const passed = results.filter((r: any) => r.passed).length;
        const failed = results.filter((r: any) => !r.passed).length;

        logger.info(`Suite ${suiteName} completed: ${passed} passed, ${failed} failed`);

        return {
          suiteName,
          passed,
          failed,
          results,
        };
      },
    };

    return suite;
  }

  /**
   * Generate test report
   */
  generateReport(): string {
    const report: string[] = ['# Trace-Based Test Report\n'];

    for (const [testName, results] of this.testResults) {
      const passed = results.filter(r => r.passed).length;
      const failed = results.filter(r => !r.passed).length;
      const avgDuration =
        results.reduce((sum, r) => sum + r.duration, 0) / results.length;

      report.push(`## ${testName}`);
      report.push(`- Runs: ${results.length}`);
      report.push(`- Passed: ${passed}`);
      report.push(`- Failed: ${failed}`);
      report.push(`- Average Duration: ${avgDuration.toFixed(2)}ms`);

      if (failed > 0) {
        report.push('\n### Failures:');
        results
          .filter(r => !r.passed)
          .forEach((r, i) => {
            report.push(`\n#### Run ${i + 1}:`);
            r.errors.forEach(e => report.push(`- ${e}`));
          });
      }

      report.push('\n---\n');
    }

    return report.join('\n');
  }

  /**
   * Assert trace contains expected operations
   */
  static assertTraceContains(spanStack: string[], expected: string[]) {
    const missing = expected.filter(
      exp => !spanStack.some(span => span.includes(exp))
    );

    if (missing.length > 0) {
      throw new Error(`Missing expected spans: ${missing.join(', ')}`);
    }
  }

  /**
   * Assert performance metrics
   */
  static assertPerformanceMetrics(metrics: any, assertions: {
    maxResponseTime?: number;
    maxErrorRate?: number;
    minCacheHitRate?: number;
  }) {
    if (assertions.maxResponseTime && metrics.averageResponseTime > assertions.maxResponseTime) {
      throw new Error(
        `Average response time ${metrics.averageResponseTime}ms exceeds max ${assertions.maxResponseTime}ms`
      );
    }

    const errorRate = metrics.errorCount / metrics.requestCount;
    if (assertions.maxErrorRate && errorRate > assertions.maxErrorRate) {
      throw new Error(
        `Error rate ${(errorRate * 100).toFixed(2)}% exceeds max ${(assertions.maxErrorRate * 100).toFixed(2)}%`
      );
    }

    if (assertions.minCacheHitRate && metrics.cacheHitRate < assertions.minCacheHitRate) {
      throw new Error(
        `Cache hit rate ${(metrics.cacheHitRate * 100).toFixed(2)}% below min ${(assertions.minCacheHitRate * 100).toFixed(2)}%`
      );
    }
  }
}

export const traceBasedTesting = new TraceBasedTesting();