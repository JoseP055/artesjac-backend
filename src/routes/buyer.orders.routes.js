// src/routes/buyer.orders.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import requireAuth from "../middlewares/requireAuth.js";
import BuyerOrder from "../models/BuyerOrder.js";
import Product from "../models/Product.js";
import PedidosSyncService from "../services/pedidosSync.service.js";

const router = Router();

/**
 * POST /api/buyer-orders
 * Crea un nuevo pedido desde el checkout
 */
router.post("/", requireAuth, async (req, res, next) => {
    try {
        const { customer, payment, items, subtotal, shipping, total } = req.body;

        if (!customer || !payment || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ ok: false, error: "Datos incompletos del pedido" });
        }

        const buyerId = new mongoose.Types.ObjectId(req.user.id);

        // Generar código único
        const orderCode = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

        // Procesar items
        const processedItems = [];
        for (const item of items) {
            try {
                const product = await Product.findById(item.id).lean();

                processedItems.push({
                    productId: item.id ? new mongoose.Types.ObjectId(item.id) : null,
                    sellerId: product?.vendorId ? new mongoose.Types.ObjectId(product.vendorId) : null,
                    name: item.name || product?.title || 'Producto',
                    price: Number(item.numericPrice || item.price || product?.price || 0),
                    quantity: Number(item.quantity || 1),
                    category: item.category || product?.category || 'general'
                });
            } catch (error) {
                processedItems.push({
                    productId: item.id ? new mongoose.Types.ObjectId(item.id) : null,
                    sellerId: null,
                    name: item.name || 'Producto',
                    price: Number(item.numericPrice || item.price || 0),
                    quantity: Number(item.quantity || 1),
                    category: item.category || 'general'
                });
            }
        }

        // Procesar pago
        const processedPayment = {
            method: payment.method,
            subtotal: Number(subtotal) || 0,
            shipping: Number(shipping) || 0,
            total: Number(total) || 0,
        };

        if (payment.method === 'card' && payment.cardNumber) {
            const cardDigits = payment.cardNumber.replace(/\s+/g, '');
            processedPayment.cardLast4 = cardDigits.slice(-4);
            processedPayment.cardName = payment.cardName || '';
        }

        if (payment.method === 'bank_transfer' && payment.bankTransfer) {
            processedPayment.bankName = payment.bankTransfer.bank || '';
        }

        // Crear el pedido
        const orderData = {
            code: orderCode,
            buyerId,
            customer,
            items: processedItems,
            payment: processedPayment,
            shipping: {
                address: `${customer.address}, ${customer.city}, ${customer.province}`,
                method: "Envío estándar",
                estimatedDelivery: "3-5 días hábiles",
                cost: Number(shipping) || 0
            },
            total: Number(total) || 0,
            status: "confirmado"
        };

        const newOrder = new BuyerOrder(orderData);
        const savedOrder = await newOrder.save();

        // Sincronizar con vendors
        try {
            await PedidosSyncService.syncBuyerOrderToVendors(savedOrder._id);
        } catch (syncError) {
            console.error('⚠️ Error en sincronización (no crítico):', syncError);
        }

        res.status(201).json({
            ok: true,
            order: {
                id: savedOrder._id.toString(),
                code: savedOrder.code,
                status: savedOrder.status,
                total: savedOrder.total,
                createdAt: savedOrder.createdAt
            }
        });

    } catch (err) {
        console.error('💥 Error creating order:', err);
        next(err);
    }
});

/**
 * GET /api/buyer-orders
 * Lista los pedidos del comprador autenticado
 */
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const buyerId = new mongoose.Types.ObjectId(req.user.id);

        const docs = await BuyerOrder.find({ buyerId }).sort({ createdAt: -1 }).lean();

        const data = docs.map((o) => ({
            _id: o._id.toString(),
            code: o.code,
            date: o.createdAt,
            status: o.status,
            total: o.total,
            items: (o.items || []).map((it) => ({
                name: it.name,
                quantity: it.quantity,
                price: it.price,
            })),
            shipping: o.shipping || {},
        }));

        res.json({ ok: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/buyer-orders/:code
 * Devuelve el detalle completo de un pedido por código
 */
router.get("/:code", requireAuth, async (req, res, next) => {
    try {
        const { code } = req.params;
        const buyerId = new mongoose.Types.ObjectId(req.user.id);

        const query = code.startsWith('ORD-')
            ? { code: code, buyerId }
            : mongoose.isValidObjectId(code)
                ? { _id: code, buyerId }
                : { code: code, buyerId };

        const order = await BuyerOrder.findOne(query).lean();

        if (!order) {
            return res.status(404).json({ ok: false, error: "Pedido no encontrado" });
        }

        const enrichedItems = [];
        for (const item of order.items) {
            try {
                const product = await Product.findById(item.productId).lean();
                let seller = null;

                if (item.sellerId) {
                    const User = mongoose.model('User');
                    seller = await User.findById(item.sellerId).select('name email').lean();
                }

                enrichedItems.push({
                    ...item,
                    productDetails: product,
                    sellerDetails: seller
                });
            } catch (error) {
                enrichedItems.push({
                    ...item,
                    productDetails: null,
                    sellerDetails: null
                });
            }
        }

        res.json({
            ok: true,
            data: {
                _id: order._id.toString(),
                code: order.code,
                date: order.createdAt,
                status: order.status,
                customer: order.customer,
                items: enrichedItems,
                payment: order.payment,
                shipping: order.shipping,
                total: order.total,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt
            }
        });
    } catch (err) {
        next(err);
    }
});

export default router;
