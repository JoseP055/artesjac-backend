// src/routes/analytics.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import Order from "../models/Order.js";

const router = Router();

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function periodToMonths(period = "6months") {
    if (period === "3months") return 3;
    if (period === "1year") return 12;
    return 6;
}

function firstDayMonthsAgo(monthsAgo) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - monthsAgo, 1); // día 1 del mes target
    return d;
}

function monthKey(y, m) {
    // m: 1..12
    return `${y}-${String(m).padStart(2, "0")}`;
}

function fillMonthsBuckets(start, end, rowsByKey) {
    const out = [];
    const cur = new Date(start);
    while (cur <= end) {
        const y = cur.getFullYear();
        const m = cur.getMonth() + 1; // 1..12
        const key = monthKey(y, m);
        const row = rowsByKey.get(key) || { revenue: 0, sales: 0, orders: 0 };
        out.push({
            month: MONTHS_ES[m - 1],
            sales: row.sales,
            revenue: row.revenue,
            orders: row.orders,
            year: y,
            m,
        });
        // siguiente mes
        cur.setMonth(cur.getMonth() + 1, 1);
    }
    return out;
}

/**
 * GET /api/analytics/seller?period=3months|6months|1year
 * Requiere rol seller/vendor/admin
 */
router.get(
    "/seller",
    requireAuth,
    requireRole(["seller", "vendor", "admin"]),
    async (req, res, next) => {
        try {
            const vendorId = new mongoose.Types.ObjectId(req.user.id);
            const months = periodToMonths(String(req.query.period || "6months"));
            const start = firstDayMonthsAgo(months - 1); // ej: 6 meses = desde el mes actual-5 al actual
            const end = new Date(); // ahora

            // ---------- Monthly (revenue, sales, orders) ----------
            const monthlyAgg = await Order.aggregate([
                { $match: { vendorId, createdAt: { $gte: start, $lte: end } } },
                { $unwind: "$items" },
                {
                    $group: {
                        _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
                        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                        sales: { $sum: "$items.quantity" },
                        orderIds: { $addToSet: "$_id" },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        year: "$_id.y",
                        month: "$_id.m",
                        revenue: 1,
                        sales: 1,
                        orders: { $size: "$orderIds" },
                    },
                },
                { $sort: { year: 1, month: 1 } },
            ]);

            const rowsByKey = new Map(
                monthlyAgg.map((r) => [monthKey(r.year, r.month), { revenue: r.revenue, sales: r.sales, orders: r.orders }])
            );
            const monthlyData = fillMonthsBuckets(new Date(start), end, rowsByKey);

            const totalRevenuePeriod = monthlyData.reduce((acc, r) => acc + (r.revenue || 0), 0);

            // ---------- Top products ----------
            const topProductsAgg = await Order.aggregate([
                { $match: { vendorId, createdAt: { $gte: start, $lte: end } } },
                { $unwind: "$items" },
                {
                    $group: {
                        _id: { productId: "$items.productId", name: "$items.name" },
                        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                        sales: { $sum: "$items.quantity" },
                    },
                },
                { $sort: { revenue: -1 } },
                { $limit: 5 },
            ]);

            const topProducts = topProductsAgg.map((p) => ({
                id: p._id.productId || null,
                name: p._id.name,
                sales: p.sales,
                revenue: p.revenue,
                percentage: totalRevenuePeriod > 0 ? Math.round((p.revenue / totalRevenuePeriod) * 100) : 0,
            }));

            // ---------- Customer metrics ----------
            // emails con pedidos en el periodo
            const periodCustomersAgg = await Order.aggregate([
                { $match: { vendorId, createdAt: { $gte: start, $lte: end } } },
                { $group: { _id: "$customer.email" } },
            ]);
            const periodEmails = new Set(periodCustomersAgg.map((d) => d._id).filter(Boolean));
            const totalCustomers = periodEmails.size;

            // emails con pedidos ANTES del periodo (para distinguir returning)
            const prevCustomersAgg = await Order.aggregate([
                { $match: { vendorId, createdAt: { $lt: start } } },
                { $group: { _id: "$customer.email" } },
            ]);
            const prevEmails = new Set(prevCustomersAgg.map((d) => d._id).filter(Boolean));

            let returningCustomers = 0;
            periodEmails.forEach((e) => {
                if (prevEmails.has(e)) returningCustomers += 1;
            });
            const newCustomers = Math.max(totalCustomers - returningCustomers, 0);

            // AOV del periodo
            const aovAgg = await Order.aggregate([
                { $match: { vendorId, createdAt: { $gte: start, $lte: end } } },
                { $group: { _id: null, avg: { $avg: "$total" } } },
            ]);
            const avgOrderValue = Math.round(aovAgg?.[0]?.avg || 0);

            const customerMetrics = {
                totalCustomers,
                newCustomers,
                returningCustomers,
                avgOrderValue,
                customerSatisfaction: null, // cuando tengas ratings, se calcula
            };

            // ---------- Revenue breakdown ----------
            // Calculamos revenue por items; si hay diferencia con 'total', la asignamos a "otros" (envío/impuestos)
            const sums = await Order.aggregate([
                { $match: { vendorId, createdAt: { $gte: start, $lte: end } } },
                { $unwind: "$items" },
                {
                    $group: {
                        _id: null,
                        itemsRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                    },
                },
            ]);

            const itemsRevenue = Math.round(sums?.[0]?.itemsRevenue || 0);
            const totalOrderSumAgg = await Order.aggregate([
                { $match: { vendorId, createdAt: { $gte: start, $lte: end } } },
                { $group: { _id: null, tot: { $sum: "$total" } } },
            ]);
            const totalSum = Math.round(totalOrderSumAgg?.[0]?.tot || 0);
            const otherRev = Math.max(totalSum - itemsRevenue, 0);

            const productSalesPct = totalSum > 0 ? Math.round((itemsRevenue / totalSum) * 100) : 0;
            const otherPct = Math.max(100 - productSalesPct, 0);
            // repartimos "otros" en shipping y taxes (si no tienes campos explícitos)
            const shippingPct = Math.round(otherPct * 0.67);
            const taxesPct = otherPct - shippingPct;

            const revenueBreakdown = {
                productSales: productSalesPct,
                shipping: shippingPct,
                taxes: taxesPct,
            };

            // ---------- Categorías ----------
            // Usa items.productId -> products.category (si existe). Si no, "Sin categoría".
            const categoriesAgg = await Order.aggregate([
                { $match: { vendorId, createdAt: { $gte: start, $lte: end } } },
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
                        cat: {
                            $ifNull: [{ $first: "$prod.category" }, "Sin categoría"],
                        },
                        pid: "$items.productId",
                        rev: { $multiply: ["$items.price", "$items.quantity"] },
                        qty: "$items.quantity",
                    },
                },
                {
                    $group: {
                        _id: "$cat",
                        revenue: { $sum: "$rev" },
                        sales: { $sum: "$qty" },
                        productIds: { $addToSet: "$pid" },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        category: "$_id",
                        revenue: 1,
                        sales: 1,
                        count: {
                            $size: {
                                $filter: { input: "$productIds", as: "p", cond: { $ne: ["$$p", null] } },
                            },
                        },
                    },
                },
                { $sort: { revenue: -1 } },
            ]);

            res.json({
                ok: true,
                data: {
                    monthlyData,
                    topProducts,
                    salesTrends: [], // reservado por si luego agregamos otra serie
                    customerMetrics,
                    revenueBreakdown,
                    productCategories: categoriesAgg,
                },
                period: req.query.period || "6months",
                range: { start, end },
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
