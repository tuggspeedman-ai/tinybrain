import { ChatInterface } from '@/components/chat/chat-interface';
import { WalletConnect } from '@/components/wallet-connect';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <main className="min-h-screen p-4 flex flex-col">
      <header className="flex justify-between items-center mb-4 max-w-3xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold">TinyBrain</h1>
          <p className="text-sm text-muted-foreground">x402-powered AI inference</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <WalletConnect />
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <ChatInterface />
      </div>
    </main>
  );
}
