import mongoose from "mongoose";

export async function connectDB() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("❌ Falta MONGO_URI en .env");
        process.exit(1);
    }
    await mongoose.connect(uri);
    console.log("✅ MongoDB conectado");
}
