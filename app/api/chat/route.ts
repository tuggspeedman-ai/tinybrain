import { NextRequest } from 'next/server';
import { withX402Streaming } from '@/lib/x402-streaming';
import { streamChat, type ChatMessage } from '@/lib/tinychat-client';
import { streamDaydreams } from '@/lib/daydreams-client';
import { streamBlockRun } from '@/lib/blockrun-client';
import {
  shouldEscalateByKeyword,
  shouldEscalateByPerplexity,
  PERPLEXITY_THRESHOLD,
  DEFAULT_ESCALATION_PROVIDER,
  type ModelType,
  type EscalationReason,
} from '@/lib/router';
import { sessionStore } from '@/lib/session-store';
import { SESSION_PRICING } from '@/lib/session-pricing';

export const runtime = 'nodejs';

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS as `0x${string}`;

// The actual chat handler
async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const messages: ChatMessage[] = body.messages;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Session mode: check for session token (bar tab)
    const sessionToken = request.headers.get('x-session-token');
    let session = sessionToken ? sessionStore.getSessionByToken(sessionToken) : undefined;

    // Phase 1: Check keyword escalation (checked first, acts as override)
    const lastUserMessage = messages.findLast(m => m.role === 'user')?.content || '';
    const keywordEscalation = shouldEscalateByKeyword(lastUserMessage);

    if (keywordEscalation) {
      // Keyword override: skip TinyChat entirely, go straight to BlockRun
      console.log(`[Router] Keyword escalation triggered for: "${lastUserMessage.slice(0, 50)}..."`);
      const model: ModelType = DEFAULT_ESCALATION_PROVIDER;
      const escalationReason: EscalationReason = 'keyword';

      // Track usage in session mode
      if (sessionToken && session) {
        sessionStore.addUsage(sessionToken, {
          model,
          cost: SESSION_PRICING.QUERY_COST_CENTS,
          escalationReason,
        });
        session = sessionStore.getSessionByToken(sessionToken);
      }

      const streamSource = model === 'blockrun'
        ? streamBlockRun(messages)
        : streamDaydreams(messages);
      return createStreamResponse(streamSource, model, escalationReason, undefined, session);
    }

    // Phase 2: Two-phase perplexity routing
    // Start TinyChat stream, read perplexity from first event, decide whether to continue or escalate
    console.log(`[Router] Starting TinyChat stream for perplexity check...`);
    const tinychatStream = streamChat({ messages });

    const encoder = new TextEncoder();
    const capturedSessionToken = sessionToken;
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let model: ModelType = 'tinychat';
          let escalationReason: EscalationReason = 'none';
          let perplexityValue: number | undefined;
          let escalated = false;
          let usageTracked = false;

          for await (const chunk of tinychatStream) {
            // Check for perplexity event (first SSE event from TinyChat)
            if (chunk.perplexity !== undefined) {
              perplexityValue = chunk.perplexity;
              console.log(`[Router] TinyChat perplexity: ${perplexityValue} (threshold: ${PERPLEXITY_THRESHOLD})`);

              if (shouldEscalateByPerplexity(perplexityValue)) {
                // Perplexity too high — abort TinyChat, switch to BlockRun
                console.log(`[Router] Perplexity escalation: ${perplexityValue} > ${PERPLEXITY_THRESHOLD}`);
                model = DEFAULT_ESCALATION_PROVIDER;
                escalationReason = 'perplexity';
                escalated = true;

                // Track usage in session mode (escalated to BlockRun)
                if (capturedSessionToken && !usageTracked) {
                  sessionStore.addUsage(capturedSessionToken, {
                    model,
                    cost: SESSION_PRICING.QUERY_COST_CENTS,
                    escalationReason,
                  });
                  usageTracked = true;
                }

                break; // Exit TinyChat stream loop
              }
              // Perplexity OK — continue streaming from TinyChat
              continue;
            }

            // Track usage on first content chunk (TinyChat happy path)
            if (!usageTracked && chunk.content && capturedSessionToken) {
              sessionStore.addUsage(capturedSessionToken, {
                model: 'tinychat',
                cost: SESSION_PRICING.QUERY_COST_CENTS,
                escalationReason: 'none',
              });
              usageTracked = true;
            }

            if (chunk.done) {
              const sessionUsage = capturedSessionToken
                ? sessionStore.getSessionByToken(capturedSessionToken)?.totalCostCents
                : undefined;
              const doneData = JSON.stringify({
                content: '', model, escalationReason, perplexity: perplexityValue,
                ...(capturedSessionToken ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS, sessionUsage } : {}),
              });
              controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
              return;
            }

            // Forward TinyChat content to client
            const sessionUsage = capturedSessionToken
              ? sessionStore.getSessionByToken(capturedSessionToken)?.totalCostCents
              : undefined;
            const data = JSON.stringify({
              content: chunk.content, model, escalationReason, perplexity: perplexityValue,
              ...(capturedSessionToken ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS, sessionUsage } : {}),
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          if (escalated) {
            // Stream from BlockRun instead
            const blockRunStream = model === 'blockrun'
              ? streamBlockRun(messages)
              : streamDaydreams(messages);

            for await (const chunk of blockRunStream) {
              if (chunk.done) {
                const sessionUsage = capturedSessionToken
                  ? sessionStore.getSessionByToken(capturedSessionToken)?.totalCostCents
                  : undefined;
                const doneData = JSON.stringify({
                  content: '', model, escalationReason, perplexity: perplexityValue,
                  ...(capturedSessionToken ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS, sessionUsage } : {}),
                });
                controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                controller.close();
                return;
              }

              const sessionUsage = capturedSessionToken
                ? sessionStore.getSessionByToken(capturedSessionToken)?.totalCostCents
                : undefined;
              const data = JSON.stringify({
                content: chunk.content, model, escalationReason, perplexity: perplexityValue,
                ...(capturedSessionToken ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS, sessionUsage } : {}),
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          // Fallback close if stream ended without done signal
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorData = JSON.stringify({ error: errorMessage });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Helper: create a streaming response from a generator (used for keyword escalation path)
function createStreamResponse(
  streamSource: AsyncGenerator<{ content: string; done: boolean }>,
  model: ModelType,
  escalationReason: EscalationReason,
  perplexity?: number,
  session?: { totalCostCents: number } | undefined,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamSource) {
          if (chunk.done) {
            const doneData = JSON.stringify({
              content: '', model, escalationReason,
              ...(session ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS, sessionUsage: session.totalCostCents } : {}),
            });
            controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          const data = JSON.stringify({
            content: chunk.content, model, escalationReason,
            ...(session ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS, sessionUsage: session.totalCostCents } : {}),
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorData = JSON.stringify({ error: errorMessage });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Wrap with streaming-compatible x402 payment protection
// Uses Coinbase facilitator (requires CDP_API_KEY_ID and CDP_API_KEY_SECRET env vars)
// Fire-and-forget settlement to avoid blocking the stream
// onSetup registers the session bypass hook for bar tab mode
export const POST = withX402Streaming(
  handler,
  TREASURY_ADDRESS,
  {
    price: "$0.01",
    network: "eip155:8453",
    config: {
      description: "Chat with TinyBrain AI",
      mimeType: "text/event-stream",
    },
  },
  (httpServer) => {
    // Register session bypass hook: requests with valid X-SESSION-TOKEN
    // skip x402 payment and are served from the session's deposit
    httpServer.onProtectedRequest(async (context) => {
      const sessionToken = context.adapter.getHeader('x-session-token');
      if (!sessionToken) return; // No session token — continue to x402 payment flow

      const session = sessionStore.getSessionByToken(sessionToken);
      if (!session || session.status !== 'active') {
        return { abort: true, reason: 'Invalid or expired session' };
      }

      if (!sessionStore.hasAvailableBalance(sessionToken)) {
        return { abort: true, reason: 'Session deposit exhausted' };
      }

      // Valid session with available balance — grant access without x402 payment
      console.log(`[Session] Granting access for session ${session.id} (${session.totalCostCents}¢ / ${session.depositAmount}¢)`);
      return { grantAccess: true };
    });
  },
);
