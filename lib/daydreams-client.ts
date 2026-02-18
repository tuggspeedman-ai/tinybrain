import { wrapFetchWithPayment } from 'x402-fetch';
import { treasuryWallet } from './treasury';
import type { ChatMessage, ChatStreamChunk } from './tinychat-client';

// Correct API endpoint (api-beta, not router)
const DAYDREAMS_URL = 'https://api-beta.daydreams.systems/v1/chat/completions';

// Default model - Claude Sonnet 4 via Daydreams (claude-3-5-sonnet not available)
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-20250514';

// System message for concise responses
const SYSTEM_MESSAGE: ChatMessage = {
  role: 'system',
  content: 'You are a helpful AI assistant. Keep your responses concise and focused.',
};

// maxValue: $0.02 in micro-USDC (Daydreams charges $0.01)
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const fetchWithPayment = wrapFetchWithPayment(fetch, treasuryWallet as any, BigInt(20000));

export async function* streamDaydreams(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL
): AsyncGenerator<ChatStreamChunk> {
  const messagesWithSystem = [SYSTEM_MESSAGE, ...messages];

  console.log(`[Daydreams] Starting request with model: ${model}`);

  const response = await fetchWithPayment(DAYDREAMS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: messagesWithSystem,
      stream: true,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Daydreams] Error ${response.status}: ${errorText}`);
    throw new Error(`Daydreams error: ${response.status} - ${errorText}`);
  }

  console.log(`[Daydreams] Got response, starting stream...`);

  // Parse SSE stream (OpenAI format)
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        yield { content: '', done: true };
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          console.log(`[Daydreams] Chunk: ${content.slice(0, 50)}...`);
          yield { content, done: false };
        }
      } catch {
        // Skip non-JSON lines
        console.log(`[Daydreams] Skipping non-JSON: ${data.slice(0, 50)}`);
      }
    }
  }

  yield { content: '', done: true };
}
