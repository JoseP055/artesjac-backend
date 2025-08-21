import { Router } from "express";
import mongoose from "mongoose";
import { body, param, validationResult } from "express-validator";
import requireAuth from "../middlewares/requireAuth.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";

const router = Router();
const toId = (v) => {
    try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
};
const validate = (req, res, next) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ ok: false, error: "Validación", details: errs.array() });
    next();
};

/** Asegura un carrito para el usuario y lo devuelve (normaliza userId) */
const ensureCart = async (userId) => {
    const uid = toId(userId) || userId; // 🔧 normaliza a ObjectId si aplica
    const cart = await Cart.findOneAndUpdate(
        { userId: uid },
        { $setOnInsert: { userId: uid, items: [] } },
        { new: true, upsert: true }
    );
    return cart;
};

/* ===================== GET /api/cart ===================== */
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const cart = await ensureCart(req.user.id);
        // populate de productos
        await cart.populate({ path: "items.productId", select: "title price images slug stock category" });
        res.json({ ok: true, data: cart });
    } catch (e) { next(e); }
});

/* ============ POST /api/cart/items  (agregar o sumar) ============ */
router.post(
    "/items",
    requireAuth,
    [
        body("productId").isString().notEmpty(),
        body("productRef").optional().isString(),
        body("quantity").optional().isInt({ min: 1 }),
    ],
    validate,
    async (req, res, next) => {
        try {
            const userId = req.user.id;
            const productId = toId(req.body.productId);
            const productRef = req.body.productRef || "";
            const quantity = Number(req.body.quantity || 1);

            if (!productId) return res.status(400).json({ ok: false, error: "productId inválido" });

            // Verificar producto
            const prod = await Product.findById(productId).lean();
            if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado" });

            const cart = await ensureCart(userId);
            const idx = cart.items.findIndex((it) => String(it.productId) === String(productId));

            if (idx !== -1) {
                cart.items[idx].quantity += quantity;
            } else {
                cart.items.push({
                    productId,
                    quantity,
                    productRef,
                    priceAtAdd: typeof prod.price === "number" ? prod.price : undefined,
                });
            }

            await cart.save();
            await cart.populate({ path: "items.productId", select: "title price images slug stock category" });

            res.json({ ok: true, data: cart, message: "Item agregado al carrito" });
        } catch (e) { next(e); }
    }
);

/* ============ PUT /api/cart/items  (cambiar cantidad exacta) ============ */
router.put(
    "/items",
    requireAuth,
    [body("productId").isString().notEmpty(), body("quantity").isInt({ min: 1 })],
    validate,
    async (req, res, next) => {
        try {
            const userId = req.user.id;
            const productId = toId(req.body.productId);
            const quantity = Number(req.body.quantity);

            if (!productId) return res.status(400).json({ ok: false, error: "productId inválido" });

            const cart = await ensureCart(userId);
            const idx = cart.items.findIndex((it) => String(it.productId) === String(productId));
            if (idx === -1) return res.status(404).json({ ok: false, error: "Item no existe en el carrito" });

            cart.items[idx].quantity = quantity;
            await cart.save();
            await cart.populate({ path: "items.productId", select: "title price images slug stock category" });

            res.json({ ok: true, data: cart, message: "Cantidad actualizada" });
        } catch (e) { next(e); }
    }
);

/* ============ DELETE /api/cart/items/:productId  (eliminar uno) ============ */
router.delete(
    "/items/:productId",
    requireAuth,
    [param("productId").isString().notEmpty()],
    validate,
    async (req, res, next) => {
        try {
            const userId = req.user.id;
            const pid = toId(req.params.productId);
            if (!pid) return res.status(400).json({ ok: false, error: "productId inválido" });

            const cart = await ensureCart(userId);
            cart.items = cart.items.filter((it) => String(it.productId) !== String(pid));
            await cart.save();
            await cart.populate({ path: "items.productId", select: "title price images slug stock category" });

            res.json({ ok: true, data: cart, message: "Item eliminado" });
        } catch (e) { next(e); }
    }
);

/* ============ DELETE /api/cart  (vaciar) ============ */
router.delete("/", requireAuth, async (req, res, next) => {
    try {
        const cart = await ensureCart(req.user.id);
        cart.items = [];
        await cart.save();
        res.json({ ok: true, data: cart, message: "Carrito vacío" });
    } catch (e) { next(e); }
});

export default router;
