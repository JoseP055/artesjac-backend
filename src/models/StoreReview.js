// src/models/StoreReview.js
import mongoose from "mongoose";

const StoreReviewSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        rating: { type: Number, min: 1, max: 5, required: true },
        comment: { type: String, trim: true, maxlength: 2000 },
        status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved", index: true },
    },
    { timestamps: true }
);

// 1 reseña por comprador por tienda
StoreReviewSchema.index({ vendorId: 1, userId: 1 }, { unique: true });

export default mongoose.models.StoreReview || mongoose.model("StoreReview", StoreReviewSchema);
