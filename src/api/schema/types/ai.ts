import { builder } from '../builder.js';

// AI Insight Types
export const ProductivityInsight = builder.objectType('ProductivityInsight', {
  fields: (t) => ({
    id: t.exposeString('id'),
    type: t.exposeString('type'),
    title: t.exposeString('title'),
    description: t.exposeString('description'),
    impact: t.exposeString('impact'),
    confidence: t.exposeFloat('confidence'),
    actionable: t.exposeBoolean('actionable'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

export const WorkPatternAnalysis = builder.objectType('WorkPatternAnalysis', {
  fields: (t) => ({
    peakHours: t.exposeStringList('peakHours'),
    mostProductiveDays: t.exposeStringList('mostProductiveDays'),
    averageTasksPerSession: t.exposeFloat('averageTasksPerSession'),
    completionPatterns: t.expose('completionPatterns', { type: 'JSON' }),
    breakdownByPriority: t.expose('breakdownByPriority', { type: 'JSON' }),
    trends: t.expose('trends', { type: 'JSON' }),
  }),
});

export const SmartRecommendation = builder.objectType('SmartRecommendation', {
  fields: (t) => ({
    id: t.exposeString('id'),
    type: t.exposeString('type'),
    title: t.exposeString('title'),
    description: t.exposeString('description'),
    priority: t.exposeString('priority'),
    estimatedImpact: t.exposeString('estimatedImpact'),
    implementation: t.exposeString('implementation'),
    confidence: t.exposeFloat('confidence'),
  }),
});

export const BurnoutRiskAssessment = builder.objectType('BurnoutRiskAssessment', {
  fields: (t) => ({
    riskLevel: t.exposeString('riskLevel'),
    score: t.exposeFloat('score'),
    factors: t.exposeStringList('factors'),
    recommendations: t.exposeStringList('recommendations'),
    earlyWarnings: t.exposeStringList('earlyWarnings'),
    lastAssessment: t.expose('lastAssessment', { type: 'DateTime' }),
  }),
});

// ML Prediction Types
export const CompletionTimePrediction = builder.objectType('CompletionTimePrediction', {
  fields: (t) => ({
    estimatedHours: t.exposeFloat('estimatedHours'),
    confidence: t.exposeFloat('confidence'),
    factors: t.exposeStringList('factors'),
    similarTasks: t.expose('similarTasks', { type: 'JSON' }),
    reasoning: t.exposeString('reasoning'),
  }),
});

export const PrioritySuggestion = builder.objectType('PrioritySuggestion', {
  fields: (t) => ({
    suggestedPriority: t.exposeString('suggestedPriority'),
    currentPriority: t.exposeString('currentPriority'),
    confidence: t.exposeFloat('confidence'),
    reasoning: t.exposeString('reasoning'),
    urgencyIndicators: t.exposeStringList('urgencyIndicators'),
  }),
});

export const ComplexityAnalysis = builder.objectType('ComplexityAnalysis', {
  fields: (t) => ({
    complexityScore: t.exposeFloat('complexityScore'),
    level: t.exposeString('level'),
    factors: t.exposeStringList('factors'),
    breakdown: t.expose('breakdown', { type: 'JSON' }),
    suggestedApproach: t.exposeString('suggestedApproach'),
  }),
});

// Task Analysis Types
export const TaskAnalysisResult = builder.objectType('TaskAnalysisResult', {
  fields: (t) => ({
    todoId: t.exposeString('todoId'),
    predictions: t.field({
      type: 'JSON',
      resolve: (analysis) => ({
        completionTime: analysis.predictions.completionTime,
        prioritySuggestion: analysis.predictions.prioritySuggestion,
        complexityAnalysis: analysis.predictions.complexityAnalysis,
      }),
    }),
    insights: t.field({
      type: 'JSON',
      resolve: (analysis) => ({
        semanticSimilarity: analysis.insights.semanticSimilarity,
        relatedTasks: analysis.insights.relatedTasks,
        autoTags: analysis.insights.autoTags,
      }),
    }),
    recommendations: t.field({
      type: 'JSON',
      resolve: (analysis) => ({
        nextActions: analysis.recommendations.nextActions,
        optimizations: analysis.recommendations.optimizations,
        scheduling: analysis.recommendations.scheduling,
      }),
    }),
  }),
});

// Productivity Report Types
export const ProductivitySummary = builder.objectType('ProductivitySummary', {
  fields: (t) => ({
    completionRate: t.exposeFloat('completionRate'),
    averageTasksPerDay: t.exposeFloat('averageTasksPerDay'),
    productivityTrend: t.exposeString('productivityTrend'),
  }),
});

export const UserProductivityReport = builder.objectType('UserProductivityReport', {
  fields: (t) => ({
    summary: t.field({
      type: ProductivitySummary,
      resolve: (report) => report.summary,
    }),
    insights: t.field({
      type: [ProductivityInsight],
      resolve: (report) => report.insights || [],
    }),
    patterns: t.field({
      type: WorkPatternAnalysis,
      nullable: true,
      resolve: (report) => report.patterns,
    }),
    recommendations: t.field({
      type: [SmartRecommendation],
      resolve: (report) => report.recommendations || [],
    }),
    burnoutRisk: t.field({
      type: BurnoutRiskAssessment,
      nullable: true,
      resolve: (report) => report.burnoutRisk,
    }),
  }),
});

// Task Scheduling Types
export const TaskRecommendation = builder.objectType('TaskRecommendation', {
  fields: (t) => ({
    todo: t.field({
      type: 'Todo',
      resolve: (rec) => rec.todo,
    }),
    estimatedTime: t.exposeFloat('estimatedTime', { nullable: true }),
    reasoning: t.exposeString('reasoning'),
    suggestedDay: t.exposeString('suggestedDay', { nullable: true }),
  }),
});

export const SchedulingSuggestions = builder.objectType('SchedulingSuggestions', {
  fields: (t) => ({
    todayRecommendations: t.field({
      type: [TaskRecommendation],
      resolve: (suggestions) => suggestions.todayRecommendations || [],
    }),
    weeklyPlan: t.field({
      type: [TaskRecommendation],
      resolve: (suggestions) => suggestions.weeklyPlan || [],
    }),
    optimizations: t.exposeStringList('optimizations'),
  }),
});

// AI Chat Types
export const ChatResponse = builder.objectType('ChatResponse', {
  fields: (t) => ({
    response: t.exposeString('response'),
    sources: t.field({
      type: 'JSON',
      resolve: (chat) => chat.sources,
    }),
    suggestions: t.exposeStringList('suggestions'),
    confidence: t.exposeFloat('confidence'),
  }),
});

// AI Service Health Types
export const AIServiceHealth = builder.objectType('AIServiceHealth', {
  fields: (t) => ({
    status: t.exposeString('status'),
    services: t.field({
      type: 'JSON',
      resolve: (health) => health.services,
    }),
    lastUpdate: t.expose('lastUpdate', { type: 'DateTime' }),
  }),
});

// Input Types for AI operations
export const AnalyzeTodoInput = builder.inputType('AnalyzeTodoInput', {
  fields: (t) => ({
    todoId: t.string({ required: true }),
    includeMLPredictions: t.boolean({ defaultValue: true }),
    includeEmbeddings: t.boolean({ defaultValue: true }),
    includeNLP: t.boolean({ defaultValue: true }),
  }),
});

export const ChatWithAIInput = builder.inputType('ChatWithAIInput', {
  fields: (t) => ({
    query: t.string({ required: true }),
    sessionId: t.string({ defaultValue: 'default' }),
    includeContext: t.boolean({ defaultValue: true }),
  }),
});

export const ProductivityReportInput = builder.inputType('ProductivityReportInput', {
  fields: (t) => ({
    includeInsights: t.boolean({ defaultValue: true }),
    includePatterns: t.boolean({ defaultValue: true }),
    includeBurnoutRisk: t.boolean({ defaultValue: true }),
    timeRange: t.string({ defaultValue: '30d' }),
  }),
});