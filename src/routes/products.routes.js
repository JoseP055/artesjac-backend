import { Router } from "express";
import Product from "../models/Product.js";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();

/** Util: generar slug limpio */
const toSlug = (str) =>
  String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Helpers de saneo */
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
    .map(t => String(t).trim())
    .filter(Boolean);

/** GET /api/products
 *  Query: q, category, featured=true, minPrice, maxPrice, sort, page, limit, active
 */
router.get("/", async (req, res) => {
  try {
    const { q, category, featured, minPrice, maxPrice, sort = "-createdAt", page = 1, limit = 12, active } = req.query;
    const filter = {};

    // Por defecto solo activos, a menos que pidas ?active=all o false
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

    res.json({ ok: true, page: Number(page), limit: Number(limit), total, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/products/:slug */
router.get("/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (!product) return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    res.json({ ok: true, product });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/products — admin y seller */
router.post("/", requireAuth, requireRole(["admin", "seller"]), async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      name: String(body.name || "").trim(),
      description: String(body.description || ""),
      price: toNum(body.price),
      stock: toNum(body.stock),
      images: cleanImages(body.images),
      category: String(body.category || "").toLowerCase().trim(),
      categoryName: String(body.categoryName || body.category || ""),
      tags: splitTags(body.tags),
      // Si es seller, forzamos su propio artistId
      artistId: req.user.role === "seller" ? req.user.id : (body.artistId || req.user.id),
      isActive: Boolean(body.isActive ?? true),
      isFeatured: Boolean(body.isFeatured ?? false),
      slug: body.slug ? toSlug(body.slug) : toSlug(body.name),
    };

    // Requeridos mínimos
    if (!payload.name || !payload.category || payload.price == null || payload.stock == null || !payload.artistId) {
      return res.status(400).json({ ok: false, error: "name, price, stock, category y artistId son requeridos" });
    }

    const exists = await Product.findOne({ slug: payload.slug });
    if (exists) return res.status(409).json({ ok: false, error: "Slug ya existe" });

    const product = await Product.create(payload);
    res.status(201).json({ ok: true, product });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** PUT /api/products/:id — admin y seller (seller solo sus productos) */
router.put("/:id", requireAuth, requireRole(["admin", "seller"]), async (req, res) => {
  try {
    const updates = { ...req.body };

    // Normalizar campos editables
    if (updates.name && !updates.slug) updates.slug = toSlug(updates.name);
    if (updates.slug) updates.slug = toSlug(updates.slug);
    if (updates.price !== undefined) updates.price = toNum(updates.price);
    if (updates.stock !== undefined) updates.stock = toNum(updates.stock);
    if (updates.category) updates.category = String(updates.category).toLowerCase().trim();
    if (updates.images) updates.images = cleanImages(updates.images);
    if (updates.tags) updates.tags = splitTags(updates.tags);

    // Filtro de ownership para seller
    const findFilter = { _id: req.params.id };
    if (req.user.role === "seller") {
      findFilter.artistId = req.user.id;
    }

    const product = await Product.findOneAndUpdate(findFilter, updates, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ ok: false, error: "Producto no encontrado o sin permiso" });

    res.json({ ok: true, product });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** DELETE /api/products/:id — admin y seller (seller solo sus productos) */
router.delete("/:id", requireAuth, requireRole(["admin", "seller"]), async (req, res) => {
  try {
    const findFilter = { _id: req.params.id };
    if (req.user.role === "seller") {
      findFilter.artistId = req.user.id;
    }

    const del = await Product.findOneAndDelete(findFilter);
    if (!del) return res.status(404).json({ ok: false, error: "Producto no encontrado o sin permiso" });

    res.json({ ok: true, msg: "Eliminado" });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

export default router;
