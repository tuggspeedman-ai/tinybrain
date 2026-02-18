const ESCALATION_KEYWORDS = [
  'think hard',
  'use advanced',
  'be smart',
  'reason carefully',
  'complex',
  'difficult',
  'challenging',
  'deep thinking',
];

// Perplexity threshold for automatic escalation
// Queries with perplexity above this value are routed to BlockRun
// Start conservative (~80), tune empirically based on calibration data
export const PERPLEXITY_THRESHOLD = 80;

export type EscalationReason = 'keyword' | 'perplexity' | 'none';

export function shouldEscalateByKeyword(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return ESCALATION_KEYWORDS.some(keyword => lowerQuery.includes(keyword));
}

export function shouldEscalateByPerplexity(perplexity: number): boolean {
  return perplexity > PERPLEXITY_THRESHOLD;
}

// Keep backward-compatible export
export function shouldEscalate(query: string): boolean {
  return shouldEscalateByKeyword(query);
}

// Escalation providers for advanced queries
// BlockRun: x402 per-token pricing (~$0.001/query for DeepSeek R1)
// Daydreams: x402 payment validation currently broken (returns 401 even with valid signatures)
export type EscalationProvider = 'blockrun' | 'daydreams';
export type ModelType = 'tinychat' | 'blockrun' | 'daydreams';

// Default escalation provider - BlockRun handles x402 via SDK
export const DEFAULT_ESCALATION_PROVIDER: EscalationProvider = 'blockrun';
