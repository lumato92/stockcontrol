import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings


def _build_message(to: str, subject: str, html: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM}>"
    msg["To"]      = to
    msg.attach(MIMEText(html, "html"))
    return msg


def send_email(to: str, subject: str, html: str) -> None:
    """Envía un mail vía SMTP. Lanza excepción si falla."""
    if not settings.SMTP_HOST:
        # En desarrollo sin SMTP configurado, solo logueamos
        print(f"[MAIL] To: {to} | Subject: {subject}")
        return

    msg = _build_message(to, subject, html)
    context = ssl.create_default_context()

    try:
        if settings.SMTP_USE_TLS:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.ehlo()
                server.starttls(context=context)
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, to, msg.as_string())
        else:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context) as server:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, to, msg.as_string())
    except Exception as e:
        raise RuntimeError(f"Error enviando mail: {e}") from e


# ── Templates ─────────────────────────────────────────────────────────────────

def send_reset_code(to: str, full_name: str, code: str) -> None:
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1e293b;">Recuperación de contraseña</h2>
      <p>Hola {full_name or 'usuario'},</p>
      <p>Tu código de verificación es:</p>
      <div style="
        font-size: 36px;
        font-weight: bold;
        letter-spacing: 10px;
        color: #2563eb;
        background: #eff6ff;
        border-radius: 8px;
        padding: 20px;
        text-align: center;
        margin: 24px 0;
      ">{code}</div>
      <p style="color: #64748b; font-size: 14px;">
        Este código expira en {settings.RESET_CODE_EXPIRE_MINUTES} minutos.<br>
        Si no solicitaste esto, ignorá este mail.
      </p>
    </div>
    """
    send_email(to, f"Código de verificación — {settings.APP_NAME}", html)


def send_welcome(to: str, full_name: str, username: str) -> None:
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1e293b;">Bienvenido a {settings.APP_NAME}</h2>
      <p>Hola {full_name or username},</p>
      <p>Tu cuenta fue creada. En tu primer login deberás configurar una nueva contraseña.</p>
      <p style="color: #64748b; font-size: 14px;">
        Usuario: <strong>{username}</strong>
      </p>
    </div>
    """
    send_email(to, f"Bienvenido a {settings.APP_NAME}", html)