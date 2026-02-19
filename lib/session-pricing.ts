// USDC on Base mainnet
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const USDC_DECIMALS = 6;

// EIP-712 domain for USDC on Base mainnet (used for transferWithAuthorization signatures)
export const USDC_EIP712_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 8453,
  verifyingContract: USDC_ADDRESS,
} as const;

export const SESSION_PRICING = {
  QUERY_COST_CENTS: 1,                     // $0.01 per query (same as pay-per-request)
  MIN_DEPOSIT_CENTS: 10,                   // $0.10 minimum deposit
  DEPOSIT_PRESETS_CENTS: [10, 25, 50] as const,  // $0.10, $0.25, $0.50
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,     // 30 minutes of inactivity
} as const;

/** Convert cents to USDC base units (6 decimals). e.g. 7 cents → "70000" */
export function centsToUsdcBaseUnits(cents: number): string {
  // 1 cent = $0.01 = 10000 base units (USDC has 6 decimals)
  return String(cents * 10000);
}

/** Convert USDC base units to cents. e.g. "250000" → 25 cents */
export function usdcBaseUnitsToCents(baseUnits: string): number {
  return Math.floor(Number(baseUnits) / 10000);
}
