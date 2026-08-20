import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LAUNCH_OFFER,
  LAUNCH_OFFER_CODE,
  isLaunchOfferLive,
  shouldApplyLaunchOffer,
} from './launch-offer'

// The active launch offer carries a hard deadline; these tests pin the
// client-side gate so the offer stops being advertised/applied once it ends.
const ENDS_AT = LAUNCH_OFFER.endsAt as string

describe('isLaunchOfferLive', () => {
  it('is live strictly before the deadline', () => {
    expect(isLaunchOfferLive(new Date(Date.parse(ENDS_AT) - 1000))).toBe(true)
  })

  it('is over at the exact UTC boundary (mirrors backend >=)', () => {
    expect(isLaunchOfferLive(new Date(ENDS_AT))).toBe(false)
  })

  it('is over after the deadline', () => {
    expect(isLaunchOfferLive(new Date(Date.parse(ENDS_AT) + 1000))).toBe(false)
  })
})

describe('shouldApplyLaunchOffer deadline awareness', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies a valid/empty code before the deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.parse(ENDS_AT) - 1000))
    expect(shouldApplyLaunchOffer(null)).toBe(true)
    expect(shouldApplyLaunchOffer(LAUNCH_OFFER_CODE)).toBe(true)
  })

  it('does not apply after the deadline even with the right code', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.parse(ENDS_AT) + 1000))
    expect(shouldApplyLaunchOffer(null)).toBe(false)
    expect(shouldApplyLaunchOffer(LAUNCH_OFFER_CODE)).toBe(false)
  })

  it('still rejects when an offer token is present', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.parse(ENDS_AT) - 1000))
    expect(shouldApplyLaunchOffer(null, 'some-token')).toBe(false)
  })
})
