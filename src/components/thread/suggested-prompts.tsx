import { useState } from "react";
import { ArrowUpRight, CornerDownRight, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// The production mobile empty state (chat_screen.dart), including its wording.
const categories = [
  {
    name: "Stocks",
    prompts: [
      "Analyse Tata Motors",
      "Compare TCS & INFY",
      "What's the outlook for Reliance?",
    ],
  },
  {
    name: "Mutual Funds",
    prompts: [
      "Analyse Quant Smallcap Fund",
      "Top 5 flexi-cap funds",
      "Best ELSS funds for tax saving",
    ],
  },
  {
    name: "Personal Finance",
    prompts: [
      "How does financial planning work?",
      "How is a savings rate worked out?",
      "How is a retirement corpus estimated?",
    ],
  },
];

export function SuggestedPrompts({
  onSelect,
  disabled,
}: {
  onSelect: (text: string) => void;
  disabled?: boolean;
}) {
  const [category, setCategory] = useState(0);
  return (
    <section
      className="mx-auto flex w-full max-w-lg flex-col items-center px-1 py-8 sm:py-12"
      aria-label="Start a conversation"
    >
      <div
        className="flex size-14 items-center justify-center rounded-[14px] text-white [background:var(--brand-gradient)]"
        aria-hidden="true"
      >
        <MessagesSquare
          className="size-6"
          strokeWidth={1.6}
        />
      </div>
      <h1 className="mt-3 text-lg leading-[1.3] font-medium">
        Consult your agent
      </h1>
      <div
        className="mt-4 flex max-w-full items-center gap-1 sm:gap-2"
        role="group"
        aria-label="Suggested prompt categories"
      >
        {categories.map(({ name }, i) => (
          <button
            key={name}
            type="button"
            aria-pressed={category === i}
            onClick={() => setCategory(i)}
            className="min-h-12 cursor-pointer rounded-full py-2 focus-visible:outline-offset-0"
          >
            <span
              className={cn(
                "block rounded-full px-2 py-2 text-[11px] font-medium whitespace-nowrap transition-colors sm:px-3.5",
                category === i
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-muted-foreground hover:bg-secondary",
              )}
            >
              {name}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1 flex w-full max-w-[340px] flex-col gap-2">
        {categories[category].prompts.map((prompt, i) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            disabled={disabled}
            className="bg-card text-card-foreground hover:bg-accent flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[14px] border px-4 py-3 text-left text-[11px] leading-normal font-medium [box-shadow:var(--chat-card-shadow)] transition-colors disabled:cursor-default disabled:opacity-50"
          >
            <CornerDownRight
              className={cn(
                "size-3.5 shrink-0",
                i === 0
                  ? "text-primary"
                  : i === 1
                    ? "text-[var(--positive)]"
                    : "text-foreground",
              )}
              aria-hidden="true"
            />
            <span>{prompt}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function FollowUpPrompts({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  const valid = suggestions.filter((s) => typeof s === "string" && s.trim());
  if (!valid.length) return null;
  return (
    <section
      className="mr-auto w-full max-w-lg pt-3"
      aria-label="Follow-ups"
    >
      <p className="text-muted-foreground mb-2.5 text-[9px] font-semibold tracking-[0.48px] uppercase">
        Follow-ups
      </p>
      <div className="flex flex-col gap-2">
        {valid.map((text, i) => (
          <button
            key={`${i}-${text}`}
            type="button"
            onClick={() => onSelect(text)}
            className="bg-card hover:bg-accent flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[14px] border px-3.5 py-3 text-left text-xs font-medium [box-shadow:var(--chat-card-shadow)] transition-colors"
          >
            <span>{text}</span>
            <ArrowUpRight
              className="text-primary size-4 shrink-0"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </section>
  );
}
