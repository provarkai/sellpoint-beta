// Renders a simple receipt as a PNG buffer, server-side, for attaching to
// the WhatsApp payment-received confirmation. WasenderAPI's image endpoint
// requires a publicly fetchable URL (not base64), so this backs a public
// GET route rather than being uploaded anywhere - see server/index.js.
const { createCanvas } = require("@napi-rs/canvas");

const WIDTH = 600;
const LINE_HEIGHT = 34;
const PADDING = 32;

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderReceiptPng({ businessName, productName, qty, unitPrice, total, currency, customerName, orderId, date }) {
  const rows = [
    ["Item", `${productName} x ${qty}`],
    ["Unit price", `${currency} ${Number(unitPrice).toLocaleString()}`],
    ["Total paid", `${currency} ${Number(total).toLocaleString()}`],
    ["Customer", customerName || "-"],
    ["Order ref", orderId],
    ["Date", date],
  ];
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = "16px sans-serif";
  const wrappedRows = rows.map(([label, value]) => [label, wrapText(measureCtx, value, WIDTH - PADDING * 2 - 140)]);
  const bodyHeight = wrappedRows.reduce((sum, [, lines]) => sum + Math.max(1, lines.length) * LINE_HEIGHT, 0);
  const height = PADDING * 2 + 140 + bodyHeight + 80;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(businessName || "Receipt", PADDING, PADDING + 30);

  ctx.fillStyle = "#16a34a";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("PAYMENT RECEIVED", PADDING, PADDING + 62);

  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(PADDING, PADDING + 84);
  ctx.lineTo(WIDTH - PADDING, PADDING + 84);
  ctx.stroke();

  let y = PADDING + 120;
  ctx.font = "16px sans-serif";
  for (const [label, lines] of wrappedRows) {
    ctx.fillStyle = "#64748b";
    ctx.fillText(label, PADDING, y);
    ctx.fillStyle = "#0f172a";
    lines.forEach((line, i) => ctx.fillText(line, PADDING + 140, y + i * LINE_HEIGHT));
    y += Math.max(1, lines.length) * LINE_HEIGHT;
  }

  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(PADDING, y + 10);
  ctx.lineTo(WIDTH - PADDING, y + 10);
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px sans-serif";
  ctx.fillText("Powered by SellersPoint", PADDING, y + 40);

  return canvas.encode("png");
}

module.exports = { renderReceiptPng };
