import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

// Rutas
import productRoutes from "./routes/products.routes.js";
import authRoutes from "./routes/auth.routes.js";     // 👈 NEW// si usás login

app.use("/api/auth", authRoutes);     // para obtener token
app.use("/api/products", productRoutes);

const app = express();

// Middlewares base
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(compression());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Healthchecks
app.get("/", (_req, res) => res.send("🚀 ArtesJAC API funcionando"));
app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "ArtesJAC API", ts: new Date().toISOString() })
);

// 🔗 Montar rutas de negocio
app.use("/api/auth", authRoutes);     // 👈 IMPORTANTE   // 👈 IMPORTANTE
app.use("/api/products", productRoutes);

// 404 controlado (AL FINAL)
app.use((req, res) => {
    res.status(404).json({ ok: false, error: "Ruta no encontrada" });
});

// Manejador de errores
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error("💥 Error handler:", err);
    res.status(err.status || 500).json({
        ok: false,
        error: err.message || "Error interno del servidor",
    });
});

export default app;
