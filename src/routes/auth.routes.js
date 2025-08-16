import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

const sign = (user) =>
  jwt.sign(
    { sub: user._id.toString(), name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

/** POST /api/auth/register */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, address } = req.body || {};

    // Validaciones mínimas
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "Nombre, email y password son obligatorios" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ ok: false, error: "El password debe tener al menos 6 caracteres" });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const exists = await User.findOne({ email: emailNorm });
    if (exists) return res.status(409).json({ ok: false, error: "Email ya registrado" });

    // Solo permitimos buyer | seller desde el front (jamás admin)
    const safeRole = role === "seller" ? "seller" : "buyer";

    const user = await User.create({
      name: String(name).trim(),
      email: emailNorm,
      password, // se hashea en pre("save")
      role: safeRole,
      address: address || {},
      addresses: address ? [{ ...address, isDefault: true }] : [],
      emailVerified: true,
      isActive: true,
      preferences: {},
      profile: {},
      stats: { loginCount: 1, lastLoginAt: new Date() },
    });

    const token = sign(user);
    return res.status(201).json({
      ok: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        address: user.address,
        addresses: user.addresses,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
        preferences: user.preferences,
        profile: user.profile,
        stats: user.stats,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (e) {
    // 🔎 Log detallado
    console.error("❌ REGISTER VALIDATION:", {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      errors: e?.errors,
      keyValue: e?.keyValue,
      path: e?.path,
      value: e?.value,
    });

    if (e?.code === 11000) return res.status(409).json({ ok: false, error: "Email ya registrado" });
    if (e?.name === "ValidationError") {
      const first = Object.values(e.errors || {})[0];
      return res.status(400).json({ ok: false, error: first?.message || "Datos inválidos" });
    }
    return res.status(400).json({ ok: false, error: e?.message || "Datos inválidos" });
  }
});

/** POST /api/auth/login */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select("+password");
    if (!user) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

    user.stats = user.stats || {};
    user.stats.loginCount = (user.stats.loginCount || 0) + 1;
    user.stats.lastLoginAt = new Date();
    await user.save();

    const token = sign(user);
    const safe = await User.findById(user._id);
    return res.json({ ok: true, token, user: safe });
  } catch (e) {
    console.error("❌ LOGIN ERROR:", {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      errors: e?.errors,
    });
    return res.status(400).json({ ok: false, error: e?.message || "Error al iniciar sesión" });
  }
});

/** GET /api/auth/whoami */
router.get("/whoami", requireAuth, (req, res) => {
  return res.json({ ok: true, user: req.user });
});

export default router;
