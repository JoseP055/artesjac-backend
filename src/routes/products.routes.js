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

function normalizeStatusForSchema(input) {
  // UI puede mandar "inactive" o "out_of_stock"
  if (input === "inactive") return "draft";
  if (input === "out_of_stock") return "active";
  if (["draft", "active", "archived"].includes(input)) return input;
  return "active";
}

/* Validaciones */
const productCreateValidators = [
  body("title").isString().trim().isLength({ min: 1, max: 140 }),
  body("price").isFloat({ min: 0 }),
  body("stock").optional().isInt({ min: 0 }),
  body("description").optional().isString().isLength({ max: 2000 }),
  body("images").optional().isArray(),
  body("category").optional().isString().trim().isLength({ max: 60 }),
  body("tags").optional().isArray(),
  body("status").optional().isString(),
];

const productUpdateValidators = [
  body("title").optional().isString().trim().isLength({ min: 1, max: 140 }),
  body("price").optional().isFloat({ min: 0 }),
  body("stock").optional().isInt({ min: 0 }),
  body("description").optional().isString().isLength({ max: 2000 }),
  body("images").optional().isArray(),
  body("category").optional().isString().trim().isLength({ max: 60 }),
  body("tags").optional().isArray(),
  body("status").optional().isString(),
];

/* Crear producto */
router.post(
  "/",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  productCreateValidators,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ ok: false, error: "Datos inválidos", details: errors.array() });
      }

      // vendorId: admin puede asignar; seller/vendor se fuerza al propio id
      const rawVendorId = isAdmin(req) && req.body.vendorId ? req.body.vendorId : req.user.id;
      if (!mongoose.Types.ObjectId.isValid(rawVendorId)) {
        return res.status(400).json({ ok: false, error: "vendorId inválido" });
      }

      const reqStatus = req.body.status;
      const normalizedStatus = normalizeStatusForSchema(reqStatus);
      const forceOutOfStock = reqStatus === "out_of_stock";

      const payload = {
        title: String(req.body.title).trim(),
        description: (req.body.description || "").toString(),
        price: Number(req.body.price),
        stock: Number(req.body.stock || 0),
        category: (req.body.category || "").toString().trim(),
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
        images: Array.isArray(req.body.images) ? req.body.images : [],
        status: normalizedStatus, // "draft" | "active" | "archived"
        vendorId: rawVendorId,
      };

      if (forceOutOfStock) payload.stock = 0;

      const product = await Product.create(payload);
      res.status(201).json({ ok: true, data: product });
    } catch (err) {
      next(err);
    }
  }
);

/* Listar productos */
router.get(
  "/",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("q").optional().isString(),
    query("category").optional().isString(),
    query("status").optional().isString(),
    query("sort")
      .optional()
      .isIn(["new", "old", "price_asc", "price_desc", "stock_desc", "stock_asc"]),
  ],
  async (req, res, next) => {
    try {
      const { page = 1, limit = 10, q, category, status, sort = "new" } = req.query;

      const filter = { ...ownerFilter(req) };
      if (q) filter.$text = { $search: String(q) };
      if (category) filter.category = String(category);
      if (status) filter.status = normalizeStatusForSchema(String(status));

      let sortBy = { createdAt: -1 };
      if (sort === "old") sortBy = { createdAt: 1 };
      if (sort === "price_asc") sortBy = { price: 1 };
      if (sort === "price_desc") sortBy = { price: -1 };
      if (sort === "stock_desc") sortBy = { stock: -1 };
      if (sort === "stock_asc") sortBy = { stock: 1 };

      const data = await Product.find(filter)
        .sort(sortBy)
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit));

      const total = await Product.countDocuments(filter);
      res.json({ ok: true, data, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
      next(err);
    }
  }
);

/* Obtener por ID */
router.get(
  "/:id",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  [param("id").isMongoId()],
  async (req, res, next) => {
    try {
      const product = await Product.findOne({ _id: req.params.id, ...ownerFilter(req) });
      if (!product) return res.status(404).json({ ok: false, error: "No encontrado" });
      res.json({ ok: true, data: product });
    } catch (err) {
      next(err);
    }
  }
);

/* Actualizar */
router.put(
  "/:id",
  requireAuth,
  requireRole(["seller", "vendor", "admin"]),
  [param("id").isMongoId(), ...productUpdateValidators],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ ok: false, error: "Datos inválidos", details: errors.array() });
      }

      const query = { _id: req.params.id, ...ownerFilter(req) };
      const update = {};

      if (req.body.title !== undefined) update.title = String(req.body.title).trim();
      if (req.body.description !== undefined)
        update.description = String(req.body.description || "");
      if (req.body.price !== undefined) update.price = Number(req.body.price);
      if (req.body.stock !== undefined) update.stock = Number(req.body.stock);
      if (req.body.category !== undefined)
        update.category = String(req.body.category || "").trim();
      if (req.body.tags !== undefined) update.tags = Array.isArray(req.body.tags) ? req.body.tags : [];
      if (req.body.images !== undefined)
        update.images = Array.isArray(req.body.images) ? req.body.images : [];

      if (req.body.status !== undefined) {
        const reqStatus = req.body.status;
        update.status = normalizeStatusForSchema(reqStatus);
        if (reqStatus === "out_of_stock") {
          update.stock = 0; // representar "sin stock" en el schema actual
        }
      }

      const product = await Product.findOneAndUpdate(query, update, {
        new: true,
        runValidators: true,
      });
      if (!product) return res.status(404).json({ ok: false, error: "No encontrado o sin permiso" });
      res.json({ ok: true, data: product });
    } catch (err) {
      next(err);
    }
  }
);

/* Eliminar */
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

export default router;
