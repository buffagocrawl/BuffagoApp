# Build-artifact secret scan

Historical tracked Expo output contained `SEC-001` and an expected Supabase anon JWT. Generated Expo roots are now ignored and rejected by the repository scanner.

The current web export completed successfully. The current tracked-tree scan found no Google-key pattern, private key, server-only variable reference in public app code, or tracked generated Expo export. Android/iOS release binaries and source maps were not available for extraction, so those assessments remain incomplete.

The direct client Directions design and replacement-key restrictions remain unverified; a client-visible key is not safe merely because exposure is intended.
