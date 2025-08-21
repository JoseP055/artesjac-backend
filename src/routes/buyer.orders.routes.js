// src/routes/buyer.orders.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import requireAuth from "../middlewares/requireAuth.js";
import BuyerOrder from "../models/BuyerOrder.js";

const router = Router();

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
 * GET /api/buyer-orders/:id
 * Devuelve el detalle de un pedido del comprador autenticado
 */
router.get("/:id", requireAuth, async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "ID inválido" });
        }

        const buyerId = new mongoose.Types.ObjectId(req.user.id);
        const o = await BuyerOrder.findOne({ _id: id, buyerId }).lean();

        if (!o) return res.status(404).json({ ok: false, error: "Pedido no encontrado" });

        res.json({
            ok: true,
            data: {
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
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/buyer-orders/dev-seed
 * Crea pedidos de ejemplo para el usuario logueado (SOLO en desarrollo)
 */
router.post("/dev-seed", requireAuth, async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === "production") {
            return res.status(403).json({ ok: false, error: "No permitido en producción" });
        }

        const buyerId = new mongoose.Types.ObjectId(req.user.id);

        const seed = [
            {
                buyerId,
                items: [
                    { name: "Collar artesanal de semillas", quantity: 1, price: 12000 },
                    { name: "Bolso tejido a mano", quantity: 1, price: 18500 },
                ],
                total: 30500,
                status: "entregado",
                shipping: {
                    address: "Desamparados, San José, Costa Rica",
                    method: "Envío estándar",
                    tracking: "CR123456789",
                },
            },
            {
                buyerId,
                items: [{ name: "Cuadro colorido abstracto", quantity: 1, price: 22000 }],
                total: 22000,
                status: "enviado",
                shipping: {
                    address: "Desamparados, San José, Costa Rica",
                    method: "Envío express",
                    tracking: "CR123456790",
                },
            },
        ];

        const created = await BuyerOrder.insertMany(seed);
        res.json({ ok: true, created: created.map((c) => c._id.toString()) });
    } catch (err) {
        next(err);
    }
});

export default router;
