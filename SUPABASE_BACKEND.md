# Supabase backend

The connected Supabase project now includes these secured tables:

- `legacy_businesses`
- `legacy_customers`
- `legacy_inventory`
- `legacy_sales`
- `legacy_sale_items`
- `legacy_orders`
- `legacy_expenses`

Backend features:

- Supabase email/password authentication
- Row-level security for every CRM table
- Automatic one-business-per-account workspace setup
- Atomic `legacy_record_sale` database function
- Automatic inventory reduction when a sale is recorded
- Automatic inventory restoration when a sale is deleted
- Realtime updates for customer, inventory, sales, order, and expense changes
- Database indexes for common CRM lookups

The browser receives only the public Supabase publishable key. No service-role secret is included.


## Split sale payments

`legacy_sale_payments` stores one or more payment methods and amounts for each sale. RLS restricts rows to the business owner. The new eight-argument `legacy_record_sale` and nine-argument `legacy_update_sale` RPC overloads validate that payment totals exactly match sale item totals.

## Tax document vault

Backend resources added:

- `legacy_documents`
- `legacy_document_links`
- Private Storage bucket: `legacy-tax-documents`
- Owner-only row-level security for both tables
- Owner-folder Storage policies for select, insert, update, and delete
- Realtime publication for the document and link tables
- Validation trigger ensuring linked CRM records belong to the same business
- Cleanup triggers that remove stale links if a sale, expense, inventory item, or order is deleted

The bucket accepts JPG, PNG, WEBP, HEIC/HEIF, PDF, and CSV files up to 20 MB each.

## Custom section tabs

Backend resources added:

- `legacy_custom_tabs`
- `legacy_record_tabs`
- `legacy_set_record_tab(...)` RPC
- Owner-only row-level security and authenticated table permissions
- Realtime publication for tabs and record assignments
- Cleanup triggers that remove tab assignments when their CRM records are deleted

Each CRM record can belong to one custom tab. Deleting a custom tab removes only its assignments, not customers, inventory, sales, orders, expenses, or documents.
