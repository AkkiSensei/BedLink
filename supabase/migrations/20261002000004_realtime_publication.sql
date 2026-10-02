-- BedLink Phase 10: Realtime Publication Configuration
-- Adds relevant tables to the supabase_realtime publication
-- Sets REPLICA IDENTITY FULL so UPDATE/DELETE events contain complete row data for RLS/filters

DO $$
BEGIN
  -- Ensure supabase_realtime publication exists
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Add public.beds
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'beds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.beds;
  END IF;

  -- Add public.bed_requests
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'bed_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bed_requests;
  END IF;

  -- Add public.reservations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
  END IF;
END $$;

ALTER TABLE public.beds REPLICA IDENTITY FULL;
ALTER TABLE public.bed_requests REPLICA IDENTITY FULL;
ALTER TABLE public.reservations REPLICA IDENTITY FULL;
