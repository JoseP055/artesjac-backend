import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
    { url: { type: String, required: true }, alt: { type: String, default: "" } },
    { _id: false }
);

const ratingSchema = new mongoose.Schema(
    { average: { type: Number, default: 0, min: 0, max: 5 }, count: { type: Number, default: 0, min: 0 } },
    { _id: false }
);

const reviewSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        comment: { type: String, default: "" },
        rating: { type: Number, min: 1, max: 5, required: true },
        createdAt: { type: Date, default: Date.now }
    },
    { _id: true }
);

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        price: { type: Number, required: true, min: 0 },
        stock: { type: Number, required: true, min: 0 },
        images: { type: [imageSchema], default: [] },
        category: { type: String, required: true, lowercase: true, trim: true },
        categoryName: { type: String, default: "" },
        tags: { type: [String], default: [] },
        artistId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        rating: { type: ratingSchema, default: () => ({}) },
        reviews: { type: [reviewSchema], default: [] },
        isActive: { type: Boolean, default: true },
        isFeatured: { type: Boolean, default: false },
        slug: { type: String, required: true, unique: true, lowercase: true, trim: true }
    },
    { timestamps: true }
);

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ name: "text", description: "text", tags: "text" });

export default mongoose.model("Product", productSchema);
