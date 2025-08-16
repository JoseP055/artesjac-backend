// src/server.js
import "dotenv/config";
import app from "./app.js";
import { connectDB } from "./db.js";

const PORT = Number(process.env.PORT) || 4000;

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 ArtesJAC API: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error al iniciar servidor:", err);
    process.exit(1);
  }
})();
