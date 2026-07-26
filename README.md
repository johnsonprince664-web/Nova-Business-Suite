# Legacy Jewelry Co. CRM Pro

A production-style React CRM with:

- React + Vite
- Tailwind CSS
- shadcn-style local UI components built with Radix
- Framer Motion animations
- Recharts analytics
- Lucide icons
- Supabase authentication, database, realtime sync, and row-level security
- Responsive desktop and mobile UI
- Dark mode
- Notifications
- Customers, inventory, sales, special orders, expenses, analytics, and settings

## Windows PowerShell setup

Open PowerShell inside this folder, then run:

```powershell
npm install
npm run dev
```

Open the address Vite prints, usually:

```text
http://localhost:5173
```

## First use

1. Create an account on the sign-up screen.
2. Sign in.
3. Your Legacy Jewelry Co. workspace is created automatically.
4. Your starter inventory and packaging expenses are added automatically.
5. Data syncs through Supabase, so you can use the same account on another device.

## Production build

```powershell
npm run build
npm run preview
```

The compiled app will be placed in the `dist` folder.

## Security

The app uses Supabase authentication and row-level security. Each signed-in account can only access the Legacy CRM business it owns. The included key is a public/publishable browser key; no service-role secret is included.


## Modal fix

This build includes corrected viewport-centered, internally scrollable forms. New/Edit dialogs remain fully accessible on smaller displays and at different Windows scaling levels.


## Sales editing update

Sales can now be edited after they are recorded. The Sales table shows shipping/delivery cost and notes, and the edit form can update the date, customer, product, quantity, payment method, shipping cost, and notes. Inventory is restored and recalculated atomically by Supabase when a sale is changed.


## Live tax reserve fix

The dashboard tax reserve is now calculated as:

`positive net profit × the tax reserve percentage in Settings`

Net profit includes revenue minus inventory cost, shipping/delivery costs, and business expenses. If net profit is zero or negative, the reserve is $0.00. The dashboard also refreshes immediately when sale line items or the tax percentage change.


## Custom sale price and discounts

Each sale now has an editable **Actual unit sale price**. Selecting a product starts with its inventory list price, but the amount can be changed for discounts, negotiated prices, clearance, or promotions.

Example: a ring listed at $150 can be recorded or edited as sold for $75. The Sales table displays the actual sold price, list price, and 50% discount badge. Revenue, profit, and the dashboard tax reserve recalculate from the actual $75 selling price.


## Wheel scrolling and expense receipt storage

- Wide tables and filter tabs no longer require dragging a visible horizontal scrollbar.
- Hover a wide table and use the mouse wheel to move left or right.
- Once the table reaches an edge, the same wheel continues scrolling the page vertically.
- Scrollbars are visually hidden, while mouse wheel, trackpad, keyboard, and touch scrolling remain available.
- Expense records now accept receipt screenshots or PDFs.
- Receipt files are stored privately in Supabase Storage and can only be opened by the signed-in account that uploaded them.
- Accepted formats: JPG, PNG, WEBP, HEIC, HEIF, and PDF, up to 10 MB.


## Inventory categories

Inventory now has separate tabs for:

- Jewelry
- Packaging
- Other

Use Packaging for jewelry boxes, bags, tissue paper, shipping mailers, and similar supplies. Use Other for business cards, thank-you cards, display stands, cleaning cloths, and miscellaneous business materials.

The stock-status filter still works independently. Only Jewelry items appear in the Sale product selector.


## Split payments

A sale can now contain multiple payments. For example, a $225 sale can be recorded as $125 Venmo plus $100 cash. The payment editor shows the sale total, payment total, and remaining or overpaid amount, and the sale cannot be saved until the amounts match. Existing single-payment sales are automatically imported into the new payment records.

## Tax Vault

The CRM now includes a private **Tax Vault** for supporting records:

- Bank statements
- Venmo, PayPal, Cash App, or other payment-app statements
- Cash-deposit proof
- Amazon receipts and invoices
- Supplier invoices
- Shipping receipts
- Tax forms and estimated-tax payment confirmations
- Business documents and miscellaneous proof

You can upload several screenshots, PDFs, or CSV exports at once. Each file can be linked to one or more sales, expenses, inventory items, or special orders. Linked proof is visible from the specific CRM record and in the central Tax Vault.

Existing expense receipt uploads also appear automatically in the Tax Vault. Tax Vault uploads are stored in a private Supabase Storage bucket and opened through short-lived signed URLs.

## Custom section tabs

The top-right **New tab** button now creates and manages custom tabs for the section currently open:

- Customers
- Inventory
- Sales
- Orders
- Expenses
- Tax Vault

Examples include Shipping, Local Pickup, Wholesale, Pop-up Event, Needs Follow-up, or a tax year. The normal page buttons such as **Add customer**, **New sale**, **Add expense**, and **Upload documents** are unchanged.

A record can be assigned to one custom tab from its Add/Edit form. When a new record is created while a custom tab is active, that tab is selected automatically. Custom tabs can be renamed or deleted; deleting a tab never deletes the records inside it.

## Tax Vault visibility

Tax Vault is available in the left sidebar and as a dedicated dashboard card. It stores private tax-proof documents and lets each file be linked to the relevant sale, expense, inventory item, or special order.


## Tax Vault multi-picture management

Each Tax Vault entry can now hold several screenshots, photos, PDFs, or CSV files as one grouped record. When creating an entry, select multiple files at once. When editing an existing entry, you can:

- Add more pictures or files later
- View each saved file individually
- Replace one saved file without changing the rest
- Delete an individual file while keeping the Tax Vault entry

The final remaining file must be replaced or the full Tax Vault entry must be deleted, so an entry is never left without supporting proof. Existing Tax Vault uploads are automatically carried into the new grouped-file system.
