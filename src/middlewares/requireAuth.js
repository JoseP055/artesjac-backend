// src/middlewares/requireAuth.js
import jwt from "jsonwebtoken";

/** Requiere JWT y normaliza el rol: seller => vendor (compatibilidad) */
export const requireAuth = (req, res, next) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Token requerido" });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const role = payload.role === "seller" ? "vendor" : payload.role; // 👈 normalización
        req.user = { id: payload.sub, name: payload.name, email: payload.email, role };
        next();
    } catch (e) {
        console.error("JWT error:", e.message);
        return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
    }
};

/** Middleware de roles */
export const requireRole = (roles = []) => (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
        return res.status(403).json({ ok: false, error: "Permiso denegado" });
    }
    next();
};
