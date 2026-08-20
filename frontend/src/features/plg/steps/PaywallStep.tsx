/**
 * Legacy compatibility shim for the retired /onboard/unlock paywall route.
 *
 * The canonical plan-selection and trial-start path is now /checkout. Keep this
 * component as a redirect target so stale links and older tests do not preserve
 * a second checkout implementation.
 */
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

function getCanonicalCheckoutPath(searchParams: URLSearchParams): string {
  const nextParams = new URLSearchParams(searchParams)
  nextParams.delete('purchased')

  const query = nextParams.toString()
  return query ? `/checkout?${query}` : '/checkout'
}

export function PaywallStep() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    navigate(getCanonicalCheckoutPath(searchParams), { replace: true })
  }, [navigate, searchParams])

  return null
}
