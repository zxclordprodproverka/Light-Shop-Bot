/**
 * Light Shop Telegram Bot
 * Каталог · покупка за Stars · выдача файла · админ
 */
import { Bot, InlineKeyboard, InputFile } from "grammy";
import "dotenv/config";

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("Нужен BOT_TOKEN в .env");
  process.exit(1);
}

const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

/** Каталог — как на сайте. fileUrl — прямая ссылка после оплаты (или null = админ шлёт вручную) */
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

/** Простые заказы в памяти (для бесплатного старта). На проде — БД. */
const pendingOrders = new Map(); // payload -> { userId, productId, stars }
const delivered = new Map(); // userId+productId+date for log

function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

function productById(id) {
  return PRODUCTS.find((p) => p.id === Number(id));
}

function catalogKeyboard(cat = "Все") {
  const list = cat === "Все" ? PRODUCTS : PRODUCTS.filter((p) => p.cat === cat);
  const kb = new InlineKeyboard();
  for (const p of list) {
    const label = p.series
      ? `${p.name} · ${p.stars}★`
      : `${p.name} · ${p.stars}★`;
    kb.text(label, `p:${p.id}`).row();
  }
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

const bot = new Bot(TOKEN);

bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name || "друг";
  await ctx.reply(
    `👋 <b>Light Shop</b>\n\nПривет, ${name}!\nМодели, карты и сборки.\nПокупка за <b>Telegram Stars</b> · выдача файла сразу после оплаты.\n\nВыбери действие:`,
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
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("Нет доступа.");
  }
  await ctx.reply(
    `🛠 <b>Админ-панель</b>\n\n` +
      `/setfile ID URL имя — привязать файл к товару\n` +
      `Пример:\n<code>/setfile 2 https://example.com/y3.zip yareevo-s3.zip</code>\n\n` +
      `/products — список товаров и файлов\n` +
      `/broadcast текст — всем кто писал боту (осторожно)\n\n` +
      `Оплата Stars приходит на баланс бота (см. @BotFather / Fragment).`,
    { parse_mode: "HTML" }
  );
});

bot.command("products", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const lines = PRODUCTS.map(
    (p) =>
      `${p.id}. ${p.name} — ${p.stars}★ / ${p.rub}₽ · файл: ${
        p.fileUrl ? "✅" : "❌ нет"
      }`
  );
  await ctx.reply(lines.join("\n"));
});

bot.command("setfile", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = (ctx.message.text || "").split(/\s+/);
  // /setfile ID URL [filename]
  if (parts.length < 3) {
    return ctx.reply("Формат: /setfile ID URL [имя_файла.zip]");
  }
  const id = Number(parts[1]);
  const url = parts[2];
  const fname = parts[3] || null;
  const p = productById(id);
  if (!p) return ctx.reply("Товар не найден");
  p.fileUrl = url;
  p.fileName = fname;
  await ctx.reply(`Готово: ${p.name}\n${url}`);
});

bot.callbackQuery("menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Главное меню:", {
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
  await ctx.editMessageText(`📦 <b>Каталог · ${cat}</b>\nЦены в Telegram Stars:`, {
    parse_mode: "HTML",
    reply_markup: catalogKeyboard(cat),
  });
});

bot.callbackQuery(/^p:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = productById(ctx.match[1]);
  if (!p) return ctx.reply("Товар не найден");
  const ser = p.series ? `\nСерия: <b>S${p.series}</b>` : "";
  await ctx.editMessageText(
    `<b>${p.name}</b>\n${p.desc}\nКатегория: ${p.cat}${ser}\n\n` +
      `★ Stars: <b>${p.stars}</b>\n₽: ${p.rub}\n\n` +
      `После оплаты Stars файл придёт в этот чат (если ссылка привязана админом).`,
    { parse_mode: "HTML", reply_markup: productKeyboard(p) }
  );
});

bot.callbackQuery(/^buy:(\d+)$/, async (ctx) => {
  const p = productById(ctx.match[1]);
  if (!p) {
    await ctx.answerCallbackQuery({ text: "Нет товара", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();

  // payload: короткий уникальный id заказа
  const payload = `ls_${p.id}_${ctx.from.id}_${Date.now()}`;
  pendingOrders.set(payload, {
    userId: ctx.from.id,
    productId: p.id,
    stars: p.stars,
  });

  try {
    // Telegram Stars: currency XTR, provider_token пустой
    await ctx.replyWithInvoice(
      p.name.slice(0, 32),
      `${p.desc} · Light Shop`.slice(0, 255),
      payload,
      "XTR", // Stars
      [{ label: p.name.slice(0, 32), amount: p.stars }],
      {
        provider_token: "", // обязательно пусто для Stars
        max_tip_amount: 0,
        protect_content: true,
      }
    );
  } catch (e) {
    console.error(e);
    await ctx.reply(
      "Не удалось создать счёт Stars.\nПроверь, что бот умеет принимать Stars (BotFather) и сумма ≥ 1.\n\nОшибка: " +
        (e.description || e.message || e)
    );
  }
});

// pre-checkout — обязательно ответить ok
bot.on("pre_checkout_query", async (ctx) => {
  const order = pendingOrders.get(ctx.preCheckoutQuery.invoice_payload);
  if (!order) {
    await ctx.answerPreCheckoutQuery(false, "Заказ устарел. Выбери товар снова.");
    return;
  }
  await ctx.answerPreCheckoutQuery(true);
});

// успешная оплата Stars
bot.on("message:successful_payment", async (ctx) => {
  const pay = ctx.message.successful_payment;
  if (pay.currency !== "XTR") {
    await ctx.reply("Получена оплата, но не Stars. Напиши админу.");
    return;
  }
  const order = pendingOrders.get(pay.invoice_payload);
  pendingOrders.delete(pay.invoice_payload);

  const p = order ? productById(order.productId) : null;
  const title = p ? p.name : "Товар";

  // уведомить админов
  for (const aid of ADMIN_IDS) {
    try {
      await bot.api.sendMessage(
        aid,
        `💰 Оплата Stars\nОт: ${ctx.from.id} @${ctx.from.username || "—"}\n` +
          `${title}\n${pay.total_amount} ★\npayload: ${pay.invoice_payload}`
      );
    } catch (_) {}
  }

  if (p?.fileUrl) {
    await ctx.reply(
      `✅ Оплата ${pay.total_amount} ★ получена.\n<b>${p.name}</b>\n\nСкачай файл:`,
      { parse_mode: "HTML" }
    );
    try {
      // ссылка
      await ctx.reply(`🔗 ${p.fileUrl}`);
      // попытка отправить как документ по URL (если Telegram скачает)
      // await ctx.replyWithDocument(p.fileUrl);
    } catch (e) {
      await ctx.reply("Ссылка выше. Если не открывается — напиши в поддержку.");
    }
  } else {
    await ctx.reply(
      `✅ Оплата ${pay.total_amount} ★ получена за <b>${title}</b>.\n\n` +
        `Файл ещё не привязан в боте — админ выдаст вручную в ближайшее время.\n` +
        `Можно написать @N3xt1r или @LightShopOFC`,
      { parse_mode: "HTML" }
    );
  }

  delivered.set(`${ctx.from.id}:${pay.invoice_payload}`, Date.now());
});

bot.callbackQuery("faq", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `<b>FAQ</b>\n\n` +
      `<b>Как купить?</b>\nКаталог → товар → «Купить за ★» → оплати Stars в Telegram.\n\n` +
      `<b>Возврат</b>\nПосле оплаты и выдачи файла возврата нет.\n\n` +
      `<b>Срок ответа</b>\nЕсли файл не пришёл автоматически — до 9 часов, напиши поддержке.\n\n` +
      `<b>Ключ на сайте</b>\nЕсли купил через менеджера — ключ вводи на lightshop.neocities.org`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Меню", "menu"),
    }
  );
});

bot.callbackQuery("support", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Поддержка:\n• @LightShopOFC\n• @N3xt1r\n• бот-магазин: этот чат"
  );
});

bot.catch((err) => console.error("Bot error", err));

bot.start({
  onStart: (info) => console.log("Light Shop bot @" + info.username),
});
