import { NextRequest } from 'next/server';
import { withX402Streaming } from '@/lib/x402-streaming';
import { streamChat, type ChatMessage } from '@/lib/nanochat-client';
import { streamDaydreams } from '@/lib/daydreams-client';
import { streamHyperbolic } from '@/lib/hyperbolic-client';
import { shouldEscalate, DEFAULT_ESCALATION_PROVIDER, type ModelType } from '@/lib/router';

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

    // Determine routing based on escalation keywords
    const lastUserMessage = messages.findLast(m => m.role === 'user')?.content || '';
    const needsEscalation = shouldEscalate(lastUserMessage);

    let model: ModelType = 'nanochat';
    let streamSource;

    if (needsEscalation) {
      // Use Daydreams as primary, with Hyperbolic as fallback
      model = DEFAULT_ESCALATION_PROVIDER;
      streamSource = model === 'daydreams'
        ? streamDaydreams(messages)
        : streamHyperbolic(messages);
    } else {
      streamSource = streamChat({ messages });
    }

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamSource) {
            if (chunk.done) {
              // Send done signal
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
              return;
            }

            // Send content chunk in SSE format with model attribution
            const data = JSON.stringify({ content: chunk.content, model });
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// PayAI facilitator supports Base mainnet (no API keys needed)
const FACILITATOR_URL = "https://facilitator.payai.network";

// Wrap with streaming-compatible x402 payment protection
// Uses fire-and-forget settlement to avoid blocking the stream
export const POST = withX402Streaming(
  handler,
  TREASURY_ADDRESS,
  {
    price: "$0.01",
    network: "base",
    config: {
      description: "Chat with NanoBrain AI",
      mimeType: "text/event-stream",
    },
  },
  { url: FACILITATOR_URL }
);
