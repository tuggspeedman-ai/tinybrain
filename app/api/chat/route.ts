import { NextRequest } from 'next/server';
import { withX402Streaming } from '@/lib/x402-streaming';
import { streamChat, type ChatMessage } from '@/lib/tinychat-client';
import { streamDaydreams } from '@/lib/daydreams-client';
import { callBlockRun } from '@/lib/blockrun-client';
import {
  shouldEscalateByKeyword,
  shouldEscalateByComplexity,
  DEFAULT_ESCALATION_PROVIDER,
  type ModelType,
  type EscalationReason,
} from '@/lib/router';
import { verifySessionToken } from '@/lib/session-token';
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

    // Phase 1: Check keyword escalation (checked first, acts as override)
    const lastUserMessage = messages.findLast(m => m.role === 'user')?.content || '';
    const keywordEscalation = shouldEscalateByKeyword(lastUserMessage);

    if (keywordEscalation) {
      // Keyword override: skip TinyChat entirely, go straight to BlockRun
      console.log(`[Router] Keyword escalation triggered for: "${lastUserMessage.slice(0, 50)}..."`);
      const model: ModelType = DEFAULT_ESCALATION_PROVIDER;
      const escalationReason: EscalationReason = 'keyword';

      if (model === 'blockrun') {
        const blockRunResult = await callBlockRun(messages);
        const streamSource = (async function* () {
          if (blockRunResult.reasoningContent) {
            yield { content: `<think>${blockRunResult.reasoningContent}</think>`, done: false };
          }
          if (blockRunResult.content) {
            yield { content: blockRunResult.content, done: false };
          }
          yield { content: '', done: true };
        })();
        return createStreamResponse(streamSource, model, escalationReason, sessionToken ?? undefined);
      }
      return createStreamResponse(streamDaydreams(messages), model, escalationReason, sessionToken ?? undefined);
    }

    // Phase 2: Rule-based complexity check
    // Detects math, code, factual, reasoning, translation queries that TinyChat can't handle
    const complexityEscalation = shouldEscalateByComplexity(lastUserMessage);
    if (complexityEscalation) {
      console.log(`[Router] Complexity escalation triggered for: "${lastUserMessage.slice(0, 50)}..."`);
      const model: ModelType = DEFAULT_ESCALATION_PROVIDER;
      const escalationReason: EscalationReason = 'complexity';

      if (model === 'blockrun') {
        const blockRunResult = await callBlockRun(messages);
        const streamSource = (async function* () {
          if (blockRunResult.reasoningContent) {
            yield { content: `<think>${blockRunResult.reasoningContent}</think>`, done: false };
          }
          if (blockRunResult.content) {
            yield { content: blockRunResult.content, done: false };
          }
          yield { content: '', done: true };
        })();
        return createStreamResponse(streamSource, model, escalationReason, sessionToken ?? undefined);
      }
      return createStreamResponse(streamDaydreams(messages), model, escalationReason, sessionToken ?? undefined);
    }

    // No escalation needed — stream from TinyChat directly
    console.log(`[Router] Routing to TinyChat (no escalation triggers)`);
    const tinychatStream = streamChat({ messages });

    const encoder = new TextEncoder();
    const capturedSessionToken = sessionToken;
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const model: ModelType = 'tinychat';
          const escalationReason: EscalationReason = 'none';

          for await (const chunk of tinychatStream) {
            // Skip perplexity event (still emitted by TinyChat engine, just not used for routing)
            if (chunk.perplexity !== undefined) continue;

            if (chunk.done) {
              const doneData = JSON.stringify({
                content: '', model, escalationReason,
                ...(capturedSessionToken ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS } : {}),
              });
              controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
              return;
            }

            const data = JSON.stringify({
              content: chunk.content, model, escalationReason,
              ...(capturedSessionToken ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS } : {}),
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
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
  sessionToken?: string,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamSource) {
          if (chunk.done) {
            const doneData = JSON.stringify({
              content: '', model, escalationReason,
              ...(sessionToken ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS } : {}),
            });
            controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          const data = JSON.stringify({
            content: chunk.content, model, escalationReason,
            ...(sessionToken ? { queryCost: SESSION_PRICING.QUERY_COST_CENTS } : {}),
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
    // skip x402 payment (token is HMAC-signed, no server state needed)
    httpServer.onProtectedRequest(async (context) => {
      const sessionToken = context.adapter.getHeader('x-session-token');
      if (!sessionToken) return; // No session token — continue to x402 payment flow

      const tokenData = verifySessionToken(sessionToken);
      if (!tokenData) {
        return { abort: true, reason: 'Invalid or expired session' };
      }

      // Valid signed token — grant access without x402 payment
      console.log(`[Session] Granting access for ${tokenData.walletAddress} (deposit: ${tokenData.depositCents}¢)`);
      return { grantAccess: true };
    });
  },
);
