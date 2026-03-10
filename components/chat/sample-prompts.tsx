'use client'

import { ArrowRight } from 'lucide-react'

interface SamplePrompt {
  title: string
  prompt: string
  icon: string
}

interface SamplePromptsProps {
  prompts: SamplePrompt[]
  onPromptClick: (prompt: string) => void
}

export function SamplePrompts({ prompts, onPromptClick }: SamplePromptsProps) {
  return (
    <div className="w-full max-w-2xl px-2 sm:px-0">
      <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-5 text-center">
        Try one of these common questions
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {prompts.map((item, index) => (
          <button
            key={index}
            onClick={() => onPromptClick(item.prompt)}
            className="group flex items-center gap-3 p-3 sm:p-4 rounded-xl border border-border bg-card hover:bg-[oklch(0.35_0.08_142)] hover:border-[oklch(0.45_0.12_142)] hover:text-white transition-all text-left"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground group-hover:text-white text-sm">{item.title}</p>
              <p className="text-xs text-muted-foreground group-hover:text-white/80 truncate mt-0.5 sm:mt-1 leading-relaxed">
                {item.prompt}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
