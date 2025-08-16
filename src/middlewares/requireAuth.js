import jwt from "jsonwebtoken";

export const requireAuth = (req, res, next) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Token requerido" });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: payload.sub, name: payload.name, email: payload.email, role: payload.role };
        next();
    } catch {
        return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
    }
};

export const requireRole = (roles = []) => (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
        return res.status(403).json({ ok: false, error: "Permiso denegado" });
    }
    next();
};
