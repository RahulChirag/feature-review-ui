import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '../theme/ThemeProvider'

export default function CodeBlockHighlighter({ children, language }) {
  const { resolvedTheme } = useTheme()
  const codeStyle = resolvedTheme === 'dark' ? vscDarkPlus : oneLight

  return (
    <div className="my-4 w-full max-w-none overflow-x-auto border border-code-border bg-code-bg [-webkit-overflow-scrolling:touch] md:overflow-hidden">
      <SyntaxHighlighter
        style={codeStyle}
        language={language}
        PreTag="pre"
        customStyle={{
          margin: 0,
          borderRadius: '0px',
          fontSize: '15px',
          maxWidth: '100%',
          padding: '1rem 1rem',
          backgroundColor: 'var(--app-code-bg)',
          color: 'var(--app-code-text)',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
