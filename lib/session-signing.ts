import type { WalletClient } from 'viem';

// USDC on Base mainnet (public, hardcoded for client-side use)
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const TREASURY_ADDRESS = '0xcAF6f4AF9C1DF98530E74A3eCbb88dF077CBBC87' as const;

// USDC EIP-712 domain on Base mainnet
const USDC_EIP712_DOMAIN = {
  name: 'USD Coin' as const,
  version: '2' as const,
  chainId: 8453,
  verifyingContract: USDC_ADDRESS,
};

// EIP-3009 TransferWithAuthorization types
// Duplicated here to avoid importing @x402/evm in client code
const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/** Convert cents to USDC base units (6 decimals). 25 cents → "250000" */
function centsToBaseUnits(cents: number): string {
  return String(cents * 10000);
}

/** Generate a random bytes32 hex nonce */
function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}

export interface Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

/**
 * Build an EIP-3009 authorization message for a deposit or settlement.
 * Valid for 1 hour from now.
 */
export function buildAuthorization(from: `0x${string}`, amountCents: number): Authorization {
  return {
    from,
    to: TREASURY_ADDRESS,
    value: centsToBaseUnits(amountCents),
    validAfter: '0',
    validBefore: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: randomNonce(),
  };
}

/**
 * Sign an EIP-3009 TransferWithAuthorization with the connected wallet.
 * Triggers a wallet popup (MetaMask/Coinbase Wallet).
 */
export async function signAuthorization(
  walletClient: WalletClient,
  authorization: Authorization,
): Promise<`0x${string}`> {
  return walletClient.signTypedData({
    account: authorization.from,
    domain: USDC_EIP712_DOMAIN,
    types: AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization' as const,
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });
}
