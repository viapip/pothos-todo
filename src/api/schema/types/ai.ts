import { builder } from '../builder.js';

// Define all AI-related types in one place to avoid duplication

export const CompletionTimePredictionType = builder.objectRef<any>('CompletionTimePrediction').implement({
  fields: (t) => ({
    estimatedHours: t.float({
      resolve: (prediction) => prediction.estimatedHours,
      description: 'Estimated hours to complete the task',
    }),
    confidence: t.float({
      resolve: (prediction) => prediction.confidence,
      description: 'Confidence level of the prediction (0-1)',
    }),
    factors: t.stringList({
      resolve: (prediction) => prediction.factors,
      description: 'Factors affecting the time estimate',
    }),
  }),
});

export const PrioritySuggestionType = builder.objectRef<any>('PrioritySuggestion').implement({
  fields: (t) => ({
    suggestedPriority: t.string({
      resolve: (suggestion) => suggestion.suggestedPriority,
      description: 'Suggested priority level',
    }),
    reasoning: t.string({
      resolve: (suggestion) => suggestion.reasoning,
      description: 'Explanation for the suggestion',
    }),
    confidence: t.float({
      resolve: (suggestion) => suggestion.confidence,
      description: 'Confidence level of the suggestion (0-1)',
    }),
  }),
});

export const TaskComplexityAnalysisType = builder.objectRef<any>('TaskComplexityAnalysis').implement({
  fields: (t) => ({
    complexity: t.string({
      resolve: (analysis) => analysis.complexity,
      description: 'Complexity level: simple, moderate, or complex',
    }),
    requiredSkills: t.stringList({
      resolve: (analysis) => analysis.requiredSkills,
      description: 'Skills required to complete the task',
    }),
    dependencies: t.stringList({
      resolve: (analysis) => analysis.dependencies,
      description: 'Potential dependencies or blockers',
    }),
    risks: t.stringList({
      resolve: (analysis) => analysis.risks,
      description: 'Potential risks associated with the task',
    }),
  }),
});

export const NextActionsPredictionType = builder.objectRef<any>('NextActionsPrediction').implement({
  fields: (t) => ({
    suggestedNextTasks: t.stringList({
      resolve: (prediction) => prediction.suggestedNextTasks,
      description: 'Suggested next tasks to create',
    }),
    reasoning: t.string({
      resolve: (prediction) => prediction.reasoning,
      description: 'Reasoning behind the suggestions',
    }),
  }),
});

export const RAGSourceType = builder.objectRef<any>('RAGSource').implement({
  fields: (t) => ({
    id: t.string({
      resolve: (source) => source.id,
    }),
    title: t.string({
      resolve: (source) => source.title,
    }),
    relevanceScore: t.float({
      resolve: (source) => source.relevanceScore,
    }),
  }),
});

export const RAGResponseType = builder.objectRef<any>('RAGResponse').implement({
  fields: (t) => ({
    answer: t.string({
      resolve: (response) => response.answer,
      description: 'AI-generated answer to the query',
    }),
    sources: t.field({
      type: [RAGSourceType],
      resolve: (response) => response.sources,
      description: 'Source todos used to generate the answer',
    }),
    confidence: t.float({
      resolve: (response) => response.confidence,
      description: 'Confidence score of the answer (0-1)',
    }),
  }),
});

export const UserInsightsType = builder.objectRef<any>('UserInsights').implement({
  fields: (t) => ({
    productivity: t.string({
      resolve: (insights) => insights.productivity,
      description: 'Overall productivity assessment',
    }),
    patterns: t.stringList({
      resolve: (insights) => insights.patterns,
      description: 'Observed patterns in user tasks',
    }),
    recommendations: t.stringList({
      resolve: (insights) => insights.recommendations,
      description: 'Actionable recommendations',
    }),
  }),
});

export const TaskExplanationType = builder.objectRef<any>('TaskExplanation').implement({
  fields: (t) => ({
    explanation: t.string({
      resolve: (explanation) => explanation.explanation,
      description: 'Clear explanation of the task',
    }),
    breakdown: t.stringList({
      resolve: (explanation) => explanation.breakdown,
      description: 'Subtasks or steps to complete',
    }),
    estimatedTime: t.string({
      resolve: (explanation) => explanation.estimatedTime,
      description: 'Estimated time to complete',
    }),
    difficulty: t.string({
      resolve: (explanation) => explanation.difficulty,
      description: 'Task difficulty level',
    }),
  }),
});

export const NLPCommandResultType = builder.objectRef<any>('NLPCommandResult').implement({
  fields: (t) => ({
    success: t.boolean({
      resolve: (result) => result.success,
      description: 'Whether the command was executed successfully',
    }),
    action: t.string({
      resolve: (result) => result.action,
      description: 'The action that was performed (create, update, complete, delete, list)',
    }),
    entity: t.string({
      resolve: (result) => result.entity,
      description: 'The entity type that was affected (todo, todoList)',
    }),
    result: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (result) => result.result || null,
      description: 'The result of the command execution',
    }),
    error: t.string({
      nullable: true,
      resolve: (result) => result.error || null,
      description: 'Error message if the command failed',
    }),
    confidence: t.float({
      resolve: (result) => result.confidence,
      description: 'Confidence score of the NLP parsing (0-1)',
    }),
    needsClarification: t.boolean({
      nullable: true,
      resolve: (result) => result.needsClarification || null,
      description: 'Whether the command needs clarification',
    }),
    clarificationMessage: t.string({
      nullable: true,
      resolve: (result) => result.clarificationMessage || null,
      description: 'Message asking for clarification',
    }),
  }),
});

export const NLPSuggestionType = builder.objectRef<any>('NLPSuggestion').implement({
  fields: (t) => ({
    suggestions: t.stringList({
      resolve: (result) => result.suggestions,
      description: 'List of suggested task titles',
    }),
  }),
});

export const TodoWithPredictionsType = builder.objectRef<any>('TodoWithPredictions').implement({
  fields: (t) => ({
    todo: t.prismaField({
      type: 'Todo',
      resolve: (query, result) => result.todo,
    }),
    predictedCompletionTime: t.field({
      type: CompletionTimePredictionType,
      nullable: true,
      resolve: (result) => result.predictedCompletionTime,
    }),
    suggestedPriority: t.field({
      type: PrioritySuggestionType,
      nullable: true,
      resolve: (result) => result.suggestedPriority,
    }),
  }),
});