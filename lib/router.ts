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

export type EscalationReason = 'keyword' | 'complexity' | 'none';

export function shouldEscalateByKeyword(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return ESCALATION_KEYWORDS.some(keyword => lowerQuery.includes(keyword));
}

// --- Rule-based query complexity classification ---
// Detects queries that a 561M-param model will likely hallucinate on.
// Runs before TinyChat to avoid wasting a round-trip.

// Self-referential bypass: questions TinyChat knows from SFT training.
// These should ALWAYS go to TinyChat, even if they match complexity patterns.
const SELF_REFERENTIAL_PATTERN = /\b(tinychat|tinybrain|tiny chat|tiny brain|jonathan avni|avni|your (name|creator|parameters?|model|training|architecture|size|weights?)|who (made|built|created|trained) you|about yourself|tell me about you|what are you|who are you|how many parameters|how big are you)\b/i;

// Math: equations, arithmetic operators between numbers, math keywords
const MATH_PATTERN = /\d+\s*[×x*\/÷+\-^%]\s*\d+|\b(calculate|compute|solve|equation|integral|derivative|factorial|sqrt|logarithm|algebra|geometry|trigonometry|probability|statistics)\b/i;

// Code: programming keywords, code blocks, syntax patterns
const CODE_PATTERN = /```|\b(function|class|import|export|const|let|var|def|return|async|await|console\.log|print\(|for\s*\(|while\s*\(|if\s*\(|=>|interface|type\s+\w+\s*=)\b/i;

// Factual: questions about real-world knowledge TinyChat doesn't have
const FACTUAL_PATTERN = /\b(who is|who was|what is the capital|when did|where is|how many|how much|what year|in what year|population of|president of|founded in|invented|discovered|history of|explain how|how does .+ work)\b/i;

// Reasoning: multi-step logic, comparisons, analysis
const REASONING_PATTERN = /\b(compare|contrast|analyze|evaluate|pros and cons|advantages|disadvantages|step by step|explain why|what would happen|if .+ then|implications|trade-?offs|differences? between)\b/i;

// Multi-part: numbered lists, multiple questions in one query
const MULTIPART_PATTERN = /(\d+\.\s+.+\n\d+\.\s+)|(^.+\?\s+.+\?)/m;

// Translation / foreign language requests
const TRANSLATION_PATTERN = /\b(translate|translation|in (spanish|french|german|chinese|japanese|korean|arabic|russian|portuguese|italian|hindi|esperanto|latin))\b/i;

// Long queries (>200 chars) are more likely to be complex
const LONG_QUERY_THRESHOLD = 200;

export function shouldEscalateByComplexity(query: string): boolean {
  // Self-referential queries stay on TinyChat (it knows about itself from SFT)
  if (SELF_REFERENTIAL_PATTERN.test(query)) return false;
  if (MATH_PATTERN.test(query)) return true;
  if (CODE_PATTERN.test(query)) return true;
  if (FACTUAL_PATTERN.test(query)) return true;
  if (REASONING_PATTERN.test(query)) return true;
  if (MULTIPART_PATTERN.test(query)) return true;
  if (TRANSLATION_PATTERN.test(query)) return true;
  if (query.length > LONG_QUERY_THRESHOLD) return true;
  return false;
}

// Escalation providers for advanced queries
// BlockRun: x402 per-token pricing (~$0.001/query for DeepSeek R1)
// Daydreams: x402 payment validation currently broken (returns 401 even with valid signatures)
export type EscalationProvider = 'blockrun' | 'daydreams';
export type ModelType = 'tinychat' | 'blockrun' | 'daydreams';

// Default escalation provider - BlockRun handles x402 via SDK
export const DEFAULT_ESCALATION_PROVIDER: EscalationProvider = 'blockrun';
