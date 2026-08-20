-- Expand signup lifecycle email events to a daily next-step sequence.
-- The external sequencer owns delivery, while this table preserves app-side
-- CRM/audit state and lets paid-active organizations be skipped before sends.
ALTER TABLE public.signup_email_events
    DROP CONSTRAINT IF EXISTS signup_email_events_email_type_check;

ALTER TABLE public.signup_email_events
    ADD CONSTRAINT signup_email_events_email_type_check
    CHECK (
        email_type IN (
            'day_1_add_property',
            'day_3_upload_gl',
            'day_7_run_reconciliation',
            'day_14_add_billing',
            'day_24_keep_access',
            'day_1_confirm_plan',
            'day_2_add_property',
            'day_4_check_sample_report',
            'day_5_run_reconciliation',
            'day_6_add_billing',
            'day_7_get_help'
        )
    );

COMMENT ON TABLE public.signup_email_events IS
    'App-owned post-signup daily next-step schedule. Due sends skip organizations with active paid subscriptions.';
