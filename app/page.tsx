import { ChatInterface } from '@/components/chat/chat-interface';
import { WalletConnect } from '@/components/wallet-connect';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <main className="min-h-screen p-4 flex flex-col">
      <header className="flex justify-between items-center mb-4 max-w-3xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">TinyBrain</h1>
          <p className="text-sm text-muted-foreground">
            Powered by{' '}
            <a
              href="https://github.com/tuggspeedman-ai/tinychat"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-muted-foreground/30 hover:decoration-foreground/50 hover:text-foreground transition-colors"
            >
              TinyChat
            </a>
            , a 561M-param model trained from scratch. It will confidently hallucinate&mdash;that&rsquo;s part of the fun.
          </p>
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
