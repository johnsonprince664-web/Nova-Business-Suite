import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3, Gem, PackagePlus, Pencil, RefreshCw, Sparkles, TrendingUp
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { money, today } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Dialog } from "./components/ui/dialog";
import { Input, Select } from "./components/ui/input";

const emptyVariant = {
  id: null,
  source_id: "",
  product: "",
  sku: "",
  metal: "",
  carat: "",
  ring_size: "",
  supplier: "",
  qty: 1,
  low_stock_threshold: 1,
  unit_cost: 0,
  sale_price: 0,
  received_at: today(),
};

export default function CRMInventoryIntelligence() {
  const [session, setSession] = useState(null);
  const [business, setBusiness] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [saleItems, setSaleItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const { page, target } = useCRMPage();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    setError("");
    try {
      const businessResult = await supabase
        .from("legacy_businesses")
        .select("*")
        .eq("owner_id", session.user.id)
        .maybeSingle();
      if (businessResult.error) throw businessResult.error;
      if (!businessResult.data) return;

      const businessId = businessResult.data.id;
      const [inventoryResult, itemsResult, salesResult] = await Promise.all([
        supabase.from("legacy_inventory").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
        supabase.from("legacy_sale_items").select("*").eq("business_id", businessId),
        supabase.from("legacy_sales").select("id,sold_at").eq("business_id", businessId),
      ]);
      const firstError = [inventoryResult, itemsResult, salesResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      setBusiness(businessResult.data);
      setInventory(inventoryResult.data || []);
      setSaleItems(itemsResult.data || []);
      setSales(salesResult.data || []);
    } catch (err) {
      setError(err.message || "Unable to load inventory intelligence.");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!business?.id) return undefined;
    const channel = supabase
      .channel(`legacy-inventory-intelligence-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_inventory", filter: `business_id=eq.${business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_sale_items", filter: `business_id=eq.${business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_sales", filter: `business_id=eq.${business.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business?.id, refresh]);

  const intelligence = useMemo(
    () => buildInventoryIntelligence(inventory, saleItems, sales),
    [inventory, saleItems, sales]
  );

  const styleOptions = useMemo(() => {
    const unique = new Map();
    intelligence.jewelry.forEach((item) => {
      const key = `${item.sku || ""}|${item.product}`;
      if (!unique.has(key)) unique.set(key, item);
    });
    return Array.from(unique.values()).sort((a, b) => a.product.localeCompare(b.product));
  }, [intelligence.jewelry]);

  function openNewVariant(source = null) {
    setEditor(source ? variantFormFromItem(source, false) : { ...emptyVariant });
  }

  function copyStyle(sourceId) {
    const source = inventory.find((item) => item.id === sourceId);
    setEditor((current) => source ? {
      ...current,
      source_id: source.id,
      product: source.product || "",
      sku: source.sku || "",
      supplier: source.supplier || "",
      low_stock_threshold: number(source.low_stock_threshold, 1),
      unit_cost: number(source.unit_cost),
      sale_price: number(source.sale_price),
    } : { ...emptyVariant, source_id: "" });
  }

  async function saveVariant(form) {
    if (!business?.id) return;
    if (!form.product.trim()) throw new Error("Enter the jewelry style name.");
    if (!form.sku.trim()) throw new Error("Enter a reusable style SKU.");
    if (form.carat !== "" && number(form.carat) < 0) throw new Error("Carat cannot be negative.");

    const values = {
      item_type: "Jewelry",
      product: form.product.trim(),
      sku: form.sku.trim(),
      color: clean(form.metal),
      metal: clean(form.metal),
      carat: form.carat === "" ? null : number(form.carat),
      ring_size: clean(form.ring_size),
      supplier: clean(form.supplier),
      qty: Math.max(0, Math.trunc(number(form.qty))),
      low_stock_threshold: Math.max(0, Math.trunc(number(form.low_stock_threshold, 1))),
      unit_cost: Math.max(0, number(form.unit_cost)),
      sale_price: Math.max(0, number(form.sale_price)),
      received_at: form.received_at || today(),
    };

    setSaving(true);
    try {
      const query = form.id
        ? supabase.from("legacy_inventory").update(values).eq("id", form.id).eq("business_id", business.id)
        : supabase.from("legacy_inventory").insert({ ...values, business_id: business.id });
      const result = await query.select().single();
      if (result.error) throw result.error;
      setEditor(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!session || !business || !target) return null;

  const normalizedPage = page.toLowerCase();
  const showDashboard = normalizedPage === "dashboard";
  const showInventory = normalizedPage === "inventory";

  return <>
    {(showDashboard || showInventory) && createPortal(
      showDashboard
        ? <DashboardInventoryIntelligence
            intelligence={intelligence}
            loading={loading}
            error={error}
            refresh={refresh}
            goToInventory={goToInventory}
          />
        : <InventoryVariantManager
            intelligence={intelligence}
            loading={loading}
            error={error}
            refresh={refresh}
            addVariant={() => openNewVariant()}
            editVariant={(item) => setEditor(variantFormFromItem(item, true))}
          />,
      target
    )}

    {editor && <VariantDialog
      form={editor}
      setForm={setEditor}
      styleOptions={styleOptions}
      copyStyle={copyStyle}
      save={saveVariant}
      saving={saving}
      close={() => setEditor(null)}
    />}
  </>;
}

function DashboardInventoryIntelligence({ intelligence, loading, error, refresh, goToInventory }) {
  return <section className="mt-6 space-y-5" data-legacy-inventory-intelligence>
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold-600">Inventory intelligence</p>
          <h3 className="mt-1 text-lg font-bold">Expected yield from jewelry inventory</h3>
          <p className="mt-1 text-xs text-slate-500">Only sellable Jewelry is counted. Packaging, shipping supplies, labels, boxes, and mailers are excluded.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button size="sm" onClick={goToInventory}><Gem className="h-4 w-4" /> Manage variants</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <IntelligenceStat icon={Sparkles} label="Expected sales yield" value={money(intelligence.expectedYield)} note="Current jewelry stock × list price" />
          <IntelligenceStat icon={TrendingUp} label="Expected gross profit" value={money(intelligence.expectedGrossProfit)} note="Before taxes and selling expenses" />
          <IntelligenceStat icon={Gem} label="Jewelry cost in stock" value={money(intelligence.jewelryCost)} note={`${intelligence.unitsInStock} sellable units`} />
          <IntelligenceStat icon={BarChart3} label="Overall sell-through" value={`${(intelligence.overallSellThrough * 100).toFixed(1)}%`} note={`${intelligence.unitsSold} units sold of ${intelligence.unitsReceived} received`} />
        </div>

        <VariantPerformanceTable rows={intelligence.variantRows.slice(0, 8)} compact />
      </CardContent>
    </Card>
  </section>;
}

function InventoryVariantManager({ intelligence, loading, error, refresh, addVariant, editVariant }) {
  return <section className="mt-6 space-y-5" data-legacy-variant-manager>
    <Card>
      <CardHeader>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold-600">Carat &amp; style tracking</p>
          <h3 className="mt-1 text-lg font-bold">Jewelry variants under reusable SKUs</h3>
          <p className="mt-1 text-xs text-slate-500">Reuse one style SKU across different carats, metals, and sizes. Each row below is a stock variant, not a brand-new product identity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button size="sm" onClick={addVariant}><PackagePlus className="h-4 w-4" /> Add variant</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Expected jewelry yield" value={money(intelligence.expectedYield)} />
          <MiniStat label="Current jewelry units" value={String(intelligence.unitsInStock)} />
          <MiniStat label="Variants needing reorder" value={String(intelligence.variantRows.filter((row) => row.needsReorder).length)} />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="data-table w-full min-w-[1240px]">
            <thead><tr><th>Style</th><th>Style SKU</th><th>Carat</th><th>Metal</th><th>Size</th><th>Received</th><th>In stock</th><th>Sell-through</th><th>Avg days to sell</th><th>Reorder</th><th /></tr></thead>
            <tbody>
              {intelligence.jewelry.length ? intelligence.jewelry.map((item) => {
                const row = intelligence.rowByInventoryId.get(item.id);
                return <tr key={item.id}>
                  <td><strong>{item.product}</strong><span className="block text-xs text-slate-500">{item.supplier || "No supplier"}</span></td>
                  <td><Badge tone="slate">{item.sku || "No SKU"}</Badge></td>
                  <td>{formatCarat(item.carat)}</td>
                  <td>{item.metal || item.color || "—"}</td>
                  <td>{item.ring_size || "—"}</td>
                  <td>{item.received_at || String(item.created_at || "").slice(0, 10) || "—"}</td>
                  <td>{number(item.qty)}</td>
                  <td>{row ? `${(row.sellThrough * 100).toFixed(1)}%` : "0.0%"}</td>
                  <td>{row?.avgDays == null ? "—" : `${row.avgDays.toFixed(1)} days`}</td>
                  <td>{row?.needsReorder ? <Badge tone="red">Order {row.reorderQty}</Badge> : <Badge tone="green">Stock OK</Badge>}</td>
                  <td><Button variant="icon" className="h-8 w-8" title="Edit carat, metal, size, and stock" onClick={() => editVariant(item)}><Pencil className="h-4 w-4" /></Button></td>
                </tr>;
              }) : <tr><td colSpan="11" className="py-10 text-center text-sm text-slate-500">No jewelry inventory yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <VariantPerformanceTable rows={intelligence.variantRows} />
      </CardContent>
    </Card>
  </section>;
}

function VariantPerformanceTable({ rows, compact = false }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
      <div><p className="text-sm font-bold">Performance by style, carat, metal, and size</p><p className="text-[11px] text-slate-500">Sell-through and days-to-sell update from recorded CRM sales.</p></div>
      <Badge tone="blue">{rows.length} variant{rows.length === 1 ? "" : "s"}</Badge>
    </div>
    <div className="overflow-x-auto">
      <table className="data-table w-full min-w-[980px]">
        <thead><tr><th>Style / SKU</th><th>Variant</th><th>Received</th><th>Sold</th><th>In stock</th><th>Sell-through</th><th>Avg days</th><th>Reorder signal</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((row) => <tr key={row.key}>
            <td><strong>{row.product}</strong><span className="block text-xs text-slate-500">{row.sku || "No SKU"}</span></td>
            <td>{row.variant}</td>
            <td>{row.received}</td>
            <td>{row.sold}</td>
            <td>{row.current}</td>
            <td><strong>{(row.sellThrough * 100).toFixed(1)}%</strong></td>
            <td>{row.avgDays == null ? "—" : `${row.avgDays.toFixed(1)} days`}</td>
            <td>{row.needsReorder ? <Badge tone="red">Reorder {row.reorderQty}</Badge> : <Badge tone="green">Stock OK</Badge>}</td>
          </tr>) : <tr><td colSpan="8" className="py-8 text-center text-sm text-slate-500">Record jewelry inventory and sales to build performance data.</td></tr>}
        </tbody>
      </table>
    </div>
    {compact && rows.length >= 8 && <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-700">Open Inventory to view and edit every variant.</p>}
  </div>;
}

function VariantDialog({ form, setForm, styleOptions, copyStyle, save, saving, close }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    try {
      await save(form);
    } catch (err) {
      window.alert(err.message || "Unable to save this jewelry variant.");
    }
  };

  return <Dialog open onOpenChange={(open) => !open && close()} title={form.id ? "Edit jewelry variant" : "Add jewelry variant"} description="Keep one reusable style SKU while tracking each carat, metal, and size combination.">
    <form onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        {!form.id && <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Copy an existing style (optional)</span>
          <Select value={form.source_id || ""} onChange={(event) => copyStyle(event.target.value)}>
            <option value="">Start a new style</option>
            {styleOptions.map((item) => <option key={item.id} value={item.id}>{item.product} — {item.sku || "No SKU"}</option>)}
          </Select>
          <p className="mt-1.5 text-[11px] text-slate-500">Copying a style reuses its SKU, supplier, cost, and price. Then enter the new carat, metal, or size.</p>
        </label>}
        <VariantField label="Jewelry style" wide><Input required value={form.product} onChange={(event) => update("product", event.target.value)} placeholder="Example: Oval Ring" /></VariantField>
        <VariantField label="Reusable style SKU"><Input required value={form.sku} onChange={(event) => update("sku", event.target.value)} placeholder="Example: R-OVAL" /></VariantField>
        <VariantField label="Metal / finish"><Input value={form.metal} onChange={(event) => update("metal", event.target.value)} placeholder="Gold, Silver, Rose Gold" /></VariantField>
        <VariantField label="Carat (ct)"><Input type="number" min="0" step=".01" value={form.carat} onChange={(event) => update("carat", event.target.value)} placeholder="2.00" /></VariantField>
        <VariantField label="Size"><Input value={form.ring_size} onChange={(event) => update("ring_size", event.target.value)} placeholder="6, 7, Adjustable, One Size" /></VariantField>
        <VariantField label="Supplier"><Input value={form.supplier} onChange={(event) => update("supplier", event.target.value)} /></VariantField>
        <VariantField label="Date received"><Input required type="date" value={form.received_at} onChange={(event) => update("received_at", event.target.value)} /></VariantField>
        <VariantField label="Quantity"><Input required type="number" min="0" step="1" value={form.qty} onChange={(event) => update("qty", event.target.value)} /></VariantField>
        <VariantField label="Low-stock alert"><Input required type="number" min="0" step="1" value={form.low_stock_threshold} onChange={(event) => update("low_stock_threshold", event.target.value)} /></VariantField>
        <VariantField label="Unit cost"><Input required type="number" min="0" step=".01" value={form.unit_cost} onChange={(event) => update("unit_cost", event.target.value)} /></VariantField>
        <VariantField label="List sale price"><Input required type="number" min="0" step=".01" value={form.sale_price} onChange={(event) => update("sale_price", event.target.value)} /></VariantField>
      </div>
      <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={close}>Cancel</Button><Button disabled={saving}>{saving ? "Saving..." : "Save variant"}</Button></div>
    </form>
  </Dialog>;
}

function IntelligenceStat({ icon: Icon, label, value, note }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
    <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-legacy-100 text-legacy-700 dark:bg-legacy-500/15 dark:text-legacy-300"><Icon className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="truncate text-xl font-black">{value}</p><p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{note}</p></div></div>
  </div>;
}

function MiniStat({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}

function VariantField({ label, wide = false, children }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>{children}</label>;
}

function useCRMPage() {
  const [context, setContext] = useState({ page: "", target: null });
  useEffect(() => {
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextTarget = document.querySelector("main");
        const nextPage = document.querySelector("header h1")?.textContent?.trim() || "";
        setContext((current) => current.page === nextPage && current.target === nextTarget ? current : { page: nextPage, target: nextTarget });
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return context;
}

function buildInventoryIntelligence(inventory, saleItems, sales) {
  const jewelry = (inventory || []).filter((item) => String(item.item_type || "Jewelry").toLowerCase() === "jewelry");
  const inventoryById = new Map(jewelry.map((item) => [item.id, item]));
  const saleById = new Map((sales || []).map((sale) => [sale.id, sale]));
  const soldByInventory = new Map();

  (saleItems || []).forEach((saleItem) => {
    const item = inventoryById.get(saleItem.inventory_id);
    if (!item) return;
    const qty = number(saleItem.qty);
    const stat = soldByInventory.get(item.id) || { sold: 0, revenue: 0, weightedDays: 0 };
    stat.sold += qty;
    stat.revenue += qty * number(saleItem.unit_price);
    const sale = saleById.get(saleItem.sale_id);
    const days = daysBetween(item.received_at || item.created_at, sale?.sold_at);
    if (days != null) stat.weightedDays += days * qty;
    soldByInventory.set(item.id, stat);
  });

  const groups = new Map();
  const rowByInventoryId = new Map();
  jewelry.forEach((item) => {
    const soldStat = soldByInventory.get(item.id) || { sold: 0, revenue: 0, weightedDays: 0 };
    const current = number(item.qty);
    const received = current + soldStat.sold;
    const sku = item.sku || "";
    const metal = item.metal || item.color || "";
    const key = [sku || item.product, item.carat ?? "", metal, item.ring_size || ""].join("|");
    const group = groups.get(key) || {
      key,
      product: item.product,
      sku,
      carat: item.carat,
      metal,
      ringSize: item.ring_size || "",
      received: 0,
      sold: 0,
      current: 0,
      revenue: 0,
      weightedDays: 0,
      threshold: 0,
      inventoryIds: [],
    };
    group.received += received;
    group.sold += soldStat.sold;
    group.current += current;
    group.revenue += soldStat.revenue;
    group.weightedDays += soldStat.weightedDays;
    group.threshold = Math.max(group.threshold, number(item.low_stock_threshold, 1));
    group.inventoryIds.push(item.id);
    groups.set(key, group);
  });

  const variantRows = Array.from(groups.values()).map((group) => {
    const targetStock = Math.max(group.threshold * 2, 2);
    const row = {
      ...group,
      variant: [formatCarat(group.carat), group.metal || "No metal", group.ringSize || "No size"].join(" · "),
      sellThrough: group.received > 0 ? group.sold / group.received : 0,
      avgDays: group.sold > 0 ? group.weightedDays / group.sold : null,
      needsReorder: group.current <= group.threshold,
      reorderQty: Math.max(0, targetStock - group.current),
    };
    group.inventoryIds.forEach((id) => rowByInventoryId.set(id, row));
    return row;
  }).sort((a, b) => Number(b.needsReorder) - Number(a.needsReorder) || b.sellThrough - a.sellThrough || a.product.localeCompare(b.product));

  const expectedYield = jewelry.reduce((sum, item) => sum + number(item.qty) * number(item.sale_price), 0);
  const jewelryCost = jewelry.reduce((sum, item) => sum + number(item.qty) * number(item.unit_cost), 0);
  const expectedGrossProfit = expectedYield - jewelryCost;
  const unitsInStock = jewelry.reduce((sum, item) => sum + number(item.qty), 0);
  const unitsSold = Array.from(soldByInventory.values()).reduce((sum, stat) => sum + stat.sold, 0);
  const unitsReceived = unitsInStock + unitsSold;

  return {
    jewelry,
    variantRows,
    rowByInventoryId,
    expectedYield,
    expectedGrossProfit,
    jewelryCost,
    unitsInStock,
    unitsSold,
    unitsReceived,
    overallSellThrough: unitsReceived > 0 ? unitsSold / unitsReceived : 0,
  };
}

function variantFormFromItem(item, editing) {
  return {
    ...emptyVariant,
    id: editing ? item.id : null,
    source_id: editing ? "" : item.id,
    product: item.product || "",
    sku: item.sku || "",
    metal: item.metal || item.color || "",
    carat: item.carat ?? "",
    ring_size: item.ring_size || "",
    supplier: item.supplier || "",
    qty: number(item.qty, 1),
    low_stock_threshold: number(item.low_stock_threshold, 1),
    unit_cost: number(item.unit_cost),
    sale_price: number(item.sale_price),
    received_at: item.received_at || String(item.created_at || today()).slice(0, 10),
  };
}

function goToInventory() {
  const button = Array.from(document.querySelectorAll("nav button")).find((node) => node.textContent?.trim().includes("Inventory"));
  button?.click();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function clean(value) { const text = String(value || "").trim(); return text || null; }
function formatCarat(value) { return value === null || value === undefined || value === "" ? "—" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 })} ct`; }
function daysBetween(start, end) {
  if (!start || !end) return null;
  const startDate = new Date(`${String(start).slice(0, 10)}T00:00:00`);
  const endDate = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, Math.round((endDate - startDate) / 86400000));
}
