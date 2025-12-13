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

export function shouldEscalate(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return ESCALATION_KEYWORDS.some(keyword => lowerQuery.includes(keyword));
}

// Primary: Hyperbolic (working), Daydreams (endpoint not yet deployed)
export type EscalationProvider = 'daydreams' | 'hyperbolic';
export type ModelType = 'nanochat' | 'daydreams' | 'hyperbolic';

// Default escalation provider - Hyperbolic is working, Daydreams endpoint returns 404
export const DEFAULT_ESCALATION_PROVIDER: EscalationProvider = 'hyperbolic';
