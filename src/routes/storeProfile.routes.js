import { Router } from "express";
import { body, param, validationResult } from "express-validator";
import mongoose from "mongoose";
import StoreProfile from "../models/StoreProfile.js";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const upsertValidators = [
    body("businessName").optional().isString().trim().isLength({ max: 140 }),
    body("description").optional().isString().trim().isLength({ max: 2000 }),
    body("logoImage").optional().isString().trim(),
    body("bannerImage").optional().isString().trim(),
    body("location").optional().isObject(),
    body("location.address").optional().isString().trim().isLength({ max: 200 }),
    body("location.city").optional().isString().trim().isLength({ max: 80 }),
    body("location.province").optional().isString().trim().isLength({ max: 80 }),
    body("location.country").optional().isString().trim().isLength({ max: 80 }),
    body("contact").optional().isObject(),
    body("contact.email").optional().isString().trim().isLength({ max: 160 }),
    body("contact.phone").optional().isString().trim().isLength({ max: 60 }),
    body("contact.whatsapp").optional().isString().trim().isLength({ max: 60 }),
    body("contact.website").optional().isString().trim().isLength({ max: 200 }),
    body("socialMedia").optional().isObject(),
    body("socialMedia.facebook").optional().isString().trim(),
    body("socialMedia.instagram").optional().isString().trim(),
    body("socialMedia.twitter").optional().isString().trim(),
    body("socialMedia.tiktok").optional().isString().trim(),
    body("businessInfo").optional().isObject(),
    body("businessInfo.category").optional().isString().trim().isLength({ max: 80 }),
    body("businessInfo.foundedYear").optional().isString().trim().isLength({ max: 10 }),
    body("businessInfo.employees").optional().isString().trim().isLength({ max: 20 }),
    body("businessInfo.specialties").optional().isArray(),
    body("settings").optional().isObject(),
    body("settings.acceptsCustomOrders").optional().isBoolean(),
    body("settings.minOrderAmount").optional().isFloat({ min: 0 }),
    body("settings.deliveryAreas").optional().isArray(),
    body("settings.workingHours").optional().isObject(),
];

/* Privado: obtener el perfil del vendedor autenticado */
router.get(
    "/me",
    requireAuth,
    requireRole(["seller", "vendor", "admin"]),
    async (req, res, next) => {
        try {
            const vendorId = req.user.id;
            const profile = await StoreProfile.findOne({ vendorId });
            if (!profile) {
                return res.json({
                    ok: true,
                    data: {
                        vendorId,
                        businessName: "",
                        description: "",
                        logoImage: "",
                        bannerImage: "",
                        location: { address: "", city: "", province: "", country: "Costa Rica" },
                        contact: { email: req.user.email || "", phone: "", whatsapp: "", website: "" },
                        socialMedia: { facebook: "", instagram: "", twitter: "", tiktok: "" },
                        businessInfo: { category: "", foundedYear: "", employees: "", specialties: [] },
                        settings: {
                            acceptsCustomOrders: true,
                            minOrderAmount: 0,
                            deliveryAreas: [],
                            workingHours: {
                                monday: { open: "08:00", close: "17:00", enabled: true },
                                tuesday: { open: "08:00", close: "17:00", enabled: true },
                                wednesday: { open: "08:00", close: "17:00", enabled: true },
                                thursday: { open: "08:00", close: "17:00", enabled: true },
                                friday: { open: "08:00", close: "17:00", enabled: true },
                                saturday: { open: "09:00", close: "15:00", enabled: true },
                                sunday: { open: "10:00", close: "14:00", enabled: false },
                            },
                        },
                    },
                });
            }
            res.json({ ok: true, data: profile });
        } catch (err) {
            next(err);
        }
    }
);

/* Privado: crear/actualizar (upsert) el perfil del vendedor autenticado */
router.put(
    "/me",
    requireAuth,
    requireRole(["seller", "vendor", "admin"]),
    upsertValidators,
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ ok: false, error: "Datos inválidos", details: errors.array() });
            }
            const vendorId = req.user.id;
            const update = { ...req.body, vendorId }; // fuerza pertenencia
            const profile = await StoreProfile.findOneAndUpdate(
                { vendorId },
                { $set: update },
                { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
            );
            res.json({ ok: true, data: profile });
        } catch (err) {
            next(err);
        }
    }
);

/* Público: ver perfil de una tienda por sellerId */
router.get(
    "/public/:sellerId",
    [param("sellerId").custom((v) => mongoose.Types.ObjectId.isValid(v))],
    async (req, res, next) => {
        try {
            const vendorId = req.params.sellerId;
            const profile = await StoreProfile.findOne({ vendorId });
            if (!profile) return res.status(404).json({ ok: false, error: "Perfil no encontrado" });
            const { id, businessName, description, logoImage, bannerImage, location, contact, socialMedia, businessInfo, settings, createdAt, updatedAt } = profile.toJSON();
            res.json({ ok: true, data: { id, vendorId, businessName, description, logoImage, bannerImage, location, contact, socialMedia, businessInfo, settings, createdAt, updatedAt } });
        } catch (err) {
            next(err);
        }
    }
);

/* (Opcional) ping de diagnóstico */
router.get("/ping", (_req, res) => res.json({ ok: true, route: "/api/store-profile" }));

export default router;
