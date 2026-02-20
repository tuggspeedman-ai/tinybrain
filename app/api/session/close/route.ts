import { NextRequest } from 'next/server';
import { verifyTypedData } from 'viem';
import { authorizationTypes, eip3009ABI } from '@x402/evm';
import type { DepositAuth } from '@/lib/session-store';
import { verifySessionToken } from '@/lib/session-token';
import { treasuryWallet, publicClient } from '@/lib/treasury';
import { USDC_ADDRESS, USDC_EIP712_DOMAIN } from '@/lib/session-pricing';

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

    // Verify the signed session token (stateless — no database lookup)
    const tokenData = verifySessionToken(sessionToken);
    if (!tokenData) {
      return Response.json({ error: 'Invalid or expired session token' }, { status: 401 });
    }

    let settlementTx: string | null = null;

    if (settlementAuth?.authorization && settlementAuth?.signature) {
      const { authorization } = settlementAuth;

      // Validate recipient is treasury
      if (authorization.to.toLowerCase() !== TREASURY_ADDRESS) {
        return Response.json(
          { error: 'Settlement must be payable to the treasury address' },
          { status: 400 },
        );
      }

      // Validate signer matches session wallet
      if (authorization.from.toLowerCase() !== tokenData.walletAddress.toLowerCase()) {
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

      // Submit settlement auth on-chain
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
      console.log(`[Session Close] Settled for ${tokenData.walletAddress}: ${txHash}`);
    } else {
      console.log(`[Session Close] Zero-cost close for ${tokenData.walletAddress}`);
    }

    return Response.json({ settlementTx });
  } catch (error) {
    console.error('[Session Close] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
