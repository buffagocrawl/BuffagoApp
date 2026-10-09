-- Fix the security-advisor finding on the append-only receipts trigger only.
alter function public.wing_photo_receipt_append_only()
  set search_path to pg_catalog, public;
