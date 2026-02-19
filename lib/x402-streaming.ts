import { NextRequest } from 'next/server';
import { x402ResourceServer, x402HTTPResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { facilitator as coinbaseFacilitatorConfig } from '@coinbase/x402';

interface RouteConfig {
  price: string;
  network: string;
  config?: {
    description?: string;
    mimeType?: string;
  };
}

/**
 * Streaming-compatible x402 v2 wrapper.
 *
 * Unlike the standard withX402 from @x402/next, this wrapper returns the
 * streaming response IMMEDIATELY and settles payment asynchronously.
 *
 * This is necessary because withX402 awaits settlePayment() before returning,
 * which blocks streaming responses until blockchain settlement completes.
 *
 * Uses Coinbase's CDP facilitator (requires CDP_API_KEY_ID and CDP_API_KEY_SECRET env vars).
 */
export function withX402Streaming(
  handler: (request: NextRequest) => Promise<Response>,
  payTo: `0x${string}`,
  routeConfig: RouteConfig,
  onSetup?: (httpServer: x402HTTPResourceServer) => void,
): (request: NextRequest) => Promise<Response> {

  // Create facilitator client using Coinbase CDP config
  const facilitatorClient = new HTTPFacilitatorClient(coinbaseFacilitatorConfig);

  // Create resource server and register EVM exact scheme
  const resourceServer = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(resourceServer);

  // Create HTTP resource server with route config
  const httpServer = new x402HTTPResourceServer(resourceServer, {
    accepts: {
      scheme: 'exact',
      network: routeConfig.network as `${string}:${string}`,
      payTo,
      price: routeConfig.price,
    },
    description: routeConfig.config?.description ?? '',
    mimeType: routeConfig.config?.mimeType ?? 'application/json',
  });

  // Allow caller to register hooks (e.g. session bypass via onProtectedRequest)
  if (onSetup) {
    onSetup(httpServer);
  }

  let initialized = false;

  return async function wrappedHandler(request: NextRequest): Promise<Response> {
    // Lazy initialization (fetches facilitator supported kinds)
    if (!initialized) {
      await httpServer.initialize();
      initialized = true;
    }

    // Process request through x402 v2
    const result = await httpServer.processHTTPRequest({
      adapter: {
        getHeader: (name: string) => request.headers.get(name) ?? undefined,
        getMethod: () => request.method.toUpperCase(),
        getPath: () => request.nextUrl.pathname,
        getUrl: () => `${request.nextUrl.protocol}//${request.nextUrl.host}${request.nextUrl.pathname}`,
        getAcceptHeader: () => request.headers.get('accept') ?? '',
        getUserAgent: () => request.headers.get('user-agent') ?? '',
      },
      path: request.nextUrl.pathname,
      method: request.method.toUpperCase(),
      // v2 uses PAYMENT-SIGNATURE, with X-PAYMENT fallback for v1 clients
      paymentHeader: request.headers.get('payment-signature')
                  ?? request.headers.get('x-payment')
                  ?? undefined,
    });

    if (result.type === 'payment-error') {
      const { response } = result;
      return new Response(
        typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
        {
          status: response.status,
          headers: response.headers as Record<string, string>,
        }
      );
    }

    if (result.type === 'no-payment-required') {
      return handler(request);
    }

    // payment-verified: call handler, then settle asynchronously
    const { paymentPayload, paymentRequirements, declaredExtensions } = result;

    const response = await handler(request);

    if (response.status >= 400) {
      return response;  // Don't settle failed requests
    }

    // FIRE-AND-FORGET: Settle payment asynchronously without blocking response
    httpServer.processSettlement(paymentPayload, paymentRequirements, declaredExtensions)
      .then(settleResult => {
        if (settleResult.success) {
          console.log(`[x402] Payment settled: ${settleResult.transaction}`);
        } else {
          console.error(`[x402] Settlement failed: ${settleResult.errorReason}`);
        }
      })
      .catch(err => console.error('[x402] Settlement error:', err));

    // Return streaming response IMMEDIATELY
    return response;
  };
}
