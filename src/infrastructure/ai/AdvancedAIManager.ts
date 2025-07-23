import { logger } from '@/logger.js';
import { MetricsCollector } from '../monitoring/MetricsCollector.js';
import { CacheManager } from '../cache/CacheManager.js';
import { GracefulDegradation } from '../resilience/GracefulDegradation.js';
import { hash } from 'ohash';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'pathe';

export interface CustomModel {
  id: string;
  name: string;
  type: 'text_generation' | 'text_classification' | 'embeddings' | 'image_analysis' | 'audio_processing';
  baseModel: string;
  version: string;
  status: 'training' | 'ready' | 'error' | 'deploying';
  metrics: {
    accuracy?: number;
    f1Score?: number;
    precision?: number;
    recall?: number;
    lossValue?: number;
  };
  trainingData: {
    size: number;
    lastUpdated: Date;
    source: string;
  };
  deployment: {
    endpoint?: string;
    instances: number;
    lastDeployed?: Date;
    cpuUsage: number;
    memoryUsage: number;
  };
  fineTuningConfig: {
    learningRate: number;
    batchSize: number;
    epochs: number;
    maxTokens: number;
    temperature: number;
    topP: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingJob {
  id: string;
  modelId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  currentEpoch: number;
  totalEpochs: number;
  metrics: {
    loss: number[];
    accuracy: number[];
    validationLoss: number[];
    validationAccuracy: number[];
  };
  config: {
    datasetPath: string;
    outputPath: string;
    hyperparameters: Record<string, any>;
  };
  startedAt?: Date;
  completedAt?: Date;
  estimatedTimeRemaining?: number;
  logs: Array<{
    timestamp: Date;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>;
}

export interface MultiModalInput {
  text?: string;
  image?: {
    url?: string;
    base64?: string;
    mimeType: string;
  };
  audio?: {
    url?: string;
    base64?: string;
    mimeType: string;
    duration?: number;
  };
  video?: {
    url?: string;
    base64?: string;
    mimeType: string;
    duration?: number;
  };
  metadata?: Record<string, any>;
}

export interface MultiModalOutput {
  text?: string;
  image?: {
    url: string;
    description?: string;
    objects?: Array<{
      label: string;
      confidence: number;
      boundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }>;
  };
  audio?: {
    transcript?: string;
    sentiment?: string;
    language?: string;
    confidence: number;
  };
  analysis: {
    confidence: number;
    processingTime: number;
    modelUsed: string;
    metadata?: Record<string, any>;
  };
}

export interface AIWorkflow {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    id: string;
    type: 'preprocess' | 'model_inference' | 'postprocess' | 'validation';
    modelId?: string;
    config: Record<string, any>;
    dependencies: string[];
  }>;
  triggers: Array<{
    type: 'schedule' | 'webhook' | 'event';
    config: Record<string, any>;
  }>;
  status: 'active' | 'paused' | 'error';
  metrics: {
    totalRuns: number;
    successRate: number;
    averageExecutionTime: number;
    lastRun?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class AdvancedAIManager {
  private static instance: AdvancedAIManager;
  private customModels = new Map<string, CustomModel>();
  private trainingJobs = new Map<string, TrainingJob>();
  private workflows = new Map<string, AIWorkflow>();
  private metrics: MetricsCollector;
  private cache: CacheManager;
  private gracefulDegradation: GracefulDegradation;
  private trainingInterval?: NodeJS.Timeout;
  private workflowInterval?: NodeJS.Timeout;

  private constructor() {
    this.metrics = MetricsCollector.getInstance();
    this.cache = CacheManager.getInstance();
    this.gracefulDegradation = GracefulDegradation.getInstance();
    this.setupDefaultModels();
    this.startTrainingMonitoring();
    this.startWorkflowExecution();
  }

  public static getInstance(): AdvancedAIManager {
    if (!AdvancedAIManager.instance) {
      AdvancedAIManager.instance = new AdvancedAIManager();
    }
    return AdvancedAIManager.instance;
  }

  /**
   * Create a custom model for fine-tuning
   */
  public async createCustomModel(
    name: string,
    type: CustomModel['type'],
    baseModel: string,
    fineTuningConfig: CustomModel['fineTuningConfig']
  ): Promise<CustomModel> {
    const modelId = hash({ name, baseModel, timestamp: Date.now() });

    const model: CustomModel = {
      id: modelId,
      name,
      type,
      baseModel,
      version: '1.0.0',
      status: 'training',
      metrics: {},
      trainingData: {
        size: 0,
        lastUpdated: new Date(),
        source: 'user_provided',
      },
      deployment: {
        instances: 0,
        cpuUsage: 0,
        memoryUsage: 0,
      },
      fineTuningConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.customModels.set(modelId, model);

    // Create model directory
    const modelDir = join(process.cwd(), 'models', modelId);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    // Save model configuration
    const configPath = join(modelDir, 'config.json');
    writeFileSync(configPath, JSON.stringify(model, null, 2));

    logger.info('Custom model created', {
      modelId,
      name,
      type,
      baseModel,
    });

    this.metrics.recordMetric('ai.model.created', 1, {
      type,
      baseModel,
    });

    return model;
  }

  /**
   * Start fine-tuning a model
   */
  public async startFineTuning(
    modelId: string,
    trainingDataPath: string,
    validationDataPath?: string
  ): Promise<TrainingJob> {
    const model = this.customModels.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const jobId = hash({ modelId, trainingDataPath, timestamp: Date.now() });

    const job: TrainingJob = {
      id: jobId,
      modelId,
      status: 'queued',
      progress: 0,
      currentEpoch: 0,
      totalEpochs: model.fineTuningConfig.epochs,
      metrics: {
        loss: [],
        accuracy: [],
        validationLoss: [],
        validationAccuracy: [],
      },
      config: {
        datasetPath: trainingDataPath,
        outputPath: join(process.cwd(), 'models', modelId, 'checkpoints'),
        hyperparameters: model.fineTuningConfig,
      },
      logs: [],
    };

    this.trainingJobs.set(jobId, job);

    // Update model status
    model.status = 'training';
    model.updatedAt = new Date();

    // Start training (simulated)
    setTimeout(() => {
      this.executeTrainingJob(jobId);
    }, 1000);

    logger.info('Fine-tuning started', {
      jobId,
      modelId,
      trainingDataPath,
    });

    this.metrics.recordMetric('ai.training.started', 1, {
      modelId,
      modelType: model.type,
    });

    return job;
  }

  /**
   * Process multi-modal input
   */
  public async processMultiModal(
    input: MultiModalInput,
    options: {
      modelId?: string;
      outputFormat?: 'text' | 'structured' | 'complete';
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<MultiModalOutput> {
    const startTime = Date.now();

    try {
      return await this.gracefulDegradation.executeAIOperation(
        'multimodal',
        async () => {
          // Determine appropriate model
          const modelId = options.modelId || this.selectBestModel(input);
          const model = this.customModels.get(modelId);

          if (!model || model.status !== 'ready') {
            throw new Error(`Model ${modelId} not available`);
          }

          // Process each modality
          const results: Partial<MultiModalOutput> = {};

          // Text processing
          if (input.text) {
            results.text = await this.processText(input.text, model, options);
          }

          // Image processing
          if (input.image) {
            results.image = await this.processImage(input.image, model);
          }

          // Audio processing
          if (input.audio) {
            results.audio = await this.processAudio(input.audio, model);
          }

          const processingTime = Date.now() - startTime;

          const output: MultiModalOutput = {
            ...results,
            analysis: {
              confidence: this.calculateOverallConfidence(results),
              processingTime,
              modelUsed: modelId,
              metadata: {
                inputTypes: Object.keys(input).filter(k => k !== 'metadata'),
                outputTypes: Object.keys(results),
              },
            },
          };

          // Cache result
          const cacheKey = `multimodal:${hash(input)}`;
          await this.cache.set(cacheKey, output, { ttl: 3600 });

          this.metrics.recordMetric('ai.multimodal.processed', 1, {
            modelId,
            inputTypes: output.analysis.metadata?.inputTypes?.join(','),
            processingTime,
          });

          return output;
        },
        {
          query: JSON.stringify(input),
          fallbackData: this.getMultiModalFallback(input),
        }
      );

    } catch (error) {
      logger.error('Multi-modal processing failed', error as Error, {
        inputTypes: Object.keys(input).filter(k => k !== 'metadata'),
      });

      this.metrics.recordMetric('ai.multimodal.error', 1, {
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Create AI workflow
   */
  public async createWorkflow(
    name: string,
    description: string,
    steps: AIWorkflow['steps'],
    triggers: AIWorkflow['triggers']
  ): Promise<AIWorkflow> {
    const workflowId = hash({ name, steps, timestamp: Date.now() });

    const workflow: AIWorkflow = {
      id: workflowId,
      name,
      description,
      steps,
      triggers,
      status: 'active',
      metrics: {
        totalRuns: 0,
        successRate: 100,
        averageExecutionTime: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.workflows.set(workflowId, workflow);

    logger.info('AI workflow created', {
      workflowId,
      name,
      steps: steps.length,
      triggers: triggers.length,
    });

    this.metrics.recordMetric('ai.workflow.created', 1, {
      steps: steps.length,
      triggers: triggers.length,
    });

    return workflow;
  }

  /**
   * Execute AI workflow
   */
  public async executeWorkflow(
    workflowId: string,
    input: Record<string, any>
  ): Promise<{
    success: boolean;
    output?: Record<string, any>;
    error?: string;
    executionTime: number;
    stepResults: Array<{
      stepId: string;
      success: boolean;
      output?: any;
      error?: string;
      duration: number;
    }>;
  }> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const startTime = Date.now();
    const stepResults: any[] = [];
    let currentData = input;

    try {
      // Execute steps in dependency order
      const sortedSteps = this.sortStepsByDependencies(workflow.steps);

      for (const step of sortedSteps) {
        const stepStartTime = Date.now();

        try {
          const stepOutput = await this.executeWorkflowStep(step, currentData);
          const stepDuration = Date.now() - stepStartTime;

          stepResults.push({
            stepId: step.id,
            success: true,
            output: stepOutput,
            duration: stepDuration,
          });

          // Update current data with step output
          currentData = { ...currentData, ...stepOutput };

        } catch (error) {
          const stepDuration = Date.now() - stepStartTime;

          stepResults.push({
            stepId: step.id,
            success: false,
            error: (error as Error).message,
            duration: stepDuration,
          });

          throw error;
        }
      }

      const executionTime = Date.now() - startTime;

      // Update workflow metrics
      workflow.metrics.totalRuns++;
      workflow.metrics.lastRun = new Date();
      workflow.metrics.averageExecutionTime = 
        (workflow.metrics.averageExecutionTime + executionTime) / 2;

      logger.info('Workflow executed successfully', {
        workflowId,
        executionTime,
        steps: stepResults.length,
      });

      this.metrics.recordMetric('ai.workflow.executed', 1, {
        workflowId,
        success: true,
        executionTime,
      });

      return {
        success: true,
        output: currentData,
        executionTime,
        stepResults,
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Update workflow metrics
      workflow.metrics.totalRuns++;
      const successCount = workflow.metrics.totalRuns * (workflow.metrics.successRate / 100);
      workflow.metrics.successRate = (successCount / workflow.metrics.totalRuns) * 100;

      logger.error('Workflow execution failed', error as Error, {
        workflowId,
        executionTime,
      });

      this.metrics.recordMetric('ai.workflow.executed', 1, {
        workflowId,
        success: false,
        executionTime,
        error: (error as Error).message,
      });

      return {
        success: false,
        error: (error as Error).message,
        executionTime,
        stepResults,
      };
    }
  }

  /**
   * Get model metrics and status
   */
  public getModelMetrics(modelId?: string): CustomModel | CustomModel[] {
    if (modelId) {
      const model = this.customModels.get(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }
      return model;
    }

    return Array.from(this.customModels.values());
  }

  /**
   * Get training job status
   */
  public getTrainingJob(jobId: string): TrainingJob | undefined {
    return this.trainingJobs.get(jobId);
  }

  /**
   * Get all workflows
   */
  public getWorkflows(): AIWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Setup default models
   */
  private setupDefaultModels(): void {
    // Create default text generation model
    this.createCustomModel(
      'todo-assistant',
      'text_generation',
      'gpt-3.5-turbo',
      {
        learningRate: 0.0001,
        batchSize: 16,
        epochs: 10,
        maxTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
      }
    );

    // Create default classification model
    this.createCustomModel(
      'task-classifier',
      'text_classification',
      'bert-base-uncased',
      {
        learningRate: 0.00005,
        batchSize: 32,
        epochs: 5,
        maxTokens: 512,
        temperature: 0.1,
        topP: 0.8,
      }
    );

    logger.info('Default AI models created');
  }

  /**
   * Execute training job (simulated)
   */
  private async executeTrainingJob(jobId: string): Promise<void> {
    const job = this.trainingJobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.startedAt = new Date();
    job.estimatedTimeRemaining = job.totalEpochs * 60000; // 1 minute per epoch

    // Simulate training progress
    for (let epoch = 1; epoch <= job.totalEpochs; epoch++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds per epoch simulation

      job.currentEpoch = epoch;
      job.progress = (epoch / job.totalEpochs) * 100;

      // Simulate improving metrics
      const loss = Math.max(0.1, 2.0 - (epoch * 0.15) + (Math.random() * 0.1));
      const accuracy = Math.min(0.95, 0.5 + (epoch * 0.04) + (Math.random() * 0.02));

      job.metrics.loss.push(loss);
      job.metrics.accuracy.push(accuracy);
      job.metrics.validationLoss.push(loss + 0.1);
      job.metrics.validationAccuracy.push(accuracy - 0.05);

      job.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Epoch ${epoch}/${job.totalEpochs} - Loss: ${loss.toFixed(4)}, Accuracy: ${accuracy.toFixed(4)}`,
      });

      job.estimatedTimeRemaining = (job.totalEpochs - epoch) * 60000;
    }

    job.status = 'completed';
    job.completedAt = new Date();
    job.progress = 100;

    // Update model status
    const model = this.customModels.get(job.modelId);
    if (model) {
      model.status = 'ready';
      model.metrics = {
        accuracy: job.metrics.accuracy[job.metrics.accuracy.length - 1],
        lossValue: job.metrics.loss[job.metrics.loss.length - 1],
      };
      model.updatedAt = new Date();
    }

    logger.info('Training job completed', {
      jobId,
      modelId: job.modelId,
      epochs: job.totalEpochs,
      finalAccuracy: model?.metrics.accuracy,
    });
  }

  /**
   * Process text input
   */
  private async processText(
    text: string,
    model: CustomModel,
    options: any
  ): Promise<string> {
    // Simulate text processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return `Processed text: ${text.substring(0, 100)}...`;
  }

  /**
   * Process image input
   */
  private async processImage(
    image: MultiModalInput['image'],
    model: CustomModel
  ): Promise<MultiModalOutput['image']> {
    // Simulate image processing
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      url: image?.url || 'processed_image_url',
      description: 'A processed image with detected objects',
      objects: [
        {
          label: 'object',
          confidence: 0.85,
          boundingBox: { x: 10, y: 10, width: 100, height: 100 },
        },
      ],
    };
  }

  /**
   * Process audio input
   */
  private async processAudio(
    audio: MultiModalInput['audio'],
    model: CustomModel
  ): Promise<MultiModalOutput['audio']> {
    // Simulate audio processing
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      transcript: 'Transcribed audio content',
      sentiment: 'positive',
      language: 'en',
      confidence: 0.92,
    };
  }

  /**
   * Select best model for input
   */
  private selectBestModel(input: MultiModalInput): string {
    const availableModels = Array.from(this.customModels.values())
      .filter(model => model.status === 'ready');

    if (availableModels.length === 0) {
      throw new Error('No models available');
    }

    // Simple selection logic - in production, use more sophisticated matching
    return availableModels[0].id;
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(results: Partial<MultiModalOutput>): number {
    const confidences: number[] = [];

    if (results.image?.objects) {
      confidences.push(...results.image.objects.map(obj => obj.confidence));
    }

    if (results.audio?.confidence) {
      confidences.push(results.audio.confidence);
    }

    // Add text confidence if available
    confidences.push(0.8); // Default text confidence

    return confidences.length > 0 ? 
      confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length : 0.5;
  }

  /**
   * Get multi-modal fallback
   */
  private getMultiModalFallback(input: MultiModalInput): any {
    return {
      text: input.text ? `Fallback processing: ${input.text}` : undefined,
      analysis: {
        confidence: 0.3,
        processingTime: 0,
        modelUsed: 'fallback',
      },
    };
  }

  /**
   * Sort workflow steps by dependencies
   */
  private sortStepsByDependencies(steps: AIWorkflow['steps']): AIWorkflow['steps'] {
    const sorted: AIWorkflow['steps'] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (step: AIWorkflow['steps'][0]) => {
      if (visiting.has(step.id)) {
        throw new Error(`Circular dependency detected: ${step.id}`);
      }
      if (visited.has(step.id)) {
        return;
      }

      visiting.add(step.id);

      // Visit dependencies first
      for (const depId of step.dependencies) {
        const depStep = steps.find(s => s.id === depId);
        if (depStep) {
          visit(depStep);
        }
      }

      visiting.delete(step.id);
      visited.add(step.id);
      sorted.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return sorted;
  }

  /**
   * Execute workflow step
   */
  private async executeWorkflowStep(
    step: AIWorkflow['steps'][0],
    input: Record<string, any>
  ): Promise<Record<string, any>> {
    switch (step.type) {
      case 'preprocess':
        return this.executePreprocessStep(step, input);
        
      case 'model_inference':
        return this.executeModelInferenceStep(step, input);
        
      case 'postprocess':
        return this.executePostprocessStep(step, input);
        
      case 'validation':
        return this.executeValidationStep(step, input);
        
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executePreprocessStep(
    step: AIWorkflow['steps'][0],
    input: Record<string, any>
  ): Promise<Record<string, any>> {
    // Simulate preprocessing
    await new Promise(resolve => setTimeout(resolve, 50));
    return { preprocessed: true, ...input };
  }

  private async executeModelInferenceStep(
    step: AIWorkflow['steps'][0],
    input: Record<string, any>
  ): Promise<Record<string, any>> {
    if (!step.modelId) {
      throw new Error('Model ID required for inference step');
    }

    const model = this.customModels.get(step.modelId);
    if (!model || model.status !== 'ready') {
      throw new Error(`Model ${step.modelId} not available`);
    }

    // Simulate model inference
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      inference_result: `Result from ${model.name}`,
      confidence: 0.85,
      ...input,
    };
  }

  private async executePostprocessStep(
    step: AIWorkflow['steps'][0],
    input: Record<string, any>
  ): Promise<Record<string, any>> {
    // Simulate postprocessing
    await new Promise(resolve => setTimeout(resolve, 30));
    return { postprocessed: true, ...input };
  }

  private async executeValidationStep(
    step: AIWorkflow['steps'][0],
    input: Record<string, any>
  ): Promise<Record<string, any>> {
    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 20));
    
    const isValid = Math.random() > 0.1; // 90% validation success rate
    if (!isValid) {
      throw new Error('Validation failed');
    }
    
    return { validated: true, ...input };
  }

  /**
   * Start training monitoring
   */
  private startTrainingMonitoring(): void {
    this.trainingInterval = setInterval(() => {
      const activeJobs = Array.from(this.trainingJobs.values())
        .filter(job => job.status === 'running');

      logger.debug('Training monitoring', {
        activeJobs: activeJobs.length,
        totalJobs: this.trainingJobs.size,
      });

      // Update metrics
      this.metrics.recordMetric('ai.training.active_jobs', activeJobs.length);

    }, 30000); // Every 30 seconds
  }

  /**
   * Start workflow execution monitoring
   */
  private startWorkflowExecution(): void {
    this.workflowInterval = setInterval(async () => {
      // Check for scheduled workflows
      const now = new Date();
      
      for (const workflow of this.workflows.values()) {
        if (workflow.status !== 'active') continue;

        for (const trigger of workflow.triggers) {
          if (trigger.type === 'schedule') {
            // Check if workflow should run based on schedule
            const shouldRun = this.shouldRunScheduledWorkflow(trigger, workflow);
            if (shouldRun) {
              try {
                await this.executeWorkflow(workflow.id, {});
              } catch (error) {
                logger.error('Scheduled workflow execution failed', error as Error, {
                  workflowId: workflow.id,
                });
              }
            }
          }
        }
      }

    }, 60000); // Every minute
  }

  /**
   * Check if scheduled workflow should run
   */
  private shouldRunScheduledWorkflow(
    trigger: AIWorkflow['triggers'][0],
    workflow: AIWorkflow
  ): boolean {
    // Simple schedule checking - in production, use a proper scheduler
    const now = new Date();
    const lastRun = workflow.metrics.lastRun;
    
    if (!lastRun) return true;
    
    const timeSinceLastRun = now.getTime() - lastRun.getTime();
    const interval = trigger.config.interval || 3600000; // Default 1 hour
    
    return timeSinceLastRun >= interval;
  }

  /**
   * Shutdown AI manager
   */
  public shutdown(): void {
    if (this.trainingInterval) {
      clearInterval(this.trainingInterval);
      this.trainingInterval = undefined;
    }

    if (this.workflowInterval) {
      clearInterval(this.workflowInterval);
      this.workflowInterval = undefined;
    }

    logger.info('Advanced AI manager shutdown completed');
  }
}

/**
 * AI processing middleware
 */
export function createAIMiddleware() {
  const aiManager = AdvancedAIManager.getInstance();

  return (context: any) => {
    // Add AI context
    context.ai = {
      processMultiModal: aiManager.processMultiModal.bind(aiManager),
      createModel: aiManager.createCustomModel.bind(aiManager),
      startTraining: aiManager.startFineTuning.bind(aiManager),
      executeWorkflow: aiManager.executeWorkflow.bind(aiManager),
      getModelMetrics: aiManager.getModelMetrics.bind(aiManager),
    };
  };
}