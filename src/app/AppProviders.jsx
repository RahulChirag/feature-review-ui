import { ThemeProvider } from '../theme/ThemeProvider'

export function AppProviders({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>
}
