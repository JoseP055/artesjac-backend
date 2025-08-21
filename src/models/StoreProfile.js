import mongoose from "mongoose";

const DayHoursSchema = new mongoose.Schema(
    { open: { type: String, default: "08:00" }, close: { type: String, default: "17:00" }, enabled: { type: Boolean, default: true } },
    { _id: false }
);

const StoreProfileSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
        businessName: { type: String, trim: true, maxlength: 140, default: "" },
        description: { type: String, trim: true, maxlength: 2000, default: "" },
        logoImage: { type: String, trim: true, default: "" },
        bannerImage: { type: String, trim: true, default: "" },
        location: {
            address: { type: String, trim: true, default: "" },
            city: { type: String, trim: true, default: "" },
            province: { type: String, trim: true, default: "" },
            country: { type: String, trim: true, default: "Costa Rica" },
        },
        contact: { email: { type: String, trim: true, default: "" }, phone: { type: String, trim: true, default: "" }, whatsapp: { type: String, trim: true, default: "" }, website: { type: String, trim: true, default: "" } },
        socialMedia: { facebook: { type: String, trim: true, default: "" }, instagram: { type: String, trim: true, default: "" }, twitter: { type: String, trim: true, default: "" }, tiktok: { type: String, trim: true, default: "" } },
        businessInfo: { category: { type: String, trim: true, default: "" }, foundedYear: { type: String, trim: true, default: "" }, employees: { type: String, default: "" }, specialties: { type: [String], default: [] } },
        settings: {
            acceptsCustomOrders: { type: Boolean, default: true },
            minOrderAmount: { type: Number, default: 0 },
            deliveryAreas: { type: [String], default: [] },
            workingHours: {
                monday: { type: DayHoursSchema, default: () => ({}) },
                tuesday: { type: DayHoursSchema, default: () => ({}) },
                wednesday: { type: DayHoursSchema, default: () => ({}) },
                thursday: { type: DayHoursSchema, default: () => ({}) },
                friday: { type: DayHoursSchema, default: () => ({}) },
                saturday: { type: DayHoursSchema, default: () => ({ open: "09:00", close: "15:00", enabled: true }) },
                sunday: { type: DayHoursSchema, default: () => ({ open: "10:00", close: "14:00", enabled: false }) },
            },
        },
    },
    { timestamps: true }
);

StoreProfileSchema.set("toJSON", {
    virtuals: true, versionKey: false,
    transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; return ret; },
});

export default mongoose.model("StoreProfile", StoreProfileSchema);
