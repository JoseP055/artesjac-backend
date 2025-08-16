import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const addressSchema = new mongoose.Schema({
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    zip: { type: String, trim: true },
    isDefault: { type: Boolean, default: false }
}, { _id: false });

const preferencesSchema = new mongoose.Schema({
    language: { type: String, default: "es" },
    theme: { type: String, default: "light" },
}, { _id: false });

const profileSchema = new mongoose.Schema({
    avatarUrl: { type: String, default: "" },
    bio: { type: String, default: "" },
}, { _id: false });

const statsSchema = new mongoose.Schema({
    loginCount: { type: Number, default: 0 },
    lastLoginAt: { type: Date }
}, { _id: false });

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, minlength: 6, select: false },

    role: { type: String, enum: ["user", "seller", "admin"], default: "user" },


    // address principal (objeto) + lista de addresses
    address: { type: addressSchema, default: {} },
    addresses: { type: [addressSchema], default: [] },

    emailVerified: { type: Boolean, default: true },   // ← para tu MVP lo dejamos en true
    isActive: { type: Boolean, default: true },

    preferences: { type: preferencesSchema, default: {} },
    profile: { type: profileSchema, default: {} },
    stats: { type: statsSchema, default: {} },
}, { timestamps: true });

// Hash de password
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// método para comparar
userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

// Sanitizar salida (no mostrar password)
userSchema.set("toJSON", {
    transform: (_doc, ret) => {
        delete ret.password;
        return ret;
    }
});

export default mongoose.model("User", userSchema);
