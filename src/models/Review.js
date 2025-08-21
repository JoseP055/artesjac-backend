// src/models/Review.js
import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        rating: { type: Number, min: 1, max: 5, required: true },
        comment: { type: String, trim: true, maxlength: 2000 },
        status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved", index: true },
    },
    { timestamps: true }
);

// 🔒 Única por (productId, userId)
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

export default mongoose.models.Review || mongoose.model("Review", ReviewSchema);
