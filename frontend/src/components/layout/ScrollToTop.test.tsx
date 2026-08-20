/**
 * ScrollToTop Component Tests
 */
import { render, waitFor } from '@testing-library/react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ScrollToTop } from './ScrollToTop'
import { act } from 'react'

// Mock window.scrollTo
const mockScrollTo = vi.fn()
window.scrollTo = mockScrollTo

describe('ScrollToTop', () => {
  beforeEach(() => {
    mockScrollTo.mockClear()
  })

  it('scrolls to top on mount', () => {
    render(
      <BrowserRouter>
        <ScrollToTop />
      </BrowserRouter>
    )

    expect(mockScrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('scrolls to top when route changes', async () => {
    function TestComponent() {
      const navigate = useNavigate()
      return (
        <>
          <ScrollToTop />
          <button onClick={() => navigate('/page2')}>Navigate</button>
        </>
      )
    }

    const { getByText } = render(
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TestComponent />} />
          <Route
            path="/page2"
            element={
              <>
                <ScrollToTop />
                <div>Page 2</div>
              </>
            }
          />
        </Routes>
      </BrowserRouter>
    )

    mockScrollTo.mockClear()

    await act(async () => {
      getByText('Navigate').click()
    })

    await waitFor(() => {
      expect(mockScrollTo).toHaveBeenCalledWith(0, 0)
    })
  })

  it('renders nothing (returns null)', () => {
    const { container } = render(
      <BrowserRouter>
        <ScrollToTop />
      </BrowserRouter>
    )

    expect(container.firstChild).toBeNull()
  })
})
