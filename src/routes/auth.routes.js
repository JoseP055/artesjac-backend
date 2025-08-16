import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = Router();
const sign = (user) => jwt.sign(
    { sub: user._id.toString(), name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
);

// POST /api/auth/register
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, address, role } = req.body || {};
        if (!name || !email || !password) {
            return res.status(400).json({ ok: false, error: "Nombre, email y password son obligatorios" });
        }

        const exists = await User.findOne({ email });
        if (exists) return res.status(409).json({ ok: false, error: "Email ya registrado" });

        // 👇 Sanitizar rol: solo 'user' o 'seller' (nunca 'admin' desde el front)
        const safeRole = role === "seller" ? "seller" : "user";

        const user = await User.create({
            name,
            email,
            password,
            role: safeRole,
            address: address || {},
            addresses: address ? [{ ...address, isDefault: true }] : [],
            emailVerified: true,
            isActive: true,
            preferences: {},
            profile: {},
            stats: { loginCount: 1, lastLoginAt: new Date() },
        });

        const token = sign(user); // asegúrate que sign() incluye role
        res.status(201).json({ ok: true, token, user });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const user = await User.findOne({ email }).select("+password");
        if (!user) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

        const valid = await user.comparePassword(password);
        if (!valid) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

        // actualizar stats
        user.stats = user.stats || {};
        user.stats.loginCount = (user.stats.loginCount || 0) + 1;
        user.stats.lastLoginAt = new Date();
        await user.save();

        const token = sign(user);
        const safe = await User.findById(user._id); // sin password
        res.json({ ok: true, token, user: safe });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

export default router;
