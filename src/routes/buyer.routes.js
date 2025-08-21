// src/routes/buyer.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Favorite from "../models/Favorite.js"; // si no usas favoritos, podés quitarlo

const router = Router();

// Estados considerados "pendientes" para el comprador
const PENDING_STATES = ["pendiente", "en_proceso", "enviado", "retraso"];

/**
 * GET /api/buyer/dashboard
 * Devuelve: stats, recentOrders, recommendedProducts
 */
router.get(
    "/dashboard",
    requireAuth,
    requireRole(["buyer", "user", "seller", "vendor", "admin"]), // buyer (y admin/seller ven su propio tablero de compra)
    async (req, res, next) => {
        try {
            const userId = new mongoose.Types.ObjectId(req.user.id);
            const email = req.user.email;

            // Filtrar órdenes del comprador por email o por customerId (si en algún momento lo agregás al modelo)
            const buyerFilter = {
                $or: [
                    { "customer.email": email },
                    { customerId: userId }, // campo opcional (si lo agregás en tu OrderSchema en el futuro)
                ],
            };

            // Totales
            const [totalOrders, pendingOrders] = await Promise.all([
                Order.countDocuments(buyerFilter),
                Order.countDocuments({ ...buyerFilter, status: { $in: PENDING_STATES } }),
            ]);

            // Total gastado (excluimos cancelados)
            const spentAgg = await Order.aggregate([
                { $match: { ...buyerFilter, status: { $ne: "cancelado" } } },
                { $group: { _id: null, total: { $sum: "$total" } } },
            ]);
            const totalSpent = Math.round(spentAgg?.[0]?.total || 0);

            // Favoritos (si no usás Favorite, poné favoriteProducts = 0)
            let favoriteProducts = 0;
            try {
                favoriteProducts = await Favorite.countDocuments({ userId });
            } catch (_) {
                favoriteProducts = 0;
            }

            // Pedidos recientes (máx 5)
            const orders = await Order.find(buyerFilter)
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            const recentOrders = orders.map((o) => ({
                id: (o._id || o.id).toString(),
                date: o.createdAt,
                // Mapear 'enviado' a 'en-transito' para compatibilidad con tu UI
                status: o.status === "enviado" ? "en-transito" : o.status,
                total: Number(o.total) || 0,
                items: Array.isArray(o.items) ? o.items.map((it) => it.name) : [],
            }));

            // Recomendaciones:
            // 1) Tomamos las categorías de las últimas compras del usuario
            // 2) Buscamos productos activos de esas categorías
            // 3) Fallback: últimos productos activos
            const recentCatsAgg = await Order.aggregate([
                { $match: buyerFilter },
                { $sort: { createdAt: -1 } },
                { $limit: 20 },
                { $unwind: "$items" },
                {
                    $lookup: {
                        from: "products",
                        localField: "items.productId",
                        foreignField: "_id",
                        as: "prod",
                    },
                },
                {
                    $addFields: {
                        cat: { $ifNull: [{ $first: "$prod.category" }, null] },
                    },
                },
                { $match: { cat: { $ne: null } } },
                { $group: { _id: "$cat", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 3 },
            ]);

            let recommendedProducts = [];
            if (recentCatsAgg.length > 0) {
                const cats = recentCatsAgg.map((c) => c._id);
                recommendedProducts = await Product.find({
                    status: "active",
                    category: { $in: cats },
                })
                    .sort({ createdAt: -1 })
                    .limit(6)
                    .lean();
            }
            if (recommendedProducts.length === 0) {
                recommendedProducts = await Product.find({ status: "active" })
                    .sort({ createdAt: -1 })
                    .limit(6)
                    .lean();
            }

            const mappedRecs = recommendedProducts.map((p) => ({
                id: (p._id || p.id).toString(),
                name: p.title, // tu backend usa 'title'
                price: Number(p.price) || 0,
                category: p.category || "",
                imageUrl: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : "",
            }));

            return res.json({
                ok: true,
                data: {
                    stats: { totalOrders, totalSpent, pendingOrders, favoriteProducts },
                    recentOrders,
                    recommendedProducts: mappedRecs,
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
