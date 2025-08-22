// src/routes/seller.orders.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import requireAuth from "../middlewares/requireAuth.js";
import BuyerOrder from "../models/BuyerOrder.js";

// TEMPORAL: Hasta que crees ListaDePedidos, usar BuyerOrder
// import ListaDePedidos from "../models/ListaDePedidos.js";

const router = Router();

/**
 * GET /api/seller-orders
 * Lista los pedidos donde el vendedor tiene productos
 */
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const sellerId = new mongoose.Types.ObjectId(req.user.id);
        const { page = 1, limit = 100, status, q, sort = "date" } = req.query;

        console.log('🔄 Buscando pedidos para vendedor:', sellerId.toString());

        // TEMPORAL: Usar BuyerOrder hasta que implementes ListaDePedidos
        // Filtro base: pedidos que contengan productos del vendedor
        const matchStage = {
            "items.sellerId": sellerId
        };

        // Filtro por estado si se especifica
        if (status && status !== "all") {
            matchStage.status = status;
        }

        // Pipeline de agregación
        const pipeline = [
            { $match: matchStage },

            // Filtrar solo los items del vendedor
            {
                $addFields: {
                    vendorItems: {
                        $filter: {
                            input: "$items",
                            cond: { $eq: ["$$this.sellerId", sellerId] }
                        }
                    }
                }
            },

            // Calcular el total del vendedor
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
            },

            // Proyección final
            {
                $project: {
                    _id: 1,
                    code: 1,
                    status: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    customer: 1,
                    shipping: 1,
                    payment: 1,
                    vendorItems: 1,
                    vendorTotal: 1,
                    totalOrderValue: "$total"
                }
            },

            { $sort: { createdAt: -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
        ];

        // Agregar filtro de búsqueda si se especifica
        if (q) {
            const searchMatch = {
                $or: [
                    { code: { $regex: q, $options: "i" } },
                    { "customer.fullName": { $regex: q, $options: "i" } },
                    { "customer.email": { $regex: q, $options: "i" } }
                ]
            };
            pipeline.unshift({ $match: searchMatch });
        }

        const orders = await BuyerOrder.aggregate(pipeline);

        console.log('📦 Pedidos encontrados:', orders.length);

        // Formatear para la respuesta
        const formattedOrders = orders.map(order => ({
            id: order._id.toString(),
            code: order.code,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            status: order.status,
            total: order.vendorTotal, // Total solo de los productos del vendedor
            totalOrderValue: order.totalOrderValue, // Total completo de la orden
            paymentMethod: getPaymentMethodLabel(order.payment?.method),
            trackingNumber: order.shipping?.tracking || "",
            customer: {
                name: order.customer?.fullName || "Cliente",
                email: order.customer?.email || "",
                phone: order.customer?.phone || "",
                address: order.shipping?.address || order.customer?.address || ""
            },
            items: order.vendorItems.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                category: item.category
            }))
        }));

        console.log('✅ Respuesta formateada:', formattedOrders.length, 'pedidos');

        res.json({
            ok: true,
            data: formattedOrders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: formattedOrders.length
            }
        });

    } catch (err) {
        console.error('💥 Error al obtener pedidos del vendedor:', err);
        next(err);
    }
});

/**
 * PUT /api/seller-orders/:orderId/status
 * Actualizar estado de un pedido (solo si el vendedor tiene productos en él)
 */
router.put("/:orderId/status", requireAuth, async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const { status, trackingNumber } = req.body;
        const sellerId = new mongoose.Types.ObjectId(req.user.id);

        console.log('🔄 Actualizando estado del pedido:', orderId, 'a', status);

        // Validar que el pedido existe y el vendedor tiene productos en él
        const order = await BuyerOrder.findOne({
            $or: [
                { _id: mongoose.isValidObjectId(orderId) ? orderId : null },
                { code: orderId }
            ],
            "items.sellerId": sellerId
        });

        if (!order) {
            return res.status(404).json({
                ok: false,
                error: "Pedido no encontrado o no tienes productos en este pedido"
            });
        }

        // Actualizar estado
        const updateData = { status };
        if (trackingNumber) {
            updateData["shipping.tracking"] = trackingNumber;
        }

        await BuyerOrder.updateOne(
            { _id: order._id },
            { $set: updateData }
        );

        console.log('✅ Estado actualizado correctamente');

        res.json({
            ok: true,
            message: "Estado del pedido actualizado correctamente"
        });

    } catch (err) {
        console.error('💥 Error al actualizar estado del pedido:', err);
        next(err);
    }
});

/**
 * GET /api/seller-orders/stats
 * Estadísticas de pedidos para el vendedor
 */
router.get("/stats", requireAuth, async (req, res, next) => {
    try {
        const sellerId = new mongoose.Types.ObjectId(req.user.id);

        const stats = await BuyerOrder.aggregate([
            { $match: { "items.sellerId": sellerId } },

            // Filtrar items del vendedor y calcular totales
            {
                $addFields: {
                    vendorItems: {
                        $filter: {
                            input: "$items",
                            cond: { $eq: ["$$this.sellerId", sellerId] }
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
            },

            // Agrupar estadísticas
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    pendingOrders: {
                        $sum: {
                            $cond: [{ $in: ["$status", ["pendiente", "confirmado", "en_proceso"]] }, 1, 0]
                        }
                    },
                    completedOrders: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "entregado"] }, 1, 0]
                        }
                    },
                    shippedOrders: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "enviado"] }, 1, 0]
                        }
                    },
                    cancelledOrders: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "cancelado"] }, 1, 0]
                        }
                    },
                    totalRevenue: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "entregado"] }, "$vendorTotal", 0]
                        }
                    },
                    totalItems: {
                        $sum: {
                            $sum: "$vendorItems.quantity"
                        }
                    }
                }
            }
        ]);

        const result = stats[0] || {
            totalOrders: 0,
            pendingOrders: 0,
            completedOrders: 0,
            shippedOrders: 0,
            cancelledOrders: 0,
            totalRevenue: 0,
            totalItems: 0
        };

        res.json({
            ok: true,
            data: result
        });

    } catch (err) {
        console.error('💥 Error al obtener estadísticas:', err);
        next(err);
    }
});

// Helper function
function getPaymentMethodLabel(method) {
    switch (method) {
        case 'card': return 'Tarjeta de crédito';
        case 'bank_transfer': return 'Transferencia bancaria';
        case 'cash': return 'Efectivo contra entrega';
        default: return method || 'No especificado';
    }
}

export default router;