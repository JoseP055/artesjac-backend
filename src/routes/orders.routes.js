// src/routes/orders.routes.js
import { Router } from "express";
import { body, param, query, validationResult } from "express-validator";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();

const isAdmin = (req) => req.user?.role === "admin";
const ownerFilter = (req) => (isAdmin(req) ? {} : { vendorId: req.user.id });

const STATUS = ["pendiente", "en_proceso", "enviado", "entregado", "cancelado", "retraso"];

/* ========== LISTAR (seller/admin) ========== */
router.get(
    "/",
    requireAuth,
    requireRole(["seller", "vendor", "admin"]),
    [
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        query("status").optional().isIn(STATUS.concat("all")),
        query("q").optional().isString(),
        query("sort").optional().isIn(["date", "total", "customer", "status"]),
    ],
    async (req, res, next) => {
        try {
            const { page = 1, limit = 50, status = "all", q, sort = "date" } = req.query;

            const filter = { ...ownerFilter(req) };
            if (status && status !== "all") filter.status = status;

            if (q) {
                const text = String(q).trim();
                // búsqueda simple en id, tracking, nombre y email
                const or = [
                    { "customer.name": { $regex: text, $options: "i" } },
                    { "customer.email": { $regex: text, $options: "i" } },
                    { trackingNumber: { $regex: text, $options: "i" } },
                ];
                // si parece ObjectId, buscar por _id
                if (mongoose.Types.ObjectId.isValid(text)) or.push({ _id: new mongoose.Types.ObjectId(text) });
                filter.$or = or;
            }

            let sortBy = { createdAt: -1 };
            if (sort === "total") sortBy = { total: -1 };
            if (sort === "customer") sortBy = { "customer.name": 1 };
            if (sort === "status") sortBy = { status: 1 };

            const data = await Order.find(filter)
                .sort(sortBy)
                .skip((Number(page) - 1) * Number(limit))
                .limit(Number(limit));

            const total = await Order.countDocuments(filter);
            res.json({ ok: true, data, total, page: Number(page), limit: Number(limit) });
        } catch (err) {
            next(err);
        }
    }
);

/* ========== OBTENER POR ID ========== */
router.get(
    "/:id",
    requireAuth,
    requireRole(["seller", "vendor", "admin"]),
    [param("id").isMongoId()],
    async (req, res, next) => {
        try {
            const order = await Order.findOne({ _id: req.params.id, ...ownerFilter(req) });
            if (!order) return res.status(404).json({ ok: false, error: "Pedido no encontrado" });
            res.json({ ok: true, data: order });
        } catch (err) {
            next(err);
        }
    }
);

/* ========== ACTUALIZAR ESTADO ========== */
router.patch(
    "/:id/status",
    requireAuth,
    requireRole(["seller", "vendor", "admin"]),
    [
        param("id").isMongoId(),
        body("status").isIn(STATUS),
        body("trackingNumber").optional().isString().trim(),
    ],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ ok: false, error: "Datos inválidos", details: errors.array() });
            }

            const { status, trackingNumber } = req.body;
            const query = { _id: req.params.id, ...ownerFilter(req) };

            const update = { status };

            if (status === "enviado") {
                update.trackingNumber = trackingNumber || `TR-${Date.now()}`;
            }
            if (status === "entregado") {
                update.deliveredAt = new Date();
            }
            if (status === "cancelado") {
                update.cancelledAt = new Date();
            }
            if (["pendiente", "en_proceso", "retraso"].includes(status)) {
                // limpiar marcas si aplica
                update.deliveredAt = undefined;
                if (status !== "enviado") update.trackingNumber = trackingNumber || undefined;
                if (status !== "cancelado") update.cancelledAt = undefined;
            }

            const order = await Order.findOneAndUpdate(query, update, { new: true, runValidators: true });
            if (!order) return res.status(404).json({ ok: false, error: "Pedido no encontrado o sin permiso" });

            res.json({ ok: true, data: order });
        } catch (err) {
            next(err);
        }
    }
);

/* ========== (Opcional) SEED DEV para probar rápido ========== */
router.post(
    "/dev/seed",
    requireAuth,
    requireRole(["seller", "vendor", "admin"]),
    async (req, res, next) => {
        try {
            if (process.env.NODE_ENV === "production") {
                return res.status(403).json({ ok: false, error: "No disponible en producción" });
            }
            const vendorId = req.user.id;

            const samples = [
                {
                    vendorId,
                    customer: { name: "Ana Rojas", email: "ana.rojas@email.com", phone: "+506 8888-1111", address: "San José, Costa Rica" },
                    items: [
                        { name: "Collar artesanal", price: 12000, quantity: 1 },
                        { name: "Bolso tejido", price: 13000, quantity: 1 },
                    ],
                    paymentMethod: "Transferencia",
                    notes: "Cliente solicita entrega urgente",
                    status: "pendiente",
                },
                {
                    vendorId,
                    customer: { name: "Carlos Mendez", email: "carlos.mendez@email.com", phone: "+506 8888-2222", address: "Cartago, Costa Rica" },
                    items: [{ name: "Cuadro paisaje", price: 18500, quantity: 1 }],
                    paymentMethod: "Tarjeta",
                    status: "enviado",
                    trackingNumber: "TR-123456789",
                },
            ];

            // calcular total
            const docs = samples.map((s) => ({
                ...s,
                total: s.items.reduce((acc, it) => acc + it.price * it.quantity, 0),
            }));

            const created = await Order.insertMany(docs);
            res.status(201).json({ ok: true, data: created });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
