/**
 * Light Shop — подписка · WebApp · Stars→коины · ключи
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
  .split(",").map((s) => s.trim()).filter(Boolean).map(Number);

const CHANNEL = process.env.CHANNEL_USERNAME || "LightShopOFC";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://YOUR-NEOCITIES.neocities.org/";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const ADMIN_PASS = process.env.ADMIN_PASS || "";

/** id товара → { url, name }  задаётся /setfile */
const fileMap = new Map();

const PRODUCTS = [
  { id: 1, name: "Ктм модель", stars: 199 },
  { id: 2, name: "Яреево — Серия 3", stars: 350 },
  { id: 3, name: "Яреево — Серия 6", stars: 590 },
  { id: 4, name: "Яреево — Серия 8", stars: 790 },
  { id: 5, name: "Кфг Яреево 1.12.2", stars: 580 },
  { id: 6, name: "Аквапарк 1.12.2", stars: 899 },
  { id: 7, name: "Питбайки мод 1.12.2", stars: 120 },
  { id: 8, name: "Питбайк стант", stars: 350 },
];

function productById(id) {
  return PRODUCTS.find((p) => p.id === Number(id));
}
function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

const pendingTopup = new Map();

async function sbRpc(name, body) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { ok: false, error: "no supabase" };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data?.message || res.statusText };
  return data || { ok: false };
}

function randKey() {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let a = "", b = "";
  for (let i = 0; i < 4; i++) a += s[(Math.random() * s.length) | 0];
  for (let i = 0; i < 4; i++) b += s[(Math.random() * s.length) | 0];
  return `LS-${a}-${b}`;
}

async function createKey(product) {
  const meta = fileMap.get(product.id) || {};
  const fileUrl = meta.url || process.env[`FILE_URL_${product.id}`];
  if (!fileUrl) return { ok: false, error: "Нет файла. Админ: /setfile " + product.id + " URL" };
  if (!ADMIN_PASS) return { ok: false, error: "Нет ADMIN_PASS" };
  const code = randKey();
  const data = await sbRpc("admin_create_key", {
    p_pass: ADMIN_PASS,
    p_code: code,
    p_title: product.name,
    p_file_url: fileUrl,
    p_file_name: meta.name || null,
    p_note: "Stars shop",
    p_max_uses: 1,
  });
  if (!data || !data.ok) return { ok: false, error: data?.error || "key fail" };
  return { ok: true, code: data.code || code };
}

async function isSubscribed(userId) {
  try {
    const m = await bot.api.getChatMember(`@${CHANNEL}`, userId);
    return ["creator", "administrator", "member", "restricted"].includes(m.status);
  } catch (e) {
    console.error("sub", e.description || e.message);
    return false;
  }
}

function menuKb() {
  return new InlineKeyboard()
    .webApp("✨ Открыть меню", WEBAPP_URL)
    .row()
    .url("📢 Канал", `https://t.me/${CHANNEL}`);
}

const port = Number(process.env.PORT) || 3000;
http.createServer((_q, r) => {
  r.writeHead(200, { "Content-Type": "text/plain" });
  r.end("ok");
}).listen(port, () => console.log("HTTP", port));

const bot = new Bot(TOKEN);

bot.command("start", async (ctx) => {
  const payload = (ctx.match || "").trim();

  // topup_100
  if (payload.startsWith("topup_")) {
    const stars = Math.floor(Number(payload.slice(6)));
    if (!stars || stars < 1) return ctx.reply("Сумма неверная");
    if (!(await isSubscribed(ctx.from.id))) {
      return ctx.reply(`Сначала подписка: https://t.me/${CHANNEL}`);
    }
    const inv = `top_${ctx.from.id}_${stars}_${Date.now()}`;
    pendingTopup.set(inv, { userId: ctx.from.id, stars });
    try {
      await ctx.replyWithInvoice(
        `Пополнение ${stars} коинов`,
        `Light Shop · ${stars} ★ = ${stars} коинов`,
        inv,
        "XTR",
        [{ label: `${stars} коинов`, amount: stars }],
        { provider_token: "", max_tip_amount: 0 }
      );
    } catch (e) {
      await ctx.reply("Счёт не создан: " + (e.description || e.message));
    }
    return;
  }

  // buy_2_350 — выдача ключа после списания коинов в WebApp
  if (payload.startsWith("buy_")) {
    const parts = payload.split("_");
    const pid = Number(parts[1]);
    const p = productById(pid);
    if (!p) return ctx.reply("Товар не найден");
    const key = await createKey(p);
    if (!key.ok) {
      return ctx.reply(`Оплата/списание уже на балансе, но ключ: ${key.error}\nНапиши админу.`);
    }
    await ctx.reply(
      `Спасибо за покупку 🛍️\nВаш ключ ниже 🔑\n\n` +
        `Ключ:\n<code>${key.code}</code>\n\n` +
        `Товар: <b>${p.name}</b>\n` +
        `Ввод: сайт / вкладка Main в меню\n\n` +
        `‼️ Ключ 1 раз. Проверь интернет перед скачиванием.\nFAQ — на сайте.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp("🌐 Открыть меню", WEBAPP_URL),
      }
    );
    return;
  }

  // обычный start — подписка
  const ok = await isSubscribed(ctx.from.id);
  if (!ok) {
    return ctx.reply(
      `🔒 Подпишись на канал, чтобы открыть меню:\nhttps://t.me/${CHANNEL}`,
      {
        reply_markup: new InlineKeyboard()
          .url("Подписаться", `https://t.me/${CHANNEL}`)
          .row()
          .text("Я подписался", "check_sub"),
      }
    );
  }
  await ctx.reply(`✦ <b>Light Shop</b>\n\nМеню с балансом, каталогом и ключами:`, {
    parse_mode: "HTML",
    reply_markup: menuKb(),
  });
});

bot.callbackQuery("check_sub", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isSubscribed(ctx.from.id))) {
    return ctx.reply("Подписка не видна. Подпишись и нажми снова.");
  }
  await ctx.reply("✅ Готово. Открывай меню:", { reply_markup: menuKb() });
});

bot.on("pre_checkout_query", async (ctx) => {
  const p = pendingTopup.get(ctx.preCheckoutQuery.invoice_payload);
  if (!p) return ctx.answerPreCheckoutQuery(false, "Устарело");
  await ctx.answerPreCheckoutQuery(true);
});

bot.on("message:successful_payment", async (ctx) => {
  const pay = ctx.message.successful_payment;
  if (pay.currency !== "XTR") return;
  const order = pendingTopup.get(pay.invoice_payload);
  pendingTopup.delete(pay.invoice_payload);
  const stars = order?.stars || pay.total_amount;
  const uid = ctx.from.id;
  const r = await sbRpc("tg_add_coins", {
    p_id: uid,
    p_amount: stars,
    p_kind: "topup",
    p_meta: { stars, payload: pay.invoice_payload },
  });
  if (!r || !r.ok) {
    await ctx.reply(`Оплата ${stars}★ прошла, но баланс: ${r?.error || "ошибка"}. Напиши админу.`);
    return;
  }
  await ctx.reply(
    `✅ +${stars} коинов\nБаланс: <b>${r.coins}</b>`,
    { parse_mode: "HTML", reply_markup: menuKb() }
  );
  for (const a of ADMIN_IDS) {
    try {
      await bot.api.sendMessage(a, `💰 topup ${stars}★ from ${uid}`);
    } catch (_) {}
  }
});

bot.command("setfile", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = (ctx.message.text || "").split(/\s+/);
  if (parts.length < 3) return ctx.reply("/setfile ID URL [name.zip]");
  const id = Number(parts[1]);
  if (!productById(id)) return ctx.reply("Нет товара");
  fileMap.set(id, { url: parts[2], name: parts[3] || null });
  await ctx.reply(`Файл для #${id} записан (до рестарта). Для постоянства: FILE_URL_${id} в Variables`);
});

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply("Админ: /setfile · WebApp админ-вкладка · Variables FILE_URL_N");
});

bot.catch((e) => console.error(e));
bot.start({ onStart: (i) => console.log("@" + i.username) });
