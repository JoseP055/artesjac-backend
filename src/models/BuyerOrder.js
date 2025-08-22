// src/models/BuyerOrder.js
import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // vendedor del producto
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        category: { type: String, default: "" },
    },
    { _id: false }
);

const CustomerSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
        city: { type: String, required: true },
        province: { type: String, required: true },
        postalCode: { type: String, default: "" },
        specialInstructions: { type: String, default: "" },
    },
    { _id: false }
);

const PaymentSchema = new mongoose.Schema(
    {
        method: { type: String, required: true }, // 'card', 'bank_transfer', 'cash'
        cardLast4: { type: String, default: "" }, // últimos 4 dígitos
        cardName: { type: String, default: "" },
        bankName: { type: String, default: "" },
        subtotal: { type: Number, required: true, min: 0 },
        shipping: { type: Number, required: true, min: 0 },
        total: { type: Number, required: true, min: 0 },
    },
    { _id: false }
);

const ShippingSchema = new mongoose.Schema(
    {
        address: { type: String, required: true },
        method: { type: String, default: "Envío estándar" },
        estimatedDelivery: { type: String, default: "3-5 días hábiles" },
        cost: { type: Number, default: 0 },
        tracking: { type: String, default: "" },
    },
    { _id: false }
);

const BuyerOrderSchema = new mongoose.Schema(
    {
        code: { type: String, index: true }, // ej: ORD-1724100900000
        buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        customer: { type: CustomerSchema, required: true },
        items: { type: [OrderItemSchema], required: true, default: [] },
        payment: { type: PaymentSchema, required: true },
        shipping: { type: ShippingSchema, required: true },
        total: { type: Number, required: true, min: 0 },
        status: {
            type: String,
            enum: ["pendiente", "confirmado", "en_proceso", "enviado", "entregado", "cancelado", "retraso"],
            default: "confirmado",
            index: true,
        },
    },
    {
        timestamps: true,
        collection: "buyer_orders",
    }
);

BuyerOrderSchema.pre("save", function (next) {
    if (!this.code) this.code = `ORD-${Date.now()}`;
    next();
});

export default mongoose.model("BuyerOrder", BuyerOrderSchema);