// src/routes/dashboard.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import BuyerOrder from "../models/BuyerOrder.js";
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

            // Para productos usamos el filtro de vendorId
            const productFilter = isAdmin ? {} : { vendorId };

            // Para pedidos buscamos donde el vendedor tenga productos
            const orderFilter = isAdmin ? {} : { "items.sellerId": vendorId };

            // Estadísticas usando BuyerOrder
            const orderStats = await BuyerOrder.aggregate([
                { $match: orderFilter },

                // Si no es admin, filtrar solo items del vendedor
                ...(isAdmin ? [] : [
                    {
                        $addFields: {
                            vendorItems: {
                                $filter: {
                                    input: "$items",
                                    cond: { $eq: ["$$this.sellerId", vendorId] }
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            vendorTotal: {
                                $sum: {
                                    $map: {
                                        input: "$vendorItems",
                                        as: "item",
                                        in: { $multiply: ["$$item.price", "$$item.quantity"] }
                                    }
                                }
                            },
                            vendorItemCount: {
                                $sum: "$vendorItems.quantity"
                            }
                        }
                    }
                ]),

                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        pendingOrders: {
                            $sum: {
                                $cond: [{ $in: ["$status", PENDING_STATES] }, 1, 0]
                            }
                        },
                        deliveredOrders: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "entregado"] }, 1, 0]
                            }
                        },
                        totalRevenue: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$status", "entregado"] },
                                    isAdmin ? "$total" : "$vendorTotal",
                                    0
                                ]
                            }
                        },
                        totalSales: {
                            $sum: isAdmin ? {
                                $sum: "$items.quantity"
                            } : "$vendorItemCount"
                        }
                    }
                }
            ]);

            const stats = orderStats[0] || {
                totalOrders: 0,
                pendingOrders: 0,
                deliveredOrders: 0,
                totalRevenue: 0,
                totalSales: 0
            };

            // Productos activos
            const activeProducts = await Product.countDocuments({
                ...productFilter,
                status: "active",
            });

            // Últimos 5 pedidos del vendedor
            const recentOrdersPipeline = [
                { $match: orderFilter },

                // Si no es admin, agregar info del vendedor
                ...(isAdmin ? [] : [
                    {
                        $addFields: {
                            vendorItems: {
                                $filter: {
                                    input: "$items",
                                    cond: { $eq: ["$$this.sellerId", vendorId] }
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            vendorTotal: {
                                $sum: {
                                    $map: {
                                        input: "$vendorItems",
                                        as: "item",
                                        in: { $multiply: ["$$item.price", "$$item.quantity"] }
                                    }
                                }
                            }
                        }
                    }
                ]),

                { $sort: { createdAt: -1 } },
                { $limit: 5 },
                {
                    $project: {
                        _id: 1,
                        code: 1,
                        createdAt: 1,
                        status: 1,
                        total: isAdmin ? "$total" : "$vendorTotal",
                        customer: 1,
                        items: isAdmin ? "$items" : "$vendorItems"
                    }
                }
            ];

            const recent = await BuyerOrder.aggregate(recentOrdersPipeline);

            const recentOrders = recent.map((o) => ({
                id: o._id.toString(),
                code: o.code,
                date: o.createdAt,
                customer: o.customer?.fullName || "Cliente",
                status: o.status,
                total: Number(o.total) || 0,
                items: Array.isArray(o.items) ? o.items.map((it) => it.name) : [],
            }));

            return res.json({
                ok: true,
                data: {
                    totalSales: stats.totalSales,
                    totalRevenue: Math.round(stats.totalRevenue),
                    activeProducts,
                    pendingOrders: stats.pendingOrders,
                    totalOrders: stats.totalOrders,
                    avgRating: 0, // placeholder hasta que tengas reseñas
                    recentOrders,
                },
            });
        } catch (err) {
            console.error('Error en dashboard del vendedor:', err);
            next(err);
        }
    }
);

export default router;