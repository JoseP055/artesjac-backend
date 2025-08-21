// src/middlewares/requireAuth.js
import jwt from "jsonwebtoken";

/** Normaliza nombres de rol a los usados en el backend */
const normalizeRole = (role) => {
    if (!role) return undefined;
    const r = String(role).toLowerCase();
    if (r === "seller" || r === "vendedor") return "vendor";
    if (r === "comprador") return "buyer";
    return r; // vendor | buyer | admin | ...
};

/** Requiere JWT y normaliza el rol: seller => vendor (compatibilidad) */
export const requireAuth = (req, res, next) => {
    try {
        // Deja pasar preflight
        if (req.method === "OPTIONS") return next();

        const auth = req.headers.authorization || req.headers.Authorization || "";
        const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        // Fallbacks opcionales
        const token = headerToken || req.headers["x-access-token"] || req.query.token || null;

        if (!token) {
            return res.status(401).json({ ok: false, error: "Token requerido" });
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET);

        const id = payload.sub || payload.id || payload._id;
        const role = normalizeRole(payload.role);
        const name = payload.name || payload.fullName || payload.username;
        const email = payload.email;

        if (!id) {
            return res.status(401).json({ ok: false, error: "Token inválido: sin usuario" });
        }

        req.user = { id, name, email, role, raw: payload };
        return next();
    } catch (e) {
        console.error("JWT error:", e.message);
        return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
    }
};

/** Middleware de roles (admin siempre puede) */
export const requireRole = (roles = []) => (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);

    if (!userRole) {
        return res.status(403).json({ ok: false, error: "Permiso denegado" });
    }

    // Admin bypass
    if (userRole === "admin") return next();

    const allowed = roles.map(normalizeRole);
    if (!allowed.includes(userRole)) {
        return res.status(403).json({ ok: false, error: "Permiso denegado" });
    }

    next();
};

// Atajos útiles
export const requireVendor = requireRole(["vendor"]);
export const requireBuyer = requireRole(["buyer"]);
export const requireAdmin = requireRole(["admin"]);

// Compatibilidad: permite importar como default o con nombre
export default requireAuth;
