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

// --- Helpers ---
const roleMap = {
  USER: "buyer", user: "buyer", BUYER: "buyer", buyer: "buyer",
  SELLER: "seller", seller: "seller",
  ADMIN: "admin", admin: "admin",
};

function normalizeAddress(input) {
  if (!input) return undefined;

  if (typeof input === "string") {
    const v = input.trim();
    return v ? { line1: v, isDefault: true } : undefined;
  }

  if (typeof input === "object") {
    const addr = {
      line1: input.line1?.trim() || undefined,
      line2: input.line2?.trim() || undefined,
      city: input.city?.trim() || undefined,
      state: input.state?.trim() || undefined,
      country: input.country?.trim() || undefined,
      zip: input.zip?.trim() || undefined,
      isDefault: input.isDefault === true,
    };
    const hasAny =
      addr.line1 || addr.line2 || addr.city || addr.state || addr.country || addr.zip;
    if (!hasAny) return undefined;
    if (addr.isDefault !== true) delete addr.isDefault;
    return addr;
  }
  return undefined;
}

/** POST /api/auth/register */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, address, businessName } = req.body || {};

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

    // Mapear role desde el front, pero JAMÁS permitimos admin por esta ruta
    const mappedRole = roleMap[role] || "buyer";
    const safeRole = mappedRole === "admin" ? "buyer" : mappedRole;

    // Si es vendedor: businessName es OBLIGATORIO
    if (safeRole === "seller" && !businessName?.trim()) {
      return res.status(400).json({ ok: false, error: "El nombre del negocio/marca es obligatorio para vendedores" });
    }

    // Address normalizado
    const mainAddress = normalizeAddress(address);
    const addresses = mainAddress ? [{ ...mainAddress, isDefault: true }] : [];

    const user = await User.create({
      name: String(name).trim(),
      email: emailNorm,
      password,              // se hashea en pre("save")
      role: safeRole,
      businessName: safeRole === "seller" ? businessName.trim() : undefined, // SOLO sellers
      address: mainAddress,  // undefined si no hay datos válidos
      addresses,             // [] si no hay address
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
        id: user._id,
        _id: user._id, // compat
        name: user.name,
        email: user.email,
        role: user.role, // "buyer" | "seller"
        businessName: user.businessName || null, // DEVOLVER SOLO SI EXISTE
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
    console.error("❌ REGISTER VALIDATION:", {
      name: e?.name, code: e?.code, message: e?.message, errors: e?.errors,
      keyValue: e?.keyValue, path: e?.path, value: e?.value,
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
    const safe = await User.findById(user._id); // ya sin password

    return res.json({
      ok: true,
      token,
      user: {
        id: safe._id,
        _id: safe._id,
        name: safe.name,
        email: safe.email,
        role: safe.role,
        businessName: safe.businessName || null, // incluir si existe
        address: safe.address,
        addresses: safe.addresses,
        emailVerified: safe.emailVerified,
        isActive: safe.isActive,
        preferences: safe.preferences,
        profile: safe.profile,
        stats: safe.stats,
        createdAt: safe.createdAt,
        updatedAt: safe.updatedAt,
      },
    });
  } catch (e) {
    console.error("❌ LOGIN ERROR:", {
      name: e?.name, code: e?.code, message: e?.message, errors: e?.errors,
    });
    return res.status(400).json({ ok: false, error: e?.message || "Error al iniciar sesión" });
  }
});

/** GET /api/auth/whoami */
router.get("/whoami", requireAuth, (req, res) => {
  return res.json({ ok: true, user: req.user });
});

/** GET /api/auth/me */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const dbUser = await User.findById(req.user.sub || req.user.id || req.user._id);
    if (!dbUser || !dbUser.isActive) return res.status(401).json({ ok: false, error: "No autorizado" });

    return res.json({
      ok: true,
      user: {
        id: dbUser._id,
        _id: dbUser._id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        businessName: dbUser.businessName || null,
        address: dbUser.address,
        addresses: dbUser.addresses,
        emailVerified: dbUser.emailVerified,
        isActive: dbUser.isActive,
        preferences: dbUser.preferences,
        profile: dbUser.profile,
        stats: dbUser.stats,
        createdAt: dbUser.createdAt,
        updatedAt: dbUser.updatedAt,
      },
    });
  } catch {
    return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
  }
});

export default router;
