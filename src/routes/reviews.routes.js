// src/routes/reviews.routes.js
import { Router } from "express";
import { query, body, validationResult } from "express-validator";
import mongoose from "mongoose";
import ProductReview from "../models/ProductReview.js";
import StoreReview from "../models/StoreReview.js";
import requireAuth, { requireBuyer } from "../middlewares/requireAuth.js";

const router = Router();
const toId = (s) => { try { return new mongoose.Types.ObjectId(String(s)); } catch { return null; } };
const validate = (req, res, next) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ ok: false, error: "Validación", details: errs.array() });
    next();
};

/* ===================== PRODUCT REVIEWS ===================== */

// GET /api/reviews/products?product=<id>&page=&limit=
router.get(
    "/products",
    [query("product").isString().notEmpty(), query("page").optional().isInt({ min: 1 }), query("limit").optional().isInt({ min: 1, max: 100 })],
    validate,
    async (req, res, next) => {
        try {
            const productId = toId(req.query.product);
            if (!productId) return res.status(400).json({ ok: false, error: "product inválido" });

            const page = Number(req.query.page || 1);
            const limit = Number(req.query.limit || 20);

            const [items, total] = await Promise.all([
                ProductReview.find({ productId, status: "approved" })
                    .populate({ path: "userId", select: "name avatar" })
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                ProductReview.countDocuments({ productId, status: "approved" }),
            ]);

            res.json({ ok: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
        } catch (err) { next(err); }
    }
);

// POST /api/reviews/products  { productId, rating, comment? }
router.post(
    "/products",
    [requireAuth, requireBuyer, body("productId").isString().notEmpty(), body("rating").isInt({ min: 1, max: 5 }), body("comment").optional().isString().isLength({ max: 2000 })],
    validate,
    async (req, res, next) => {
        try {
            const productId = toId(req.body.productId);
            if (!productId) return res.status(400).json({ ok: false, error: "productId inválido" });

            const payload = { rating: req.body.rating, comment: req.body.comment || "", status: "approved" };
            const doc = await ProductReview.findOneAndUpdate(
                { productId, userId: req.user.id },
                { $set: payload, $setOnInsert: { productId, userId: req.user.id } },
                { upsert: true, new: true }
            );

            res.json({ ok: true, data: doc, message: "Reseña de producto guardada" });
        } catch (err) {
            if (err?.code === 11000) return res.status(409).json({ ok: false, error: "Ya reseñaste este producto" });
            next(err);
        }
    }
);

/* ===================== STORE REVIEWS ===================== */

// GET /api/reviews/stores?vendor=<id>&page=&limit=
router.get(
    "/stores",
    [query("vendor").isString().notEmpty(), query("page").optional().isInt({ min: 1 }), query("limit").optional().isInt({ min: 1, max: 100 })],
    validate,
    async (req, res, next) => {
        try {
            const vendorId = toId(req.query.vendor);
            if (!vendorId) return res.status(400).json({ ok: false, error: "vendor inválido" });

            const page = Number(req.query.page || 1);
            const limit = Number(req.query.limit || 20);

            const [items, total] = await Promise.all([
                StoreReview.find({ vendorId, status: "approved" })
                    .populate({ path: "userId", select: "name avatar" })
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                StoreReview.countDocuments({ vendorId, status: "approved" }),
            ]);

            res.json({ ok: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
        } catch (err) { next(err); }
    }
);

// POST /api/reviews/stores  { vendorId, rating, comment? }
router.post(
    "/stores",
    [requireAuth, requireBuyer, body("vendorId").isString().notEmpty(), body("rating").isInt({ min: 1, max: 5 }), body("comment").optional().isString().isLength({ max: 2000 })],
    validate,
    async (req, res, next) => {
        try {
            const vendorId = toId(req.body.vendorId);
            if (!vendorId) return res.status(400).json({ ok: false, error: "vendorId inválido" });

            const payload = { rating: req.body.rating, comment: req.body.comment || "", status: "approved" };
            const doc = await StoreReview.findOneAndUpdate(
                { vendorId, userId: req.user.id },
                { $set: payload, $setOnInsert: { vendorId, userId: req.user.id } },
                { upsert: true, new: true }
            );

            res.json({ ok: true, data: doc, message: "Reseña de tienda guardada" });
        } catch (err) {
            if (err?.code === 11000) return res.status(409).json({ ok: false, error: "Ya reseñaste esta tienda" });
            next(err);
        }
    }
);

export default router;
