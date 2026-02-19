# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TinyBrain** is an AI inference service demonstrating the x402 protocol from both merchant and agent perspectives:
- **Merchant**: Accepts $0.01 USDC payments from users for queries
- **Agent**: Pays BlockRun.ai ~$0.001 for DeepSeek R1 when queries exceed TinyChat's confidence

The project uses a locally-trained 561M parameter model (TinyChat) that measures its own uncertainty (perplexity) and escalates complex queries to more powerful models via x402 payments.

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
├── Frontend: Chat UI, wallet connection
├── API Routes: /api/chat (x402 protected, $0.01/query)
│
├── Routing: Two-phase perplexity-based escalation
│   ├── TinyChat emits perplexity as first SSE event
│   ├── Low perplexity → continue TinyChat stream (free for server)
│   ├── High perplexity → abort, route to BlockRun (server pays ~$0.001)
│   └── Keyword override → force BlockRun regardless of perplexity
│
├── TinyChat Service: Modal serverless GPU (T4)
│   └── https://tuggspeedman-ai--tinychat-chat-completions.modal.run
├── BlockRun.ai: DeepSeek R1 for escalation (~$0.001/query via x402)
├── Daydreams x402 API: Claude Sonnet 4 ($0.01/query) - BROKEN (401 errors, kept for future)
└── Coinbase CDP Facilitator: Payment verification/settlement (Base mainnet)
```

### Request Flow
1. User sends message → Chat UI
2. x402-fetch handles 402 → User signs payment ($0.01)
3. Coinbase CDP facilitator verifies and settles payment
4. Server checks for keyword escalation triggers first
5. If no keywords: starts TinyChat stream, reads perplexity from first SSE event
   - Low perplexity → continue TinyChat stream (free for server)
   - High perplexity → abort TinyChat, route to BlockRun DeepSeek R1
6. If keywords present: route directly to BlockRun DeepSeek R1
7. Response streams back with model attribution badge + perplexity value

### Tech Stack
- **Framework**: Next.js 15 with Turbopack, React 19
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui (new-york style) with Lucide icons
- **Animations**: Framer Motion, tw-animate-css
- **Payments**: x402-fetch (client), @coinbase/x402 (facilitator), custom x402-streaming wrapper
- **Escalation**: @blockrun/llm (DeepSeek R1 via x402, ~$0.001/query)
- **Wallet**: wagmi + viem (Base mainnet)

### Path Aliases
- `@/*` maps to the project root (configured in tsconfig.json)
- Components: `@/components` and `@/components/ui`
- Utilities: `@/lib/utils` (includes `cn()` for class merging)
- Hooks: `@/hooks`

### Key Files
- `app/api/chat/route.ts` - x402-protected chat endpoint with two-phase perplexity routing ($0.01/query)
- `lib/tinychat-client.ts` - TypeScript client for TinyChat API with SSE streaming + perplexity parsing
- `lib/blockrun-client.ts` - BlockRun.ai x402 client for DeepSeek R1 escalation (~$0.001/query)
- `lib/daydreams-client.ts` - Daydreams Router client (not deployed yet, kept for future)
- `lib/router.ts` - Perplexity-based + keyword escalation routing (threshold: 80, needs calibration)
- `lib/treasury.ts` - Server-side treasury wallet signer
- `lib/x402-streaming.ts` - Custom streaming-compatible x402 wrapper (fire-and-forget settlement)
- `lib/wagmi-config.ts` - Wallet configuration for Base mainnet
- `app/providers.tsx` - WagmiProvider + QueryClientProvider + ThemeProvider wrapper
- `components/wallet-connect.tsx` - Wallet connect/disconnect button
- `components/theme-toggle.tsx` - Dark/light mode toggle button
- `components/chat/chat-interface.tsx` - Chat UI with wrapFetchWithPayment integration
- `components/chat/message-list.tsx` - Message display with avatars, model badges, and perplexity values
- `components/chat/message-content.tsx` - Markdown rendering and think block parsing
- `components/chat/think-block.tsx` - Collapsible reasoning block for DeepSeek R1
- `components/chat/message-input.tsx` - Auto-expanding textarea with gradient send button

## Escalation Routing

### Perplexity-Based (automatic)
TinyChat computes perplexity during prefill and emits it as the first SSE event. If perplexity exceeds the threshold (currently 80), the server aborts the TinyChat stream and routes to BlockRun DeepSeek R1 instead.

**Note**: Perplexity calibration is pending. Observed values are all very low (2-18), so the threshold of 80 never triggers automatic escalation yet. Keyword escalation works as a manual override.

### Keyword-Based (manual override)
Queries containing these keywords skip TinyChat entirely and route directly to BlockRun (DeepSeek R1):
- "think hard", "use advanced", "be smart", "reason carefully"
- "complex", "difficult", "challenging", "deep thinking"

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
- **Perplexity threshold needs calibration**: All observed perplexity values are 2-18, well below the threshold of 80. Automatic perplexity-based escalation never triggers. Keyword escalation works as manual override.
- **Daydreams x402 broken**: Their x402 payment validation returns 401 "Invalid x402 payment" even with properly signed payments. Client kept in codebase for future testing.

### Future Enhancements
- **PayAI Facilitator Fallback**: Add `https://facilitator.payai.network` as fallback if CDP fails
- **Daydreams as alternative**: If Daydreams fixes their x402 ($0.01/query), could add as additional provider

### Upcoming Work
See [tinybrain-updated-project-plan.md](tinybrain-updated-project-plan.md) for the v2 upgrade plan:
- x402 v2 migration (`@x402/*` packages, `PAYMENT-SIGNATURE` headers, CAIP-2 networks)
- "Bar Tab" session-based payment mode (deposit, chat freely, settle at end)
- Perplexity threshold calibration (collect more samples, find good cutoff)

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
