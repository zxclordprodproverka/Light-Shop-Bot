/**
 * Light Shop — ключ без ссылки · Mega в product_files · WebApp
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
const WEBAPP_URL = process.env.WEBAPP_URL || "https://example.neocities.org/";
const SITE = process.env.SITE_URL || "https://lightshop.neocities.org/";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const ADMIN_PASS = process.env.ADMIN_PASS || "";

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

const MEGA = {
  1: ["https://mega.nz/file/YnIj3R4R#GVxBXoKdYh-pi-6d53eYSHH7tntc6JR5jd9LTZsMkro", "ktm-modeli.zip"],
  2: ["https://mega.nz/file/sjwSlJ7Y#TnmnTilKz0skTUtlmttWqT2KUrIkPmmUUFjAuo0o1LE", "yareevo-s3.zip"],
  3: ["https://mega.nz/file/QqpURRaL#2GHCuHoAAAB0I0QOfI1wYQAAAAAAAAAAfIBgHAGNcNU", "yareevo-s6.zip"],
  4: ["https://mega.nz/file/AnYjFLzT#1-ObvqBk15Y-pi9G7UhFr6EcVafXEqIWw1EkyURBssk", "yareevo-s8.zip"],
  5: ["https://mega.nz/file/cjAziT6a#ImtOXpC7STrYo1dStk1AC5R7mQkegJKRCma1f53zf1Y", "kfg-yareevo.rar"],
  6: ["https://mega.nz/file/MiBTzYhA#Tws3bUt20KzNKnwvZhXWxmNZnu96eW4KjvmwMaFl0D8", "aquapark.rar"],
  7: ["https://mega.nz/file/x7JhzLKA#txE6PBqrDj7IC5NhxEnNU4FKg7Z3uc23qZ0QjsN_Syo", "pitbike-mod.zip"],
  8: ["https://mega.nz/file/5zAXADaC#mPRs5n8AAAA8u5Ep_Fu3DgAAAAAAAAAAxJ6MO4Fbt7o", "pitbike-stunt.zip"],
};

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

/** Создать одноразовый ключ с mega-ссылкой внутри БД (пользователю ссылку не шлём) */
async function createKeyOnly(product) {
  const mega = MEGA[product.id];
  let fileUrl = mega?.[0];
  let fileName = mega?.[1] || null;

  // обновить product_files
  if (fileUrl) {
    await sbRpc("tg_set_product_file", {
      p_product_id: product.id,
      p_url: fileUrl,
      p_name: fileName,
    });
  }

  if (!fileUrl && ADMIN_PASS) {
    // fallback — уже в product_files через SQL
  }

  const code = randKey();
  if (ADMIN_PASS && fileUrl) {
    const data = await sbRpc("admin_create_key", {
      p_pass: ADMIN_PASS,
      p_code: code,
      p_title: product.name,
      p_file_url: fileUrl,
      p_file_name: fileName,
      p_note: "bot",
      p_max_uses: 1,
    });
    if (data?.ok) return { ok: true, code: data.code || code };
  }

  // без admin_create_key — покупка через tg_buy_product из WebApp
  return { ok: true, code, note: "webapp" };
}

function keyMessage(product, code) {
  return (
    `Спасибо за покупку 🛍️\n\n` +
    `Товар: <b>${product.name}</b>\n\n` +
    `Ключ:\n<code>${code}</code>\n\n` +
    `Введи ключ на сайте:\n${SITE}\n` +
    `или во вкладке Main в меню.\n\n` +
    `‼️ Ключ <b>одноразовый</b>. Ссылку на файл бот не присылает.`
  );
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

  if (payload.startsWith("topup_")) {
    const stars = Math.floor(Number(payload.slice(6)));
    if (!stars || stars < 1) return ctx.reply("Сумма неверная");
    if (!(await isSubscribed(ctx.from.id))) {
      return ctx.reply(`Подписка: https://t.me/${CHANNEL}`);
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
      await ctx.reply("Счёт: " + (e.description || e.message));
    }
    return;
  }

  // buy_ID — только если нужно добить ключ из бота (WebApp уже создаёт)
  if (payload.startsWith("buy_")) {
    const pid = Number(payload.split("_")[1]);
    const p = productById(pid);
    if (!p) return ctx.reply("Товар не найден");
    const key = await createKeyOnly(p);
    if (!key.ok) return ctx.reply("Не удалось создать ключ");
    await ctx.reply(keyMessage(p, key.code), {
      parse_mode: "HTML",
      reply_markup: menuKb(),
      link_preview_options: { is_disabled: true },
    });
    return;
  }

  const ok = await isSubscribed(ctx.from.id);
  if (!ok) {
    return ctx.reply(
      `🔒 Подпишись на канал:\nhttps://t.me/${CHANNEL}`,
      {
        reply_markup: new InlineKeyboard()
          .url("Подписаться", `https://t.me/${CHANNEL}`)
          .row()
          .text("Я подписался", "check_sub"),
      }
    );
  }
  await ctx.reply(`✦ <b>Light Shop</b>\n\nМеню магазина:`, {
    parse_mode: "HTML",
    reply_markup: menuKb(),
  });
});

bot.callbackQuery("check_sub", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isSubscribed(ctx.from.id))) {
    return ctx.reply("Подписка не видна. Подпишись и нажми снова.");
  }
  await ctx.reply("✅ Открывай меню:", { reply_markup: menuKb() });
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
  const r = await sbRpc("tg_add_coins", {
    p_id: ctx.from.id,
    p_amount: stars,
    p_kind: "topup",
    p_meta: { stars },
  });
  if (!r?.ok) {
    await ctx.reply(`Оплата ${stars}★ прошла, баланс: ${r?.error || "ошибка"}`);
    return;
  }
  await ctx.reply(`✅ +${stars} коинов\nБаланс: <b>${r.coins}</b>`, {
    parse_mode: "HTML",
    reply_markup: menuKb(),
  });
});

bot.command("setfile", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = (ctx.message.text || "").split(/\s+/);
  if (parts.length < 3) return ctx.reply("/setfile ID URL [name]");
  const id = Number(parts[1]);
  if (!productById(id)) return ctx.reply("Нет товара");
  const r = await sbRpc("tg_set_product_file", {
    p_product_id: id,
    p_url: parts[2],
    p_name: parts[3] || null,
  });
  await ctx.reply(r?.ok ? `Файл #${id} обновлён` : `Ошибка: ${r?.error}`);
});

bot.command("seedmega", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  let n = 0;
  for (const [id, [url, name]] of Object.entries(MEGA)) {
    const r = await sbRpc("tg_set_product_file", {
      p_product_id: Number(id),
      p_url: url,
      p_name: name,
    });
    if (r?.ok) n++;
  }
  await ctx.reply(`Mega-ссылки записаны: ${n}/8`);
});

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply("Админ: /setfile · /seedmega · WebApp админка");
});

bot.catch((e) => console.error(e));
bot.start({ onStart: (i) => console.log("@" + i.username) });
