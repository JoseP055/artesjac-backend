import { Router } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { requireAuth, requireSellerOrAdmin } from "../middlewares/requireAuth.js";

const router = Router();
const { isValidObjectId, Types } = mongoose;

// Utils
const toSlug = (str) =>
  String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const cleanImages = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map(i => ({ url: String(i?.url || "").trim(), alt: String(i?.alt || "").trim() }))
    .filter(i => i.url);
const splitTags = (s) =>
  (Array.isArray(s) ? s : String(s || "").split(","))
    .map(t => String(t).trim()).filter(Boolean);

/** GET /api/products
 * Query: q, category, featured=true, minPrice, maxPrice, sort, page, limit, active
 */
router.get("/", async (req, res) => {
  try {
    const { q, category, featured, minPrice, maxPrice, sort = "-createdAt", page = 1, limit = 12, active } = req.query;
    const filter = {};

    if (active !== "all") filter.isActive = active === "false" ? false : true;
    if (q) filter.$text = { $search: q };
    if (category) filter.category = String(category).toLowerCase();
    if (featured === "true") filter.isFeatured = true;

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Product.find(filter).sort(String(sort)).skip(skip).limit(Number(limit)),
      Product.countDocuments(filter),
    ]);

    return res.json({ ok: true, page: Number(page), limit: Number(limit), total, items });
  } catch (e) {
    console.error("❌ PRODUCTS LIST ERROR:", {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      errors: e?.errors,
    });
    return res.status(400).json({ ok: false, error: e?.message || "Error listando productos" });
  }
});

/** GET /api/products/:slug */
router.get("/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (!product) return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    return res.json({ ok: true, product });
  } catch (e) {
    console.error("❌ PRODUCT GET ERROR:", {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      errors: e?.errors,
    });
    return res.status(400).json({ ok: false, error: e?.message || "Error obteniendo producto" });
  }
});

/** POST /api/products — seller | admin */
router.post("/", requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const rawArtist = req.user.role === "seller" ? req.user.id : (b.artistId || req.user.id);
    if (!isValidObjectId(rawArtist)) {
      return res.status(400).json({ ok: false, error: "artistId inválido" });
    }

    const payload = {
      name: String(b.name || "").trim(),
      description: String(b.description || ""),
      price: toNum(b.price),
      stock: toNum(b.stock),
      images: cleanImages(b.images),
      category: String(b.category || "").toLowerCase().trim(),
      categoryName: String(b.categoryName || b.category || ""),
      tags: splitTags(b.tags),
      artistId: new Types.ObjectId(rawArtist),
      isActive: Boolean(b.isActive ?? true),
      isFeatured: Boolean(b.isFeatured ?? false),
      slug: b.slug ? toSlug(b.slug) : toSlug(b.name),
    };

    if (!payload.name || !payload.category || payload.price == null || payload.stock == null) {
      return res.status(400).json({ ok: false, error: "name, price, stock y category son requeridos" });
    }

    const exists = await Product.findOne({ slug: payload.slug });
    if (exists) return res.status(409).json({ ok: false, error: "Slug ya existe" });

    const product = await Product.create(payload);
    return res.status(201).json({ ok: true, product });
  } catch (e) {
    console.error("❌ PRODUCT CREATE VALIDATION:", {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      errors: e?.errors,
      keyValue: e?.keyValue,
      path: e?.path,
      value: e?.value,
    });
    if (e?.code === 11000) return res.status(409).json({ ok: false, error: "Duplicado (slug/email único)" });
    return res.status(400).json({ ok: false, error: e?.message || "Document failed validation" });
  }
});

/** PUT /api/products/:id — seller | admin (seller solo sus productos) */
router.put("/:id", requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.name && !updates.slug) updates.slug = toSlug(updates.name);
    if (updates.slug) updates.slug = toSlug(updates.slug);
    if (updates.price !== undefined) updates.price = toNum(updates.price);
    if (updates.stock !== undefined) updates.stock = toNum(updates.stock);
    if (updates.category) updates.category = String(updates.category).toLowerCase().trim();
    if (updates.images) updates.images = cleanImages(updates.images);
    if (updates.tags) updates.tags = splitTags(updates.tags);
    if (updates.artistId) {
      if (!isValidObjectId(updates.artistId)) {
        return res.status(400).json({ ok: false, error: "artistId inválido" });
      }
      updates.artistId = new Types.ObjectId(updates.artistId);
    }

    const findFilter = { _id: req.params.id };
    if (req.user.role === "seller") findFilter.artistId = req.user.id;

    const product = await Product.findOneAndUpdate(findFilter, updates, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ ok: false, error: "Producto no encontrado o sin permiso" });

    return res.json({ ok: true, product });
  } catch (e) {
    console.error("❌ PRODUCT UPDATE VALIDATION:", {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      errors: e?.errors,
      keyValue: e?.keyValue,
      path: e?.path,
      value: e?.value,
    });
    if (e?.code === 11000) return res.status(409).json({ ok: false, error: "Duplicado (slug/email único)" });
    return res.status(400).json({ ok: false, error: e?.message || "Document failed validation" });
  }
});

/** DELETE /api/products/:id — seller | admin (seller solo sus productos) */
router.delete("/:id", requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const findFilter = { _id: req.params.id };
    if (req.user.role === "seller") findFilter.artistId = req.user.id;

    const del = await Product.findOneAndDelete(findFilter);
    if (!del) return res.status(404).json({ ok: false, error: "Producto no encontrado o sin permiso" });

    return res.json({ ok: true, msg: "Eliminado" });
  } catch (e) {
    console.error("❌ PRODUCT DELETE ERROR:", {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      errors: e?.errors,
    });
    return res.status(400).json({ ok: false, error: e?.message || "Error eliminando producto" });
  }
});

export default router;
