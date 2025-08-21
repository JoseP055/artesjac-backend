// src/models/ShopProduct.model.js
import mongoose from "mongoose";

const ShopProductSchema = new mongoose.Schema(
    {
        title: String,
        slug: String,
        description: String,
        price: Number,
        stock: Number,
        images: [String],
        category: String,          // ej: "jewelery", "art", "textiles", "bags", "decoration", "ceramics"
        tags: [String],
        status: { type: String, default: "active" }, // "active" | "draft"
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true, collection: "products" }   // 👈 usa la colección ya existente
);

// Búsqueda simple
ShopProductSchema.index({ title: "text", description: "text" });

export default mongoose.model("ShopProduct", ShopProductSchema);
