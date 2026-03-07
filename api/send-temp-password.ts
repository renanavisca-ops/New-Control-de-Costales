export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});

    const {
      to,
      nombre,
      tempPassword,
      tipo,
      appName = 'Control de Costales',
    } = body;

    if (!to || !tempPassword || !tipo) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan datos obligatorios',
      });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      return res.status(500).json({
        ok: false,
        error: 'Faltan variables de entorno del correo en Vercel',
      });
    }

    const displayName = nombre?.trim() || 'usuario';
    const subject =
      tipo === 'CREACION'
        ? `Tu acceso temporal a ${appName}`
        : `Recuperación de acceso a ${appName}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
        <h2 style="margin:0 0 16px 0;">${appName}</h2>
        <p>Hola <strong>${escapeHtml(displayName)}</strong>,</p>

        ${
          tipo === 'CREACION'
            ? `<p>Se creó tu usuario en el sistema.</p>`
            : `<p>Se generó una nueva contraseña temporal para tu cuenta.</p>`
        }

        <p>Tu correo de acceso es: <strong>${escapeHtml(to)}</strong></p>
        <p>Tu contraseña temporal es:</p>

        <div style="margin:16px 0;padding:16px;border-radius:12px;background:#EEF2FF;border:1px solid #C7D2FE;font-size:22px;font-weight:700;letter-spacing:1px;text-align:center">
          ${escapeHtml(tempPassword)}
        </div>

        <p>Al iniciar sesión, debes cambiar la contraseña inmediatamente.</p>

        <p style="margin-top:24px;color:#6B7280;font-size:14px">
          Este correo fue generado automáticamente. No respondas a este mensaje.
        </p>
      </div>
    `;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    const resendJson = await resendResponse.json();

    if (!resendResponse.ok) {
      return res.status(500).json({
        ok: false,
        error: resendJson?.message || 'No se pudo enviar el correo',
        provider: resendJson,
      });
    }

    return res.status(200).json({
      ok: true,
      data: resendJson,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Error interno enviando correo',
    });
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
