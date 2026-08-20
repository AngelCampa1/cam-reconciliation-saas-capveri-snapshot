"""Property-based stress for unsubscribe-token HMAC sign/verify.

``build_unsubscribe_token`` signs an email with an HMAC-SHA256 secret and
``verify_unsubscribe_token`` recovers the email iff the token is authentic.
This pair gates the public ``/api/v1/leads/unsubscribe`` endpoint, so its
security properties are load-bearing: a forgery would let anyone suppress
anyone else's email, and a round-trip failure would break every real
unsubscribe link. Hand-written examples already exist; this harness proves the
invariants hold across the whole input space rather than a few cases.

Invariants:
  * **round-trip**: for any email and any secret, verifying the freshly built
    token recovers exactly the original email;
  * **unforgeable under a wrong secret**: a token built with one secret never
    verifies under a different secret;
  * **tamper-evident token**: mutating any single character of a valid token
    makes verification fail (None);
  * **tamper-evident subject**: substituting a different email's b64 (keeping
    the original token) fails — the HMAC binds the token to the email;
  * **never crashes**: arbitrary garbage in the b64/token fields returns None,
    not an exception (the endpoint must answer 400, never 500).

Run standalone:
    pytest tests/stress/test_unsubscribe_token_stress.py -q
"""

from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.leads.unsubscribe import (
    build_unsubscribe_token,
    verify_unsubscribe_token,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# st.text() excludes lone surrogates (category 'Cs') by default, so every value
# round-trips through ``str.encode()`` exactly as a real email field would.
emails = st.text(max_size=120)
secrets = st.text(min_size=1, max_size=64)


@STRESS
@given(email=emails, secret=secrets)
def test_round_trip_recovers_email(email, secret):
    email_b64, token = build_unsubscribe_token(email, secret)
    assert verify_unsubscribe_token(email_b64, token, secret) == email


@STRESS
@given(email=emails, secret_a=secrets, secret_b=secrets)
def test_wrong_secret_never_verifies(email, secret_a, secret_b):
    email_b64, token = build_unsubscribe_token(email, secret_a)
    result = verify_unsubscribe_token(email_b64, token, secret_b)
    # A different secret must reject; an identical secret round-trips. HMAC makes
    # a cross-secret digest collision cryptographically unreachable by fuzzing.
    if secret_a == secret_b:
        assert result == email
    else:
        assert result is None


@STRESS
@given(email=emails, secret=secrets, idx=st.integers(0, 1000), repl=st.integers(0, 15))
def test_single_char_token_tamper_is_rejected(email, secret, idx, repl):
    email_b64, token = build_unsubscribe_token(email, secret)
    # token is a 64-char lowercase hex digest; flip one nibble to a different one.
    pos = idx % len(token)
    new_char = "0123456789abcdef"[repl]
    if new_char == token[pos]:
        new_char = "0123456789abcdef"[(repl + 1) % 16]
    tampered = token[:pos] + new_char + token[pos + 1 :]
    assert tampered != token
    assert verify_unsubscribe_token(email_b64, tampered, secret) is None


@STRESS
@given(email_a=emails, email_b=emails, secret=secrets)
def test_token_is_bound_to_its_email(email_a, email_b, secret):
    # Sign email_a, then present email_b's b64 with email_a's token. The HMAC is
    # computed over the decoded email, so a mismatch must be rejected.
    _, token_a = build_unsubscribe_token(email_a, secret)
    email_b_b64, _ = build_unsubscribe_token(email_b, secret)
    result = verify_unsubscribe_token(email_b_b64, token_a, secret)
    if email_a == email_b:
        assert result == email_a
    else:
        assert result is None


@STRESS
@given(
    blob=st.text(max_size=200),
    token=st.text(max_size=80),
    secret=secrets,
)
def test_arbitrary_input_never_raises(blob, token, secret):
    # Whatever garbage a caller posts, verify must return a value (str or None),
    # never raise — the endpoint depends on this to answer 400 instead of 500.
    result = verify_unsubscribe_token(blob, token, secret)
    assert result is None or isinstance(result, str)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
