// src/routes/dashboard.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

const router = Router();

const PENDING_STATES = ["pendiente", "en_proceso", "retraso"];

router.get(
    "/seller",
    requireAuth,
    requireRole(["seller", "vendor", "admin"]),
    async (req, res, next) => {
        try {
            const isAdmin = req.user?.role === "admin";
            const vendorId = new mongoose.Types.ObjectId(req.user.id);
            const ownerFilter = isAdmin ? {} : { vendorId };

            // Totales de órdenes
            const [totalOrders, pendingOrders] = await Promise.all([
                Order.countDocuments(ownerFilter),
                Order.countDocuments({ ...ownerFilter, status: { $in: PENDING_STATES } }),
            ]);

            // Ingresos y ventas (solo órdenes entregadas)
            const deliveredAgg = await Order.aggregate([
                { $match: { ...ownerFilter, status: "entregado" } },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$total" },
                    },
                },
            ]);
            const itemsAgg = await Order.aggregate([
                { $match: { ...ownerFilter, status: "entregado" } },
                { $unwind: "$items" },
                { $group: { _id: null, totalSales: { $sum: "$items.quantity" } } },
            ]);

            const totalRevenue = Math.round(deliveredAgg?.[0]?.totalRevenue || 0);
            const totalSales = Math.round(itemsAgg?.[0]?.totalSales || 0);

            // Productos activos
            const activeProducts = await Product.countDocuments({
                ...ownerFilter,
                status: "active",
            });

            // Últimos 5 pedidos
            const recent = await Order.find(ownerFilter)
                .sort({ createdAt: -1 })
                .limit(5)
                .select({
                    _id: 1,
                    createdAt: 1,
                    status: 1,
                    total: 1,
                    "customer.name": 1,
                    items: 1,
                })
                .lean();

            const recentOrders = recent.map((o) => ({
                id: o._id.toString(),
                date: o.createdAt,
                customer: o.customer?.name || "Cliente",
                status: o.status,
                total: Number(o.total) || 0,
                items: Array.isArray(o.items) ? o.items.map((it) => it.name) : [],
            }));

            return res.json({
                ok: true,
                data: {
                    totalSales,
                    totalRevenue,
                    activeProducts,
                    pendingOrders,
                    totalOrders,
                    avgRating: 0, // placeholder hasta que tengas reseñas
                    recentOrders,
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
