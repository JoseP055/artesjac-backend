// src/routes/seller.analytics.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import requireAuth from "../middlewares/requireAuth.js";
import ListaDePedidos from "../models/ListaDePedidos.js";

const router = Router();

/**
 * GET /api/seller-analytics
 * Analytics completos para el vendedor usando ListaDePedidos
 */
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const vendorId = new mongoose.Types.ObjectId(req.user.id);
        const { period = "6months" } = req.query;

        // Calcular fecha de inicio según el período
        const now = new Date();
        let startDate;
        switch (period) {
            case "3months":
                startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                break;
            case "1year":
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
                break;
            default: // 6months
                startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        }

        const baseMatch = {
            vendorId,
            createdAt: { $gte: startDate }
        };

        // 1. Datos mensuales
        const monthlyData = await ListaDePedidos.aggregate([
            { $match: baseMatch },
            {
                $addFields: {
                    vendorSales: { $sum: "$items.quantity" }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    sales: { $sum: "$vendorSales" },
                    revenue: { $sum: "$vendorTotal" },
                    orders: { $sum: 1 }
                }
            },
            {
                $project: {
                    month: {
                        $concat: [
                            { $toString: "$_id.year" },
                            "-",
                            { $toString: "$_id.month" }
                        ]
                    },
                    sales: 1,
                    revenue: 1,
                    orders: 1
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // 2. Top productos
        const topProducts = await ListaDePedidos.aggregate([
            { $match: baseMatch },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.productId",
                    name: { $first: "$items.name" },
                    sales: { $sum: "$items.quantity" },
                    revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
                }
            },
            { $sort: { sales: -1 } },
            { $limit: 10 },
            {
                $addFields: {
                    id: "$_id",
                    percentage: 100 // Calculamos después
                }
            }
        ]);

        // Calcular porcentajes para top productos
        const maxSales = topProducts[0]?.sales || 1;
        topProducts.forEach(product => {
            product.percentage = Math.round((product.sales / maxSales) * 100);
        });

        // 3. Categorías de productos
        const productCategories = await ListaDePedidos.aggregate([
            { $match: baseMatch },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.category",
                    category: { $first: "$items.category" },
                    sales: { $sum: "$items.quantity" },
                    revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                    count: { $addToSet: "$items.productId" }
                }
            },
            {
                $addFields: {
                    count: { $size: "$count" }
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        // 4. Métricas de clientes
        const customerMetrics = await ListaDePedidos.aggregate([
            { $match: baseMatch },
            {
                $group: {
                    _id: "$customer.email",
                    orders: { $sum: 1 },
                    totalSpent: { $sum: "$vendorTotal" },
                    firstOrder: { $min: "$createdAt" }
                }
            },
            {
                $group: {
                    _id: null,
                    totalCustomers: { $sum: 1 },
                    returningCustomers: {
                        $sum: { $cond: [{ $gt: ["$orders", 1] }, 1, 0] }
                    },
                    avgOrderValue: { $avg: "$totalSpent" },
                    newCustomers: {
                        $sum: {
                            $cond: [{ $gte: ["$firstOrder", startDate] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        const custMetrics = customerMetrics[0] || {
            totalCustomers: 0,
            newCustomers: 0,
            returningCustomers: 0,
            avgOrderValue: 0
        };

        // 5. Desglose de ingresos (simplificado)
        const revenueBreakdown = {
            productSales: 85, // 85% ventas de productos
            shipping: 10,     // 10% envíos
            taxes: 5          // 5% impuestos/comisiones
        };

        // 6. Tendencias de ventas (últimos 7 días)
        const salesTrends = await ListaDePedidos.aggregate([
            {
                $match: {
                    vendorId,
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $addFields: {
                    vendorSales: { $sum: "$items.quantity" }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    sales: { $sum: "$vendorSales" },
                    revenue: { $sum: "$vendorTotal" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 7. Métricas de rendimiento adicionales
        const performanceMetrics = await ListaDePedidos.aggregate([
            { $match: { vendorId } },
            {
                $group: {
                    _id: null,
                    avgProcessingTime: { $avg: "$processingTime" },
                    avgDeliveryTime: { $avg: "$deliveryTime" },
                    completionRate: {
                        $avg: {
                            $cond: [{ $eq: ["$status", "entregado"] }, 1, 0]
                        }
                    },
                    cancellationRate: {
                        $avg: {
                            $cond: [{ $eq: ["$status", "cancelado"] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        const perfMetrics = performanceMetrics[0] || {
            avgProcessingTime: 0,
            avgDeliveryTime: 0,
            completionRate: 0,
            cancellationRate: 0
        };

        res.json({
            ok: true,
            data: {
                monthlyData: monthlyData.map(m => ({
                    month: formatMonth(m.month),
                    sales: m.sales,
                    revenue: m.revenue,
                    orders: m.orders
                })),
                topProducts,
                productCategories,
                customerMetrics: {
                    ...custMetrics,
                    customerSatisfaction: "4.5/5" // Placeholder
                },
                revenueBreakdown,
                salesTrends,
                performanceMetrics: {
                    avgProcessingTime: Math.round(perfMetrics.avgProcessingTime || 0),
                    avgDeliveryTime: Math.round(perfMetrics.avgDeliveryTime || 0),
                    completionRate: Math.round((perfMetrics.completionRate || 0) * 100),
                    cancellationRate: Math.round((perfMetrics.cancellationRate || 0) * 100)
                }
            }
        });

    } catch (err) {
        console.error('Error en analytics del vendedor:', err);
        next(err);
    }
});

/**
 * GET /api/seller-analytics/performance
 * Métricas específicas de rendimiento
 */
router.get("/performance", requireAuth, async (req, res, next) => {
    try {
        const vendorId = new mongoose.Types.ObjectId(req.user.id);

        // Análisis de tiempos de procesamiento
        const performanceData = await ListaDePedidos.aggregate([
            { $match: { vendorId } },
            {
                $group: {
                    _id: "$priority",
                    count: { $sum: 1 },
                    avgProcessingTime: { $avg: "$processingTime" },
                    avgDeliveryTime: { $avg: "$deliveryTime" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Estado de pedidos por mes
        const statusByMonth = await ListaDePedidos.aggregate([
            { $match: { vendorId } },
            {
                $group: {
                    _id: {
                        month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                        status: "$status"
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.month": 1 } }
        ]);

        res.json({
            ok: true,
            data: {
                performanceByPriority: performanceData,
                statusTrends: statusByMonth
            }
        });

    } catch (err) {
        console.error('Error en métricas de rendimiento:', err);
        next(err);
    }
});

// Helper function para formatear meses
function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const monthNames = [
        'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
        'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
    ];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
}

export default router;