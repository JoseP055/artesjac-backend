// src/routes/public.routes.js
import { Router } from "express";
import { query, param } from "express-validator";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Review from "../models/Review.js";

const router = Router();

/** Helpers */
const toObjectId = (id) => {
    try { return new mongoose.Types.ObjectId(id); } catch { return null; }
};

/** GET /api/public/products
 *  Lista pública de productos activos (tienda)
 *  Query: page, limit, q, category, sort(new|old|price_asc|price_desc)
 */
router.get(
    "/products",
    [
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        query("q").optional().isString(),
        query("category").optional().isString(),
        query("sort").optional().isIn(["new", "old", "price_asc", "price_desc"]),
    ],
    async (req, res, next) => {
        try {
            const page = Number(req.query.page || 1);
            const limit = Number(req.query.limit || 12);
            const q = req.query.q ? String(req.query.q) : null;
            const category = req.query.category ? String(req.query.category) : null;
            const sort = req.query.sort ? String(req.query.sort) : "new";

            const filter = { status: "active" };
            if (q) filter.$text = { $search: q };
            if (category) filter.category = category;

            let sortBy = { createdAt: -1 };
            if (sort === "old") sortBy = { createdAt: 1 };
            if (sort === "price_asc") sortBy = { price: 1 };
            if (sort === "price_desc") sortBy = { price: -1 };

            const [items, total] = await Promise.all([
                Product.find(filter)
                    .select("title slug price images category stock createdAt")
                    .sort(sortBy)
                    .skip((page - 1) * limit)
                    .limit(limit),
                Product.countDocuments(filter),
            ]);

            return res.json({
                ok: true,
                data: items,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

/** GET /api/public/products/:slug
 *  Detalle público por slug + vendedor público + rating agregado
 */
router.get(
    "/products/:slug",
    [param("slug").isString().notEmpty()],
    async (req, res, next) => {
        try {
            const product = await Product.findOne({ slug: req.params.slug, status: "active" })
                .populate({
                    path: "vendorId",
                    select: "name companyName avatar role", // solo público
                })
                .lean();

            if (!product) {
                return res.status(404).json({ ok: false, error: "Producto no encontrado" });
            }

            // Agregar promedio de rating y conteo desde reviews aprobadas
            const agg = await Review.aggregate([
                { $match: { productId: product._id, status: "approved" } },
                {
                    $group: {
                        _id: "$productId",
                        avg: { $avg: "$rating" },
                        count: { $sum: 1 },
                    },
                },
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

/** GET /api/public/reviews?product=:id&page=&limit=
 *  Lista pública de reseñas aprobadas por producto
 */
router.get(
    "/reviews",
    [
        query("product").isString().notEmpty(),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
    ],
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

export default router;
