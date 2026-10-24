import React, { useRef, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'e.g. 150 food or salary 36000',
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSubmit()
      }
    }
  }

  const handleSendClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (value.trim() && !disabled) {
      onSubmit()
    }
  }

  useEffect(() => {
    // Focus input on mount if not on small mobile where keyboard popup might obstruct
    if (!disabled && window.innerWidth > 600) {
      inputRef.current?.focus()
    }
  }, [disabled])

  return (
    <form className="chat-input-bar" onSubmit={(e) => e.preventDefault()}>
      <input
        ref={inputRef}
        type="text"
        className="chat-text-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Transaction message"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />
      <button
        type="button"
        className="chat-send-btn"
        onClick={handleSendClick}
        disabled={disabled || !value.trim()}
        aria-label="Process transaction"
      >
        <ArrowUp size={20} strokeWidth={2.5} />
      </button>
    </form>
  )
}
