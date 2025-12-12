/**
 * TypeScript client for the Nanochat inference API
 * Handles SSE streaming responses from the FastAPI server
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_k?: number;
}

export interface ChatStreamChunk {
  content: string;
  done: boolean;
}

const NANOCHAT_URL = process.env.NANOCHAT_URL || 'http://localhost:8000';

/**
 * Stream chat completion from Nanochat
 * Returns an async generator that yields content chunks
 */
export async function* streamChat(
  request: ChatRequest
): AsyncGenerator<ChatStreamChunk, void, unknown> {
  const response = await fetch(`${NANOCHAT_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      messages: request.messages,
      temperature: request.temperature ?? 0.8,
      max_tokens: request.max_tokens ?? 512,
      top_k: request.top_k ?? 50,
    }),
  });

  if (!response.ok) {
    throw new Error(`Nanochat API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        yield { content: '', done: true };
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE format: "data: {...}\n\n"
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '') continue;

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);

          // Check for stream end
          if (data === '[DONE]') {
            yield { content: '', done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            // Nanochat sends chunks with {"token": "..."} format
            const content = parsed.token ||
                           parsed.choices?.[0]?.delta?.content ||
                           parsed.choices?.[0]?.text ||
                           parsed.content ||
                           '';
            if (content) {
              yield { content, done: false };
            }
          } catch {
            // If not JSON, treat as raw content
            if (data && data !== '[DONE]') {
              yield { content: data, done: false };
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-streaming chat completion (waits for full response)
 */
export async function chat(request: ChatRequest): Promise<string> {
  let fullContent = '';

  for await (const chunk of streamChat(request)) {
    if (!chunk.done) {
      fullContent += chunk.content;
    }
  }

  return fullContent;
}

/**
 * Health check for Nanochat server
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${NANOCHAT_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
