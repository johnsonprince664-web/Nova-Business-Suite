# JARVIS + Legacy CRM coexistence

- The original Legacy CRM remains the authoritative manual interface.
- Tax Vault, customers, sales, orders, expenses, settings, and inventory controls stay available.
- JARVIS is an intelligence and command layer around the CRM, not a replacement for it.
- Manual CRM edits and JARVIS inventory edits target the same Supabase records.
- JARVIS inventory writes require one uniquely identified inventory row and an allowed field.
- Non-JSON AI/API responses are converted to safe errors and never mutate CRM data.
