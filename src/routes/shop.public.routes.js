// src/routes/shop.public.routes.js
import { Router } from "express";
import { query, param, body, validationResult } from "express-validator";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import requireAuth, { requireBuyer } from "../middlewares/requireAuth.js";

const router = Router();
const toObjectId = (id) => {
    try { return new mongoose.Types.ObjectId(id); } catch { return null; }
};
const validate = (req, res, next) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) {
        return res.status(400).json({ ok: false, error: "Validación", details: errs.array() });
    }
    next();
};

/** GET /api/shop/products
 *  Lista pública de productos activos
 *  Query: page, limit, q, category, sort(new|old|price_asc|price_desc), vendor
 */
router.get(
    "/products",
    [
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        query("q").optional().isString(),
        query("category").optional().isString(),
        query("sort").optional().isIn(["new", "old", "price_asc", "price_desc"]),
        query("vendor").optional().isString(),
    ],
    validate,
    async (req, res, next) => {
        try {
            const page = Number(req.query.page || 1);
            const limit = Number(req.query.limit || 12);
            const q = req.query.q ? String(req.query.q) : null;
            const category = req.query.category ? String(req.query.category) : null;
            const vendor = req.query.vendor ? String(req.query.vendor) : null;
            const sort = req.query.sort ? String(req.query.sort) : "new";

            const filter = { status: "active" };
            if (q) filter.$text = { $search: q };
            if (category) filter.category = category;
            if (vendor) {
                const vId = toObjectId(vendor);
                if (!vId) return res.status(400).json({ ok: false, error: "vendor inválido" });
                filter.vendorId = vId;
            }

            let sortBy = { createdAt: -1 };
            if (sort === "old") sortBy = { createdAt: 1 };
            if (sort === "price_asc") sortBy = { price: 1 };
            if (sort === "price_desc") sortBy = { price: -1 };

            const [items, total] = await Promise.all([
                Product.find(filter)
                    .select("title slug price images category stock createdAt vendorId")
                    .sort(sortBy)
                    .skip((page - 1) * limit)
                    .limit(limit),
                Product.countDocuments(filter),
            ]);

            return res.json({
                ok: true,
                data: items,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (err) {
            next(err);
        }
    }
);

/** GET /api/shop/products/:slug
 *  Detalle público por slug + vendedor público + rating agregado (approved)
 */
router.get(
    "/products/:slug",
    [param("slug").isString().notEmpty()],
    validate,
    async (req, res, next) => {
        try {
            const product = await Product.findOne({ slug: req.params.slug, status: "active" })
                .populate({ path: "vendorId", select: "name companyName avatar role" }) // solo público
                .lean();

            if (!product) return res.status(404).json({ ok: false, error: "Producto no encontrado" });

            const agg = await Review.aggregate([
                { $match: { productId: product._id, status: "approved" } },
                { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
            ]);

            const rating = agg.length
                ? { averageRating: Number(agg[0].avg.toFixed(2)), reviewsCount: agg[0].count }
                : { averageRating: 0, reviewsCount: 0 };

            return res.json({ ok: true, data: { ...product, ...rating } });
        } catch (err) {
            next(err);
        }
    }
);

/** GET /api/shop/reviews?product=:id&page=&limit=
 *  Lista pública de reseñas aprobadas
 */
router.get(
    "/reviews",
    [
        query("product").isString().notEmpty(),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
    ],
    validate,
    async (req, res, next) => {
        try {
            const page = Number(req.query.page || 1);
            const limit = Number(req.query.limit || 10);
            const productId = toObjectId(req.query.product);
            if (!productId) return res.status(400).json({ ok: false, error: "product inválido" });

            const filter = { productId, status: "approved" };

            const [items, total] = await Promise.all([
                Review.find(filter)
                    .populate({ path: "userId", select: "name avatar" })
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                Review.countDocuments(filter),
            ]);

            return res.json({
                ok: true,
                data: items,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (err) {
            next(err);
        }
    }
);

/** POST /api/shop/reviews
 *  Crea/actualiza reseña (🔒 comprador autenticado, 1 por persona)
 *  Body: { productId, rating(1..5), comment? }
 */
router.post(
    "/reviews",
    [
        requireAuth,      // requiere JWT
        requireBuyer,     // solo compradores
        body("productId").isString().notEmpty(),
        body("rating").isInt({ min: 1, max: 5 }),
        body("comment").optional().isString().isLength({ max: 2000 }),
    ],
    validate,
    async (req, res, next) => {
        try {
            const productId = toObjectId(req.body.productId);
            if (!productId) return res.status(400).json({ ok: false, error: "productId inválido" });

            // (Opcional: verificar que el producto exista y esté activo)
            const prod = await Product.findById(productId).select("_id status").lean();
            if (!prod || prod.status !== "active") {
                return res.status(404).json({ ok: false, error: "Producto no disponible" });
            }

            const userId = toObjectId(req.user.id);
            if (!userId) return res.status(401).json({ ok: false, error: "Usuario inválido" });

            const payload = {
                rating: req.body.rating,
                comment: req.body.comment || "",
                status: "approved", // o "pending" si querés moderar
            };

            // Upsert: si ya existe, actualiza; si no, crea
            const review = await Review.findOneAndUpdate(
                { productId, userId },
                { $set: payload, $setOnInsert: { productId, userId } },
                { upsert: true, new: true }
            );

            return res.status(200).json({ ok: true, data: review, message: "Reseña guardada" });
        } catch (err) {
            // Si el índice unique dispara error 11000, devolvemos mensaje claro
            if (err?.code === 11000) {
                return res.status(409).json({ ok: false, error: "Ya existe reseña para este producto" });
            }
            next(err);
        }
    }
);

export default router;
