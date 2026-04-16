import { render, screen } from '@testing-library/react'
import AppShell from './AppShell'
import { AppProviders } from './AppProviders'

describe('AppShell', () => {
  it('renders the feature reviews shell', async () => {
    render(
      <AppProviders>
        <AppShell />
      </AppProviders>
    )

    expect(screen.getAllByText(/feature reviews/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /documentation/i })).toBeInTheDocument()
  })
})
