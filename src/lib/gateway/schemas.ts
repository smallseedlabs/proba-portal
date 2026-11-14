import { z } from 'zod';

export const VERB_MODES = ['allow', 'ask', 'deny'] as const;
export const verbModeSchema = z.enum(VERB_MODES);
export type VerbMode = z.infer<typeof verbModeSchema>;

export const GUARDRAIL_LIMIT_KEYS = [
  'maxIterations',
  'maxLlmCalls',
  'maxToolCalls',
  'maxPromptTokens',
  'maxCompletionTokens',
  'maxTotalTokens',
  'maxCostUsd',
] as const;
export type GuardrailLimitKey = (typeof GUARDRAIL_LIMIT_KEYS)[number];

const limitsSchema = z
  .object({
    maxIterations: z.number().positive().optional(),
    maxLlmCalls: z.number().positive().optional(),
    maxToolCalls: z.number().positive().optional(),
    maxPromptTokens: z.number().positive().optional(),
    maxCompletionTokens: z.number().positive().optional(),
    maxTotalTokens: z.number().positive().optional(),
    maxCostUsd: z.number().positive().optional(),
  })
  .strict();

export const verbSnapshotSchema = z
  .object({
    name: z.string().min(1),
    locked: verbModeSchema,
    file: verbModeSchema.nullable(),
    env: verbModeSchema.nullable(),
    effective: verbModeSchema,
    allowedModes: z.array(verbModeSchema).min(1),
  })
  .strict();

export const guardrailsSnapshotSchema = z
  .object({
    schema: z.literal('proba.gateway-guardrails/v1-effective'),
    fileVersion: z.string(),
    version: z.string(),
    source: z.string(),
    writable: z.boolean(),
    lockedLimits: z.object({
      maxIterations: z.number().nullable(),
      maxLlmCalls: z.number().nullable(),
      maxToolCalls: z.number().nullable(),
      maxPromptTokens: z.number().nullable(),
      maxCompletionTokens: z.number().nullable(),
      maxTotalTokens: z.number().nullable(),
      maxCostUsd: z.number().nullable(),
    }),
    fileLimits: limitsSchema,
    envLimits: limitsSchema,
    effectiveLimits: limitsSchema,
    verbs: z.array(verbSnapshotSchema),
  })
  .strict();

export type GuardrailsSnapshot = z.infer<typeof guardrailsSnapshotSchema>;
export type VerbSnapshot = z.infer<typeof verbSnapshotSchema>;

export const guardrailsWriteSchema = z
  .object({
    schema: z.literal('proba.gateway-guardrails/v1').optional(),
    version: z.string().optional(),
    description: z.string().max(2000).optional(),
    verbs: z.record(z.string(), verbModeSchema).default({}),
    limits: limitsSchema.default({}),
  })
  .strict();

export type GuardrailsWrite = z.infer<typeof guardrailsWriteSchema>;
