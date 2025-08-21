// src/models/PasswordResetToken.js
import mongoose from "mongoose";

const PasswordResetTokenSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
        used: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model("PasswordResetToken", PasswordResetTokenSchema);
