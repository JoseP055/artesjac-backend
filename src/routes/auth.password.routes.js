// src/routes/auth.password.routes.js
import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import { sendPasswordResetEmail } from "../utils/mailer.js";

const router = Router();

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res, next) => {
    try {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });

        // Buscamos usuario (case-insensitive)
        const user = await User.findOne({ email: new RegExp(`^${email}$`, "i") }).select("_id email name").lean();

        // Siempre respondemos 200 por seguridad
        res.json({ ok: true, message: "Si el correo existe, enviaremos instrucciones." });

        if (!user) return;

        // Invalidar tokens previos
        await PasswordResetToken.deleteMany({ userId: user._id });

        // Generar token y hash
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 min
        await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });

        const frontendBase = process.env.FRONTEND_URL || "http://localhost:3000";
        const resetUrl = `${frontendBase}/reset-password?token=${rawToken}`;

        await sendPasswordResetEmail({ to: user.email, resetUrl });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res, next) => {
    try {
        const { token, newPassword } = req.body || {};
        if (!token || !newPassword) {
            return res.status(400).json({ ok: false, error: "Token y nueva contraseña requeridos" });
        }

        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const prt = await PasswordResetToken.findOne({ tokenHash }).lean();

        if (!prt) return res.status(400).json({ ok: false, error: "Token inválido" });
        if (prt.used) return res.status(400).json({ ok: false, error: "Token ya utilizado" });
        if (new Date(prt.expiresAt) < new Date()) {
            return res.status(400).json({ ok: false, error: "Token expirado" });
        }

        const userId = new mongoose.Types.ObjectId(prt.userId);
        const user = await User.findById(userId).select("+password");
        if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        // Marcar usado e invalidar otros
        await PasswordResetToken.updateOne({ tokenHash }, { $set: { used: true } });
        await PasswordResetToken.deleteMany({ userId, tokenHash: { $ne: tokenHash } });

        return res.json({ ok: true, message: "Contraseña actualizada" });
    } catch (err) {
        next(err);
    }
});

export default router;
