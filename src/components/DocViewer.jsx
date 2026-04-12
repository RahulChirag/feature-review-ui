import { forwardRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '../theme/ThemeProvider'
import { focusRingLink } from '../theme/focusStyles'

function mergeClass(base, extra) {
  return [base, extra].filter(Boolean).join(' ')
}

/* Full-width column; sits flush on main surface (no nested card). `id` comes from rehype-slug via ...props */
const mdComponents = {
  h1: ({ children, className, ...props }) => (
    <h1
      {...props}
      className={mergeClass(
        'scroll-mt-6 border-b-2 border-outline pb-3.5 text-xl font-extrabold tracking-tight text-on-surface max-md:mb-4 md:mb-5 md:text-[26px]',
        className
      )}
    >
      {children}
    </h1>
  ),
  h2: ({ children, className, ...props }) => (
    <h2
      {...props}
      className={mergeClass(
        'mb-3 mt-9 flex scroll-mt-6 items-center gap-2 text-lg font-bold tracking-tight text-on-surface max-md:mt-8 md:text-xl',
        className
      )}
    >
      <span className="inline-block h-[1em] w-1 shrink-0 bg-primary" aria-hidden />
      {children}
    </h2>
  ),
  h3: ({ children, className, ...props }) => (
    <h3
      {...props}
      className={mergeClass('mb-2 mt-6 scroll-mt-6 text-[15px] font-bold text-on-surface', className)}
    >
      {children}
    </h3>
  ),
  h4: ({ children, className, ...props }) => (
    <h4
      {...props}
      className={mergeClass(
        'mb-1.5 mt-4 scroll-mt-6 text-[13px] font-bold uppercase tracking-wide text-on-surface-variant',
        className
      )}
    >
      {children}
    </h4>
  ),
  h5: ({ children, className, ...props }) => (
    <h5
      {...props}
      className={mergeClass('mb-1.5 mt-3 scroll-mt-6 text-sm font-semibold text-on-surface', className)}
    >
      {children}
    </h5>
  ),
  h6: ({ children, className, ...props }) => (
    <h6
      {...props}
      className={mergeClass(
        'mb-1 mt-3 scroll-mt-6 text-sm font-semibold text-on-surface-variant',
        className
      )}
    >
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="mb-3 max-md:mb-4 max-md:leading-[1.7] text-[14.5px] leading-relaxed text-on-surface/90 [&:not(:first-child)]:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3.5 ml-5 max-md:mb-4 max-md:space-y-2 list-disc space-y-1.5 text-[14.5px] leading-relaxed text-on-surface/90 max-md:leading-[1.65]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3.5 ml-5 max-md:mb-4 max-md:space-y-2 list-decimal space-y-1.5 text-[14.5px] leading-relaxed text-on-surface/90 max-md:leading-[1.65]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="marker:text-primary">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-on-surface">{children}</strong>,
  em: ({ children }) => <em className="italic text-on-surface-variant">{children}</em>,
  hr: () => <hr className="my-7 border-0 border-t border-outline max-md:my-8" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className={`font-medium text-primary underline-offset-2 hover:underline ${focusRingLink}`}
    >
      {children}
    </a>
  ),
}

const DocViewer = forwardRef(function DocViewer({ content }, ref) {
  const { resolvedTheme } = useTheme()
  const codeStyle = resolvedTheme === 'dark' ? vscDarkPlus : oneLight

  if (!content) {
    return (
      <div className="px-6 py-8 text-sm text-on-surface-muted">
        No documentation file found for this feature.
      </div>
    )
  }

  const codeFontSize = '15px'

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden break-words px-4 py-6 text-on-surface md:px-8 md:py-8 lg:px-10">
      <div ref={ref} className="doc-markdown-root min-w-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={{
            ...mdComponents,
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '')
              if (match) {
                return (
                  <div className="my-4 w-full max-w-none overflow-x-auto border border-code-border bg-code-bg [-webkit-overflow-scrolling:touch] md:overflow-hidden">
                    <SyntaxHighlighter
                      style={codeStyle}
                      language={match[1]}
                      PreTag="pre"
                      customStyle={{
                        margin: 0,
                        borderRadius: '0px',
                        fontSize: codeFontSize,
                        maxWidth: '100%',
                        padding: '1rem 1rem',
                        backgroundColor: 'var(--app-code-bg)',
                        color: 'var(--app-code-text)',
                      }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                )
              }
              return (
                <code
                  className="border border-code-border bg-code-bg px-1.5 py-0.5 font-mono text-[12.5px] text-code-text [overflow-wrap:anywhere] max-md:text-[13px]"
                  {...props}
                >
                  {children}
                </code>
              )
            },
            table({ children }) {
              return (
                <div className="my-5 w-full max-w-none overflow-x-auto border border-outline bg-surface-container [-webkit-overflow-scrolling:touch] md:my-4 md:bg-transparent">
                  <table className="w-full border-collapse text-[12px] text-on-surface/90 sm:text-[13px]">{children}</table>
                </div>
              )
            },
            thead: ({ children }) => <thead>{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => (
              <tr className="last:[&>td]:border-b-0 hover:[&>td]:bg-surface-container-high">{children}</tr>
            ),
            th: ({ children }) => (
              <th className="border-b border-outline bg-surface-container-high px-2.5 py-2.5 text-left text-[11px] font-bold text-on-surface sm:px-3.5 sm:text-xs md:whitespace-nowrap">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-outline-variant px-2.5 py-2.5 align-top sm:px-3.5">{children}</td>
            ),
            blockquote({ children }) {
              return (
                <blockquote className="my-4 border-l-[3px] border-blockquote-border bg-blockquote-bg px-4 py-2.5 text-[color:var(--app-blockquote-text)] [&>p]:m-0 [&>p]:text-inherit">
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
})

export default DocViewer
