import { NextRequest } from 'next/server';
import { withX402 } from 'x402-next';
import { streamChat, type ChatMessage } from '@/lib/nanochat-client';

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

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChat({ messages })) {
            if (chunk.done) {
              // Send done signal
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
              return;
            }

            // Send content chunk in SSE format
            const data = JSON.stringify({ content: chunk.content });
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

// Wrap with x402 payment protection
// Payment settles only after successful response (status < 400)
export const POST = withX402(
  handler,
  TREASURY_ADDRESS,
  {
    price: "$0.01",
    network: "base-sepolia",
    config: {
      description: "Chat with NanoBrain AI",
      mimeType: "text/event-stream",
    },
  }
);
