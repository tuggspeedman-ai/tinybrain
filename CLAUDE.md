# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

- **Phase 1**: Chat UI with Nanochat - Complete
- **Phase 2**: x402 Merchant (accept $0.01 payments) - Complete
- **Phase 3**: x402 Agent (pay for escalation) - Complete
  - **Hyperbolic**: Working (DeepSeek R1, ~$0.10/query)
  - **Daydreams**: Broken (x402 returns 401 "Invalid x402 payment" - even their own SDK fails)
- **Phase 4**: Deploy Nanochat to Modal - Complete
  - Nanochat now runs on Modal serverless GPU (T4)
  - URL: `https://tuggspeedman-ai--nanochat-chat-completions.modal.run`
- **Phase 5**: Deploy NanoBrain to Vercel - Complete
  - Production URL: https://nanobrain-alpha.vercel.app/
  - Full x402 payment flow working (user pays $0.01, treasury pays Hyperbolic ~$0.10 for escalation)
- **Phase 6**: UX Polish - Complete
  - Markdown rendering with syntax highlighting (react-markdown, remark-gfm)
  - Collapsible `<think>` reasoning blocks for DeepSeek R1
  - Avatar icons, Framer Motion animations, gradient send button
  - Model badges as styled pills (Brain/Rocket icons)
  - Auto-expanding textarea, responsive container height

## Project Overview

**NanoBrain** is an AI inference service demonstrating the x402 protocol from both merchant and agent perspectives:
- **Merchant**: Accepts $0.01 USDC payments from users for queries
- **Agent**: Pays Hyperbolic ~$0.10 for DeepSeek R1 when user triggers escalation keywords

The project uses a locally-trained 561M parameter model (Nanochat) that escalates complex queries to more powerful models via x402 payments.

## Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production with Turbopack
- `npm run lint` - Run ESLint

### Related: Nanochat Inference Server
**Production (Modal)**: Nanochat runs on Modal serverless GPU
- Chat endpoint: `https://tuggspeedman-ai--nanochat-chat-completions.modal.run`
- Health endpoint: `https://tuggspeedman-ai--nanochat-health.modal.run`
- Cold start: ~10-15s, warm: ~2-3s latency
- T4 GPU, 5-minute idle timeout

**Local development** (optional): Run locally in `/Users/jonathanavni/Documents/Coding/nanochat`:
```bash
cd /Users/jonathanavni/Documents/Coding/nanochat/nanochat
source .venv/bin/activate
python -m scripts.chat_web --source sft --step 700  # Starts on localhost:8000
```

**Important**: Use `--step 700` to load the correct SFT checkpoint. The default (step 21400) is overtrained.

**Model info** (d20 architecture, 561M params):
- Checkpoint: `~/.cache/nanochat/chatsft_checkpoints/d20/model_000700.pt`
- MMLU accuracy: 36%, ARC-Easy: 47%
- Has SFT personality (knows it's nanochat) but limited factual knowledge

## Architecture

### System Components
```
Next.js App (this repo)
├── Frontend: Chat UI, wallet connection
├── API Routes: /api/chat (x402 protected, $0.01/query)
│
├── Nanochat Service: Modal serverless GPU (T4)
│   └── https://tuggspeedman-ai--nanochat-chat-completions.modal.run
├── Hyperbolic x402 API: DeepSeek R1 for escalation (~$0.10/query) - WORKING
├── Daydreams x402 API: Claude Sonnet 4 ($0.01/query) - BROKEN (401 errors)
└── Coinbase CDP Facilitator: Payment verification/settlement (Base mainnet)
```

### Request Flow
1. User sends message → Chat UI
2. x402-fetch handles 402 → User signs payment ($0.01)
3. Coinbase CDP facilitator verifies and settles payment
4. Server routes based on keywords:
   - Simple queries → Nanochat (free for server)
   - "think hard" queries → Hyperbolic DeepSeek R1 (~$0.10 from treasury)
5. Response streams back with model attribution badge

### Tech Stack
- **Framework**: Next.js 15 with Turbopack, React 19
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui (new-york style) with Lucide icons
- **Animations**: Framer Motion, tw-animate-css
- **Payments**: x402-fetch (client), @coinbase/x402 (facilitator), custom x402-streaming wrapper
- **Wallet**: wagmi + viem (Base mainnet)

### Path Aliases
- `@/*` maps to the project root (configured in tsconfig.json)
- Components: `@/components` and `@/components/ui`
- Utilities: `@/lib/utils` (includes `cn()` for class merging)
- Hooks: `@/hooks`

### Key Files
- `app/api/chat/route.ts` - x402-protected chat endpoint with routing ($0.01/query)
- `lib/nanochat-client.ts` - TypeScript client for Nanochat API with SSE streaming
- `lib/hyperbolic-client.ts` - Hyperbolic x402 client (non-streaming, $0.10/query)
- `lib/daydreams-client.ts` - Daydreams Router client (not deployed yet, kept for future)
- `lib/router.ts` - Keyword-based escalation routing
- `lib/treasury.ts` - Server-side treasury wallet signer
- `lib/x402-streaming.ts` - Custom streaming-compatible x402 wrapper (fire-and-forget settlement)
- `lib/wagmi-config.ts` - Wallet configuration for Base mainnet
- `app/providers.tsx` - WagmiProvider + QueryClientProvider wrapper
- `components/wallet-connect.tsx` - Wallet connect/disconnect button
- `components/chat/chat-interface.tsx` - Chat UI with wrapFetchWithPayment integration

## Escalation Keywords
Queries containing these keywords route to Hyperbolic (DeepSeek R1):
- "think hard", "use advanced", "be smart", "reason carefully"
- "complex", "difficult", "challenging", "deep thinking"

## Styling Conventions
- Uses OKLCH color space for CSS variables
- Theme colors defined in `app/globals.css` with light/dark mode support
- Dark mode uses `.dark` class variant
- Use `cn()` from `@/lib/utils` to merge Tailwind classes

## Environment Variables
```bash
# Nanochat inference server
# Use Modal (production) or local (development)
NANOCHAT_URL=https://tuggspeedman-ai--nanochat-chat-completions.modal.run
# NANOCHAT_URL=http://localhost:8000  # Uncomment for local development
NANOCHAT_API_KEY=...                         # API key for Modal authentication (required for production)

TREASURY_ADDRESS=0xcAF6f4AF9C1DF98530E74A3eCbb88dF077CBBC87  # Receives user payments
TREASURY_PRIVATE_KEY=0x...                   # For paying escalation providers (server-side)
CDP_API_KEY_ID=...                           # Coinbase Developer Platform API key ID
CDP_API_KEY_SECRET=...                       # Coinbase Developer Platform API key secret
```

### x402 Providers & Facilitators
- **Coinbase CDP Facilitator**: `https://api.cdp.coinbase.com/platform/v2/x402` (Base mainnet, requires CDP API keys)
- **Hyperbolic**: `https://hyperbolic-x402.vercel.app/v1/chat/completions` (DeepSeek R1, ~$0.10/query) - PRIMARY (working)
- **Daydreams**: `https://api-beta.daydreams.systems/v1/chat/completions` - BROKEN (x402 returns 401 even with valid signatures)

### Known Issues
- **Hyperbolic streaming broken**: Their `stream: true` endpoint returns 500 errors. Using `stream: false` as workaround.
- **Daydreams x402 broken**: Their x402 payment validation returns 401 "Invalid x402 payment" even with properly signed payments. This affects both the `x402-fetch` library and their own `@daydreamsai/ai-sdk-provider` SDK. Client kept in codebase for future testing.

### Future Enhancements
- **PayAI Facilitator Fallback**: Add `https://facilitator.payai.network` as fallback if CDP fails
- **Daydreams as cheaper option**: If Daydreams fixes their x402 ($0.01/query vs Hyperbolic's $0.10), switch back

## Project Documentation
- `project-docs/nanobrain-project-plan.md` - Original project concept and requirements
- `project-docs/claude-project-plan.md` - Implementation plan with progress tracking
- `project-docs/nanochat_project_overview.md` - Nanochat training details
- `project-docs/nanochat-hosting-analysis.md` - Hosting decision (Modal) and cost analysis

---

## Nanochat Codebase Reference

This section documents the nanochat project structure for deployment and integration work.

### Modal Deployment
Nanochat runs on Modal serverless GPU (T4) for production:
- **Chat endpoint**: `https://tuggspeedman-ai--nanochat-chat-completions.modal.run`
- **Health endpoint**: `https://tuggspeedman-ai--nanochat-health.modal.run`
- **Deploy command**: `cd /Users/jonathanavni/Documents/Coding/nanochat/nanochat && source .venv/bin/activate && modal deploy modal_app.py`
- **Cold start**: ~10-15s, warm: ~2-3s
- **Container idle timeout**: 5 minutes
- **Authentication**: Requires `X-API-Key` header (stored in Modal secret `nanochat-api-key`)

**Key Modal files**:
- `modal_app.py` - Modal deployment with T4 GPU, SSE streaming, API key auth
- Modal Volume `nanochat-checkpoints` - stores model weights and tokenizer
- Modal Secret `nanochat-api-key` - stores `NANOCHAT_API_KEY` for authentication

**URL Handling in NanoBrain** ([nanochat-client.ts:28-33](lib/nanochat-client.ts#L28-L33)):
- Modal URLs (contain `modal.run` or `chat-completions`) are used directly
- Local URLs get `/chat/completions` appended

### Location
- **Local path**: `/Users/jonathanavni/Documents/Coding/nanochat/nanochat`
- **Checkpoints**: `/Users/jonathanavni/Documents/Coding/nanochat/checkpoints/` (model_000700.pt, tokenizer/)
- **Model cache** (alternative): `~/.cache/nanochat/` (used by training scripts)

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
# From checkpoint_manager.py:
def load_model(source, device, phase, model_tag=None, step=None):
    # source: "sft" | "base" | "mid" | "rl"
    # Maps to: ~/.cache/nanochat/chatsft_checkpoints/d20/

# Key paths (from get_base_dir() in common.py):
# - Default: ~/.cache/nanochat/
# - Override: NANOCHAT_BASE_DIR env var

# Checkpoint files needed:
# - model_000700.pt (~1.9GB) - Model weights
# - meta_000700.json (~1KB) - Model config
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

**Response**: SSE stream with `data: {"token": "...", "gpu": 0}` chunks, ending with `data: {"done": true}`

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
--step 700           # Checkpoint step (IMPORTANT: use 700, not default 21400)
--port 8000          # Server port
--host 0.0.0.0       # Bind address
--device-type cuda   # Force device: cuda|cpu|mps
--temperature 0.8    # Default sampling temperature
--top-k 50           # Default top-k sampling
--max-tokens 512     # Default max tokens
--num-gpus 1         # Number of GPUs for worker pool
```
