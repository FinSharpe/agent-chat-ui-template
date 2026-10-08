"use client";

import "./markdown-styles.css";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { FC, memo, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { SyntaxHighlighter } from "@/components/thread/syntax-highlighter";

import { TooltipIconButton } from "@/components/thread/tooltip-icon-button";
import { cn } from "@/lib/utils";

import "katex/dist/katex.min.css";

interface CodeHeaderProps {
  language?: string;
  code: string;
}

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-t-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white">
      <span className="lowercase [&>span]:text-xs">{language}</span>
      <TooltipIconButton
        tooltip="Copy"
        onClick={onCopy}
      >
        {!isCopied && <CopyIcon />}
        {isCopied && <CheckIcon />}
      </TooltipIconButton>
    </div>
  );
};

const defaultComponents: any = {
  h1: ({ className, ...props }: { className?: string }) => (
    <h1
      className={cn(
        "mt-4 mb-2 text-sm leading-[1.4] font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }: { className?: string }) => (
    <h2
      className={cn(
        "mt-4 mb-2 text-[13px] leading-normal font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: { className?: string }) => (
    <h3
      className={cn(
        "mt-3 mb-2 text-[13px] leading-normal font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }: { className?: string }) => (
    <h4
      className={cn(
        "mt-3 mb-2 text-[13px] font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }: { className?: string }) => (
    <h5
      className={cn(
        "mt-3 mb-2 text-xs font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }: { className?: string }) => (
    <h6
      className={cn(
        "mt-3 mb-2 text-[11px] font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }: { className?: string }) => (
    <p
      className={cn("my-2 leading-normal first:mt-0 last:mb-0", className)}
      {...props}
    />
  ),
  a: ({ className, ...props }: { className?: string }) => (
    <a
      className={cn(
        "text-primary font-medium underline underline-offset-4",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }: { className?: string }) => (
    <blockquote
      className={cn("text-muted-foreground border-l pl-3", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: { className?: string }) => (
    <ul
      className={cn(
        "marker:text-muted-foreground my-2 ml-5 list-disc [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }: { className?: string }) => (
    <ol
      className={cn(
        "marker:text-muted-foreground my-2 ml-5 list-decimal [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }: { className?: string }) => (
    <hr
      className={cn("border-border my-3", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }: { className?: string }) => (
    <div
      className="my-3 max-w-full overflow-x-auto rounded-lg border"
      role="region"
      aria-label="Data table"
      tabIndex={0}
    >
      <table
        className={cn("w-full border-collapse text-xs tabular-nums", className)}
        {...props}
      />
    </div>
  ),
  th: ({ className, ...props }: { className?: string }) => (
    <th
      className={cn(
        "bg-muted px-3 py-2 text-left font-semibold [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }: { className?: string }) => (
    <td
      className={cn(
        "border-b px-3 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }: { className?: string }) => (
    <tr
      className={cn("m-0 p-0 last:[&>td]:border-b-0", className)}
      {...props}
    />
  ),
  sup: ({ className, ...props }: { className?: string }) => (
    <sup
      className={cn("[&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }: { className?: string }) => (
    <pre
      className={cn(
        "my-3 max-w-full overflow-x-auto rounded-lg bg-zinc-950 text-white",
        className,
      )}
      {...props}
    />
  ),
  code: ({
    className,
    children,
    ...props
  }: {
    className?: string;
    children: React.ReactNode;
  }) => {
    const match = /language-(\w+)/.exec(className || "");

    if (match) {
      const language = match[1];
      const code = String(children).replace(/\n$/, "");

      return (
        <>
          <CodeHeader
            language={language}
            code={code}
          />
          <SyntaxHighlighter
            language={language}
            className={className}
          >
            {code}
          </SyntaxHighlighter>
        </>
      );
    }

    return (
      <code
        className={cn("rounded font-medium", className)}
        {...props}
      >
        {children}
      </code>
    );
  },
};

const MarkdownTextImpl: FC<{ children: string; components?: Components }> = ({
  children,
  components,
}) => {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{ ...defaultComponents, ...components }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
