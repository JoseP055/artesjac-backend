// 2 src/models/Address.js
import mongoose from "mongoose";

const AddressSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: { type: String, enum: ["principal", "trabajo", "otro"], default: "principal" },
        name: { type: String, required: true },           // "Casa", "Oficina", etc.
        fullAddress: { type: String, required: true },
        details: { type: String, default: "" },
        city: { type: String, default: "" },
        province: { type: String, default: "" },
        country: { type: String, default: "Costa Rica" },
        postalCode: { type: String, default: "" },
        phone: { type: String, default: "" },
        isDefault: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model("Address", AddressSchema);