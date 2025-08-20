// src/models/Product.js
import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 140 },
        slug: { type: String, unique: true, index: true },
        description: { type: String, default: "", maxlength: 2000 },
        price: { type: Number, required: true, min: 0 },
        stock: { type: Number, default: 0, min: 0 },
        images: [{ type: String, trim: true }],              // URLs (pueden ser locales por ahora)
        category: { type: String, index: true, trim: true }, // opcional: luego lo podemos normalizar a otra colección
        tags: [{ type: String, trim: true }],
        status: { type: String, enum: ["draft", "active", "archived"], default: "active", index: true },

        // Propietario del producto (vendedor)
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }
    },
    { timestamps: true }
);

// Utilidad simple para generar slug
function toSlug(str) {
    return String(str || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "")
        .slice(0, 180);
}

ProductSchema.pre("save", function (next) {
    if (!this.slug && this.title) {
        this.slug = `${toSlug(this.title)}-${Date.now().toString(36)}`;
    }
    next();
});

ProductSchema.index({ title: "text", description: "text", tags: "text" });

export default mongoose.model("Product", ProductSchema);
