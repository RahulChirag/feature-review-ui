import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

export default function DocViewer({ content }) {
  if (!content) {
    return <div className="doc-empty">No documentation file found for this feature.</div>
  }

  return (
    <div className="doc-viewer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            if (match) {
              return (
                <div className="doc-code-block">
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="pre"
                    customStyle={{
                      borderRadius: '8px',
                      fontSize: '13px',
                      margin: 0,
                      maxWidth: '100%',
                    }}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              )
            }
            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            )
          },
          // Style tables
          table({ children }) {
            return <div className="table-wrap"><table>{children}</table></div>
          },
          // Wrap blockquotes nicely
          blockquote({ children }) {
            return <blockquote className="md-blockquote">{children}</blockquote>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
