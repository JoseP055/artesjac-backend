// src/models/BuyerOrder.js
import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
    },
    { _id: false }
);

const ShippingSchema = new mongoose.Schema(
    {
        address: { type: String, default: "" },
        method: { type: String, default: "" },
        tracking: { type: String, default: "" },
    },
    { _id: false }
);

const BuyerOrderSchema = new mongoose.Schema(
    {
        code: { type: String, index: true }, // ej: ORD-1724100900000
        buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        items: { type: [OrderItemSchema], required: true, default: [] },
        total: { type: Number, required: true, min: 0 },
        status: {
            type: String,
            enum: ["pendiente", "en_proceso", "enviado", "entregado", "cancelado", "retraso"],
            default: "pendiente",
            index: true,
        },
        shipping: { type: ShippingSchema, default: {} },
    },
    {
        timestamps: true,
        collection: "buyer_orders", // separado del lado vendedor para evitar choques
    }
);

BuyerOrderSchema.pre("save", function (next) {
    if (!this.code) this.code = `ORD-${Date.now()}`;
    next();
});

export default mongoose.model("BuyerOrder", BuyerOrderSchema);
