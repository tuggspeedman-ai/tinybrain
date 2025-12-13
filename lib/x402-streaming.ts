import { NextRequest } from 'next/server';
import { useFacilitator } from 'x402/verify';
import { exact } from 'x402/schemes';
import {
  findMatchingPaymentRequirements,
  processPriceToAtomicAmount,
  toJsonSafe
} from 'x402/shared';
import { getAddress } from 'viem';
import { SupportedEVMNetworks } from 'x402/types';
import { facilitator as coinbaseFacilitator } from '@coinbase/x402';

interface RouteConfig {
  price: string;
  network: string;
  config?: {
    description?: string;
    mimeType?: string;
    maxTimeoutSeconds?: number;
  };
}

/**
 * Streaming-compatible x402 wrapper.
 *
 * Unlike the standard withX402 from x402-next, this wrapper returns the
 * streaming response IMMEDIATELY and settles payment asynchronously.
 *
 * This is necessary because withX402 awaits settlePayment() before returning,
 * which blocks streaming responses until blockchain settlement completes.
 *
 * Uses Coinbase's facilitator by default (requires CDP_API_KEY_ID and CDP_API_KEY_SECRET env vars).
 */
export function withX402Streaming(
  handler: (request: NextRequest) => Promise<Response>,
  payTo: `0x${string}`,
  routeConfig: RouteConfig
): (request: NextRequest) => Promise<Response> {

  // Use Coinbase's facilitator - reads CDP_API_KEY_ID and CDP_API_KEY_SECRET from env
  // Type assertion needed due to minor type mismatch between @coinbase/x402 and x402/verify
  // eslint-disable-next-line react-hooks/rules-of-hooks, @typescript-eslint/no-explicit-any
  const { verify, settle, supported } = useFacilitator(coinbaseFacilitator as any);
  const x402Version = 1;

  return async function wrappedHandler(request: NextRequest): Promise<Response> {
    const { price, network, config = {} } = routeConfig;
    const method = request.method.toUpperCase();
    const pathname = request.nextUrl.pathname;
    const resourceUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}${pathname}`;

    // Build payment requirements
    const paymentRequirements = await buildPaymentRequirements(
      payTo, price, network as typeof SupportedEVMNetworks[number], config, resourceUrl, method, supported
    );

    // Check for payment header
    const paymentHeader = request.headers.get('X-PAYMENT');
    if (!paymentHeader) {
      return new Response(
        JSON.stringify({
          x402Version,
          error: 'X-PAYMENT header is required',
          accepts: paymentRequirements
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Decode and verify payment
    let decodedPayment;
    try {
      decodedPayment = exact.evm.decodePayment(paymentHeader);
      decodedPayment.x402Version = x402Version;
    } catch {
      return new Response(
        JSON.stringify({ x402Version, error: 'Invalid payment', accepts: paymentRequirements }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const selectedRequirements = findMatchingPaymentRequirements(
      paymentRequirements, decodedPayment
    );
    if (!selectedRequirements) {
      return new Response(
        JSON.stringify({
          x402Version,
          error: 'No matching payment requirements',
          accepts: toJsonSafe(paymentRequirements)
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const verification = await verify(decodedPayment, selectedRequirements);
    if (!verification.isValid) {
      return new Response(
        JSON.stringify({
          x402Version,
          error: verification.invalidReason,
          accepts: paymentRequirements
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Call handler - returns streaming Response
    const response = await handler(request);

    if (response.status >= 400) {
      return response;  // Don't settle failed requests
    }

    // FIRE-AND-FORGET: Settle payment asynchronously without blocking response
    // The payment signature is already verified, so we can return immediately
    settle(decodedPayment, selectedRequirements)
      .then(result => {
        if (result.success) {
          console.log(`[x402] Payment settled: ${result.transaction}`);
        } else {
          console.error(`[x402] Settlement failed: ${result.errorReason}`);
        }
      })
      .catch(err => console.error('[x402] Settlement error:', err));

    // Return streaming response IMMEDIATELY
    return response;
  };
}

// Helper to build payment requirements (adapted from x402-next)
async function buildPaymentRequirements(
  payTo: string,
  price: string,
  network: typeof SupportedEVMNetworks[number],
  config: { description?: string; mimeType?: string; maxTimeoutSeconds?: number },
  resourceUrl: string,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _supported: () => Promise<{ kinds: Array<{ network: string; scheme: string; extra?: { feePayer?: string } }> }>
) {
  const { description, mimeType, maxTimeoutSeconds } = config;
  const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
  if ('error' in atomicAmountForAsset) {
    throw new Error(atomicAmountForAsset.error);
  }
  const { maxAmountRequired, asset } = atomicAmountForAsset;

  if (!SupportedEVMNetworks.includes(network as typeof SupportedEVMNetworks[number])) {
    throw new Error(`Unsupported network: ${network}`);
  }

  return [{
    scheme: 'exact' as const,
    network: network as typeof SupportedEVMNetworks[number],
    maxAmountRequired,
    resource: resourceUrl,
    description: description ?? '',
    mimeType: mimeType ?? 'application/json',
    payTo: getAddress(payTo),
    maxTimeoutSeconds: maxTimeoutSeconds ?? 300,
    asset: getAddress(asset.address),
    outputSchema: {
      input: { type: 'http' as const, method, discoverable: true },
      output: undefined
    },
    extra: 'eip712' in asset ? asset.eip712 : undefined
  }];
}
