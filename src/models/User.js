import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

const addressSchema = new Schema(
    {
        line1: { type: String, trim: true },
        line2: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        country: { type: String, trim: true },
        zip: { type: String, trim: true },
        isDefault: { type: Boolean, default: false },
    },
    { _id: false }
);

const preferencesSchema = new Schema(
    { language: { type: String, default: "es" }, theme: { type: String, default: "light" } },
    { _id: false }
);

const profileSchema = new Schema(
    { avatarUrl: { type: String, default: "" }, bio: { type: String, default: "" } },
    { _id: false }
);

const statsSchema = new Schema(
    { loginCount: { type: Number, default: 0 }, lastLoginAt: { type: Date } },
    { __id: false }
);

const userSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, minlength: 2 },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },

        // password está con select:false; hay que usar .select("+password") para leerla
        password: { type: String, required: true, minlength: 6, select: false },

        // roles estándar
        role: { type: String, enum: ["buyer", "seller", "admin"], default: "buyer" },

        // SOLO para vendedores (si buyer/admin, dejar undefined)
        businessName: { type: String, trim: true },

        // address principal y lista de addresses
        address: { type: addressSchema, default: undefined },
        addresses: { type: [addressSchema], default: [] },

        emailVerified: { type: Boolean, default: true },
        isActive: { type: Boolean, default: true },

        preferences: { type: preferencesSchema, default: {} },
        profile: { type: profileSchema, default: {} },
        stats: { type: statsSchema, default: {} },
    },
    { timestamps: true }
);

// Hash automático del password
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Comparar password en login
userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

// No exponer password al serializar
userSchema.set("toJSON", {
    transform: (_doc, ret) => {
        delete ret.password;
        return ret;
    },
});

export default mongoose.model("User", userSchema);
