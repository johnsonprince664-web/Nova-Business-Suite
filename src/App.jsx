
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import {
  Bell, Boxes, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList,
  Contact, CreditCard, ExternalLink, FileImage, FileText, FolderLock, Gem,
  Landmark, LayoutDashboard, Link2, LogOut, Menu, Moon, PackagePlus, Paperclip,
  Plus, ReceiptText, Search, Settings, ShoppingBag, Sparkles, Sun, Trash2,
  TrendingUp, UploadCloud, Users, WalletCards, X
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "./lib/supabase";
import { money, today } from "./lib/utils";
import { useCRM } from "./hooks/useCRM";
import AuthScreen from "./components/AuthScreen";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Dialog } from "./components/ui/dialog";
import { Input, Select, Textarea } from "./components/ui/input";

const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["customers", "Customers", Users],
  ["inventory", "Inventory", Gem],
  ["sales", "Sales", CircleDollarSign],
  ["orders", "Orders", ClipboardList],
  ["expenses", "Expenses", ReceiptText],
  ["tax-vault", "Tax Vault", FolderLock],
  ["settings", "Settings", Settings],
];

const documentCategories = [
  "Bank Statement",
  "Payment App Statement",
  "Cash Deposit Proof",
  "Amazon Receipt",
  "Supplier Invoice",
  "Shipping Receipt",
  "Tax Form",
  "Tax Payment",
  "Business Document",
  "Other",
];

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (authLoading) return <CenteredLoader label="Starting Legacy CRM..." />;
  if (!session) return <AuthScreen />;
  return <CRM user={session.user} />;
}

function CRM({ user }) {
  const { data, loading, error, api, refresh } = useCRM(user);
  const [page, setPage] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("legacy-dark") === "true");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("legacy-dark", String(dark));
  }, [dark]);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  async function perform(action, success) {
    try {
      await action();
      setModal(null);
      notify(success);
    } catch (err) {
      notify(err.message || "Something went wrong.");
    }
  }

  async function openStoredFile(file) {
    try {
      const url = await api.getStoredFileUrl(file.storage_bucket, file.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      notify(err.message || "Unable to open the saved file.");
    }
  }

  const metrics = useMemo(() => calculateMetrics(data), [data]);
  const lowStock = data.inventory.filter((item) => item.qty <= item.low_stock_threshold);
  const openOrders = data.orders.filter((order) => !["Completed", "Canceled"].includes(order.status));
  const vaultCount = documentFileTotal(data.documents) + data.expenses.filter((expense) => expense.receipt_path).length;
  const pageLabel = nav.find(([id]) => id === page)?.[1] || "Dashboard";
  const pageSupportsTabs = supportsCustomTabs(page);

  if (loading && !data.business) return <CenteredLoader label="Loading your business..." />;

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-white/10 bg-legacy-gradient p-5 text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gold-300 text-legacy-950 shadow-lg shadow-gold-300/20">
              <Gem className="h-5 w-5" />
            </div>
            <div>
              <p className="font-black tracking-[.18em]">LEGACY</p>
              <p className="text-xs text-legacy-100">Jewelry Co.</p>
            </div>
          </div>
          <button className="rounded-xl p-2 hover:bg-white/10 lg:hidden" onClick={() => setMobileOpen(false)}><X /></button>
        </div>

        <nav className="mt-9 space-y-1.5">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => { setPage(id); setSearch(""); setMobileOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                page === id ? "bg-white/[0.14] text-white shadow-inner" : "text-legacy-100 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
              {id === "orders" && openOrders.length > 0 && <span className="ml-auto rounded-full bg-gold-300 px-2 py-0.5 text-[10px] font-bold text-legacy-950">{openOrders.length}</span>}
              {id === "tax-vault" && vaultCount > 0 && <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">{vaultCount}</span>}
              {id === "inventory" && lowStock.length > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-red-400" />}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-white/[0.08] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gold-200"><Sparkles className="h-4 w-4" /> Cloud synced</div>
          <p className="mt-2 text-xs leading-relaxed text-legacy-100">Your CRM is protected by Supabase authentication and row-level security.</p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 glass dark:border-slate-700/70">
          <div className="flex h-[72px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Button variant="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold-600">Legacy Jewelry Co.</p>
              <h1 className="truncate text-xl font-black tracking-tight">{pageLabel}</h1>
            </div>
            <div className="hidden w-full max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900 sm:flex">
              <Search className="h-4 w-4 text-slate-400" />
              <input className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder={`Search ${pageLabel.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="icon" onClick={() => setDark(!dark)}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
            <NotificationButton count={lowStock.length + openOrders.length} lowStock={lowStock} openOrders={openOrders} />
            <Button onClick={() => setModal(pageSupportsTabs ? { type: "custom-tab", page } : { type: quickType(page) })}><Plus className="h-4 w-4" /> <span className="hidden sm:inline">{pageSupportsTabs ? "New tab" : "New"}</span></Button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} <button className="font-bold underline" onClick={refresh}>Retry</button></div>}
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .2 }}>
              {page === "dashboard" && <Dashboard data={data} metrics={metrics} lowStock={lowStock} openOrders={openOrders} setPage={setPage} setModal={setModal} />}
              {page === "customers" && <Customers data={data} search={search} setModal={setModal} remove={(id) => perform(() => api.deleteCustomer(id), "Customer deleted")} />}
              {page === "inventory" && <Inventory data={data} search={search} setModal={setModal} openDocument={openStoredFile} remove={(id) => perform(() => api.deleteInventory(id), "Inventory deleted")} />}
              {page === "sales" && <Sales data={data} search={search} setModal={setModal} openDocument={openStoredFile} remove={(id) => perform(() => api.deleteSale(id), "Sale deleted")} />}
              {page === "orders" && <Orders data={data} search={search} setModal={setModal} openDocument={openStoredFile} remove={(id) => perform(() => api.deleteOrder(id), "Order deleted")} />}
              {page === "expenses" && <Expenses data={data} search={search} setModal={setModal} openDocument={openStoredFile} remove={(id) => perform(() => api.deleteExpense(id), "Expense deleted")} />}
              {page === "tax-vault" && <TaxVault data={data} search={search} setModal={setModal} openDocument={openStoredFile} remove={(id) => perform(() => api.deleteDocument(id), "Document deleted")} />}
              {page === "settings" && <SettingsPage data={data} api={api} user={user} notify={notify} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {modal && !["document","document-files","proof-list","custom-tab"].includes(modal.type) && <RecordModal modal={modal} setModal={setModal} data={data} perform={perform} api={api} />}
      {modal?.type === "document" && <TaxDocumentModal modal={modal} setModal={setModal} data={data} perform={perform} api={api} notify={notify} openDocument={openStoredFile} />}
      {modal?.type === "document-files" && <DocumentFilesDialog modal={modal} setModal={setModal} data={data} openDocument={openStoredFile} />}
      {modal?.type === "proof-list" && <ProofListDialog modal={modal} setModal={setModal} data={data} openDocument={openStoredFile} />}
      {modal?.type === "custom-tab" && <CustomTabModal modal={modal} setModal={setModal} data={data} api={api} />}
      {toast && <div className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-xl bg-legacy-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{toast}</div>}
    </div>
  );
}

function Dashboard({ data, metrics, lowStock, openOrders, setPage, setModal }) {
  const revenueByDay = buildRevenueSeries(data);
  const productData = buildProductSeries(data);
  const expenseData = buildExpenseSeries(data);
  const vaultCount = documentFileTotal(data.documents) + data.expenses.filter((expense) => expense.receipt_path).length;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-legacy-gradient p-7 text-white shadow-glow sm:p-9">
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute right-12 top-12 h-40 w-40 rounded-full border border-white/10" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-gold-200"><Sparkles className="h-4 w-4" /> Luxury business command center</div>
          <h2 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">Sell beautifully.<br />Grow intentionally.</h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-legacy-100 sm:text-base">Manage customers, inventory, sales, special orders, expenses, analytics, and your private Tax Vault for receipts, statements, and audit proof.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => setModal({ type: "sale" })}><CircleDollarSign className="h-4 w-4" /> Record sale</Button>
            <Button variant="secondary" className="border-white/15 bg-white/10 text-white hover:bg-white/15" onClick={() => setModal({ type: "customer" })}><Contact className="h-4 w-4" /> Add customer</Button>
            <Button variant="secondary" className="border-white/15 bg-white/10 text-white hover:bg-white/15" onClick={() => setPage("tax-vault")}><FolderLock className="h-4 w-4" /> Open Tax Vault</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={CircleDollarSign} label="Total revenue" value={money(metrics.revenue)} note={`${data.sales.length} recorded sales`} tone="orange" />
        <Kpi icon={TrendingUp} label="Net profit" value={money(metrics.netProfit)} note="After costs and expenses" tone="purple" />
        <Kpi icon={Gem} label="Inventory value" value={money(metrics.inventoryValue)} note={`${metrics.stock} items in stock`} tone="blue" />
        <Kpi icon={WalletCards} label="Tax reserve" value={money(metrics.tax)} note={`${Math.round(metrics.taxRate * 100)}% of ${money(metrics.taxableProfit)} positive profit`} tone="green" />
      </section>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-legacy-100 text-legacy-700 dark:bg-legacy-500/15 dark:text-legacy-300">
            <FolderLock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold">Tax Vault</p>
            <p className="mt-1 text-sm text-slate-500">Your private archive currently has {vaultCount} saved {vaultCount === 1 ? "file" : "files"}, including linked receipts and statements.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPage("tax-vault")}><FolderLock className="h-4 w-4" /> View vault</Button>
            <Button onClick={() => setModal({ type: "document" })}><UploadCloud className="h-4 w-4" /> Upload proof</Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_.85fr]">
        <Card>
          <CardHeader>
            <div><Eyebrow>Performance</Eyebrow><h3 className="mt-1 text-lg font-bold">Revenue trend</h3></div>
            <Badge tone="blue">Last 30 days</Badge>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueByDay}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#278fa7" stopOpacity={.45}/><stop offset="95%" stopColor="#278fa7" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dfe8ec" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => money(value)} />
                <Area type="monotone" dataKey="revenue" stroke="#278fa7" strokeWidth={3} fill="url(#revenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><Eyebrow>Attention</Eyebrow><h3 className="mt-1 text-lg font-bold">Low stock</h3></div>
            <button className="flex items-center text-xs font-bold text-legacy-600" onClick={() => setPage("inventory")}>View all <ChevronRight className="h-4 w-4" /></button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStock.length ? lowStock.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Gem className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.product}</p><p className="text-xs text-slate-500">{(item.item_type || "Jewelry") === "Jewelry" ? (item.color || "No color") : (item.item_type || "Other")}</p></div>
                <Badge tone={item.qty === 0 ? "red" : "gold"}>{item.qty === 0 ? "Sold out" : `${item.qty} left`}</Badge>
              </div>
            )) : <Empty icon={Boxes} title="Stock looks good" text="No low-stock alerts right now." />}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><div><Eyebrow>Products</Eyebrow><h3 className="mt-1 text-lg font-bold">Top-selling products</h3></div></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dfe8ec" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => `${value} sold`} />
                <Bar dataKey="qty" fill="#7755dd" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><Eyebrow>Spending</Eyebrow><h3 className="mt-1 text-lg font-bold">Expense mix</h3></div></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={3}>
                  {expenseData.map((_, index) => <Cell key={index} fill={["#278fa7","#7755dd","#f1b83f","#32a368","#ef6f6c"][index % 5]} />)}
                </Pie>
                <Tooltip formatter={(value) => money(value)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div><Eyebrow>Orders</Eyebrow><h3 className="mt-1 text-lg font-bold">Open special orders</h3></div>
          <button className="flex items-center text-xs font-bold text-legacy-600" onClick={() => setPage("orders")}>Manage orders <ChevronRight className="h-4 w-4" /></button>
        </CardHeader>
        <CardContent>
          {openOrders.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {openOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{order.product}</p><p className="mt-1 text-xs text-slate-500">{customerName(data, order.customer_id)}</p></div><Status value={order.status} /></div>
                  <div className="mt-4 flex justify-between text-xs text-slate-500"><span>Balance due</span><strong className="text-slate-900 dark:text-white">{money(order.total - order.deposit)}</strong></div>
                </div>
              ))}
            </div>
          ) : <Empty icon={ShoppingBag} title="No open orders" text="Special orders will appear here." />}
        </CardContent>
      </Card>
    </div>
  );
}

function Customers({ data, search, setModal, remove }) {
  const [filter, setFilter] = useState("All");
  const customTabs = customTabsForPage(data, "customers");
  useResetDeletedCustomTab(filter, setFilter, customTabs);
  const rows = data.customers.filter((customer) => {
    const matches = `${customer.name} ${customer.phone || ""} ${customer.email || ""} ${customer.notes || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = isCustomTabKey(filter)
      ? recordIsInCustomTab(data, "customer", customer.id, filter)
      : filter === "All" || customer.status === filter;
    return matches && matchesFilter;
  });

  return <Page title="Customers" subtitle="Relationships, preferences, and purchase history." action="Add customer" onAction={() => setModal({ type: "customer", presetTabId: customTabIdFromKey(filter) })} tabs={withCustomTabs(["All","Active","Potential","Inactive"], customTabs)} active={filter} setActive={setFilter}>
    <TableCard>
      {rows.length ? <table className="data-table w-full min-w-[940px]"><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Status</th><th>Custom tab</th><th>Total spent</th><th>Notes</th><th /></tr></thead><tbody>
        {rows.map((customer) => {
          const sales = data.sales.filter((sale) => sale.customer_id === customer.id);
          const total = sales.reduce((sum, sale) => sum + saleTotal(data, sale.id), 0);
          return <tr key={customer.id}><td><strong>{customer.name}</strong><span className="block text-xs text-slate-500">{sales.length} purchases</span></td><td>{customer.phone || "—"}</td><td>{customer.email || "—"}</td><td><Status value={customer.status} /></td><td><RecordTabBadge data={data} recordType="customer" recordId={customer.id} /></td><td>{money(total)}</td><td className="max-w-xs truncate">{customer.notes || "—"}</td><td><Actions edit={() => setModal({ type: "customer", record: customer })} remove={() => remove(customer.id)} /></td></tr>;
        })}
      </tbody></table> : <Empty icon={Users} title="No customers found" text="Add a customer or adjust the active filters." />}
    </TableCard>
  </Page>;
}

function Inventory({ data, search, setModal, openDocument, remove }) {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState("All stock");
  const customTabs = customTabsForPage(data, "inventory");
  useResetDeletedCustomTab(categoryFilter, setCategoryFilter, customTabs);

  const rows = data.inventory.filter((item) => {
    const itemType = item.item_type || "Jewelry";
    const matches = `${item.product} ${itemType} ${item.sku || ""} ${item.color || ""} ${item.supplier || ""}`.toLowerCase().includes(search.toLowerCase());
    const stockStatus = item.qty === 0 ? "Sold out" : item.qty <= item.low_stock_threshold ? "Low stock" : "In stock";
    const matchesCategory = isCustomTabKey(categoryFilter)
      ? recordIsInCustomTab(data, "inventory", item.id, categoryFilter)
      : categoryFilter === "All" || itemType === categoryFilter;
    const matchesStock = stockFilter === "All stock" || stockFilter === stockStatus;
    return matches && matchesCategory && matchesStock;
  });

  return <Page
    title="Inventory"
    subtitle="Jewelry, packaging, business cards, and other business supplies. Attach invoices or purchase proof to any item."
    action="Add inventory"
    onAction={() => setModal({ type: "inventory", presetTabId: customTabIdFromKey(categoryFilter) })}
    tabs={withCustomTabs(["All","Jewelry","Packaging","Other"], customTabs)}
    active={categoryFilter}
    setActive={setCategoryFilter}
  >
    <div className="flex justify-end">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Stock
        <Select className="w-40" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
          {["All stock","In stock","Low stock","Sold out"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </label>
    </div>

    <TableCard>
      {rows.length ? <table className="data-table w-full min-w-[1340px]"><thead><tr><th>Item</th><th>Type</th><th>Custom tab</th><th>SKU</th><th>Supplier</th><th>Stock</th><th>Unit cost</th><th>Sale price</th><th>Margin</th><th>Tax proof</th><th /></tr></thead><tbody>
        {rows.map((item) => {
          const itemType = item.item_type || "Jewelry";
          return <tr key={item.id}>
            <td><strong>{item.product}</strong><span className="block text-xs text-slate-500">{itemType === "Jewelry" ? (item.color || "No color") : itemType}</span></td>
            <td><Badge tone={itemType === "Jewelry" ? "blue" : itemType === "Packaging" ? "gold" : "slate"}>{itemType}</Badge></td>
            <td><RecordTabBadge data={data} recordType="inventory" recordId={item.id} /></td>
            <td>{item.sku || "—"}</td>
            <td>{item.supplier || "—"}</td>
            <td><Status value={item.qty === 0 ? "Sold out" : item.qty <= item.low_stock_threshold ? "Low stock" : `${item.qty} in stock`} /></td>
            <td>{money(item.unit_cost)}</td>
            <td>{Number(item.sale_price) > 0 ? money(item.sale_price) : "—"}</td>
            <td>{Number(item.sale_price) > 0 ? money(item.sale_price - item.unit_cost) : "—"}</td>
            <td><ProofCell data={data} linkedType="inventory" linkedId={item.id} title={item.product} setModal={setModal} openDocument={openDocument} /></td>
            <td><Actions edit={() => setModal({ type: "inventory", record: item })} remove={() => remove(item.id)} /></td>
          </tr>;
        })}
      </tbody></table> : <Empty icon={Gem} title="No inventory found" text="Add an item or adjust the active filters." />}
    </TableCard>
  </Page>;
}

function Sales({ data, search, setModal, openDocument, remove }) {
  const [filter, setFilter] = useState("All");
  const customTabs = customTabsForPage(data, "sales");
  useResetDeletedCustomTab(filter, setFilter, customTabs);
  const rows = data.sales.filter((sale) => {
    const items = data.saleItems.filter((item) => item.sale_id === sale.id);
    const consumables = data.saleConsumables.filter((item) => item.sale_id === sale.id);
    const payments = data.salePayments.filter((payment) => payment.sale_id === sale.id);
    const matchesSearch = `${customerName(data, sale.customer_id)} ${items.map((item) => item.product_name).join(" ")} ${consumables.map((item) => `${item.item_name} ${item.item_type}`).join(" ")} ${payments.map((payment) => `${payment.method} ${payment.amount} ${payment.notes || ""}`).join(" ")} ${sale.payment_method} ${sale.notes || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || recordIsInCustomTab(data, "sale", sale.id, filter);
    return matchesSearch && matchesFilter;
  });

  return <Page title="Sales" subtitle="Record payments, packaging supplies, actual cost, shipping, and tax proof for every sale." action="New sale" onAction={() => setModal({ type: "sale", presetTabId: customTabIdFromKey(filter) })} tabs={withCustomTabs(["All"], customTabs)} active={filter} setActive={setFilter}>
    <TableCard>
      {rows.length ? <table className="data-table w-full min-w-[2100px]"><thead><tr><th>Date</th><th>Customer</th><th>Custom tab</th><th>Items</th><th>Sold price</th><th>Supplies used</th><th>Payments</th><th>Shipping</th><th>Revenue</th><th>Actual cost</th><th>Profit</th><th>Tax proof</th><th>Notes</th><th /></tr></thead><tbody>
        {rows.map((sale) => {
          const items = data.saleItems.filter((item) => item.sale_id === sale.id);
          const consumables = data.saleConsumables.filter((item) => item.sale_id === sale.id);
          const payments = data.salePayments.filter((payment) => payment.sale_id === sale.id);
          const revenue = items.reduce((sum, item) => sum + Number(item.qty) * Number(item.unit_price), 0);
          const productCost = items.reduce((sum, item) => sum + Number(item.qty) * Number(item.unit_cost), 0);
          const supplyCost = consumables.reduce((sum, item) => sum + Number(item.qty) * Number(item.unit_cost), 0);
          const actualCost = productCost + supplyCost;
          const deliveryCost = Number(sale.delivery_cost || 0);
          const displayedPayments = payments.length ? payments : [{ id: `legacy-${sale.id}`, method: sale.payment_method || "Other", amount: revenue, notes: "" }];
          return <tr key={sale.id}>
            <td>{sale.sold_at}</td>
            <td>{customerName(data, sale.customer_id)}</td>
            <td><RecordTabBadge data={data} recordType="sale" recordId={sale.id} /></td>
            <td>{items.map((item) => `${item.product_name} ×${item.qty}`).join(", ") || "—"}</td>
            <td>{items.length ? items.map((item) => {
              const inventoryItem = data.inventory.find((inventory) => inventory.id === item.inventory_id);
              const listPrice = Number(inventoryItem?.sale_price || item.unit_price || 0);
              const soldPrice = Number(item.unit_price || 0);
              const discount = listPrice > 0 && soldPrice < listPrice
                ? Math.round((1 - soldPrice / listPrice) * 100)
                : 0;
              return <div key={item.id} className="mb-1 last:mb-0">
                <strong>{money(soldPrice)}</strong>
                {discount > 0 && <span className="ml-2"><Badge tone="gold">{discount}% off</Badge></span>}
                {discount > 0 && <span className="block text-[10px] text-slate-400 line-through">List {money(listPrice)}</span>}
              </div>;
            }) : "—"}</td>
            <td>{consumables.length ? consumables.map((item) => <div key={item.id} className="mb-1 last:mb-0">
              <span className="text-xs font-semibold">{item.item_name} ×{item.qty}</span>
              <span className="block text-[10px] text-slate-400">{money(Number(item.qty) * Number(item.unit_cost))}</span>
            </div>) : "—"}</td>
            <td>{displayedPayments.map((payment) => <div key={payment.id} className="mb-1.5 last:mb-0" title={payment.notes || ""}>
              <Badge tone="blue">{payment.method}</Badge>
              <strong className="ml-2 text-xs">{money(payment.amount)}</strong>
              {payment.notes && <span className="block max-w-[190px] truncate pt-0.5 text-[10px] text-slate-400">{payment.notes}</span>}
            </div>)}</td>
            <td>{money(deliveryCost)}</td>
            <td>{money(revenue)}</td>
            <td>
              <strong>{money(actualCost)}</strong>
              <span className="block text-[10px] text-slate-400">Product {money(productCost)} · supplies {money(supplyCost)}</span>
            </td>
            <td>{money(revenue - actualCost - deliveryCost)}</td>
            <td><ProofCell data={data} linkedType="sale" linkedId={sale.id} title={`${customerName(data, sale.customer_id)} sale · ${sale.sold_at}`} setModal={setModal} openDocument={openDocument} /></td>
            <td className="max-w-[220px] truncate" title={sale.notes || ""}>{sale.notes || "—"}</td>
            <td><Actions edit={() => setModal({ type: "sale", record: sale })} remove={() => remove(sale.id)} /></td>
          </tr>;
        })}
      </tbody></table> : <Empty icon={CircleDollarSign} title="No sales found" text="Use New sale to record your first sale." />}
    </TableCard>
  </Page>;
}

function Orders({ data, search, setModal, openDocument, remove }) {
  const [filter, setFilter] = useState("All");
  const customTabs = customTabsForPage(data, "orders");
  useResetDeletedCustomTab(filter, setFilter, customTabs);
  const rows = data.orders.filter((order) => {
    const matches = `${order.product} ${customerName(data, order.customer_id)} ${order.status}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = isCustomTabKey(filter)
      ? recordIsInCustomTab(data, "order", order.id, filter)
      : filter === "All" || order.status === filter;
    return matches && matchesFilter;
  });

  return <Page title="Special orders" subtitle="Deposits, balances, sourcing, order progress, and supporting documents." action="New order" onAction={() => setModal({ type: "order", presetTabId: customTabIdFromKey(filter) })} tabs={withCustomTabs(["All","Inquiry","Deposit Paid","Ordered","Shipped","Ready","Completed"], customTabs)} active={filter} setActive={setFilter}>
    <TableCard>
      {rows.length ? <table className="data-table w-full min-w-[1180px]"><thead><tr><th>Customer</th><th>Product</th><th>Custom tab</th><th>Date</th><th>Total</th><th>Deposit</th><th>Balance</th><th>Status</th><th>Tax proof</th><th /></tr></thead><tbody>
        {rows.map((order) => <tr key={order.id}>
          <td>{customerName(data, order.customer_id)}</td>
          <td><strong>{order.product}</strong><span className="block max-w-xs truncate text-xs text-slate-500">{order.notes || "—"}</span></td>
          <td><RecordTabBadge data={data} recordType="order" recordId={order.id} /></td>
          <td>{order.order_date}</td><td>{money(order.total)}</td><td>{money(order.deposit)}</td><td>{money(order.total - order.deposit)}</td><td><Status value={order.status} /></td>
          <td><ProofCell data={data} linkedType="order" linkedId={order.id} title={`${order.product} order`} setModal={setModal} openDocument={openDocument} /></td>
          <td><Actions edit={() => setModal({ type: "order", record: order })} remove={() => remove(order.id)} /></td>
        </tr>)}
      </tbody></table> : <Empty icon={ClipboardList} title="No orders found" text="Create a special order or adjust your filters." />}
    </TableCard>
  </Page>;
}

function Expenses({ data, search, setModal, openDocument, remove }) {
  const [filter, setFilter] = useState("All");
  const categories = ["All","Packaging","Shipping","Gas/Mileage","Fees","Marketing","Supplies","Other"];
  const customTabs = customTabsForPage(data, "expenses");
  useResetDeletedCustomTab(filter, setFilter, customTabs);
  const rows = data.expenses.filter((expense) => {
    const matches = `${expense.category} ${expense.description} ${expense.notes || ""} ${expense.receipt_name || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = isCustomTabKey(filter)
      ? recordIsInCustomTab(data, "expense", expense.id, filter)
      : filter === "All" || expense.category === filter;
    return matches && matchesFilter;
  });

  return <Page title="Expenses" subtitle="Business costs, receipts, and linked tax proof stored together." action="Add expense" onAction={() => setModal({ type: "expense", presetTabId: customTabIdFromKey(filter) })} tabs={withCustomTabs(categories, customTabs)} active={filter} setActive={setFilter}>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-bold">Fees</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Payment processing, Venmo Goods &amp; Services, PayPal, Shopify, marketplace, and bank fees.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-bold">Other</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">A real business expense that does not fit Packaging, Shipping, Mileage, Fees, Marketing, or Supplies.</p>
      </div>
    </div>
    <TableCard>
      {rows.length ? <table className="data-table w-full min-w-[1160px]"><thead><tr><th>Date</th><th>Category</th><th>Custom tab</th><th>Description</th><th>Amount</th><th>Tax proof</th><th>Notes</th><th /></tr></thead><tbody>
        {rows.map((expense) => <tr key={expense.id}>
          <td>{expense.expense_date}</td>
          <td><Badge tone="gold">{expense.category}</Badge></td>
          <td><RecordTabBadge data={data} recordType="expense" recordId={expense.id} /></td>
          <td><strong>{expense.description}</strong></td>
          <td>{money(expense.amount)}</td>
          <td><ProofCell data={data} linkedType="expense" linkedId={expense.id} title={expense.description} setModal={setModal} openDocument={openDocument} receipt={expense} /></td>
          <td className="max-w-[240px] truncate" title={expense.notes || ""}>{expense.notes || "—"}</td>
          <td><Actions edit={() => setModal({ type: "expense", record: expense })} remove={() => remove(expense.id)} /></td>
        </tr>)}
      </tbody></table> : <Empty icon={ReceiptText} title="No expenses found" text="Add an expense or adjust your filters." />}
    </TableCard>
  </Page>;
}


function TaxVault({ data, search, setModal, openDocument, remove }) {
  const [group, setGroup] = useState("All");
  const [year, setYear] = useState("All years");
  const customTabs = customTabsForPage(data, "tax-vault");
  useResetDeletedCustomTab(group, setGroup, customTabs);

  const uploaded = data.documents.map((document) => ({
    ...document,
    kind: "document",
    links: data.documentLinks.filter((link) => link.document_id === document.id),
  }));
  const expenseReceipts = data.expenses.filter((expense) => expense.receipt_path).map((expense) => ({
    id: `expense-receipt-${expense.id}`,
    kind: "expense-receipt",
    document_date: expense.expense_date,
    category: "Expense Receipt",
    title: expense.description,
    description: `${expense.category} expense · ${money(expense.amount)}`,
    storage_bucket: "legacy-expense-receipts",
    file_path: expense.receipt_path,
    file_name: expense.receipt_name || "Expense receipt",
    file_mime: expense.receipt_mime,
    links: [{ linked_type: "expense", linked_id: expense.id }],
    expense,
  }));
  const allRows = [...uploaded, ...expenseReceipts].sort((a, b) => String(b.document_date).localeCompare(String(a.document_date)));
  const years = Array.from(new Set(allRows.map((row) => String(row.document_date || "").slice(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const rows = allRows.filter((row) => {
    const linked = row.links.map((link) => recordLabel(data, link.linked_type, link.linked_id)).join(" ");
    const fileNames = row.kind === "document" ? documentFiles(row).map((file) => file.file_name).join(" ") : row.file_name || "";
    const matchesSearch = `${row.title} ${row.category} ${row.description || ""} ${fileNames} ${linked}`.toLowerCase().includes(search.toLowerCase());
    const matchesGroup = isCustomTabKey(group)
      ? row.kind === "document" && recordIsInCustomTab(data, "document", row.id, group)
      : group === "All" || vaultGroup(row.category) === group;
    const matchesYear = year === "All years" || String(row.document_date || "").startsWith(year);
    return matchesSearch && matchesGroup && matchesYear;
  });

  const linkedCount = allRows.filter((row) => row.links.length > 0).reduce((sum, row) => sum + (row.kind === "document" ? documentFiles(row).length : 1), 0);
  const statementCount = allRows.filter((row) => vaultGroup(row.category) === "Statements").reduce((sum, row) => sum + (row.kind === "document" ? documentFiles(row).length : 1), 0);
  const taxCount = allRows.filter((row) => vaultGroup(row.category) === "Taxes").reduce((sum, row) => sum + (row.kind === "document" ? documentFiles(row).length : 1), 0);
  const proofFileCount = allRows.reduce((sum, row) => sum + (row.kind === "document" ? documentFiles(row).length : 1), 0);

  return <Page title="Tax Vault" subtitle="One private, searchable home for bank statements, Venmo proof, cash deposits, Amazon invoices, receipts, and tax records." action="Upload documents" onAction={() => setModal({ type: "document", presetTabId: customTabIdFromKey(group) })} tabs={withCustomTabs(["All","Statements","Receipts","Taxes","Business","Other"], customTabs)} active={group} setActive={setGroup}>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={FolderLock} label="All proof files" value={String(proofFileCount)} note={`${data.documents.length} vault entries + expense receipts`} tone="purple" />
      <Kpi icon={Link2} label="Linked to records" value={String(linkedCount)} note="Sales, expenses, inventory, or orders" tone="green" />
      <Kpi icon={Landmark} label="Statements" value={String(statementCount)} note="Bank and payment-app history" tone="blue" />
      <Kpi icon={FileText} label="Tax records" value={String(taxCount)} note="Forms and tax payment proof" tone="orange" />
    </div>

    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold">Keep the original proof</p>
        <p className="mt-1 text-xs text-slate-500">Upload statement PDFs or screenshots here, then link each file to every CRM record it supports.</p>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        Tax year
        <Select className="w-40" value={year} onChange={(event) => setYear(event.target.value)}>
          <option>All years</option>
          {years.map((option) => <option key={option}>{option}</option>)}
        </Select>
      </label>
    </div>

    <TableCard>
      {rows.length ? <table className="data-table w-full min-w-[1320px]"><thead><tr><th>Date</th><th>Document</th><th>Category</th><th>Custom tab</th><th>Linked to</th><th>File</th><th>Description</th><th /></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td>{row.document_date}</td>
          <td><strong>{row.title}</strong><span className="block max-w-[240px] truncate text-xs text-slate-500">{row.kind === "document" ? documentSummary(row) : row.file_name}</span></td>
          <td><Badge tone={vaultGroup(row.category) === "Taxes" ? "green" : vaultGroup(row.category) === "Statements" ? "blue" : "gold"}>{row.category}</Badge></td>
          <td>{row.kind === "document" ? <RecordTabBadge data={data} recordType="document" recordId={row.id} /> : "—"}</td>
          <td>{row.links.length ? <div className="space-y-1">{row.links.map((link) => <span key={`${link.linked_type}-${link.linked_id}`} className="block max-w-[280px] truncate text-xs" title={recordLabel(data, link.linked_type, link.linked_id)}><Badge tone="slate">{link.linked_type}</Badge> <span className="ml-1">{recordLabel(data, link.linked_type, link.linked_id)}</span></span>)}</div> : <Badge tone="red">Unlinked</Badge>}</td>
          <td>{row.kind === "document"
            ? <Button variant="secondary" size="sm" onClick={() => setModal({ type: "document-files", record: row })}><FileImage className="h-4 w-4" /> View {documentFiles(row).length}</Button>
            : <Button variant="secondary" size="sm" onClick={() => openDocument(row)}><ExternalLink className="h-4 w-4" /> View</Button>}</td>
          <td className="max-w-[260px] truncate" title={row.description || ""}>{row.description || "—"}</td>
          <td>{row.kind === "document"
            ? <Actions edit={() => setModal({ type: "document", record: row })} remove={() => remove(row.id)} />
            : <Button variant="secondary" size="sm" onClick={() => setModal({ type: "expense", record: row.expense })}>Edit expense</Button>}</td>
        </tr>)}
      </tbody></table> : <Empty icon={FolderLock} title="No documents found" text="Upload proof or adjust the active filters." />}
    </TableCard>
  </Page>;
}

function SettingsPage({ data, api, user, notify }) {
  const [name, setName] = useState(data.business?.name || "Legacy Jewelry Co.");
  const [tax, setTax] = useState(Number(data.business?.tax_rate || .25) * 100);

  async function save(event) {
    event.preventDefault();
    try {
      await api.updateBusiness({ name, tax_rate: Number(tax) / 100 });
      notify("Settings saved");
    } catch (err) {
      notify(err.message);
    }
  }

  return <div className="mx-auto max-w-3xl space-y-5">
    <PageTitle title="Settings" subtitle="Business preferences and account security." />
    <Card>
      <CardHeader><div><Eyebrow>Business</Eyebrow><h3 className="mt-1 text-lg font-bold">Company settings</h3></div></CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <Field label="Business name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Tax reserve percentage"><Input type="number" min="0" max="100" step=".1" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Button>Save settings</Button></div>
        </form>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><div><Eyebrow>Account</Eyebrow><h3 className="mt-1 text-lg font-bold">Secure access</h3></div></CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">{user.email}</p><p className="text-sm text-slate-500">Authenticated with Supabase</p></div>
          <Button variant="secondary" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>
      </CardContent>
    </Card>
  </div>;
}

function RecordModal({ modal, setModal, data, perform, api }) {
  if (!modal) return null;
  const type = modal.type;
  const record = modal.record;
  const title = { customer:"Customer", inventory:"Inventory item", sale:"Sale", order:"Special order", expense:"Expense" }[type];
  const [form, setForm] = useState(() => defaults(type, record, data, modal.presetTabId));
  const [receiptFile, setReceiptFile] = useState(null);
  useEffect(() => {
    setForm(defaults(type, record, data, modal.presetTabId));
    setReceiptFile(null);
  }, [type, record?.id, modal.presetTabId, data.saleItems, data.saleConsumables, data.salePayments, data.inventory, data.recordTabs]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedInventory = type === "sale"
    ? data.inventory.find((item) => item.id === form.inventory_id)
    : null;
  const selectedListPrice = Number(selectedInventory?.sale_price || 0);
  const actualUnitPrice = Number(form.unit_price || 0);
  const saleDiscount = selectedListPrice > 0 && actualUnitPrice < selectedListPrice
    ? Math.round((1 - actualUnitPrice / selectedListPrice) * 100)
    : 0;
  const saleAmount = roundMoney(Number(form.qty || 0) * Number(form.unit_price || 0));
  const paymentAmount = roundMoney((form.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const existingConsumableQty = type === "sale" && record
    ? Object.fromEntries(data.saleConsumables.filter((item) => item.sale_id === record.id).map((item) => [item.inventory_id, Number(item.qty || 0)]))
    : {};
  const supplyInventory = data.inventory.filter((item) => (item.item_type || "Jewelry") !== "Jewelry");
  const productCost = selectedInventory ? Number(form.qty || 0) * Number(selectedInventory.unit_cost || 0) : 0;
  const supplyCost = (form.consumables || []).reduce((sum, selected) => {
    const item = data.inventory.find((inventory) => inventory.id === selected.inventory_id);
    return sum + Number(selected.qty || 0) * Number(item?.unit_cost || 0);
  }, 0);
  const actualItemCost = roundMoney(productCost + supplyCost);
  const deliveryCost = Number(form.delivery_cost || 0);
  const projectedProfit = roundMoney(saleAmount - actualItemCost - deliveryCost);
  const projectedMargin = saleAmount > 0 ? (projectedProfit / saleAmount) * 100 : 0;

  const submit = (event) => {
    event.preventDefault();
    if (type === "customer") perform(() => api.saveCustomer({ name:form.name, phone:form.phone||null, email:form.email||null, status:form.status, notes:form.notes||null }, record?.id, form.custom_tab_id), "Customer saved");
    if (type === "inventory") perform(() => api.saveInventory({ item_type:form.item_type, product:form.product, sku:form.sku||null, color:form.color||null, supplier:form.supplier||null, qty:Number(form.qty), low_stock_threshold:Number(form.low_stock_threshold), unit_cost:Number(form.unit_cost), sale_price:Number(form.sale_price) }, record?.id, form.custom_tab_id), "Inventory saved");
    if (type === "order") perform(() => api.saveOrder({ customer_id:form.customer_id||null, product:form.product, order_date:form.order_date, total:Number(form.total), deposit:Number(form.deposit), status:form.status, notes:form.notes||null }, record?.id, form.custom_tab_id), "Order saved");
    if (type === "expense") perform(
      () => api.saveExpense(
        { expense_date:form.expense_date, category:form.category, description:form.description, amount:Number(form.amount), notes:form.notes||null },
        record?.id,
        receiptFile,
        record?.receipt_path,
        form.custom_tab_id
      ),
      "Expense saved"
    );
    if (type === "sale") {
      const payments = (form.payments || []).map((payment) => ({
        method: payment.method,
        amount: Number(payment.amount),
        notes: payment.notes?.trim() || null,
      }));
      if (!payments.length || payments.some((payment) => !payment.method || !Number.isFinite(payment.amount) || payment.amount <= 0)) {
        window.alert("Add at least one payment with a method and an amount greater than $0.");
        return;
      }
      const paid = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
      const expected = roundMoney(Number(form.qty || 0) * Number(form.unit_price || 0));
      if (Math.abs(paid - expected) > 0.009) {
        window.alert(`Payments total ${money(paid)}, but the sale total is ${money(expected)}. Adjust the payment amounts before saving.`);
        return;
      }
      const consumables = (form.consumables || [])
        .filter((item) => item.inventory_id && Number(item.qty || 0) > 0)
        .map((item) => ({ inventory_id:item.inventory_id, qty:Number(item.qty) }));
      for (const consumable of consumables) {
        const inventoryItem = data.inventory.find((item) => item.id === consumable.inventory_id);
        const available = Number(inventoryItem?.qty || 0) + Number(existingConsumableQty[consumable.inventory_id] || 0);
        if (!inventoryItem || consumable.qty > available) {
          window.alert(`Not enough stock for ${inventoryItem?.product || "the selected supply"}. ${available} available including this sale.`);
          return;
        }
      }
      const values = {
        customer_id:form.customer_id||null,
        sold_at:form.sold_at,
        payment_method:payments.length > 1 ? "Split" : payments[0].method,
        delivery_cost:Number(form.delivery_cost),
        notes:form.notes||null,
        items:[{ inventory_id:form.inventory_id, qty:Number(form.qty), unit_price:Number(form.unit_price) }],
        consumables,
        payments,
        custom_tab_id: form.custom_tab_id || null,
      };
      perform(
        () => record ? api.updateSale(record.id, values) : api.recordSale(values),
        record ? "Sale updated" : "Sale recorded"
      );
    }
  };

  return <Dialog open onOpenChange={(open) => !open && setModal(null)} title={`${record ? "Edit" : "New"} ${title}`} description="Legacy Jewelry Co. cloud CRM">
    <form onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        {type === "customer" && <>
          <Field label="Name" wide><Input required value={form.name} onChange={(e) => update("name",e.target.value)} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => update("phone",e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => update("email",e.target.value)} /></Field>
          <Field label="Status"><Select value={form.status} onChange={(e) => update("status",e.target.value)}>{["Active","Potential","Inactive"].map(x=><option key={x}>{x}</option>)}</Select></Field>
          <Field label="Preferences / notes" wide><Textarea value={form.notes} onChange={(e) => update("notes",e.target.value)} /></Field>
        </>}
        {type === "inventory" && <>
          <Field label="Item type"><Select value={form.item_type} onChange={(event) => {
            const itemType = event.target.value;
            const matchingTab = customTabsForPage(data, "inventory").find((tab) => tab.name.trim().toLowerCase() === itemType.trim().toLowerCase());
            setForm((current) => ({ ...current, item_type:itemType, ...(matchingTab ? { custom_tab_id:matchingTab.id } : {}) }));
          }}>{inventoryItemTypes(data).map((option) => <option key={option}>{option}</option>)}</Select>
            <p className="mt-1.5 text-[11px] text-slate-500">Inventory custom tabs also appear here as item types.</p>
          </Field>
          <Field label="Item name"><Input required value={form.product} onChange={(e) => update("product",e.target.value)} /></Field>
          <Field label="SKU"><Input value={form.sku} onChange={(e) => update("sku",e.target.value)} /></Field>
          <Field label="Color / style"><Input value={form.color} onChange={(e) => update("color",e.target.value)} /></Field>
          <Field label="Supplier"><Input value={form.supplier} onChange={(e) => update("supplier",e.target.value)} /></Field>
          <Field label="Quantity"><Input required type="number" min="0" value={form.qty} onChange={(e) => update("qty",e.target.value)} /></Field>
          <Field label="Low-stock alert"><Input required type="number" min="0" value={form.low_stock_threshold} onChange={(e) => update("low_stock_threshold",e.target.value)} /></Field>
          <Field label="Unit cost"><Input required type="number" min="0" step=".01" value={form.unit_cost} onChange={(e) => update("unit_cost",e.target.value)} /></Field>
          <Field label="Sale price (use $0 if not sold)"><Input required type="number" min="0" step=".01" value={form.sale_price} onChange={(e) => update("sale_price",e.target.value)} /></Field>
        </>}
        {type === "sale" && <>
          <Field label="Date"><Input required type="date" value={form.sold_at} onChange={(e) => update("sold_at",e.target.value)} /></Field>
          <Field label="Customer"><Select value={form.customer_id} onChange={(e) => update("customer_id",e.target.value)}><option value="">Walk-in customer</option>{data.customers.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Product" wide><Select required value={form.inventory_id} onChange={(e) => {
            const inventoryId = e.target.value;
            const inventoryItem = data.inventory.find((item) => item.id === inventoryId);
            setForm((current) => {
              const nextPrice = inventoryItem ? Number(inventoryItem.sale_price) : current.unit_price;
              const nextTotal = roundMoney(Number(current.qty || 0) * Number(nextPrice || 0));
              return {
                ...current,
                inventory_id: inventoryId,
                unit_price: nextPrice,
                payments: syncSinglePayment(current.payments, nextTotal),
              };
            });
          }}><option value="">Select inventory</option>{data.inventory.filter(x=>(x.item_type || "Jewelry")==="Jewelry" && (x.qty>0 || x.id===form.inventory_id)).map(x=><option value={x.id} key={x.id}>{x.product} — {x.color || "No color"} ({x.qty + (x.id===form.inventory_id && record ? Number(form.qty||0) : 0)} available including this sale)</option>)}</Select></Field>
          <Field label="Quantity"><Input required type="number" min="1" value={form.qty} onChange={(e) => {
            const qty = e.target.value;
            setForm((current) => ({
              ...current,
              qty,
              payments: syncSinglePayment(current.payments, roundMoney(Number(qty || 0) * Number(current.unit_price || 0))),
            }));
          }} /></Field>
          <Field label="Actual unit sale price">
            <Input required type="number" min="0" step=".01" value={form.unit_price} onChange={(e) => {
              const unitPrice = e.target.value;
              setForm((current) => ({
                ...current,
                unit_price: unitPrice,
                payments: syncSinglePayment(current.payments, roundMoney(Number(current.qty || 0) * Number(unitPrice || 0))),
              }));
            }} />
            {selectedInventory && <p className="mt-1.5 text-[11px] text-slate-500">
              List price: {money(selectedListPrice)}
              {saleDiscount > 0 ? ` · ${saleDiscount}% discount` : " · Full price"}
            </p>}
          </Field>
          <Field label="Packaging & shipping supplies" wide>
            <SupplyPicker
              inventory={supplyInventory}
              selected={form.consumables || []}
              existingQuantities={existingConsumableQty}
              onChange={(consumables) => update("consumables", consumables)}
            />
          </Field>
          <Field label="Delivery / shipping cost"><Input type="number" min="0" step=".01" value={form.delivery_cost} onChange={(e) => update("delivery_cost",e.target.value)} /></Field>
          <Field label="Actual cost & projected profit" wide>
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-700 dark:bg-slate-950/50 sm:grid-cols-2 lg:grid-cols-5">
              <CostStat label="Product cost" value={productCost} />
              <CostStat label="Supplies" value={supplyCost} />
              <CostStat label="Actual item cost" value={actualItemCost} strong />
              <CostStat label="Shipping / delivery" value={deliveryCost} />
              <CostStat label="Projected profit" value={projectedProfit} strong note={`${projectedMargin.toFixed(1)}% margin`} />
            </div>
          </Field>
          <Field label="Payments" wide>
            <PaymentEditor
              payments={form.payments || []}
              saleTotal={saleAmount}
              paymentTotal={paymentAmount}
              onChange={(payments) => update("payments", payments)}
            />
          </Field>
          <Field label="Notes" wide><Textarea value={form.notes} onChange={(e) => update("notes",e.target.value)} /></Field>
        </>}
        {type === "order" && <>
          <Field label="Customer"><Select value={form.customer_id} onChange={(e) => update("customer_id",e.target.value)}><option value="">Select customer</option>{data.customers.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Order date"><Input required type="date" value={form.order_date} onChange={(e) => update("order_date",e.target.value)} /></Field>
          <Field label="Product / style" wide><Input required value={form.product} onChange={(e) => update("product",e.target.value)} /></Field>
          <Field label="Total price"><Input required type="number" min="0" step=".01" value={form.total} onChange={(e) => update("total",e.target.value)} /></Field>
          <Field label="Deposit paid"><Input required type="number" min="0" step=".01" max={form.total} value={form.deposit} onChange={(e) => update("deposit",e.target.value)} /></Field>
          <Field label="Status"><Select value={form.status} onChange={(e) => update("status",e.target.value)}>{["Inquiry","Deposit Paid","Ordered","Shipped","Ready","Completed","Canceled"].map(x=><option key={x}>{x}</option>)}</Select></Field>
          <Field label="Notes" wide><Textarea value={form.notes} onChange={(e) => update("notes",e.target.value)} /></Field>
        </>}
        {type === "expense" && <>
          <Field label="Date"><Input required type="date" value={form.expense_date} onChange={(e) => update("expense_date",e.target.value)} /></Field>
          <Field label="Category"><Select value={form.category} onChange={(e) => update("category",e.target.value)}>{["Packaging","Shipping","Gas/Mileage","Fees","Marketing","Supplies","Other"].map(x=><option key={x}>{x}</option>)}</Select></Field>
          <Field label="Description" wide><Input required value={form.description} onChange={(e) => update("description",e.target.value)} /></Field>
          <Field label="Amount"><Input required type="number" min="0" step=".01" value={form.amount} onChange={(e) => update("amount",e.target.value)} /></Field>
          <Field label="Receipt screenshot or PDF" wide>
            <ReceiptUpload
              file={receiptFile}
              existingName={record?.receipt_name}
              onChange={setReceiptFile}
            />
          </Field>
          <Field label="Notes" wide><Textarea value={form.notes} onChange={(e) => update("notes",e.target.value)} /></Field>
        </>}
        {supportsRecordCustomTab(type) && <Field label="Custom tab (optional)" wide>
          <Select value={form.custom_tab_id || ""} onChange={(event) => update("custom_tab_id", event.target.value)}>
            <option value="">No custom tab</option>
            {customTabsForPage(data, pageForRecordType(type)).map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
          </Select>
          <p className="mt-1.5 text-[11px] text-slate-500">Create tabs with the top New tab button, then assign this record here.</p>
        </Field>}
      </div>
      <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button>Save</Button></div>
    </form>
  </Dialog>;
}


function ProofCell({ data, linkedType, linkedId, title, setModal, openDocument, receipt }) {
  const documents = linkedDocuments(data, linkedType, linkedId);
  const hasReceipt = Boolean(receipt?.receipt_path);
  const count = documents.reduce((sum, document) => sum + documentFiles(document).length, 0) + (hasReceipt ? 1 : 0);

  return <div className="flex min-w-[170px] flex-wrap items-center gap-2">
    {count > 0 && <Button variant="secondary" size="sm" onClick={() => setModal({ type: "proof-list", linkedType, linkedId, title, receipt })}>
      <Paperclip className="h-4 w-4" /> {count} file{count === 1 ? "" : "s"}
    </Button>}
    <Button variant={count > 0 ? "ghost" : "secondary"} size="sm" onClick={() => setModal({ type: "document", presetLink: { linked_type: linkedType, linked_id: linkedId }, presetTitle: title })}>
      <UploadCloud className="h-4 w-4" /> {count > 0 ? "Add" : "Attach proof"}
    </Button>
  </div>;
}

function ProofListDialog({ modal, setModal, data, openDocument }) {
  const documents = linkedDocuments(data, modal.linkedType, modal.linkedId);
  const receipt = modal.receipt?.receipt_path ? {
    id: `receipt-${modal.receipt.id}`,
    title: modal.receipt.description,
    category: "Expense Receipt",
    file_name: modal.receipt.receipt_name || "Expense receipt",
    storage_bucket: "legacy-expense-receipts",
    file_path: modal.receipt.receipt_path,
    kind: "expense-receipt",
  } : null;
  const entries = receipt ? [receipt, ...documents] : documents;

  return <Dialog open onOpenChange={(open) => !open && setModal(null)} title={`Tax proof · ${modal.title}`} description="Every file linked to this CRM record">
    <div className="space-y-3">
      {entries.length ? entries.map((entry) => <div key={entry.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-legacy-100 text-legacy-700 dark:bg-legacy-500/15 dark:text-legacy-300"><FileText className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{entry.title}</p><p className="truncate text-xs text-slate-500">{entry.category} · {entry.kind === "expense-receipt" ? entry.file_name : documentSummary(entry)}</p></div>
        <div className="flex gap-2">
          {entry.kind === "expense-receipt"
            ? <Button variant="secondary" size="sm" onClick={() => openDocument(entry)}><ExternalLink className="h-4 w-4" /> View</Button>
            : <Button variant="secondary" size="sm" onClick={() => setModal({ type: "document-files", record: entry })}><FileImage className="h-4 w-4" /> View files</Button>}
          {entry.kind !== "expense-receipt" && <Button variant="ghost" size="sm" onClick={() => setModal({ type: "document", record: entry })}>Edit</Button>}
        </div>
      </div>) : <Empty icon={Paperclip} title="No proof attached yet" text="Add a statement, screenshot, invoice, or receipt to this record." />}
    </div>
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
      <Button onClick={() => setModal({ type: "document", presetLink: { linked_type: modal.linkedType, linked_id: modal.linkedId }, presetTitle: modal.title })}><Plus className="h-4 w-4" /> Add proof</Button>
    </div>
  </Dialog>;
}

function DocumentFilesDialog({ modal, setModal, data, openDocument }) {
  const record = data.documents.find((document) => document.id === modal.record?.id) || modal.record;
  const files = documentFiles(record);
  return <Dialog open onOpenChange={(open) => !open && setModal(null)} title={record?.title || "Tax Vault files"} description={`${files.length} saved file${files.length === 1 ? "" : "s"} in this entry`}>
    <div className="space-y-3">
      {files.map((file, index) => <div key={file.id || file.file_path} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-legacy-100 text-legacy-700 dark:bg-legacy-500/15 dark:text-legacy-300"><FileImage className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{file.file_name || `File ${index + 1}`}</p><p className="text-xs text-slate-500">{file.file_size ? `${(Number(file.file_size) / 1024 / 1024).toFixed(2)} MB` : "Saved proof"}</p></div>
        <Button variant="secondary" size="sm" onClick={() => openDocument(file)}><ExternalLink className="h-4 w-4" /> View</Button>
      </div>)}
    </div>
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
      <Button onClick={() => setModal({ type: "document", record })}>Manage files</Button>
    </div>
  </Dialog>;
}

function TaxDocumentModal({ modal, setModal, data, perform, api, notify, openDocument }) {
  const record = modal.record ? (data.documents.find((document) => document.id === modal.record.id) || modal.record) : null;
  const [form, setForm] = useState(() => documentDefaults({ ...modal, record }, data));
  const [files, setFiles] = useState([]);
  const [busyFile, setBusyFile] = useState("");
  const replaceRefs = useRef({});

  useEffect(() => {
    setForm(documentDefaults({ ...modal, record }, data));
    setFiles([]);
  }, [record?.id, modal.presetLink?.linked_type, modal.presetLink?.linked_id, modal.presetTabId, data.documentLinks, data.recordTabs]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!record && !files.length) {
      window.alert("Choose at least one statement, screenshot, receipt, PDF, or CSV file.");
      return;
    }
    const cleanedLinks = (form.links || []).filter((link) => link.linked_type && link.linked_id);
    perform(
      () => api.saveDocuments({
        document_date: form.document_date,
        category: form.category,
        title: form.title?.trim() || "",
        description: form.description?.trim() || null,
        custom_tab_id: form.custom_tab_id || null,
        links: cleanedLinks,
        files,
      }, record?.id),
      record ? (files.length ? `${files.length} file${files.length === 1 ? "" : "s"} added and entry updated` : "Document updated") : `Tax Vault entry created with ${files.length} file${files.length === 1 ? "" : "s"}`
    );
  };

  async function replaceSavedFile(file, replacement) {
    if (!replacement) return;
    try {
      setBusyFile(file.id);
      await api.replaceDocumentFile(record.id, file.id, replacement);
      notify("Picture replaced");
    } catch (error) {
      notify(error.message || "Unable to replace that picture.");
    } finally {
      setBusyFile("");
    }
  }

  async function deleteSavedFile(file) {
    if (!window.confirm(`Delete ${file.file_name}?`)) return;
    try {
      setBusyFile(file.id);
      await api.deleteDocumentFile(record.id, file.id);
      notify("Picture deleted");
    } catch (error) {
      notify(error.message || "Unable to delete that picture.");
    } finally {
      setBusyFile("");
    }
  }

  const savedFiles = record ? documentFiles(record) : [];

  return <Dialog open onOpenChange={(open) => !open && setModal(null)} title={record ? "Edit tax document" : "Upload tax proof"} description="Private storage linked to your Legacy Jewelry Co. records">
    <form onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Document date"><Input required type="date" value={form.document_date} onChange={(event) => update("document_date", event.target.value)} /></Field>
        <Field label="Category"><Select value={form.category} onChange={(event) => update("category", event.target.value)}>{documentCategories.map((category) => <option key={category}>{category}</option>)}</Select></Field>
        <Field label="Custom tab (optional)"><Select value={form.custom_tab_id || ""} onChange={(event) => update("custom_tab_id", event.target.value)}><option value="">No custom tab</option>{customTabsForPage(data, "tax-vault").map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}</Select></Field>
        <Field label={record ? "Title" : "Title (optional — filename used if blank)"} wide><Input required={Boolean(record)} value={form.title} placeholder={modal.presetTitle || "Example: July Venmo statement"} onChange={(event) => update("title", event.target.value)} /></Field>
        <Field label="Description / tax note" wide><Textarea value={form.description} placeholder="What this proves, deposit details, order number, or accountant note" onChange={(event) => update("description", event.target.value)} /></Field>
        <Field label="Linked CRM records" wide><DocumentLinkEditor links={form.links || []} data={data} onChange={(links) => update("links", links)} /></Field>
        {record && <Field label={`Saved pictures and files (${savedFiles.length})`} wide>
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/50">
            {savedFiles.map((file, index) => <div key={file.id || file.file_path} className="flex flex-col gap-3 rounded-xl bg-white p-3 dark:bg-slate-900 sm:flex-row sm:items-center">
              <FileImage className="h-5 w-5 shrink-0 text-legacy-600" />
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{file.file_name || `File ${index + 1}`}</p><p className="text-[10px] text-slate-500">{file.file_size ? `${(Number(file.file_size) / 1024 / 1024).toFixed(2)} MB` : "Saved file"}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => openDocument(file)}>View</Button>
                <input ref={(node) => { if (node) replaceRefs.current[file.id] = node; }} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/csv,.heic,.heif,.csv" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; replaceSavedFile(file, selected); }} />
                <Button type="button" variant="secondary" size="sm" disabled={busyFile === file.id} onClick={() => replaceRefs.current[file.id]?.click()}>{busyFile === file.id ? "Working..." : "Replace"}</Button>
                <Button type="button" variant="ghost" size="sm" className="text-red-600" disabled={busyFile === file.id} onClick={() => deleteSavedFile(file)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>)}
          </div>
        </Field>}
        <Field label={record ? "Add more pictures or files" : "Pictures and files"} wide><TaxDocumentUpload files={files} onChange={setFiles} /></Field>
      </div>
      <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button>{record ? (files.length ? "Save and add files" : "Save changes") : "Upload to vault"}</Button></div>
    </form>
  </Dialog>;
}

function TaxDocumentUpload({ files, onChange }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (selected) => {
    const allowedExtensions = ["jpg","jpeg","png","webp","heic","heif","pdf","csv"];
    const accepted = Array.from(selected || []).filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        window.alert(`${file.name} is not a supported file. Use JPG, PNG, WEBP, HEIC, PDF, or CSV.`);
        return false;
      }
      if (file.size > 20 * 1024 * 1024) {
        window.alert(`${file.name} is larger than 20 MB.`);
        return false;
      }
      return true;
    });
    const merged = [...files, ...accepted];
    const unique = merged.filter((file, index) => merged.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index);
    onChange(unique);
  };

  return <div
    className={`rounded-2xl border-2 border-dashed p-4 transition ${dragging ? "border-legacy-400 bg-legacy-50 dark:bg-legacy-950/40" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50"}`}
    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
  >
    <input ref={inputRef} className="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/csv,.heic,.heif,.csv" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
    <button type="button" className="flex w-full flex-col items-center justify-center py-3 text-center" onClick={() => inputRef.current?.click()}>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-legacy-100 text-legacy-700 dark:bg-legacy-500/15 dark:text-legacy-300"><UploadCloud className="h-6 w-6" /></div>
      <p className="mt-3 text-sm font-semibold">Upload screenshots, statements, receipts, PDFs, or CSV exports</p>
      <p className="mt-1 text-xs text-slate-500">Select several files at once · 20 MB max per file</p>
    </button>
    {files.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-xl bg-white p-3 dark:bg-slate-900">
      <FileText className="h-4 w-4 shrink-0 text-legacy-600" />
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{file.name}</p><p className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
      <Button type="button" variant="icon" className="h-8 w-8 text-red-500" onClick={() => onChange(files.filter((_file, fileIndex) => fileIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
    </div>)}</div>}
  </div>;
}

function DocumentLinkEditor({ links, data, onChange }) {
  const updateLink = (index, key, value) => onChange(links.map((link, linkIndex) => linkIndex === index ? { ...link, [key]: value, ...(key === "linked_type" ? { linked_id: "" } : {}) } : link));
  const removeLink = (index) => onChange(links.filter((_link, linkIndex) => linkIndex !== index));

  return <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
    {links.map((link, index) => <div key={`${link.linked_type}-${link.linked_id}-${index}`} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-[150px_1fr_auto] sm:items-end">
      <label className="space-y-1.5"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Record type</span><Select value={link.linked_type} onChange={(event) => updateLink(index, "linked_type", event.target.value)}>{[["expense","Expense"],["sale","Sale"],["inventory","Inventory"],["order","Special order"]].map(([value,label]) => <option value={value} key={value}>{label}</option>)}</Select></label>
      <label className="space-y-1.5"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Specific record</span><Select required value={link.linked_id} onChange={(event) => updateLink(index, "linked_id", event.target.value)}><option value="">Select a record</option>{linkOptions(data, link.linked_type).map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</Select></label>
      <Button type="button" variant="icon" aria-label="Remove link" title="Remove link" onClick={() => removeLink(index)}><Trash2 className="h-4 w-4" /></Button>
    </div>)}
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">Optional. One document can support several sales, expenses, inventory items, or orders.</p>
      <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...links, { linked_type: "expense", linked_id: "" }])}><Plus className="h-4 w-4" /> Add link</Button>
    </div>
  </div>;
}


function CustomTabModal({ modal, setModal, data, api }) {
  const page = modal.page;
  const tabs = customTabsForPage(data, page);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const sectionName = sectionLabel(page);
  const tabSignature = tabs.map((tab) => `${tab.id}:${tab.name}`).join("|");

  useEffect(() => {
    setEditing(Object.fromEntries(tabs.map((tab) => [tab.id, tab.name])));
  }, [tabSignature]);

  const validateName = (candidate, currentId = null) => {
    const cleaned = String(candidate || "").trim();
    if (!cleaned) throw new Error("Enter a tab name.");
    if (cleaned.length > 40) throw new Error("Tab names must be 40 characters or fewer.");
    const reserved = builtInTabsForPage(page).map((item) => item.toLowerCase());
    if (reserved.includes(cleaned.toLowerCase())) throw new Error(`“${cleaned}” is already a built-in tab in ${sectionName}.`);
    const duplicate = tabs.find((tab) => tab.id !== currentId && tab.name.trim().toLowerCase() === cleaned.toLowerCase());
    if (duplicate) throw new Error(`A ${sectionName} tab named “${cleaned}” already exists.`);
    return cleaned;
  };

  const addTab = async (event) => {
    event.preventDefault();
    try {
      const cleaned = validateName(name);
      setBusy("new");
      setMessage("");
      await api.saveCustomTab(page, cleaned);
      setName("");
      setMessage(`${cleaned} tab added.`);
    } catch (error) {
      setMessage(error.message || "Unable to add the tab.");
    } finally {
      setBusy("");
    }
  };

  const renameTab = async (tab) => {
    try {
      const cleaned = validateName(editing[tab.id], tab.id);
      setBusy(tab.id);
      setMessage("");
      await api.saveCustomTab(page, cleaned, tab.id);
      setMessage(`${cleaned} updated.`);
    } catch (error) {
      setMessage(error.message || "Unable to rename the tab.");
    } finally {
      setBusy("");
    }
  };

  const deleteTab = async (tab) => {
    if (!window.confirm(`Delete the “${tab.name}” tab? Records will stay in the CRM; only their custom-tab assignment will be removed.`)) return;
    try {
      setBusy(tab.id);
      setMessage("");
      await api.deleteCustomTab(tab.id);
      setMessage(`${tab.name} tab deleted. Your records were not deleted.`);
    } catch (error) {
      setMessage(error.message || "Unable to delete the tab.");
    } finally {
      setBusy("");
    }
  };

  return <Dialog open onOpenChange={(open) => !open && setModal(null)} title={`Manage ${sectionName} tabs`} description="Create your own filter tabs without changing the normal Add buttons.">
    <form onSubmit={addTab} className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
        <p className="text-sm font-bold">Add a new tab</p>
        <p className="mt-1 text-xs text-slate-500">Examples: Shipping, Local Pickup, Wholesale, Pop-up Event, Needs Follow-up, or 2026.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input value={name} maxLength={40} placeholder="Tab name" onChange={(event) => setName(event.target.value)} />
          <Button disabled={busy === "new" || !name.trim()}><Plus className="h-4 w-4" /> Add tab</Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-bold">Your custom tabs</p>
          <p className="mt-1 text-xs text-slate-500">Assign a record inside its Add or Edit form. Each record can use one custom tab.</p>
        </div>
        {tabs.length ? tabs.map((tab) => <div key={tab.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center">
          <Input value={editing[tab.id] ?? tab.name} maxLength={40} onChange={(event) => setEditing((current) => ({ ...current, [tab.id]: event.target.value }))} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={busy === tab.id} onClick={() => renameTab(tab)}>Save name</Button>
            <Button type="button" variant="ghost" size="sm" className="text-red-500" disabled={busy === tab.id} onClick={() => deleteTab(tab)}><Trash2 className="h-4 w-4" /> Delete</Button>
          </div>
        </div>) : <Empty icon={Plus} title="No custom tabs yet" text={`Add the first custom tab for ${sectionName}.`} />}
      </div>

      {message && <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">{message}</p>}
      <div className="flex justify-end"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Done</Button></div>
    </form>
  </Dialog>;
}

function Page({ title, subtitle, action, onAction, tabs, active, setActive, children }) {
  return <div className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><PageTitle title={title} subtitle={subtitle} />{action && <Button onClick={onAction}><Plus className="h-4 w-4" />{action}</Button>}</div>
    {tabs && <WheelScroller className="pb-1"><div className="flex w-max gap-2">{tabs.map((tab) => {
      const key = typeof tab === "string" ? tab : tab.key;
      const label = typeof tab === "string" ? tab : tab.label;
      return <button key={key} onClick={() => setActive(key)} className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition ${active===key?"bg-legacy-600 text-white shadow":"border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>{label}</button>;
    })}</div></WheelScroller>}
    {children}
  </div>;
}

function PageTitle({ title, subtitle }) {
  return <div><Eyebrow>Legacy Jewelry Co.</Eyebrow><h2 className="mt-1 text-3xl font-black tracking-tight">{title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p></div>;
}

function WheelScroller({ children, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const handleWheel = (event) => {
      if (node.scrollWidth <= node.clientWidth) return;

      const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      const delta = rawDelta * (event.deltaMode === 1 ? 28 : 1);

      if (!delta) return;

      const atStart = node.scrollLeft <= 0;
      const atEnd = Math.ceil(node.scrollLeft + node.clientWidth) >= node.scrollWidth;
      const canMove = (delta < 0 && !atStart) || (delta > 0 && !atEnd);

      if (canMove) {
        event.preventDefault();
        node.scrollLeft += delta;
      }
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, []);

  return <div ref={ref} className={`scrollbar-hide overflow-x-auto ${className}`}>{children}</div>;
}

function TableCard({ children }) {
  return <Card className="overflow-hidden"><WheelScroller>{children}</WheelScroller></Card>;
}
function Eyebrow({ children }) { return <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold-600">{children}</p>; }
function Field({ label, wide, children }) { return <label className={wide?"sm:col-span-2":""}><span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>{children}</label>; }

function Kpi({ icon:Icon, label, value, note, tone }) {
  const styles={orange:"bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",purple:"bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",blue:"bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",green:"bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"};
  return <Card className="p-4"><div className="flex items-center gap-3"><div className={`grid h-12 w-12 place-items-center rounded-2xl ${styles[tone]}`}><Icon className="h-5 w-5" /></div><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="truncate text-2xl font-black tracking-tight">{value}</p><p className="text-[11px] text-slate-500">{note}</p></div></div></Card>;
}

function Status({ value }) {
  const lower=String(value).toLowerCase();
  const tone=lower.includes("active")||lower.includes("completed")||lower.includes("ready")||lower.includes("in stock")?"green":lower.includes("low")||lower.includes("potential")||lower.includes("ordered")||lower.includes("deposit")||lower.includes("inquiry")||lower.includes("shipped")?"gold":lower.includes("sold")||lower.includes("inactive")||lower.includes("canceled")?"red":"blue";
  return <Badge tone={tone}>{value}</Badge>;
}
function Actions({ edit, remove }) { return <div className="flex justify-end gap-1">{edit&&<Button variant="icon" className="h-8 w-8" onClick={edit}><PackagePlus className="h-4 w-4" /></Button>}{remove&&<Button variant="icon" className="h-8 w-8 text-red-500" onClick={remove}><Trash2 className="h-4 w-4" /></Button>}</div>; }
function Empty({ icon:Icon, title, text }) { return <div className="py-10 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-gold-600 dark:bg-slate-800"><Icon className="h-5 w-5" /></div><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
function CenteredLoader({label}) { return <div className="grid min-h-screen place-items-center bg-slate-50 dark:bg-slate-950"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-legacy-100 border-t-legacy-500" /><p className="mt-4 text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</p></div></div>; }

function NotificationButton({ count, lowStock, openOrders }) {
  const [open,setOpen]=useState(false);
  return <div className="relative"><Button variant="icon" onClick={()=>setOpen(!open)}><Bell className="h-4 w-4" />{count>0&&<span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{count}</span>}</Button>{open&&<Card className="absolute right-0 top-12 z-50 w-80 p-4"><p className="font-bold">Notifications</p><div className="mt-3 space-y-2">{lowStock.slice(0,3).map(x=><p key={x.id} className="rounded-lg bg-gold-50 p-2 text-xs text-gold-800 dark:bg-gold-500/10 dark:text-gold-200">{x.product}: {x.qty===0?"sold out":`${x.qty} left`}</p>)}{openOrders.slice(0,3).map(x=><p key={x.id} className="rounded-lg bg-sky-50 p-2 text-xs text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">{x.product}: {x.status}</p>)}{count===0&&<p className="text-sm text-slate-500">You're all caught up.</p>}</div></Card>}</div>;
}



function PaymentEditor({ payments, saleTotal, paymentTotal, onChange }) {
  const methods = ["Cash","Venmo","Zelle","Cash App","Card","Check","Bank transfer","Other"];
  const difference = roundMoney(saleTotal - paymentTotal);
  const matched = Math.abs(difference) < 0.01;

  const updatePayment = (index, key, value) => {
    onChange(payments.map((payment, paymentIndex) => paymentIndex === index ? { ...payment, [key]: value } : payment));
  };

  const addPayment = () => {
    const remaining = Math.max(roundMoney(saleTotal - paymentTotal), 0);
    onChange([...payments, { method:"Cash", amount: remaining > 0 ? remaining.toFixed(2) : "", notes:"" }]);
  };

  const removePayment = (index) => {
    if (payments.length <= 1) return;
    onChange(payments.filter((_payment, paymentIndex) => paymentIndex !== index));
  };

  return <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
    {payments.map((payment, index) => <div key={payment.id || `payment-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="space-y-1.5"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Method</span><Select value={payment.method} onChange={(event) => updatePayment(index, "method", event.target.value)}>{methods.map((method) => <option key={method}>{method}</option>)}</Select></label>
        <label className="space-y-1.5"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Amount</span><Input required type="number" min="0.01" step=".01" value={payment.amount} onChange={(event) => updatePayment(index, "amount", event.target.value)} /></label>
        <Button type="button" variant="icon" aria-label="Remove payment" title="Remove payment" disabled={payments.length <= 1} onClick={() => removePayment(index)}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <label className="mt-3 block space-y-1.5"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reference or note (optional)</span><Input value={payment.notes || ""} placeholder="Example: Venmo confirmation or cash deposit note" onChange={(event) => updatePayment(index, "notes", event.target.value)} /></label>
    </div>)}

    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-slate-500">
        <p>Sale total: <strong className="text-slate-900 dark:text-white">{money(saleTotal)}</strong></p>
        <p>Payments: <strong className="text-slate-900 dark:text-white">{money(paymentTotal)}</strong></p>
        <p className="mt-1">{matched ? <Badge tone="green">Payments match</Badge> : difference > 0 ? <Badge tone="gold">{money(difference)} remaining</Badge> : <Badge tone="red">{money(Math.abs(difference))} over</Badge>}</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={addPayment}><Plus className="h-4 w-4" /> Add payment</Button>
    </div>
  </div>;
}

function SupplyPicker({ inventory, selected, existingQuantities, onChange }) {
  const selectedMap = Object.fromEntries((selected || []).map((item) => [item.inventory_id, item]));

  const toggle = (item, checked) => {
    if (!checked) {
      onChange((selected || []).filter((entry) => entry.inventory_id !== item.id));
      return;
    }
    onChange([...(selected || []), { inventory_id:item.id, qty:1 }]);
  };

  const updateQty = (item, qty) => {
    onChange((selected || []).map((entry) => entry.inventory_id === item.id ? { ...entry, qty } : entry));
  };

  if (!inventory.length) {
    return <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">Add packaging or shipping supplies to Inventory first. They will appear here automatically.</div>;
  }

  return <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/50">
    <p className="px-1 text-[11px] leading-relaxed text-slate-500">Select every box, bag, label, mailer, or other supply used. Saving the sale deducts its stock and adds its cost to the sale automatically.</p>
    {inventory.map((item) => {
      const current = selectedMap[item.id];
      const checked = Boolean(current);
      const available = Number(item.qty || 0) + Number(existingQuantities?.[item.id] || 0);
      return <div key={item.id} className={`grid gap-3 rounded-xl border p-3 transition sm:grid-cols-[auto_1fr_110px] sm:items-center ${checked ? "border-legacy-300 bg-white dark:border-legacy-700 dark:bg-slate-900" : "border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60"}`}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-legacy-600"
          checked={checked}
          disabled={!checked && available <= 0}
          onChange={(event) => toggle(item, event.target.checked)}
          aria-label={`Use ${item.product}`}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.product}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{item.item_type} · {money(item.unit_cost)} each · {available} available{existingQuantities?.[item.id] ? " including this sale" : ""}</p>
        </div>
        {checked ? <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quantity used</span><Input required type="number" min="1" max={available} value={current.qty} onChange={(event) => updateQty(item, event.target.value)} /></label> : <span className="text-right text-[11px] text-slate-400">Not used</span>}
      </div>;
    })}
  </div>;
}

function CostStat({ label, value, strong, note }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${strong ? "ring-1 ring-legacy-200 dark:ring-legacy-800" : ""}`}>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 ${strong ? "text-base font-black" : "font-bold"}`}>{money(value)}</p>
    {note && <p className="mt-0.5 text-[10px] text-slate-500">{note}</p>}
  </div>;
}

function ReceiptUpload({ file, existingName, onChange }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file || !file.type?.startsWith("image/")) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (selected) => {
    if (!selected) return;
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"
    ];
    const extension = selected.name.split(".").pop()?.toLowerCase();
    const extensionAllowed = ["jpg","jpeg","png","webp","heic","heif","pdf"].includes(extension);
    if (!allowed.includes(selected.type) && !extensionAllowed) {
      window.alert("Choose a JPG, PNG, WEBP, HEIC, or PDF receipt.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      window.alert("Receipt files must be 10 MB or smaller.");
      return;
    }
    onChange(selected);
  };

  return <div
    className={`rounded-2xl border-2 border-dashed p-4 transition ${dragging ? "border-legacy-400 bg-legacy-50 dark:bg-legacy-950/40" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50"}`}
    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => {
      event.preventDefault();
      setDragging(false);
      choose(event.dataTransfer.files?.[0]);
    }}
  >
    <input
      ref={inputRef}
      className="hidden"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
      onChange={(event) => choose(event.target.files?.[0])}
    />

    {file ? <div className="flex items-center gap-4">
      {preview
        ? <img src={preview} alt="Receipt preview" className="h-20 w-20 rounded-xl border border-slate-200 object-cover dark:border-slate-700" />
        : <div className="grid h-16 w-16 place-items-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"><Paperclip className="h-6 w-6" /></div>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{file.name}</p>
        <p className="mt-1 text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to upload</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>Replace</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Remove selection</Button>
        </div>
      </div>
    </div> : <button
      type="button"
      className="flex w-full flex-col items-center justify-center py-4 text-center"
      onClick={() => inputRef.current?.click()}
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-legacy-100 text-legacy-700 dark:bg-legacy-500/15 dark:text-legacy-300"><UploadCloud className="h-6 w-6" /></div>
      <p className="mt-3 text-sm font-semibold">{existingName ? "Replace saved receipt" : "Upload expense screenshot"}</p>
      <p className="mt-1 text-xs text-slate-500">Click or drag and drop · JPG, PNG, WEBP, HEIC, or PDF · 10 MB max</p>
      {existingName && <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-legacy-600 dark:text-legacy-300"><Paperclip className="h-3.5 w-3.5" /> Current: {existingName}</p>}
    </button>}
  </div>;
}

function defaults(type, record, data, presetTabId = "") {
  if (record && type === "sale") {
    const item = data.saleItems.find((saleItem) => saleItem.sale_id === record.id);
    const savedPayments = data.salePayments.filter((payment) => payment.sale_id === record.id);
    const fallbackTotal = roundMoney(Number(item?.qty || 0) * Number(item?.unit_price || 0));
    return {
      customer_id: record.customer_id || "",
      inventory_id: item?.inventory_id || "",
      sold_at: record.sold_at || today(),
      qty: item?.qty || 1,
      unit_price: Number(item?.unit_price || 0),
      payments: savedPayments.length
        ? savedPayments.map((payment) => ({ id:payment.id, method:payment.method, amount:Number(payment.amount).toFixed(2), notes:payment.notes || "" }))
        : [{ method: record.payment_method || "Cash", amount: fallbackTotal.toFixed(2), notes:"" }],
      consumables: data.saleConsumables.filter((consumable) => consumable.sale_id === record.id).map((consumable) => ({
        id: consumable.id,
        inventory_id: consumable.inventory_id,
        qty: Number(consumable.qty || 1),
      })),
      delivery_cost: Number(record.delivery_cost || 0),
      notes: record.notes || "",
      custom_tab_id: assignedCustomTabId(data, "sale", record.id),
    };
  }
  if(record) {
    const base = type === "inventory" ? { item_type:"Jewelry", ...record } : {...record};
    return { ...base, custom_tab_id: assignedCustomTabId(data, type, record.id) };
  }
  const presetInventoryTab = customTabsForPage(data, "inventory").find((tab) => tab.id === presetTabId);
  return {
    customer:{name:"",phone:"",email:"",status:"Active",notes:"",custom_tab_id:presetTabId || ""},
    inventory:{item_type:presetInventoryTab?.name || "Jewelry",product:"",sku:"",color:"",supplier:"",qty:1,low_stock_threshold:1,unit_cost:0,sale_price:0,custom_tab_id:presetTabId || ""},
    sale:{customer_id:"",inventory_id:"",sold_at:today(),qty:1,unit_price:"",payments:[{method:"Cash",amount:"",notes:""}],consumables:[],delivery_cost:0,notes:"",custom_tab_id:presetTabId || ""},
    order:{customer_id:"",product:"",order_date:today(),total:0,deposit:0,status:"Inquiry",notes:"",custom_tab_id:presetTabId || ""},
    expense:{expense_date:today(),category:"Packaging",description:"",amount:0,notes:"",custom_tab_id:presetTabId || ""}
  }[type];
}

function roundMoney(value){ return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function syncSinglePayment(payments, total){
  if (!payments?.length) return [{ method:"Cash", amount:roundMoney(total).toFixed(2), notes:"" }];
  if (payments.length !== 1) return payments;
  return [{ ...payments[0], amount:roundMoney(total).toFixed(2) }];
}
const CUSTOM_TAB_PREFIX = "custom:";
function supportsCustomTabs(page){ return ["customers","inventory","sales","orders","expenses","tax-vault"].includes(page); }
function supportsRecordCustomTab(type){ return ["customer","inventory","sale","order","expense"].includes(type); }
function pageForRecordType(type){ return ({customer:"customers",inventory:"inventory",sale:"sales",order:"orders",expense:"expenses",document:"tax-vault"})[type] || ""; }
function sectionLabel(page){ return ({customers:"Customers",inventory:"Inventory",sales:"Sales",orders:"Orders",expenses:"Expenses","tax-vault":"Tax Vault"})[page] || "section"; }
function builtInTabsForPage(page){ return ({customers:["All","Active","Potential","Inactive"],inventory:["All","Jewelry","Packaging","Other"],sales:["All"],orders:["All","Inquiry","Deposit Paid","Ordered","Shipped","Ready","Completed"],expenses:["All","Packaging","Shipping","Gas/Mileage","Fees","Marketing","Supplies","Other"],"tax-vault":["All","Statements","Receipts","Taxes","Business","Other"]})[page] || ["All"]; }
function customTabsForPage(data, page){ return (data.customTabs || []).filter((tab) => tab.page === page); }
function inventoryItemTypes(data){
  const values = [
    "Jewelry",
    "Packaging",
    "Other",
    ...customTabsForPage(data, "inventory").map((tab) => tab.name),
    ...(data.inventory || []).map((item) => item.item_type),
  ];
  return Array.from(new Map(values.map((value) => String(value || "").trim()).filter(Boolean).map((value) => [value.toLowerCase(), value])).values());
}
function customTabKey(id){ return id ? `${CUSTOM_TAB_PREFIX}${id}` : ""; }
function isCustomTabKey(value){ return String(value || "").startsWith(CUSTOM_TAB_PREFIX); }
function customTabIdFromKey(value){ return isCustomTabKey(value) ? String(value).slice(CUSTOM_TAB_PREFIX.length) : ""; }
function withCustomTabs(builtIns, customTabs){ return [...builtIns, ...customTabs.map((tab) => ({ key:customTabKey(tab.id), label:tab.name }))]; }
function assignedCustomTabId(data, recordType, recordId){ return (data.recordTabs || []).find((assignment) => assignment.record_type === recordType && assignment.record_id === recordId)?.tab_id || ""; }
function assignedCustomTab(data, recordType, recordId){ const id = assignedCustomTabId(data, recordType, recordId); return (data.customTabs || []).find((tab) => tab.id === id) || null; }
function recordIsInCustomTab(data, recordType, recordId, activeKey){ return assignedCustomTabId(data, recordType, recordId) === customTabIdFromKey(activeKey); }
function useResetDeletedCustomTab(active, setActive, customTabs){
  const signature = customTabs.map((tab) => tab.id).join("|");
  useEffect(() => {
    if (isCustomTabKey(active) && !customTabs.some((tab) => tab.id === customTabIdFromKey(active))) setActive("All");
  }, [active, signature, setActive]);
}
function RecordTabBadge({ data, recordType, recordId }) {
  const tab = assignedCustomTab(data, recordType, recordId);
  return tab ? <Badge tone="slate">{tab.name}</Badge> : "—";
}

function quickType(page){ return ({dashboard:"sale",customers:"customer",inventory:"inventory",sales:"sale",orders:"order",expenses:"expense","tax-vault":"document",settings:"customer"})[page]; }
function customerName(data,id){ return data.customers.find(x=>x.id===id)?.name || "Walk-in"; }
function saleTotal(data,saleId){ return data.saleItems.filter(x=>x.sale_id===saleId).reduce((sum,x)=>sum+x.qty*x.unit_price,0); }
function linkedDocuments(data, linkedType, linkedId){
  const ids = new Set(data.documentLinks.filter((link) => link.linked_type === linkedType && link.linked_id === linkedId).map((link) => link.document_id));
  return data.documents.filter((document) => ids.has(document.id));
}
function documentFiles(document){
  if (Array.isArray(document?.files) && document.files.length) return document.files;
  return document?.file_path ? [{
    id: `legacy-${document.id}`,
    document_id: document.id,
    storage_bucket: document.storage_bucket,
    file_path: document.file_path,
    file_name: document.file_name,
    file_mime: document.file_mime,
    file_size: document.file_size,
    sort_order: 0,
  }] : [];
}
function documentSummary(document){
  const files = documentFiles(document);
  if (!files.length) return "No saved files";
  if (files.length === 1) return files[0].file_name || "1 saved file";
  return `${files[0].file_name || "Saved file"} + ${files.length - 1} more`;
}
function documentFileTotal(documents){ return (documents || []).reduce((sum, document) => sum + documentFiles(document).length, 0); }
function recordLabel(data, type, id){
  if (type === "expense") {
    const expense = data.expenses.find((item) => item.id === id);
    return expense ? `${expense.expense_date} · ${expense.description} · ${money(expense.amount)}` : "Deleted expense";
  }
  if (type === "sale") {
    const sale = data.sales.find((item) => item.id === id);
    return sale ? `${sale.sold_at} · ${customerName(data, sale.customer_id)} · ${money(saleTotal(data, sale.id))}` : "Deleted sale";
  }
  if (type === "inventory") {
    const item = data.inventory.find((inventory) => inventory.id === id);
    return item ? `${item.product}${item.color ? ` · ${item.color}` : ""}` : "Deleted inventory item";
  }
  if (type === "order") {
    const order = data.orders.find((item) => item.id === id);
    return order ? `${order.order_date} · ${customerName(data, order.customer_id)} · ${order.product}` : "Deleted order";
  }
  return "CRM record";
}
function linkOptions(data, type){
  if (type === "expense") return data.expenses.map((item) => ({ id:item.id, label:recordLabel(data, type, item.id) }));
  if (type === "sale") return data.sales.map((item) => ({ id:item.id, label:recordLabel(data, type, item.id) }));
  if (type === "inventory") return data.inventory.map((item) => ({ id:item.id, label:recordLabel(data, type, item.id) }));
  if (type === "order") return data.orders.map((item) => ({ id:item.id, label:recordLabel(data, type, item.id) }));
  return [];
}
function vaultGroup(category){
  if (["Bank Statement","Payment App Statement"].includes(category)) return "Statements";
  if (["Cash Deposit Proof","Amazon Receipt","Supplier Invoice","Shipping Receipt","Expense Receipt"].includes(category)) return "Receipts";
  if (["Tax Form","Tax Payment"].includes(category)) return "Taxes";
  if (category === "Business Document") return "Business";
  return "Other";
}
function documentDefaults(modal, data){
  const record = modal.record;
  if (record) return {
    document_date: record.document_date || today(),
    category: record.category || "Other",
    title: record.title || "",
    description: record.description || "",
    custom_tab_id: assignedCustomTabId(data, "document", record.id),
    links: data.documentLinks.filter((link) => link.document_id === record.id).map((link) => ({ linked_type:link.linked_type, linked_id:link.linked_id })),
  };
  return {
    document_date: today(),
    category: "Other",
    title: modal.presetTitle || "",
    description: "",
    custom_tab_id: modal.presetTabId || "",
    links: modal.presetLink ? [{ ...modal.presetLink }] : [],
  };
}
function calculateMetrics(data) {
  const revenue = data.saleItems.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0),
    0
  );
  const productCogs = data.saleItems.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unit_cost || 0),
    0
  );
  const supplyCogs = data.saleConsumables.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unit_cost || 0),
    0
  );
  const cogs = productCogs + supplyCogs;
  const delivery = data.sales.reduce(
    (sum, sale) => sum + Number(sale.delivery_cost || 0),
    0
  );
  const operatingExpenses = data.expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0
  );

  const netProfit = revenue - cogs - delivery - operatingExpenses;
  const taxableProfit = Math.max(netProfit, 0);
  const taxRate = Number(data.business?.tax_rate ?? 0.25);
  const tax = taxableProfit * taxRate;

  const inventoryValue = data.inventory.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unit_cost || 0),
    0
  );
  const stock = data.inventory.reduce(
    (sum, item) => sum + Number(item.qty || 0),
    0
  );

  return {
    revenue,
    netProfit,
    taxableProfit,
    taxRate,
    tax,
    inventoryValue,
    stock,
    expenses: operatingExpenses + delivery,
  };
}
function buildRevenueSeries(data){ const map={}; data.sales.forEach(s=>{map[s.sold_at]=(map[s.sold_at]||0)+saleTotal(data,s.id)}); return Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(29-i));const key=d.toISOString().slice(0,10);return {date:format(d,"MMM d"),revenue:map[key]||0};}); }
function buildProductSeries(data){ const map={}; data.saleItems.forEach(x=>{map[x.product_name]=(map[x.product_name]||0)+x.qty}); const rows=Object.entries(map).map(([name,qty])=>({name:name.length>18?name.slice(0,18)+"…":name,qty})).sort((a,b)=>b.qty-a.qty).slice(0,6); return rows.length?rows:[{name:"No sales yet",qty:0}]; }
function buildExpenseSeries(data){ const map={}; data.expenses.forEach(x=>{map[x.category]=(map[x.category]||0)+Number(x.amount)}); const rows=Object.entries(map).map(([name,value])=>({name,value})); return rows.length?rows:[{name:"No expenses",value:1}]; }
