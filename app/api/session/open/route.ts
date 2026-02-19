import { NextRequest } from 'next/server';
import { verifyTypedData } from 'viem';
import { authorizationTypes } from '@x402/evm';
import { sessionStore, type DepositAuth } from '@/lib/session-store';
import {
  SESSION_PRICING,
  USDC_EIP712_DOMAIN,
  usdcBaseUnitsToCents,
} from '@/lib/session-pricing';

export const runtime = 'nodejs';

const TREASURY_ADDRESS = (process.env.TREASURY_ADDRESS as `0x${string}`).toLowerCase();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, depositAuth } = body as {
      walletAddress: string;
      depositAuth: DepositAuth;
    };

    // --- Validate request body ---
    if (!walletAddress || !depositAuth?.authorization || !depositAuth?.signature) {
      return Response.json(
        { error: 'walletAddress and depositAuth (authorization + signature) are required' },
        { status: 400 },
      );
    }

    const { authorization } = depositAuth;

    // Validate deposit goes to our treasury
    if (authorization.to.toLowerCase() !== TREASURY_ADDRESS) {
      return Response.json(
        { error: 'Deposit authorization must be payable to the treasury address' },
        { status: 400 },
      );
    }

    // Validate signer matches claimed wallet
    if (authorization.from.toLowerCase() !== walletAddress.toLowerCase()) {
      return Response.json(
        { error: 'Authorization "from" must match walletAddress' },
        { status: 400 },
      );
    }

    // Validate deposit meets minimum
    const depositCents = usdcBaseUnitsToCents(authorization.value);
    if (depositCents < SESSION_PRICING.MIN_DEPOSIT_CENTS) {
      return Response.json(
        { error: `Minimum deposit is $${(SESSION_PRICING.MIN_DEPOSIT_CENTS / 100).toFixed(2)}` },
        { status: 400 },
      );
    }

    // Validate auth is not expired
    const validBefore = Number(authorization.validBefore);
    if (validBefore <= Math.floor(Date.now() / 1000)) {
      return Response.json(
        { error: 'Deposit authorization has expired' },
        { status: 400 },
      );
    }

    // Check for existing active session
    const existing = sessionStore.getSessionByWallet(walletAddress as `0x${string}`);
    if (existing) {
      return Response.json(
        { error: 'An active session already exists for this wallet. Close it first.' },
        { status: 409 },
      );
    }

    // Verify EIP-3009 signature
    const isValid = await verifyTypedData({
      address: authorization.from as `0x${string}`,
      domain: USDC_EIP712_DOMAIN,
      types: authorizationTypes,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from as `0x${string}`,
        to: authorization.to as `0x${string}`,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
      signature: depositAuth.signature,
    });

    if (!isValid) {
      return Response.json(
        { error: 'Invalid deposit authorization signature' },
        { status: 401 },
      );
    }

    // Create session
    const session = sessionStore.createSession(
      walletAddress as `0x${string}`,
      depositAuth,
      depositCents,
    );

    return Response.json({
      sessionId: session.id,
      sessionToken: session.token,
      depositCents: session.depositAmount,
      maxQueries: Math.floor(session.depositAmount / SESSION_PRICING.QUERY_COST_CENTS),
    });
  } catch (error) {
    console.error('[Session Open] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
