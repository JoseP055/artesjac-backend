// src/utils/mailer.js
import nodemailer from "nodemailer";

export const getTransport = () => {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        // Modo DEV: no SMTP → log al server
        return null;
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });
};

export const sendPasswordResetEmail = async ({ to, resetUrl }) => {
    const transporter = getTransport();
    const from = process.env.MAIL_FROM || "no-reply@artesjac.local";

    const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Restablecer contraseña</h2>
      <p>Solicitaste restablecer tu contraseña. Hacé clic en el siguiente botón:</p>
      <p>
        <a href="${resetUrl}" style="background:#4caf50;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">
          Restablecer contraseña
        </a>
      </p>
      <p>Si no fuiste vos, ignorá este correo.</p>
      <p>Enlace válido por 60 minutos.</p>
    </div>
  `;

    if (!transporter) {
        console.log("📧 (DEV) Enviar a:", to);
        console.log("🔗 (DEV) Reset URL:", resetUrl);
        return { ok: true, dev: true };
    }

    await transporter.sendMail({
        from,
        to,
        subject: "Restablecer contraseña",
        html,
    });

    return { ok: true };
};
