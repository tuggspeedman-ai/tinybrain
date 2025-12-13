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

// Escalation providers for advanced queries
// Hyperbolic: Works with x402, costs ~$0.10-0.15/request (DeepSeek R1)
// Daydreams: x402 payment validation currently broken (returns 401 even with valid signatures)
export type EscalationProvider = 'hyperbolic' | 'daydreams';
export type ModelType = 'nanochat' | 'hyperbolic' | 'daydreams';

// Default escalation provider - Hyperbolic works reliably
// (Daydreams x402 is broken - even their own SDK fails with "Invalid x402 payment")
export const DEFAULT_ESCALATION_PROVIDER: EscalationProvider = 'hyperbolic';
