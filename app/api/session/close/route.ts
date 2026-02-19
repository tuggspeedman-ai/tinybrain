import { NextRequest } from 'next/server';
import { verifyTypedData } from 'viem';
import { authorizationTypes, eip3009ABI } from '@x402/evm';
import { sessionStore, type DepositAuth } from '@/lib/session-store';
import { treasuryWallet, publicClient } from '@/lib/treasury';
import {
  USDC_ADDRESS,
  USDC_EIP712_DOMAIN,
  centsToUsdcBaseUnits,
} from '@/lib/session-pricing';

export const runtime = 'nodejs';

const TREASURY_ADDRESS = (process.env.TREASURY_ADDRESS as `0x${string}`).toLowerCase();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionToken, settlementAuth } = body as {
      sessionToken: string;
      settlementAuth?: DepositAuth;
    };

    if (!sessionToken) {
      return Response.json({ error: 'sessionToken is required' }, { status: 400 });
    }

    // Look up session
    const session = sessionStore.getSessionByToken(sessionToken);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.status !== 'active') {
      return Response.json(
        { error: `Session is already ${session.status}` },
        { status: 409 },
      );
    }

    const { totalCostCents } = session;
    let settlementTx: string | null = null;

    if (totalCostCents > 0) {
      // Require settlement auth for non-zero usage
      if (!settlementAuth?.authorization || !settlementAuth?.signature) {
        return Response.json(
          {
            error: 'settlementAuth required for non-zero usage',
            totalCostCents,
            expectedValueBaseUnits: centsToUsdcBaseUnits(totalCostCents),
          },
          { status: 400 },
        );
      }

      const { authorization } = settlementAuth;

      // Validate settlement amount matches tracked usage
      const expectedBaseUnits = centsToUsdcBaseUnits(totalCostCents);
      if (authorization.value !== expectedBaseUnits) {
        return Response.json(
          {
            error: 'Settlement amount does not match tracked usage',
            expectedValueBaseUnits: expectedBaseUnits,
            providedValueBaseUnits: authorization.value,
            totalCostCents,
          },
          { status: 400 },
        );
      }

      // Validate recipient is treasury
      if (authorization.to.toLowerCase() !== TREASURY_ADDRESS) {
        return Response.json(
          { error: 'Settlement must be payable to the treasury address' },
          { status: 400 },
        );
      }

      // Validate signer matches session wallet
      if (authorization.from.toLowerCase() !== session.walletAddress.toLowerCase()) {
        return Response.json(
          { error: 'Settlement signer must match session wallet' },
          { status: 400 },
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
        signature: settlementAuth.signature,
      });

      if (!isValid) {
        return Response.json(
          { error: 'Invalid settlement authorization signature' },
          { status: 401 },
        );
      }

      // Submit settlement auth on-chain (bytes signature overload)
      const txHash = await treasuryWallet.writeContract({
        address: USDC_ADDRESS,
        abi: eip3009ABI,
        functionName: 'transferWithAuthorization',
        args: [
          authorization.from as `0x${string}`,
          authorization.to as `0x${string}`,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce as `0x${string}`,
          settlementAuth.signature,
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return Response.json(
          { error: 'On-chain settlement transaction failed' },
          { status: 500 },
        );
      }

      settlementTx = txHash;
      console.log(`[Session Close] Settled ${totalCostCents}¢ for session ${session.id}: ${txHash}`);
    }

    // Mark session closed (discards deposit auth)
    sessionStore.closeSession(sessionToken);

    // Build receipt
    const breakdown = buildBreakdown(session);
    const durationSeconds = Math.round((Date.now() - session.createdAt) / 1000);

    return Response.json({
      receipt: {
        sessionId: session.id,
        duration: durationSeconds,
        queries: session.usage.length,
        breakdown,
        totalCostCents,
        depositCents: session.depositAmount,
        settlementTx,
      },
    });
  } catch (error) {
    console.error('[Session Close] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

function buildBreakdown(session: { usage: Array<{ model: string; cost: number }> }) {
  const byModel = new Map<string, { count: number; totalCost: number }>();
  for (const entry of session.usage) {
    const existing = byModel.get(entry.model) ?? { count: 0, totalCost: 0 };
    existing.count += 1;
    existing.totalCost += entry.cost;
    byModel.set(entry.model, existing);
  }
  return [...byModel.entries()].map(([model, stats]) => ({
    model,
    count: stats.count,
    totalCost: stats.totalCost,
  }));
}
