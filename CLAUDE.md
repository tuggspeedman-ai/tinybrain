# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

- **Phase 1**: Chat UI with Nanochat - Complete
- **Phase 2**: x402 Merchant (accept $0.01 payments) - Complete
- **Phase 3**: x402 Agent (pay Hyperbolic for escalation) - Complete

## Project Overview

**NanoBrain** is an AI inference service demonstrating the x402 protocol from both merchant and agent perspectives:
- **Merchant**: Accepts $0.01 USDC payments from users for queries
- **Agent**: Pays Hyperbolic $0.10 for DeepSeek R1 when user triggers escalation keywords

The project uses a locally-trained 561M parameter model (Nanochat) that escalates complex queries to more powerful models via x402 payments.

## Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production with Turbopack
- `npm run lint` - Run ESLint

### Related: Nanochat Inference Server
The Nanochat model runs separately in `/Users/jonathanavni/Documents/Coding/nanochat`:
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
├── Nanochat Service (external): localhost:8000
├── Hyperbolic x402 API: DeepSeek R1 for escalation ($0.10/query)
└── PayAI Facilitator: Payment verification/settlement (Base mainnet)
```

### Request Flow
1. User sends message → Chat UI
2. x402-fetch handles 402 → User signs payment ($0.01)
3. Server routes based on keywords:
   - Simple queries → Nanochat (free for server)
   - "think hard" queries → Hyperbolic DeepSeek R1 ($0.10 from treasury)
4. Response streams back with model attribution badge

### Tech Stack
- **Framework**: Next.js 15 with Turbopack, React 19
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui (new-york style) with Lucide icons
- **Animations**: Framer Motion, tw-animate-css
- **Payments**: x402-next (accept payments), x402-fetch (pay Hyperbolic)
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
Queries containing these keywords route to Hyperbolic DeepSeek R1:
- "think hard", "use advanced", "be smart", "reason carefully"
- "complex", "difficult", "challenging", "deep thinking"

## Styling Conventions
- Uses OKLCH color space for CSS variables
- Theme colors defined in `app/globals.css` with light/dark mode support
- Dark mode uses `.dark` class variant
- Use `cn()` from `@/lib/utils` to merge Tailwind classes

## Environment Variables
```bash
NANOCHAT_URL=http://localhost:8000           # Nanochat inference server
TREASURY_ADDRESS=0xcAF6f4AF9C1DF98530E74A3eCbb88dF077CBBC87  # Receives user payments
TREASURY_PRIVATE_KEY=0x...                   # For paying Hyperbolic (server-side)
```

### x402 Providers
- **PayAI Facilitator**: `https://facilitator.payai.network` (Base mainnet, no API keys needed)
- **Hyperbolic**: `https://hyperbolic-x402.vercel.app/v1/chat/completions` (DeepSeek R1, $0.10/query)
- **Daydreams Router**: Not deployed yet (returns 404), kept as fallback for future

### Known Issues
- **Hyperbolic streaming broken**: Their `stream: true` endpoint returns 500 errors. Using `stream: false` as workaround.
- **Daydreams Router**: API endpoint at `/v1/chat/completions` returns 404 (frontend SPA, not API). Documentation is ahead of deployment.

## Project Documentation
- `project-docs/nanobrain-project-plan.md` - Original project concept and requirements
- `project-docs/claude-project-plan.md` - Implementation plan with progress tracking
- `project-docs/nanochat_project_overview.md` - Nanochat training details
