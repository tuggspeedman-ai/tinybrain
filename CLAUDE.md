# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TinyBrain** is an AI inference service demonstrating the x402 protocol from both merchant and agent perspectives:
- **Merchant**: Accepts $0.01 USDC payments from users for queries
- **Agent**: Pays BlockRun.ai ~$0.001 for DeepSeek R1 when queries exceed TinyChat's confidence

The project uses a locally-trained 561M parameter model (TinyChat) with rule-based complexity classification that escalates complex queries (math, code, factual, reasoning) to more powerful models via x402 payments.

## Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production with Turbopack
- `npm run lint` - Run ESLint

### Related: TinyChat Inference Server
**Production (Modal)**: TinyChat runs on Modal serverless GPU
- Chat endpoint: `https://tuggspeedman-ai--tinychat-chat-completions.modal.run`
- Health endpoint: `https://tuggspeedman-ai--tinychat-health.modal.run`
- Cold start: ~10-15s, warm: ~2-3s latency
- T4 GPU, 5-minute idle timeout

**Local development** (optional): Run locally in `/Users/jonathanavni/Documents/Coding/nanochat`:
```bash
cd /Users/jonathanavni/Documents/Coding/nanochat/nanochat
source .venv/bin/activate
python -m scripts.chat_web --source sft --step 809  # Starts on localhost:8000
```

**Important**: Use `--step 809` to load the correct Phase 2 SFT checkpoint (TinyChat identity).

**Model info** (d20 architecture, 561M params):
- Checkpoint: `~/.cache/nanochat/chatsft_checkpoints/d20/model_000809.pt`
- MMLU accuracy: 35.2%, ARC-Easy: 46.8%
- Has SFT personality (knows it's TinyChat, built by Jonathan Avni) but limited factual knowledge

## Architecture

### System Components
```
Next.js App (this repo)
├── Frontend: Chat UI, wallet connection, payment mode selector
├── API Routes:
│   ├── /api/chat (dual-mode: x402 pay-per-request OR session token)
│   ├── /api/session/open (deposit auth → signed session token)
│   └── /api/session/close (settle usage on-chain)
│
├── Routing: Rule-based complexity classification + keyword override
│   ├── Keywords checked first (manual override → BlockRun)
│   ├── Complexity heuristics: math, code, factual, reasoning, translation, long queries
│   ├── Complex queries → skip TinyChat, route to BlockRun (server pays ~$0.001)
│   └── Simple queries → TinyChat handles directly (free for server)
│
├── TinyChat Service: Modal serverless GPU (T4)
│   └── https://tuggspeedman-ai--tinychat-chat-completions.modal.run
├── BlockRun.ai: DeepSeek R1 for escalation (~$0.001/query via x402)
├── Daydreams x402 API: Claude Sonnet 4 ($0.01/query) - BROKEN (401 errors, kept for future)
└── Coinbase CDP Facilitator: Payment verification/settlement (Base mainnet)
```

### Payment Modes

**Pay-per-request**: User signs x402 payment ($0.01) on every message. Uses `@x402/fetch` client wrapper.

**Bar Tab (session)**: User signs a deposit auth once, chats freely, settles at end. Session tokens are stateless HMAC-signed (no server-side state needed — works across Vercel serverless instances). Client tracks usage locally. Sessions persist to localStorage (keyed by wallet address) so users can resume/settle after page refresh or accidental close (within 1-hour token TTL).

### Request Flow
1. User sends message → Chat UI
2. **Pay-per-request**: x402 middleware returns 402 → User signs payment ($0.01) → Retries with PAYMENT-SIGNATURE header
   **Bar Tab**: Request includes X-SESSION-TOKEN header → Server validates HMAC token → Grants access
3. Server checks keyword escalation triggers first → if matched, route directly to BlockRun DeepSeek R1
4. If no keywords: checks rule-based complexity classification (math, code, factual, reasoning, translation, long queries)
   - Complex query → route to BlockRun DeepSeek R1 (server pays ~$0.001)
   - Simple query → stream from TinyChat (free for server)
5. Response streams back with model attribution badge

### Tech Stack
- **Framework**: Next.js 15 with Turbopack, React 19
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui (new-york style) with Lucide icons
- **Animations**: Framer Motion, tw-animate-css
- **Payments**: @x402/fetch (client), @x402/evm (EVM scheme), @coinbase/x402 (facilitator), custom x402-streaming wrapper
- **Escalation**: @blockrun/llm (DeepSeek R1 via x402, ~$0.001/query)
- **Wallet**: wagmi + viem (Base mainnet)
- **Markdown/Math**: react-markdown + remark-gfm + remark-math + rehype-katex (LaTeX rendering)

### Path Aliases
- `@/*` maps to the project root (configured in tsconfig.json)
- Components: `@/components` and `@/components/ui`
- Utilities: `@/lib/utils` (includes `cn()` for class merging)
- Hooks: `@/hooks`

### Key Files
- `app/api/chat/route.ts` - x402-protected chat endpoint with complexity-based routing ($0.01/query), dual-mode (x402 or session token)
- `app/api/session/open/route.ts` - Bar tab: validates deposit auth, returns HMAC-signed session token
- `app/api/session/close/route.ts` - Bar tab: verifies token, settles usage on-chain via EIP-3009
- `lib/tinychat-client.ts` - TypeScript client for TinyChat API with SSE streaming + perplexity parsing
- `lib/blockrun-client.ts` - BlockRun.ai x402 client for DeepSeek R1 escalation (~$0.001/query)
- `lib/daydreams-client.ts` - Daydreams Router client (not deployed yet, kept for future)
- `lib/router.ts` - Rule-based complexity classification + keyword escalation routing
- `lib/session-token.ts` - Stateless HMAC-signed session tokens (works across Vercel serverless instances, 1-hour TTL)
- `lib/session-storage.ts` - localStorage persistence for bar tab sessions (keyed by wallet address, auto-clears on expiry)
- `lib/session-signing.ts` - Client-side EIP-3009 signing utilities for deposit/settlement
- `lib/session-pricing.ts` - Pricing constants and USDC conversion utilities
- `lib/session-store.ts` - Session types (DepositAuth, UsageEntry, Session) — kept for type exports
- `lib/treasury.ts` - Server-side treasury wallet signer + publicClient
- `lib/x402-streaming.ts` - Custom streaming-compatible x402 wrapper (fire-and-forget settlement, onSetup hook)
- `lib/wagmi-config.ts` - Wallet configuration for Base mainnet
- `app/providers.tsx` - WagmiProvider + QueryClientProvider + ThemeProvider wrapper
- `components/wallet-connect.tsx` - Wallet connect/disconnect button
- `components/theme-toggle.tsx` - Dark/light mode toggle button
- `components/chat/chat-interface.tsx` - Chat UI with dual payment modes (per-request + bar tab)
- `components/chat/payment-mode-selector.tsx` - Payment mode chooser (per-request vs open a tab)
- `components/chat/session-bar.tsx` - Active session status bar (query count, cost, progress)
- `components/chat/session-receipt.tsx` - Settlement receipt modal with BaseScan tx link
- `components/chat/message-list.tsx` - Message display with avatars, model badges, cost, and scroll-to-bottom button
- `components/chat/message-content.tsx` - Markdown + LaTeX rendering and think block parsing
- `components/chat/think-block.tsx` - Collapsible reasoning block for DeepSeek R1
- `components/chat/message-input.tsx` - Auto-expanding textarea with gradient send button + stop button during streaming

## Escalation Routing

### Keyword-Based (manual override, checked first)
Queries containing these keywords skip TinyChat entirely and route directly to BlockRun (DeepSeek R1):
- "think hard", "use advanced", "be smart", "reason carefully"
- "complex", "difficult", "challenging", "deep thinking"

### Complexity-Based (automatic)
Rule-based heuristics detect queries that TinyChat (561M params) will likely hallucinate on. Checked after keywords, before starting TinyChat. Matching queries route directly to BlockRun DeepSeek R1.

Categories detected:
- **Math**: arithmetic (`42 * 42`), math keywords (calculate, solve, factorial, theorem, etc.), operations (multiply, divide, sum, average), advanced (matrix, vector, polynomial, exponent)
- **Code**: programming language names (python, javascript, rust, etc.), code terms (code, program, algorithm, debug, api, regex), syntax keywords (function, class, def, etc.), code blocks
- **Factual**: real-world knowledge questions (who is, what is the capital, when did, etc.)
- **Reasoning**: multi-step logic (compare, analyze, pros and cons, step by step, etc.)
- **Multi-part**: numbered lists, multiple questions in one query
- **Translation**: translate requests, foreign language references
- **Long queries**: >200 characters (more likely to be complex)
- **Self-referential bypass**: questions about TinyChat itself (creator, parameters, identity) always stay on TinyChat

**Note**: TinyChat still emits perplexity as the first SSE event, but it is no longer used for routing decisions. Perplexity was unreliable — the model confidently hallucinates on complex queries (all values 2-18, never triggering the threshold).

## Styling Conventions
- Uses OKLCH color space for CSS variables
- Theme colors defined in `app/globals.css` with light/dark mode support
- Dark mode uses `.dark` class variant
- Use `cn()` from `@/lib/utils` to merge Tailwind classes

## Environment Variables
```bash
# TinyChat inference server
# Use Modal (production) or local (development)
TINYCHAT_URL=https://tuggspeedman-ai--tinychat-chat-completions.modal.run
# TINYCHAT_URL=http://localhost:8000  # Uncomment for local development
TINYCHAT_API_KEY=...                         # API key for Modal authentication (required for production)

TREASURY_ADDRESS=0xcAF6f4AF9C1DF98530E74A3eCbb88dF077CBBC87  # Receives user payments
TREASURY_PRIVATE_KEY=0x...                   # For paying escalation providers (server-side)
CDP_API_KEY_ID=...                           # Coinbase Developer Platform API key ID
CDP_API_KEY_SECRET=...                       # Coinbase Developer Platform API key secret
```

### x402 Providers & Facilitators
- **Coinbase CDP Facilitator**: `https://api.cdp.coinbase.com/platform/v2/x402` (Base mainnet, requires CDP API keys)
- **BlockRun.ai**: DeepSeek R1 via `@blockrun/llm` SDK (~$0.001/query, handles x402 internally) - PRIMARY (working)
- **Daydreams**: `https://api-beta.daydreams.systems/v1/chat/completions` - BROKEN (x402 returns 401 even with valid signatures)
- **Hyperbolic**: Replaced by BlockRun.ai. `lib/hyperbolic-client.ts` deleted.

### Known Issues
- **Daydreams x402 broken**: Their x402 payment validation returns 401 "Invalid x402 payment" even with properly signed payments. Client kept in codebase for future testing.
- **BlockRun doesn't return reasoning_content**: DeepSeek R1's chain-of-thought reasoning is not exposed as a separate field by BlockRun SDK, so the collapsible think block doesn't appear.

### Future Enhancements
- **PayAI Facilitator Fallback**: Add `https://facilitator.payai.network` as fallback if CDP fails
- **Daydreams as alternative**: If Daydreams fixes their x402 ($0.01/query), could add as additional provider

### Remaining Work
See [tinybrain-updated-project-plan.md](tinybrain-updated-project-plan.md) for full plan details. Completed: Phases 1-6 (all items). Remaining:
- Rename GitHub repo from `nanobrain` to `tinybrain` and make public

---

## TinyChat Codebase Reference

This section documents the TinyChat project structure for deployment and integration work.

### Modal Deployment
TinyChat runs on Modal serverless GPU (T4) for production:
- **Chat endpoint**: `https://tuggspeedman-ai--tinychat-chat-completions.modal.run`
- **Health endpoint**: `https://tuggspeedman-ai--tinychat-health.modal.run`
- **Deploy command**: `cd /Users/jonathanavni/Documents/Coding/nanochat/nanochat && source .venv/bin/activate && modal deploy modal_app.py`
- **Cold start**: ~10-15s, warm: ~2-3s
- **Container idle timeout**: 5 minutes
- **Authentication**: Requires `X-API-Key` header (stored in Modal secret `tinychat-api-key`)

**Key Modal files**:
- `modal_app.py` - Modal deployment with T4 GPU, SSE streaming, API key auth
- Modal Volume `tinychat-checkpoints` - stores model weights and tokenizer
- Modal Secret `tinychat-api-key` - stores key as `NANOCHAT_API_KEY` env var (checked via `X-API-Key` header)

**URL Handling in TinyBrain** ([tinychat-client.ts:30-34](lib/tinychat-client.ts#L30-L34)):
- Modal URLs (contain `modal.run` or `chat-completions`) are used directly
- Local URLs get `/chat/completions` appended

### Location
- **Local path**: `/Users/jonathanavni/Documents/Coding/nanochat/nanochat`
- **Checkpoints**: `~/.cache/nanochat/chatsft_checkpoints/d20/model_000809.pt`
- **Model cache**: `~/.cache/nanochat/` (used by training scripts)

### Key Files for Deployment

| File | Purpose |
|------|---------|
| `scripts/chat_web.py` | FastAPI web server (the main entry point for serving) |
| `nanochat/engine.py` | Inference engine with KV cache, streaming generation |
| `nanochat/checkpoint_manager.py` | Model loading from checkpoints |
| `nanochat/tokenizer.py` | RustBPE tokenizer (uses tiktoken for inference) |
| `nanochat/common.py` | `get_base_dir()`, device detection utilities |
| `nanochat/gpt.py` | GPT model architecture |
| `pyproject.toml` | Dependencies (torch, fastapi, uvicorn, tiktoken, etc.) |
| `rustbpe/` | Rust BPE tokenizer (built with maturin) |

### Model Loading Flow

```python
# From modal_app.py (production):
from nanochat.checkpoint_manager import build_model
model, tokenizer, meta_data = build_model(
    checkpoint_dir=checkpoint_dir,
    step=809,  # Phase 2 SFT checkpoint (TinyChat identity)
    device=device,
    phase="eval"
)

# From chat_web.py (local dev):
# python -m scripts.chat_web --source sft --step 809

# Key paths (from get_base_dir() in common.py):
# - Default: ~/.cache/nanochat/
# - Override: NANOCHAT_BASE_DIR env var

# Checkpoint files needed:
# - model_000809.pt (~1.9GB) - Model weights
# - meta_000809.json (~1KB) - Model config
# - tokenizer/tokenizer.pkl (~846KB) - Tokenizer data
```

### Web Server API (chat_web.py)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Chat UI (serves ui.html) |
| `/chat/completions` | POST | Chat API (SSE streaming) |
| `/health` | GET | Health check with worker pool status |
| `/stats` | GET | Worker pool statistics |

**Request format** (POST /chat/completions):
```json
{
  "messages": [{"role": "user", "content": "Hello"}],
  "temperature": 0.8,
  "max_tokens": 512,
  "top_k": 50
}
```

**Response**: SSE stream:
- First event: `data: {"perplexity": 17.76}` (computed during prefill)
- Token events: `data: {"token": "...", "gpu": 0}`
- Final event: `data: {"done": true}`

### Dependencies (pyproject.toml)

```
torch>=2.8.0
fastapi>=0.117.1
uvicorn>=0.36.0
tiktoken>=0.11.0
tokenizers>=0.22.0
datasets>=4.0.0
```

**Build system**: Uses `maturin` to build the rustbpe tokenizer

### Device Support
- **CUDA**: Full support, multi-GPU via worker pool
- **MPS** (Apple Silicon): Works, single worker only
- **CPU**: Works but slow (use `--device-type cpu`)

### CLI Arguments (chat_web.py)
```
--source sft         # Model source: sft|mid|rl|base
--step 809           # Checkpoint step (Phase 2 SFT with TinyChat identity)
--port 8000          # Server port
--host 0.0.0.0       # Bind address
--device-type cuda   # Force device: cuda|cpu|mps
--temperature 0.8    # Default sampling temperature
--top-k 50           # Default top-k sampling
--max-tokens 512     # Default max tokens
--num-gpus 1         # Number of GPUs for worker pool
```
