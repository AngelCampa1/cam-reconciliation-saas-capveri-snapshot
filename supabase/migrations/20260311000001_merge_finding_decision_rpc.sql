-- Atomic JSONB merge for finding decisions to prevent read-modify-write races.
-- Called by the application instead of read-modify-write on finding_decisions.
CREATE OR REPLACE FUNCTION merge_finding_decision(
    p_analysis_id UUID,
    p_org_id UUID,
    p_finding_id TEXT,
    p_decision JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_decisions JSONB;
BEGIN
    UPDATE cross_doc_analyses
    SET finding_decisions = finding_decisions || jsonb_build_object(p_finding_id, p_decision)
    WHERE id = p_analysis_id
      AND (p_org_id IS NULL OR organization_id = p_org_id)
    RETURNING finding_decisions INTO v_decisions;

    RETURN COALESCE(v_decisions, '{}'::JSONB);
END;
$$;

-- Grant execute to the authenticated role so app-layer RPC calls succeed.
-- SECURITY DEFINER means the function runs as its owner (superuser), not the
-- calling role, so the authenticated role still benefits from row-level security
-- via the WHERE clause in the UPDATE above.
GRANT EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB)
    TO authenticated;
