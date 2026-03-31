'use client'

import { useChat, type Message } from 'ai/react'
import { useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Loader2, Bot, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'

const STARTER_QUESTIONS = [
  'What are the most common issues this week?',
  'Which customers are experiencing the most problems?',
  'Summarize all high-urgency issues.',
  'What features are customers requesting most?',
]

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
  })

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>)
      }
    }
  }

  function handleStarterClick(question: string) {
    // Directly submit a starter question
    handleInputChange({ target: { value: question } } as React.ChangeEvent<HTMLTextAreaElement>)
    setTimeout(() => {
      textareaRef.current?.form?.requestSubmit()
    }, 50)
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b px-8 py-4 shrink-0">
        <h1 className="text-xl font-bold">AI Chat</h1>
        <p className="text-sm text-muted-foreground">
          Ask questions about your product feedback data
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-8 py-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Product Feedback Assistant</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ask questions about your synced feedback data. If you haven&apos;t synced yet,{' '}
                <Link href="/integrations" className="underline">
                  go to Integrations
                </Link>{' '}
                first.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleStarterClick(q)}
                  className="text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((message: Message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="rounded-2xl px-4 py-2.5 bg-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            {error && (
              <div className="text-sm text-destructive text-center p-3 bg-destructive/10 rounded-lg">
                {error.message}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t px-8 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your feedback data... (Enter to send, Shift+Enter for new line)"
            className="resize-none min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="icon" className="shrink-0 h-11 w-11">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
