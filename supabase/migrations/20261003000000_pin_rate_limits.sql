CREATE TABLE IF NOT EXISTS public.pin_rate_limits (
  identifier TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pin_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_pin_rate_limit(
  p_identifier TEXT,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_seconds CONSTANT INTEGER := 900;
  v_max_attempts CONSTANT INTEGER := 5;
  v_row public.pin_rate_limits;
  v_retry INTEGER;
BEGIN
  INSERT INTO public.pin_rate_limits(identifier, attempt_count, window_started_at, updated_at)
  VALUES (p_identifier, 1, p_now, p_now)
  ON CONFLICT (identifier) DO UPDATE
  SET
    attempt_count = CASE
      WHEN EXTRACT(EPOCH FROM (p_now - pin_rate_limits.window_started_at)) >= v_window_seconds
      THEN 1
      ELSE pin_rate_limits.attempt_count + 1
    END,
    window_started_at = CASE
      WHEN EXTRACT(EPOCH FROM (p_now - pin_rate_limits.window_started_at)) >= v_window_seconds
      THEN p_now
      ELSE pin_rate_limits.window_started_at
    END,
    updated_at = p_now
  RETURNING * INTO v_row;

  IF v_row.attempt_count > v_max_attempts THEN
    v_retry := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM ((v_row.window_started_at + make_interval(secs => v_window_seconds)) - p_now)))::INTEGER
    );
    RETURN QUERY SELECT FALSE, v_retry;
  ELSE
    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_pin_rate_limit(p_identifier TEXT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.pin_rate_limits WHERE identifier = p_identifier;
$$;

REVOKE ALL ON TABLE public.pin_rate_limits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_pin_rate_limit(TEXT, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pin_rate_limit(TEXT) TO anon, authenticated;
