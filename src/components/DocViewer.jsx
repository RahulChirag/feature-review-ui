import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '../theme/ThemeProvider'

/* Reading measure: inner column only; outer card fills App max-w-6xl wrapper */
const mdComponents = {
  h1: ({ children }) => (
    <h1 className="mb-5 border-b-2 border-outline pb-3.5 text-2xl font-extrabold tracking-tight text-on-surface md:text-[26px]">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-9 flex items-center gap-2 text-lg font-bold tracking-tight text-on-surface md:text-xl">
      <span className="inline-block h-[1em] w-1 shrink-0 rounded-sm bg-primary" aria-hidden />
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-6 text-[15px] font-bold text-on-surface">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-4 text-[13px] font-bold uppercase tracking-wide text-on-surface-variant">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[14.5px] leading-relaxed text-on-surface/90 [&:not(:first-child)]:mt-0">{children}</p>
  ),
  ul: ({ children }) => <ul className="mb-3.5 ml-5 list-disc space-y-1.5 text-[14.5px] leading-relaxed text-on-surface/90">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-3.5 ml-5 list-decimal space-y-1.5 text-[14.5px] leading-relaxed text-on-surface/90">{children}</ol>
  ),
  li: ({ children }) => <li className="marker:text-primary">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-on-surface">{children}</strong>,
  em: ({ children }) => <em className="italic text-on-surface-variant">{children}</em>,
  hr: () => <hr className="my-7 border-0 border-t border-outline" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container rounded-sm"
    >
      {children}
    </a>
  ),
}

export default function DocViewer({ content }) {
  const { resolvedTheme } = useTheme()
  const codeStyle = resolvedTheme === 'dark' ? vscDarkPlus : oneLight

  if (!content) {
    return (
      <div className="rounded-lg border border-outline bg-surface-container px-6 py-8 text-sm text-on-surface-muted">
        No documentation file found for this feature.
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden break-words rounded-lg border border-outline bg-surface-container px-4 py-6 shadow-[var(--shadow-elevation-1)] dark:shadow-none md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-prose text-on-surface">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...mdComponents,
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            if (match) {
              return (
                <div className="my-4 max-w-full overflow-x-auto rounded-lg [-webkit-overflow-scrolling:touch]">
                  <SyntaxHighlighter
                    style={codeStyle}
                    language={match[1]}
                    PreTag="pre"
                    customStyle={{
                      margin: 0,
                      borderRadius: '8px',
                      fontSize: '13px',
                      maxWidth: '100%',
                    }}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              )
            }
            return (
              <code
                className="rounded border border-code-border bg-code-bg px-1.5 py-0.5 font-mono text-[12.5px] text-code-text [overflow-wrap:anywhere]"
                {...props}
              >
                {children}
              </code>
            )
          },
          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto rounded-lg border border-outline [-webkit-overflow-scrolling:touch]">
                <table className="w-full border-collapse text-[13px]">{children}</table>
              </div>
            )
          },
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="last:[&>td]:border-b-0 hover:[&>td]:bg-surface-container-high">{children}</tr>,
          th: ({ children }) => (
            <th className="border-b border-outline bg-surface-container-high px-3.5 py-2.5 text-left text-xs font-bold whitespace-nowrap text-on-surface">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-outline-variant px-3.5 py-2 align-top text-on-surface/90">{children}</td>
          ),
          blockquote({ children }) {
            return (
              <blockquote className="my-4 rounded-r-md border-l-[3px] border-blockquote-border bg-blockquote-bg px-4 py-2.5 text-[color:var(--app-blockquote-text)] [&>p]:m-0 [&>p]:text-inherit">
                {children}
              </blockquote>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
      </div>
    </div>
  )
}
