// src/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

// Rutas
import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/products.routes.js";
import storeProfileRoutes from "./routes/storeProfile.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import buyerRoutes from "./routes/buyer.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import authPasswordRoutes from "./routes/auth.password.routes.js";
import buyerOrderRoutes from "./routes/buyer.orders.routes.js";
import shopPublicRoutes from "./routes/shop.public.routes.js";
import publicRoutes from "./routes/public.routes.js";
import reviewsRoutes from "./routes/reviews.routes.js";




const app = express(); // ✅ crear la app ANTES de usar app.use

// Middlewares base
app.use(helmet({ crossOriginResourcePolicy: false })); // en dev, para que no bloquee imágenes/static
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(compression());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));




// Healthchecks
app.get("/", (_req, res) => res.send("🚀 ArtesJAC API funcionando"));
app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "ArtesJAC API", ts: new Date().toISOString() })
);

// 🔗 Rutas de negocio (montar solo una vez)
app.use("/api/auth", authRoutes);
app.use("/api", productRoutes);
app.use("/api/store-profile", storeProfileRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/buyer", buyerRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/auth", authPasswordRoutes);
app.use("/api/buyer-orders", buyerOrderRoutes);
app.use("/api/shop", publicRoutes);
app.use("/api/reviews", reviewsRoutes);




// 404 controlado (AL FINAL)
app.use((req, res) => {
    res.status(404).json({ ok: false, error: "Ruta no encontrada" });
});

// Manejador global de errores (AL FINAL)
app.use((err, _req, res, _next) => {
    console.error("💥 Error handler:", err);
    res.status(err.status || 500).json({
        ok: false,
        error: err.message || "Error interno del servidor",
    });
});

export default app;
