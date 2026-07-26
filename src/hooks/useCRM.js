import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const RECEIPT_BUCKET = "legacy-expense-receipts";
const TAX_DOCUMENT_BUCKET = "legacy-tax-documents";
const ALLOWED_RECEIPT_TYPES = ["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf"];
const ALLOWED_TAX_DOCUMENT_TYPES = [
  "image/jpeg","image/png","image/webp","image/heic","image/heif",
  "application/pdf","text/csv","application/csv","application/vnd.ms-excel",
];

const empty = {
  business: null,
  customers: [],
  inventory: [],
  sales: [],
  saleItems: [],
  salePayments: [],
  orders: [],
  expenses: [],
  documents: [],
  documentFiles: [],
  documentLinks: [],
  customTabs: [],
  recordTabs: [],
};

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  csv: "text/csv",
};

function extensionFor(file) {
  return file.name.includes(".")
    ? file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")
    : "bin";
}

function normalizedMime(file) {
  return file.type || MIME_BY_EXTENSION[extensionFor(file)] || "application/octet-stream";
}

function stripExtension(name) {
  return String(name || "Document").replace(/\.[^.]+$/, "");
}

function normalizeLinks(links = []) {
  const unique = new Map();
  links.forEach((link) => {
    if (!link?.linked_type || !link?.linked_id) return;
    unique.set(`${link.linked_type}:${link.linked_id}`, {
      linked_type: link.linked_type,
      linked_id: link.linked_id,
    });
  });
  return Array.from(unique.values());
}

export function useCRM(user) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const ensureBusiness = useCallback(async () => {
    let { data: business, error: fetchError } = await supabase
      .from("legacy_businesses")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!business) {
      const created = await supabase
        .from("legacy_businesses")
        .insert({ owner_id: user.id, name: "Legacy Jewelry Co.", tax_rate: 0.25, currency: "USD" })
        .select()
        .single();
      if (created.error) throw created.error;
      business = created.data;

      const inventorySeed = [
        ["Moissanite Stud Earrings", "Gold", "Moissanite Supply", 1, 26.99, 60],
        ["Moissanite Stud Earrings", "Silver", "Moissanite Supply", 1, 26.99, 60],
        ["1.0 CT Adjustable Stud Ring", "Silver", "Moissanite Supply", 1, 22.50, 100],
        ["Circle / Halo Earrings", "Gold", "458 Mois", 2, 25, 60],
        ["Circle / Halo Earrings", "Silver", "458 Mois", 1, 25, 60],
      ].map(([product, color, supplier, qty, unit_cost, sale_price]) => ({
        business_id: business.id,
        item_type: "Jewelry",
        product,
        color,
        supplier,
        qty,
        unit_cost,
        sale_price,
      }));

      await supabase.from("legacy_inventory").insert(inventorySeed);
      await supabase.from("legacy_expenses").insert([
        { business_id: business.id, category: "Packaging", description: "Velvet jewelry boxes", amount: 19.43 },
        { business_id: business.id, category: "Packaging", description: "15 gift bags", amount: 9.71 },
      ]);
    }

    return business;
  }, [user.id]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const business = await ensureBusiness();
      const [customers, inventory, sales, saleItems, salePayments, orders, expenses, documents, documentFiles, documentLinks, customTabs, recordTabs] = await Promise.all([
        supabase.from("legacy_customers").select("*").eq("business_id", business.id).order("created_at", { ascending: false }),
        supabase.from("legacy_inventory").select("*").eq("business_id", business.id).order("created_at", { ascending: false }),
        supabase.from("legacy_sales").select("*").eq("business_id", business.id).order("sold_at", { ascending: false }),
        supabase.from("legacy_sale_items").select("*").eq("business_id", business.id),
        supabase.from("legacy_sale_payments").select("*").eq("business_id", business.id).order("created_at", { ascending: true }),
        supabase.from("legacy_orders").select("*").eq("business_id", business.id).order("order_date", { ascending: false }),
        supabase.from("legacy_expenses").select("*").eq("business_id", business.id).order("expense_date", { ascending: false }),
        supabase.from("legacy_documents").select("*").eq("business_id", business.id).order("document_date", { ascending: false }),
        supabase.from("legacy_document_files").select("*").eq("business_id", business.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("legacy_document_links").select("*").eq("business_id", business.id).order("created_at", { ascending: true }),
        supabase.from("legacy_custom_tabs").select("*").eq("business_id", business.id).order("page", { ascending: true }).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("legacy_record_tabs").select("*").eq("business_id", business.id).order("created_at", { ascending: true }),
      ]);

      const results = [customers, inventory, sales, saleItems, salePayments, orders, expenses, documents, documentFiles, documentLinks, customTabs, recordTabs];
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const allDocumentFiles = documentFiles.data || [];
      const filesByDocument = allDocumentFiles.reduce((grouped, file) => {
        (grouped[file.document_id] ||= []).push(file);
        return grouped;
      }, {});
      const hydratedDocuments = (documents.data || []).map((document) => {
        const files = filesByDocument[document.id] || [];
        if (files.length) return { ...document, files };
        return {
          ...document,
          files: document.file_path ? [{
            id: `legacy-${document.id}`,
            document_id: document.id,
            business_id: document.business_id,
            storage_bucket: document.storage_bucket,
            file_path: document.file_path,
            file_name: document.file_name,
            file_mime: document.file_mime,
            file_size: document.file_size,
            sort_order: 0,
          }] : [],
        };
      });

      setData({
        business,
        customers: customers.data || [],
        inventory: inventory.data || [],
        sales: sales.data || [],
        saleItems: saleItems.data || [],
        salePayments: salePayments.data || [],
        orders: orders.data || [],
        expenses: expenses.data || [],
        documents: hydratedDocuments,
        documentFiles: allDocumentFiles,
        documentLinks: documentLinks.data || [],
        customTabs: customTabs.data || [],
        recordTabs: recordTabs.data || [],
      });
    } catch (err) {
      setError(err.message || "Unable to load CRM data.");
    } finally {
      setLoading(false);
    }
  }, [ensureBusiness]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!data.business?.id) return;
    const channel = supabase
      .channel(`legacy-crm-${data.business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_customers", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_inventory", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_sales", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_sale_items", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_sale_payments", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_businesses", filter: `id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_orders", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_expenses", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_documents", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_document_files", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_document_links", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_custom_tabs", filter: `business_id=eq.${data.business.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_record_tabs", filter: `business_id=eq.${data.business.id}` }, refresh)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [data.business?.id, refresh]);

  const api = useMemo(() => {
    const businessId = data.business?.id;

    async function uploadFile(file, bucket, allowedTypes, maxBytes, label) {
      if (!file) return null;
      const mime = normalizedMime(file);
      if (!allowedTypes.includes(mime)) {
        throw new Error(`${label} must be a JPG, PNG, WEBP, HEIC, PDF${label === "Tax document" ? ", or CSV" : ""}.`);
      }
      if (file.size > maxBytes) {
        throw new Error(`${label} files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
      }

      const extension = extensionFor(file);
      const path = `${user.id}/${businessId}/${new Date().getFullYear()}/${crypto.randomUUID()}.${extension || "bin"}`;
      const uploaded = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: mime,
        });

      if (uploaded.error) throw uploaded.error;
      return { path, mime, size: file.size, name: file.name };
    }

    async function uploadExpenseReceipt(file) {
      const uploaded = await uploadFile(file, RECEIPT_BUCKET, ALLOWED_RECEIPT_TYPES, 10 * 1024 * 1024, "Receipt");
      if (!uploaded) return null;
      return {
        receipt_path: uploaded.path,
        receipt_name: uploaded.name,
        receipt_mime: uploaded.mime,
      };
    }

    async function uploadTaxDocument(file) {
      return uploadFile(file, TAX_DOCUMENT_BUCKET, ALLOWED_TAX_DOCUMENT_TYPES, 20 * 1024 * 1024, "Tax document");
    }

    async function upsert(table, values, id) {
      const query = id
        ? supabase.from(table).update(values).eq("id", id).eq("business_id", businessId)
        : supabase.from(table).insert({ ...values, business_id: businessId });
      const result = await query.select().single();
      if (result.error) throw result.error;
      return result.data;
    }

    async function setRecordTab(recordType, recordId, tabId) {
      const result = await supabase.rpc("legacy_set_record_tab", {
        p_business_id: businessId,
        p_record_type: recordType,
        p_record_id: recordId,
        p_tab_id: tabId || null,
      });
      if (result.error) throw result.error;
    }

    async function saveRecordWithTab(table, values, id, recordType, tabId) {
      const saved = await upsert(table, values, id);
      await setRecordTab(recordType, saved.id, tabId);
      await refresh();
      return saved;
    }

    async function remove(table, id) {
      const result = await supabase.from(table).delete().eq("id", id);
      if (result.error) throw result.error;
      await refresh();
    }

    async function replaceDocumentLinks(documentId, links) {
      const normalized = normalizeLinks(links);
      const result = await supabase.rpc("legacy_replace_document_links", {
        p_document_id: documentId,
        p_business_id: businessId,
        p_links: normalized,
      });
      if (result.error) throw result.error;
    }

    async function addFilesToDocument(documentId, files, startOrder = 0) {
      const selected = Array.from(files || []);
      if (!selected.length) return [];

      const uploadedFiles = [];
      try {
        for (let index = 0; index < selected.length; index += 1) {
          const uploaded = await uploadTaxDocument(selected[index]);
          uploadedFiles.push(uploaded);
          const inserted = await supabase
            .from("legacy_document_files")
            .insert({
              business_id: businessId,
              document_id: documentId,
              storage_bucket: TAX_DOCUMENT_BUCKET,
              file_path: uploaded.path,
              file_name: uploaded.name,
              file_mime: uploaded.mime,
              file_size: uploaded.size,
              sort_order: startOrder + index,
            });
          if (inserted.error) throw inserted.error;
        }
        return uploadedFiles;
      } catch (error) {
        if (uploadedFiles.length) {
          await supabase.storage.from(TAX_DOCUMENT_BUCKET).remove(uploadedFiles.map((file) => file.path));
        }
        throw error;
      }
    }

    return {
      saveCustomer: (values, id, tabId) => saveRecordWithTab("legacy_customers", values, id, "customer", tabId),
      saveInventory: (values, id, tabId) => saveRecordWithTab("legacy_inventory", values, id, "inventory", tabId),
      saveOrder: (values, id, tabId) => saveRecordWithTab("legacy_orders", values, id, "order", tabId),
      saveCustomTab: async (page, name, id) => {
        const cleanedName = String(name || "").trim();
        if (!cleanedName) throw new Error("Enter a tab name.");
        if (cleanedName.length > 40) throw new Error("Tab names must be 40 characters or fewer.");
        const query = id
          ? supabase.from("legacy_custom_tabs").update({ name: cleanedName }).eq("id", id).eq("business_id", businessId)
          : supabase.from("legacy_custom_tabs").insert({ business_id: businessId, page, name: cleanedName });
        const result = await query.select().single();
        if (result.error) throw result.error;
        await refresh();
        return result.data;
      },
      deleteCustomTab: async (id) => {
        const result = await supabase.from("legacy_custom_tabs").delete().eq("id", id).eq("business_id", businessId);
        if (result.error) throw result.error;
        await refresh();
      },
      setRecordTab,
      saveExpense: async (values, id, receiptFile, previousReceiptPath, tabId) => {
        let uploaded = null;
        let saved = null;
        try {
          uploaded = await uploadExpenseReceipt(receiptFile);
          saved = await upsert(
            "legacy_expenses",
            { ...values, ...(uploaded || {}) },
            id
          );
          await setRecordTab("expense", saved.id, tabId);

          if (uploaded && previousReceiptPath && previousReceiptPath !== uploaded.receipt_path) {
            await supabase.storage.from(RECEIPT_BUCKET).remove([previousReceiptPath]);
          }
          await refresh();
          return saved;
        } catch (error) {
          if (!saved && uploaded?.receipt_path) {
            await supabase.storage.from(RECEIPT_BUCKET).remove([uploaded.receipt_path]);
          }
          throw error;
        }
      },
      saveDocuments: async (values, id) => {
        const links = normalizeLinks(values.links);
        const files = Array.from(values.files || []);

        if (id) {
          const updated = await supabase
            .from("legacy_documents")
            .update({
              document_date: values.document_date,
              category: values.category,
              title: values.title,
              description: values.description || null,
            })
            .eq("id", id)
            .eq("business_id", businessId)
            .select()
            .single();
          if (updated.error) throw updated.error;

          if (files.length) {
            const existing = await supabase
              .from("legacy_document_files")
              .select("sort_order")
              .eq("document_id", id)
              .eq("business_id", businessId)
              .order("sort_order", { ascending: false })
              .limit(1);
            if (existing.error) throw existing.error;
            const startOrder = existing.data?.length ? Number(existing.data[0].sort_order || 0) + 1 : 0;
            await addFilesToDocument(id, files, startOrder);
          }

          await replaceDocumentLinks(id, links);
          await setRecordTab("document", id, values.custom_tab_id);
          await refresh();
          return updated.data;
        }

        if (!files.length) throw new Error("Choose at least one statement, screenshot, receipt, or PDF.");

        const uploadedFiles = [];
        let createdDocument = null;
        try {
          for (const file of files) uploadedFiles.push(await uploadTaxDocument(file));
          const primary = uploadedFiles[0];
          const created = await supabase
            .from("legacy_documents")
            .insert({
              business_id: businessId,
              document_date: values.document_date,
              category: values.category,
              title: values.title?.trim() || stripExtension(files[0].name),
              description: values.description || null,
              storage_bucket: TAX_DOCUMENT_BUCKET,
              file_path: primary.path,
              file_name: primary.name,
              file_mime: primary.mime,
              file_size: primary.size,
            })
            .select()
            .single();
          if (created.error) throw created.error;
          createdDocument = created.data;

          const rows = uploadedFiles.map((uploaded, index) => ({
            business_id: businessId,
            document_id: createdDocument.id,
            storage_bucket: TAX_DOCUMENT_BUCKET,
            file_path: uploaded.path,
            file_name: uploaded.name,
            file_mime: uploaded.mime,
            file_size: uploaded.size,
            sort_order: index,
          }));
          const insertedFiles = await supabase.from("legacy_document_files").insert(rows);
          if (insertedFiles.error) throw insertedFiles.error;

          await replaceDocumentLinks(createdDocument.id, links);
          await setRecordTab("document", createdDocument.id, values.custom_tab_id);
          await refresh();
          return createdDocument;
        } catch (error) {
          if (createdDocument?.id) {
            await supabase.from("legacy_documents").delete().eq("id", createdDocument.id).eq("business_id", businessId);
          }
          if (uploadedFiles.length) {
            await supabase.storage.from(TAX_DOCUMENT_BUCKET).remove(uploadedFiles.map((file) => file.path));
          }
          throw error;
        }
      },
      replaceDocumentFile: async (documentId, fileId, replacementFile) => {
        if (!replacementFile) throw new Error("Choose a replacement file.");
        const current = await supabase
          .from("legacy_document_files")
          .select("*")
          .eq("id", fileId)
          .eq("document_id", documentId)
          .eq("business_id", businessId)
          .single();
        if (current.error) throw current.error;

        const uploaded = await uploadTaxDocument(replacementFile);
        try {
          const updated = await supabase
            .from("legacy_document_files")
            .update({
              storage_bucket: TAX_DOCUMENT_BUCKET,
              file_path: uploaded.path,
              file_name: uploaded.name,
              file_mime: uploaded.mime,
              file_size: uploaded.size,
            })
            .eq("id", fileId)
            .eq("document_id", documentId)
            .eq("business_id", businessId);
          if (updated.error) throw updated.error;

          if (Number(current.data.sort_order || 0) === 0) {
            const legacyUpdate = await supabase
              .from("legacy_documents")
              .update({
                storage_bucket: TAX_DOCUMENT_BUCKET,
                file_path: uploaded.path,
                file_name: uploaded.name,
                file_mime: uploaded.mime,
                file_size: uploaded.size,
              })
              .eq("id", documentId)
              .eq("business_id", businessId);
            if (legacyUpdate.error) throw legacyUpdate.error;
          }

          const removed = await supabase.storage.from(current.data.storage_bucket).remove([current.data.file_path]);
          if (removed.error) console.warn("Old document file cleanup failed:", removed.error.message);
          await refresh();
        } catch (error) {
          await supabase.storage.from(TAX_DOCUMENT_BUCKET).remove([uploaded.path]);
          throw error;
        }
      },
      deleteDocumentFile: async (documentId, fileId) => {
        const files = await supabase
          .from("legacy_document_files")
          .select("*")
          .eq("document_id", documentId)
          .eq("business_id", businessId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (files.error) throw files.error;
        if (files.data.length <= 1) {
          throw new Error("This is the last file. Replace it, or delete the entire Tax Vault entry.");
        }
        const target = files.data.find((file) => file.id === fileId);
        if (!target) throw new Error("That saved file could not be found.");

        const deleted = await supabase
          .from("legacy_document_files")
          .delete()
          .eq("id", fileId)
          .eq("document_id", documentId)
          .eq("business_id", businessId);
        if (deleted.error) throw deleted.error;

        if (Number(target.sort_order || 0) === 0) {
          const nextFile = files.data.find((file) => file.id !== fileId);
          const promoted = await supabase
            .from("legacy_documents")
            .update({
              storage_bucket: nextFile.storage_bucket,
              file_path: nextFile.file_path,
              file_name: nextFile.file_name,
              file_mime: nextFile.file_mime,
              file_size: nextFile.file_size,
            })
            .eq("id", documentId)
            .eq("business_id", businessId);
          if (promoted.error) throw promoted.error;
          await supabase
            .from("legacy_document_files")
            .update({ sort_order: 0 })
            .eq("id", nextFile.id)
            .eq("business_id", businessId);
        }

        const removed = await supabase.storage.from(target.storage_bucket).remove([target.file_path]);
        if (removed.error) console.warn("Document file cleanup failed:", removed.error.message);
        await refresh();
      },
      updateBusiness: async (values) => {
        const result = await supabase.from("legacy_businesses").update(values).eq("id", businessId).select().single();
        if (result.error) throw result.error;
        await refresh();
      },
      deleteCustomer: (id) => remove("legacy_customers", id),
      deleteInventory: (id) => remove("legacy_inventory", id),
      deleteOrder: (id) => remove("legacy_orders", id),
      deleteExpense: async (id) => {
        const lookup = await supabase
          .from("legacy_expenses")
          .select("receipt_path")
          .eq("id", id)
          .maybeSingle();
        if (lookup.error) throw lookup.error;

        await remove("legacy_expenses", id);

        if (lookup.data?.receipt_path) {
          const deleted = await supabase.storage
            .from(RECEIPT_BUCKET)
            .remove([lookup.data.receipt_path]);
          if (deleted.error) console.warn("Receipt cleanup failed:", deleted.error.message);
        }
      },
      deleteDocument: async (id) => {
        const lookup = await supabase
          .from("legacy_documents")
          .select("storage_bucket,file_path")
          .eq("id", id)
          .eq("business_id", businessId)
          .single();
        if (lookup.error) throw lookup.error;
        const fileLookup = await supabase
          .from("legacy_document_files")
          .select("storage_bucket,file_path")
          .eq("document_id", id)
          .eq("business_id", businessId);
        if (fileLookup.error) throw fileLookup.error;

        const deleted = await supabase
          .from("legacy_documents")
          .delete()
          .eq("id", id)
          .eq("business_id", businessId);
        if (deleted.error) throw deleted.error;

        const pathsByBucket = new Map();
        [...(fileLookup.data || []), lookup.data].forEach((file) => {
          if (!file?.storage_bucket || !file?.file_path) return;
          if (!pathsByBucket.has(file.storage_bucket)) pathsByBucket.set(file.storage_bucket, new Set());
          pathsByBucket.get(file.storage_bucket).add(file.file_path);
        });
        for (const [bucket, paths] of pathsByBucket) {
          const storageDelete = await supabase.storage.from(bucket).remove(Array.from(paths));
          if (storageDelete.error) console.warn("Document cleanup failed:", storageDelete.error.message);
        }
        await refresh();
      },
      getStoredFileUrl: async (bucket, path) => {
        if (!bucket || !path) throw new Error("This record does not have a saved file.");
        const result = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 10);
        if (result.error) throw result.error;
        return result.data.signedUrl;
      },
      getExpenseReceiptUrl: async (path) => {
        if (!path) throw new Error("This expense does not have a receipt.");
        const result = await supabase.storage
          .from(RECEIPT_BUCKET)
          .createSignedUrl(path, 60 * 10);
        if (result.error) throw result.error;
        return result.data.signedUrl;
      },
      deleteSale: async (id) => {
        const result = await supabase.from("legacy_sales").delete().eq("id", id);
        if (result.error) throw result.error;
        await refresh();
      },
      recordSale: async (values) => {
        const result = await supabase.rpc("legacy_record_sale", {
          p_business_id: businessId,
          p_customer_id: values.customer_id || "00000000-0000-0000-0000-000000000000",
          p_sold_at: values.sold_at,
          p_payment_method: values.payment_method,
          p_delivery_cost: Number(values.delivery_cost || 0),
          p_notes: values.notes || null,
          p_items: values.items,
          p_payments: values.payments,
        });
        if (result.error) throw result.error;
        await setRecordTab("sale", result.data, values.custom_tab_id);
        await refresh();
        return result.data;
      },
      updateSale: async (saleId, values) => {
        const result = await supabase.rpc("legacy_update_sale", {
          p_sale_id: saleId,
          p_business_id: businessId,
          p_customer_id: values.customer_id || "00000000-0000-0000-0000-000000000000",
          p_sold_at: values.sold_at,
          p_payment_method: values.payment_method,
          p_delivery_cost: Number(values.delivery_cost || 0),
          p_notes: values.notes || null,
          p_items: values.items,
          p_payments: values.payments,
        });
        if (result.error) throw result.error;
        await setRecordTab("sale", result.data, values.custom_tab_id);
        await refresh();
        return result.data;
      },
    };
  }, [data.business?.id, refresh, user.id]);

  return { data, loading, error, refresh, api };
}
