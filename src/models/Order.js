// src/models/Order.js
import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
    },
    { _id: false }
);

const CustomerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 140 },
        email: { type: String, required: true, trim: true, maxlength: 160 },
        phone: { type: String, trim: true, maxlength: 60, default: "" },
        address: { type: String, trim: true, maxlength: 240, default: "" },
    },
    { _id: false }
);

const OrderSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        customer: { type: CustomerSchema, required: true },
        items: { type: [OrderItemSchema], required: true, validate: v => v.length > 0 },
        total: { type: Number, required: true, min: 0 },

        status: {
            type: String,
            enum: ["pendiente", "en_proceso", "enviado", "entregado", "cancelado", "retraso"],
            default: "pendiente",
            index: true,
        },

        paymentMethod: { type: String, trim: true, default: "" }, // "Transferencia", "Tarjeta", etc.
        notes: { type: String, trim: true, maxlength: 1000, default: "" },
        trackingNumber: { type: String, trim: true, default: "" },

        deliveredAt: { type: Date },
        cancelledAt: { type: Date },
    },
    { timestamps: true }
);

// toJSON limpio
OrderSchema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
    },
});

export default mongoose.model("Order", OrderSchema);
