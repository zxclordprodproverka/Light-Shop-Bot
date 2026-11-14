/**
 * Light Shop Telegram Bot (Railway-friendly)
 */
import { Bot, InlineKeyboard } from "grammy";
import http from "node:http";
import "dotenv/config";

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("Нужен BOT_TOKEN");
  process.exit(1);
}

const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

const PRODUCTS = [
  { id: 1, name: "Ктм модель", desc: "Ключ · модель KTM", stars: 199, rub: 326, cat: "Блокбастер", fileUrl: null, fileName: null },
  { id: 2, name: "Яреево — Серия 3", desc: "Ключ · карта Яреево", stars: 350, rub: 490, cat: "Карты", series: 3, fileUrl: null, fileName: null },
  { id: 3, name: "Яреево — Серия 6", desc: "Ключ · карта Яреево", stars: 590, rub: 690, cat: "Карты", series: 6, fileUrl: null, fileName: null },
  { id: 4, name: "Яреево — Серия 8", desc: "Ключ · карта Яреево", stars: 790, rub: 980, cat: "Карты", series: 8, fileUrl: null, fileName: null },
  { id: 5, name: "Кфг Яреево 1.12.2", desc: "Ключ · конфиг + сборка", stars: 580, rub: 1050, cat: "Блокбастер", fileUrl: null, fileName: null },
  { id: 6, name: "Аквапарк 1.12.2", desc: "Ключ · full версия", stars: 899, rub: 1636, cat: "Карты", fileUrl: null, fileName: null },
  { id: 7, name: "Питбайки мод 1.12.2", desc: "Ключ · мод питбайков", stars: 120, rub: 390, cat: "Моды", fileUrl: null, fileName: null },
  { id: 8, name: "Питбайк стант", desc: "Ключ · стант-модель", stars: 350, rub: 576, cat: "Блокбастер", fileUrl: null, fileName: null },
];

const CATS = ["Все", "Карты", "Блокбастер", "Моды"];
const pendingOrders = new Map();

function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}
function productById(id) {
  return PRODUCTS.find((p) => p.id === Number(id));
}
function catalogKeyboard(cat = "Все") {
  const list = cat === "Все" ? PRODUCTS : PRODUCTS.filter((p) => p.cat === cat);
  const kb = new InlineKeyboard();
  for (const p of list) kb.text(`${p.name} · ${p.stars}★`, `p:${p.id}`).row();
  kb.text("◀️ Категории", "cats").text("🛒 FAQ", "faq");
  return kb;
}
function catsKeyboard() {
  const kb = new InlineKeyboard();
  for (const c of CATS) kb.text(c, `cat:${c}`).row();
  kb.text("◀️ Меню", "menu");
  return kb;
}
function productKeyboard(p) {
  return new InlineKeyboard()
    .text(`Купить за ${p.stars} ★`, `buy:${p.id}`)
    .row()
    .text("◀️ Каталог", "cat:Все");
}

// Railway health: keep process alive on PORT
const port = Number(process.env.PORT) || 3000;
http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Light Shop bot ok");
  })
  .listen(port, () => console.log("HTTP on", port));

const bot = new Bot(TOKEN);

bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name || "друг";
  await ctx.reply(
    `👋 <b>Light Shop</b>\n\nПривет, ${name}!\nКаталог и покупка за <b>Telegram Stars</b>.`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("📦 Каталог", "cat:Все")
        .row()
        .text("❓ FAQ", "faq")
        .text("🆘 Поддержка", "support"),
    }
  );
});

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("Нет доступа.");
  await ctx.reply(
    `🛠 <b>Админ</b>\n/setfile ID URL имя\n/products`,
    { parse_mode: "HTML" }
  );
});

bot.command("products", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply(
    PRODUCTS.map((p) => `${p.id}. ${p.name} · ${p.stars}★ · файл:${p.fileUrl ? "✅" : "❌"}`).join("\n")
  );
});

bot.command("setfile", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = (ctx.message.text || "").split(/\s+/);
  if (parts.length < 3) return ctx.reply("Формат: /setfile ID URL [имя.zip]");
  const p = productById(parts[1]);
  if (!p) return ctx.reply("Товар не найден");
  p.fileUrl = parts[2];
  p.fileName = parts[3] || null;
  await ctx.reply(`Готово: ${p.name}\n${p.fileUrl}`);
});

bot.callbackQuery("menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Меню:", {
    reply_markup: new InlineKeyboard()
      .text("📦 Каталог", "cat:Все")
      .row()
      .text("❓ FAQ", "faq")
      .text("🆘 Поддержка", "support"),
  });
});

bot.callbackQuery("cats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Категории:", { reply_markup: catsKeyboard() });
});

bot.callbackQuery(/^cat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const cat = ctx.match[1];
  await ctx.editMessageText(`📦 <b>Каталог · ${cat}</b>`, {
    parse_mode: "HTML",
    reply_markup: catalogKeyboard(cat),
  });
});

bot.callbackQuery(/^p:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = productById(ctx.match[1]);
  if (!p) return;
  const ser = p.series ? `\nСерия: <b>S${p.series}</b>` : "";
  await ctx.editMessageText(
    `<b>${p.name}</b>\n${p.desc}\n${p.cat}${ser}\n\n★ <b>${p.stars}</b> · ₽ ${p.rub}`,
    { parse_mode: "HTML", reply_markup: productKeyboard(p) }
  );
});

bot.callbackQuery(/^buy:(\d+)$/, async (ctx) => {
  const p = productById(ctx.match[1]);
  if (!p) return ctx.answerCallbackQuery({ text: "Нет товара", show_alert: true });
  await ctx.answerCallbackQuery();
  const payload = `ls_${p.id}_${ctx.from.id}_${Date.now()}`;
  pendingOrders.set(payload, { userId: ctx.from.id, productId: p.id, stars: p.stars });
  try {
    await ctx.replyWithInvoice(
      p.name.slice(0, 32),
      `${p.desc} · Light Shop`.slice(0, 255),
      payload,
      "XTR",
      [{ label: p.name.slice(0, 32), amount: p.stars }],
      { provider_token: "", max_tip_amount: 0, protect_content: true }
    );
  } catch (e) {
    await ctx.reply("Счёт Stars не создался: " + (e.description || e.message || e));
  }
});

bot.on("pre_checkout_query", async (ctx) => {
  const order = pendingOrders.get(ctx.preCheckoutQuery.invoice_payload);
  if (!order) return ctx.answerPreCheckoutQuery(false, "Заказ устарел");
  await ctx.answerPreCheckoutQuery(true);
});

bot.on("message:successful_payment", async (ctx) => {
  const pay = ctx.message.successful_payment;
  const order = pendingOrders.get(pay.invoice_payload);
  pendingOrders.delete(pay.invoice_payload);
  const p = order ? productById(order.productId) : null;
  const title = p ? p.name : "Товар";

  for (const aid of ADMIN_IDS) {
    try {
      await bot.api.sendMessage(
        aid,
        `💰 ${pay.total_amount} ★ от ${ctx.from.id} @${ctx.from.username || "—"}\n${title}`
      );
    } catch (_) {}
  }

  if (p?.fileUrl) {
    await ctx.reply(`✅ Оплата ${pay.total_amount} ★\n<b>${p.name}</b>\n\n🔗 ${p.fileUrl}`, {
      parse_mode: "HTML",
    });
  } else {
    await ctx.reply(
      `✅ Оплата ${pay.total_amount} ★ за <b>${title}</b>.\nФайл выдаст админ. @N3xt1r / @LightShopOFC`,
      { parse_mode: "HTML" }
    );
  }
});

bot.callbackQuery("faq", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `<b>FAQ</b>\nКаталог → товар → оплата Stars.\nПосле оплаты файл в этот чат (если привязан).\nВозврата после выдачи нет.`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("◀️ Меню", "menu") }
  );
});

bot.callbackQuery("support", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Поддержка: @LightShopOFC · @N3xt1r");
});

bot.catch((err) => console.error("Bot error", err));

bot.start({
  onStart: (info) => console.log("Bot @" + info.username + " started"),
});
