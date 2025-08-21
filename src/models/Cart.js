// src/models/Cart.js
import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        quantity: { type: Number, min: 1, default: 1 },
        productRef: { type: String, trim: true },   // opcional (slug o id legible)
        priceAtAdd: { type: Number },               // opcional (snapshot del precio)
    },
    { _id: false }
);

const CartSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
        items: { type: [CartItemSchema], default: [] },
    },
    { timestamps: true }
);

export default mongoose.models.Cart || mongoose.model("Cart", CartSchema);
