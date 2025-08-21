// src/routes/products.routes.js
import { Router } from "express";
import { body, param, query, validationResult } from "express-validator";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();

/* Helpers */
const isAdmin = (req) => req.user?.role === "admin";
const ownerFilter = (req) => (isAdmin(req) ? {} : { vendorId: req.user.id });
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

function normalizeStatusForSchema(input) {
  if (input === "inactive") return "draft";
  if (input === "out_of_stock") return "active"; // tu UI puede mapear stock=0
  return input;
}

/* ===== Validadores ===== */
const productCreateValidators = [
  body("title").isString().trim().isLength({ min: 2, max: 140 }),
  body("price").isNumeric().custom((n) => n >= 0),
  body("stock").optional().isInt({ min: 0 }),
  body("category").optional().isString().trim(),
  body("tags").optional().isArray(),
  body("images").optional().isArray(),
  body("status").optional().isString().custom((s) => ["draft", "active", "archived", "inactive", "out_of_stock"].includes(s)),
];

const productUpdateValidators = [
  body("title").optional().isString().trim().isLength({ min: 2, max: 140 }),
  body("price").optional().isNumeric().custom((n) => n >= 0),
  body("stock").optional().isInt({ min: 0 }),
  body("category").optional().isString().trim(),
  body("tags").optional().isArray(),
  body("images").optional().isArray(),
  body("status").optional().isString().custom((s) => ["draft", "active", "archived", "inactive", "out_of_stock"].includes(s)),
];

/* ===== LISTA GENERAL (admin o vendedor) =====
   GET /api/products?status=&category=&q=&limit=&page=&vendorId=
*/
router.get(
  "/",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  [
    query("status").optional().isString(),
    query("category").optional().isString(),
    query("q").optional().isString(),
    query("vendorId").optional().isString(),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 200 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ ok: false, error: "Parámetros inválidos", details: errors.array() });

      const { status, category, q, vendorId } = req.query;
      const page = parseInt(req.query.page || "1", 10);
      const limit = parseInt(req.query.limit || "50", 10);

      const filter = { ...(ownerFilter(req)) };

      if (isAdmin(req) && vendorId && isObjectId(vendorId)) {
        // admin puede filtrar por vendorId arbitrario
        filter.vendorId = vendorId;
      }

      if (status) filter.status = normalizeStatusForSchema(status);
      if (category) filter.category = category;

      let queryM = Product.find(filter);

      if (q) {
        // Búsqueda simple por texto
        queryM = Product.find({
          ...filter,
          $or: [
            { title: new RegExp(q, "i") },
            { description: new RegExp(q, "i") },
            { tags: { $in: [new RegExp(q, "i")] } },
          ],
        });
      }

      const total = await Product.countDocuments(queryM.getFilter());
      const data = await queryM
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      res.json({ ok: true, data, page, limit, total });
    } catch (err) {
      next(err);
    }
  }
);

/* ===== MIS PRODUCTOS (vendedor logueado) =====
   GET /api/products/me
*/
router.get(
  "/me",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  async (req, res, next) => {
    try {
      const data = await Product.find(ownerFilter(req)).sort({ createdAt: -1 }).lean();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/* ===== POR VENDEDOR (público o interno según tu uso)
   GET /api/products/by-vendor/:vendorId
   Útil para dashboards o para listar por tienda.
*/
router.get(
  "/by-vendor/:vendorId",
  [param("vendorId").exists()],
  async (req, res, next) => {
    try {
      const { vendorId } = req.params;
      if (!isObjectId(vendorId)) return res.status(400).json({ ok: false, error: "vendorId inválido" });

      const data = await Product.find({ vendorId, status: "active" }).sort({ createdAt: -1 }).lean();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/* ===== CREAR =====
   POST /api/products
*/
router.post(
  "/",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  productCreateValidators,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ ok: false, error: "Datos inválidos", details: errors.array() });
      }

      const payload = { ...req.body };
      if (payload.status) payload.status = normalizeStatusForSchema(payload.status);

      // asegurar dueño
      if (!isAdmin(req)) payload.vendorId = req.user.id;

      const created = await Product.create(payload);
      res.status(201).json({ ok: true, data: created });
    } catch (err) {
      next(err);
    }
  }
);

/* ===== ACTUALIZAR =====
   PUT /api/products/:id
*/
router.put(
  "/:id",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  [param("id").isMongoId(), ...productUpdateValidators],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ ok: false, error: "Datos inválidos", details: errors.array() });

      const payload = { ...req.body };
      if (payload.status) payload.status = normalizeStatusForSchema(payload.status);

      const query = { _id: req.params.id, ...ownerFilter(req) };
      const updated = await Product.findOneAndUpdate(query, payload, { new: true });
      if (!updated) return res.status(404).json({ ok: false, error: "No encontrado o sin permiso" });

      res.json({ ok: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/* ===== ELIMINAR =====
   DELETE /api/products/:id
*/
router.delete(
  "/:id",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  [param("id").isMongoId()],
  async (req, res, next) => {
    try {
      const query = { _id: req.params.id, ...ownerFilter(req) };
      const product = await Product.findOneAndDelete(query);
      if (!product) return res.status(404).json({ ok: false, error: "No encontrado o sin permiso" });
      res.json({ ok: true, data: { _id: product._id } });
    } catch (err) {
      next(err);
    }
  }
);

/* ===== DETALLE (ID o SLUG) — DEJAR AL FINAL =====
   GET /api/products/:idOrSlug
   Evita el cast error y evita capturar rutas como /me, /by-vendor, etc.
*/
router.get(
  "/:idOrSlug",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  async (req, res, next) => {
    try {
      const { idOrSlug } = req.params;
      const filterOwner = ownerFilter(req);

      const query = isObjectId(idOrSlug)
        ? { _id: idOrSlug, ...filterOwner }
        : { slug: idOrSlug, ...filterOwner };

      const product = await Product.findOne(query).lean();
      if (!product) return res.status(404).json({ ok: false, error: "Producto no encontrado" });

      res.json({ ok: true, data: product });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
