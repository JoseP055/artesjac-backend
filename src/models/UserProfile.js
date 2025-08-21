// src/models/UserProfile.js
import mongoose from "mongoose";

const UserProfileSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
        phone: { type: String, default: "" },
        birthDate: { type: Date, default: null },
        businessName: { type: String, default: "" },
    },
    { timestamps: true }
);

export default mongoose.model("UserProfile", UserProfileSchema);
