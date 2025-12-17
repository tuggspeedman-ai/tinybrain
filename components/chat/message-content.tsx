'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ThinkBlock } from './think-block';

interface MessageContentProps {
  content: string;
}

function parseThinkBlocks(content: string): { thinking: string | null; answer: string } {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    return { thinking, answer };
  }
  return { thinking: null, answer: content };
}

export function MessageContent({ content }: MessageContentProps) {
  const { thinking, answer } = parseThinkBlocks(content);

  return (
    <div>
      {thinking && <ThinkBlock content={thinking} />}
      <div className="chat-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !String(children).includes('\n');

              return !isInline && match ? (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {answer}
        </ReactMarkdown>
      </div>
    </div>
  );
}
