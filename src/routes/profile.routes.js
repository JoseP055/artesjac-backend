// src/routes/profile.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { requireAuth } from "../middlewares/requireAuth.js"; // ajustá la ruta si tu middleware está en otro lugar
import User from "../models/User.js";
import Order from "../models/Order.js"; // asumimos que ya lo tenés
import UserProfile from "../models/UserProfile.js";
import Address from "../models/Address.js";

const router = Router();

// Helpers
const mapOrderForBuyer = (o) => ({
    id: (o._id || o.id).toString(),
    date: o.createdAt,
    status: o.status === "enviado" ? "en-transito" : o.status, // compatibilidad UI
    total: Number(o.total) || 0,
    items: Array.isArray(o.items) ? o.items.map((it) => it.name) : [],
});

// GET /api/profile/me
router.get("/me", requireAuth, async (req, res, next) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const user = await User.findById(userId).select("_id name email role createdAt").lean();

        if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

        // Profile extra
        const profile = await UserProfile.findOne({ userId }).lean();

        // Direcciones
        const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();

        // Stats buyer
        const buyerFilter = {
            $or: [{ "customer.email": user.email }, { customerId: userId }],
        };
        const [totalOrders, pendingOrders, spentAgg] = await Promise.all([
            Order.countDocuments(buyerFilter),
            Order.countDocuments({ ...buyerFilter, status: { $in: ["pendiente", "en_proceso", "enviado", "retraso"] } }),
            Order.aggregate([
                { $match: { ...buyerFilter, status: { $ne: "cancelado" } } },
                { $group: { _id: null, total: { $sum: "$total" } } },
            ]),
        ]);
        const totalSpent = Math.round(spentAgg?.[0]?.total || 0);

        // Pedidos recientes (3)
        const recent = await Order.find(buyerFilter).sort({ createdAt: -1 }).limit(3).lean();
        const recentOrders = recent.map(mapOrderForBuyer);

        return res.json({
            ok: true,
            data: {
                user: {
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    userType: user.role || "buyer",
                    joinDate: user.createdAt,
                },
                profile: {
                    phone: profile?.phone || "",
                    birthDate: profile?.birthDate || null,
                    businessName: profile?.businessName || "",
                },
                stats: { totalOrders, totalSpent, pendingOrders },
                addresses: addresses.map((a) => ({
                    id: a._id.toString(),
                    type: a.type,
                    name: a.name,
                    fullAddress: a.fullAddress,
                    details: a.details,
                    isDefault: a.isDefault,
                })),
                recentOrders,
            },
        });
    } catch (err) {
        next(err);
    }
});

// PUT /api/profile/me  (actualiza name + profile fields)
router.put("/me", requireAuth, async (req, res, next) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const { name, phone, birthDate } = req.body;

        // Actualizar nombre en User (no cambiamos email aquí)
        if (typeof name === "string" && name.trim()) {
            await User.findByIdAndUpdate(userId, { $set: { name: name.trim() } }, { new: true });
        }

        // Upsert del perfil extendido
        await UserProfile.findOneAndUpdate(
            { userId },
            {
                $set: {
                    phone: phone ?? "",
                    birthDate: birthDate ? new Date(birthDate) : null,
                },
            },
            { upsert: true, new: true }
        );

        return res.json({ ok: true, message: "Perfil actualizado" });
    } catch (err) {
        next(err);
    }
});

// POST /api/profile/change-password
router.post("/change-password", requireAuth, async (req, res, next) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ ok: false, error: "Datos incompletos" });
        }

        const user = await User.findById(userId).select("+password");
        if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(400).json({ ok: false, error: "Contraseña actual incorrecta" });

        const hash = await bcrypt.hash(newPassword, 10);
        user.password = hash;
        await user.save();

        return res.json({ ok: true, message: "Contraseña actualizada" });
    } catch (err) {
        next(err);
    }
});

// GET /api/profile/orders?limit=10
router.get("/orders", requireAuth, async (req, res, next) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);
        const user = await User.findById(userId).select("email").lean();
        const buyerFilter = { $or: [{ "customer.email": user.email }, { customerId: userId }] };

        const orders = await Order.find(buyerFilter).sort({ createdAt: -1 }).limit(limit).lean();
        return res.json({ ok: true, data: orders.map(mapOrderForBuyer) });
    } catch (err) {
        next(err);
    }
});

/* ---------- DIRECCIONES ---------- */

// GET /api/profile/addresses
router.get("/addresses", requireAuth, async (req, res, next) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const list = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
        return res.json({
            ok: true,
            data: list.map((a) => ({
                id: a._id.toString(),
                type: a.type,
                name: a.name,
                fullAddress: a.fullAddress,
                details: a.details,
                isDefault: a.isDefault,
            })),
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/profile/addresses
router.post("/addresses", requireAuth, async (req, res, next) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const { type = "principal", name, fullAddress, details = "", isDefault = false } = req.body;

        if (!name || !fullAddress) return res.status(400).json({ ok: false, error: "Faltan campos" });

        if (isDefault) {
            await Address.updateMany({ userId }, { $set: { isDefault: false } });
        }

        const created = await Address.create({ userId, type, name, fullAddress, details, isDefault });
        return res.status(201).json({ ok: true, data: { id: created._id.toString() } });
    } catch (err) {
        next(err);
    }
});

// PUT /api/profile/addresses/:id
router.put("/addresses/:id", requireAuth, async (req, res, next) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const _id = new mongoose.Types.ObjectId(req.params.id);
        const { type, name, fullAddress, details, isDefault } = req.body;

        if (isDefault === true) {
            await Address.updateMany({ userId }, { $set: { isDefault: false } });
        }

        await Address.updateOne(
            { _id, userId },
            { $set: { ...(type && { type }), ...(name && { name }), ...(fullAddress && { fullAddress }), ...(details !== undefined && { details }), ...(isDefault !== undefined && { isDefault }) } }
        );

        return res.json({ ok: true, message: "Dirección actualizada" });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/profile/addresses/:id
router.delete("/addresses/:id", requireAuth, async (req, res, next) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const _id = new mongoose.Types.ObjectId(req.params.id);
        await Address.deleteOne({ _id, userId });
        return res.json({ ok: true, message: "Dirección eliminada" });
    } catch (err) {
        next(err);
    }
});

export default router;
