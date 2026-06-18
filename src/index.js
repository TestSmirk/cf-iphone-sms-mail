import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405);
    }

    if (!env.SMTP_PASS) {
      return json({ error: "missing SMTP_PASS secret" }, 500);
    }

    const payload = await readPayload(request);
    const smsText = payload.text || payload.body || payload.message || "";
    const sender = payload.sender || payload.from || "";
    const to = payload.to || env.MAIL_TO;
    const receivedAt = payload.date || payload.time || new Date().toISOString();

    const subject = `iPhone短信${sender ? ` - ${sender}` : ""}`;
    const body = [
      `发件号码: ${sender || "-"}`,
      `接收时间: ${receivedAt}`,
      "",
      smsText
    ].join("\n");

    await sendMail(env, { to, subject, body });
    return json({ ok: true });
  }
};

async function readPayload(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await request.json();
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  return { text: await request.text() };
}

async function sendMail(env, { to, subject, body }) {
  const socket = connect(
    {
      hostname: env.SMTP_HOST || "smtp.139.com",
      port: Number(env.SMTP_PORT || 465)
    },
    { secureTransport: "on" }
  );

  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();

  try {
    await expect(reader, 220);
    await cmd(reader, writer, `EHLO worker.local`, 250);
    await cmd(reader, writer, `AUTH LOGIN`, 334);
    await cmd(reader, writer, b64(env.SMTP_USER), 334);
    await cmd(reader, writer, b64(env.SMTP_PASS), 235);
    await cmd(reader, writer, `MAIL FROM:<${env.MAIL_FROM}>`, 250);
    await cmd(reader, writer, `RCPT TO:<${to}>`, 250);
    await cmd(reader, writer, `DATA`, 354);

    await write(
      writer,
      [
        `From: <${env.MAIL_FROM}>`,
        `To: <${to}>`,
        `Subject: ${mimeHeader(subject)}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        "",
        foldBase64(b64(body)),
        "."
      ].join("\r\n")
    );
    await expect(reader, 250);
    await cmd(reader, writer, `QUIT`, 221);
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    socket.close();
  }
}

async function cmd(reader, writer, line, code) {
  await write(writer, line);
  return expect(reader, code);
}

async function write(writer, line) {
  await writer.write(encoder.encode(`${line}\r\n`));
}

async function expect(reader, code) {
  const want = String(code);
  let text = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      throw new Error(`smtp closed, last response: ${text}`);
    }

    text += decoder.decode(value, { stream: true });
    const lines = text.split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1] || "";

    if (/^\d{3} /.test(last)) {
      if (!last.startsWith(want)) {
        throw new Error(`smtp expect ${want}, got: ${text}`);
      }
      return text;
    }
  }
}

function b64(value) {
  const bytes = encoder.encode(String(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function mimeHeader(value) {
  return `=?UTF-8?B?${b64(value)}?=`;
}

function foldBase64(value) {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
