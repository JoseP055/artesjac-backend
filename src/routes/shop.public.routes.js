// src/routes/shop.public.routes.js
import { Router } from "express";
import ShopProduct from "../models/ShopProduct.model.js";

const router = Router();

// Mapa EN → ES para tu UI
const catMap = {
    jewelery: "joyeria",
    jewelry: "joyeria",
    textiles: "textil",
    ceramics: "ceramica",
    ceramic: "ceramica",
    art: "pintura",       // o "arte" si preferís
    bags: "bolsos",
    decoration: "decoracion",
    escultura: "escultura",
    others: "otros",
    otros: "otros",
};

// DTO para el front (ajustado a tu ShopPage)
const toDTO = (doc) => ({
    id: doc._id.toString(),
    name: doc.title,
    price: `₡${Number(doc.price).toLocaleString("es-CR")}`,
    numericPrice: Number(doc.price),
    category: catMap[doc.category?.toLowerCase?.()] || "otros",
    description: doc.description || "",
    image: Array.isArray(doc.images) && doc.images.length ? doc.images[0] : null,
    slug: doc.slug,
});

router.get("/products", async (req, res, next) => {
    try {
        const { q, category, minPrice, maxPrice, limit = 60 } = req.query;
        const filter = { status: "active" }; // solo activos

        // Filtro por categoría (acepta ES o EN)
        if (category && category !== "todos") {
            const normEs = (catMap[category?.toLowerCase()] || category)?.toLowerCase();
            const equivalencias = Object.entries(catMap)
                .filter(([, es]) => es === normEs)
                .map(([en]) => en);
            filter.$or = [{ category: { $in: equivalencias } }, { category: normEs }];
        }

        // Rango de precio
        if (minPrice) filter.price = { ...(filter.price || {}), $gte: Number(minPrice) };
        if (maxPrice) filter.price = { ...(filter.price || {}), $lte: Number(maxPrice) };

        // Búsqueda
        if (q) filter.$text = { $search: q };

        const docs = await ShopProduct.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean();
        res.json({ ok: true, data: docs.map(toDTO) });
    } catch (err) {
        next(err);
    }
});

router.get("/products/:slugOrId", async (req, res, next) => {
    try {
        const { slugOrId } = req.params;
        const isId = /^[a-f0-9]{24}$/i.test(slugOrId);
        const doc = isId
            ? await ShopProduct.findById(slugOrId).lean()
            : await ShopProduct.findOne({ slug: slugOrId }).lean();

        if (!doc || doc.status !== "active") {
            return res.status(404).json({ ok: false, error: "Producto no encontrado" });
        }

        res.json({ ok: true, data: toDTO(doc) });
    } catch (err) {
        next(err);
    }
});

export default router;
