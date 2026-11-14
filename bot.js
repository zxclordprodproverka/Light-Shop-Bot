/**
 * LIGHT SHOP — Telegram storefront
 * Existing Supabase integration is intentionally preserved:
 * POST /rest/v1/rpc/admin_create_key with the existing arguments.
 * No database tables, columns, policies or functions are created/modified.
 */
import { Bot, InlineKeyboard } from 'grammy';
import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) { console.error('Missing BOT_TOKEN environment variable'); process.exit(1); }

const ADMIN_IDS = (process.env.ADMIN_IDS || '8147223766').split(',').map(x => x.trim()).filter(Boolean);
const CHANNEL = (process.env.CHANNEL_USERNAME || 'LightShopOFC').replace(/^@/, '');
const SITE = process.env.SITE_URL || 'https://lightshop.neocities.org/';
const SUPPORT = process.env.SUPPORT_URL || `https://t.me/${CHANNEL}`;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const LOG_BOT_TOKEN = process.env.LOG_BOT_TOKEN || '';
const LOG_CHAT_ID = process.env.LOG_CHAT_ID || '';
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || './data';
const DATA_FILE = path.join(DATA_DIR, 'shop-data.json');

const DEFAULT_PRODUCTS = [
  { id: 1, name: 'KTM 690 Enduro R', desc: '3D-модель KTM · текстуры', stars: 199, cat: 'Модели', enabled: true },
  { id: 2, name: 'Яреево — Серия 3', desc: 'Карта Minecraft 1.12.2', stars: 350, cat: 'Карты', series: 3, enabled: true },
  { id: 3, name: 'Яреево — Серия 6', desc: 'Карта Minecraft 1.12.2', stars: 590, cat: 'Карты', series: 6, enabled: true },
  { id: 4, name: 'Яреево — Серия 8', desc: 'Карта Minecraft 1.12.2', stars: 790, cat: 'Карты', series: 8, enabled: true },
  { id: 5, name: 'Кфг Яреево 1.12.2', desc: 'Конфиг + сборка', stars: 580, cat: 'Сборки', enabled: true },
  { id: 6, name: 'Аквапарк 1.12.2', desc: 'Карта Minecraft 1.12.2', stars: 899, cat: 'Карты', enabled: true },
  { id: 7, name: 'Питбайки мод 1.12.2', desc: 'Мод питбайков', stars: 120, cat: 'Моды', enabled: true },
  { id: 8, name: 'Питбайк стант', desc: 'Модель для Minecraft', stars: 350, cat: 'Модели', enabled: true },
];

let store = { products: DEFAULT_PRODUCTS, files: {}, orders: [], keys: [] };
const sessions = new Map();
const bot = new Bot(TOKEN);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = n => `${Number(n).toLocaleString('ru-RU')} Stars`;
const isAdmin = id => ADMIN_IDS.includes(String(id));
const product = id => store.products.find(p => p.id === Number(id));
const enabledProducts = () => store.products.filter(p => p.enabled !== false);
const save = async () => { await fs.mkdir(DATA_DIR, { recursive: true }); await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2)); };
async function load() {
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    store = { ...store, ...parsed };
    if (!Array.isArray(store.products) || !store.products.length) store.products = DEFAULT_PRODUCTS;
    store.files ||= {}; store.orders ||= []; store.keys ||= [];
  } catch { await save(); }
  for (const p of store.products) {
    const url = process.env[`FILE_URL_${p.id}`];
    if (url && !store.files[p.id]?.url) store.files[p.id] = { ...(store.files[p.id] || {}), url };
  }
}

function menuKeyboard() {
  return new InlineKeyboard().text('🛍 Каталог', 'shop').text('📦 Мои покупки', 'myorders').row()
    .webApp('🌐 Открыть сайт', SITE).row()
    .url('📢 Наш канал', `https://t.me/${CHANNEL}`).text('❔ FAQ', 'faq').row()
    .url('💬 Поддержка', SUPPORT);
}
function backMenu() { return new InlineKeyboard().text('⬅️ В меню', 'menu'); }
function categoriesKeyboard() {
  const cats = [...new Set(enabledProducts().map(p => p.cat))];
  const kb = new InlineKeyboard();
  for (const c of cats) kb.text(c, `category:${c}`).row();
  kb.text('📦 Все товары', 'category:Все').row().text('⬅️ В меню', 'menu');
  return kb;
}
function catalogKeyboard(cat = 'Все') {
  const list = enabledProducts().filter(p => cat === 'Все' || p.cat === cat);
  const kb = new InlineKeyboard();
  for (const p of list) kb.text(`${p.name} · ${p.stars} ★`, `product:${p.id}`).row();
  kb.text('📂 Категории', 'categories').row().text('⬅️ В меню', 'menu');
  return kb;
}
function productKeyboard(p) {
  return new InlineKeyboard().text(`⭐ Купить за ${p.stars} Stars`, `buy:${p.id}`).row()
    .text('⬅️ Каталог', 'shop').text('🏠 Меню', 'menu');
}
function adminKeyboard() {
  return new InlineKeyboard().text('📦 Товары', 'adm:products').text('🧾 Заказы / логи', 'adm:orders').row()
    .text('🔑 Выданные ключи', 'adm:keys').text('🔗 Файлы и ссылки', 'adm:files').row()
    .text('⭐ Тест выдачи', 'adm:test').text('📊 Статистика', 'adm:stats').row()
    .text('🏠 В магазин', 'menu');
}
function adminProductsKeyboard() {
  const kb = new InlineKeyboard();
  for (const p of store.products) kb.text(`${p.enabled === false ? '⛔' : '🟢'} ${p.id}. ${p.name}`, `adm:product:${p.id}`).row();
  kb.text('➕ Добавить товар', 'adm:addproduct').row().text('⬅️ Админ-панель', 'adm:home');
  return kb;
}
function adminProductKeyboard(p) {
  return new InlineKeyboard().text('✏️ Изменить цену', `adm:price:${p.id}`).text('📝 Изменить название', `adm:name:${p.id}`).row()
    .text('🔗 Привязать файл', `adm:file:${p.id}`).text(p.enabled === false ? '🟢 Включить' : '⛔ Выключить', `adm:toggle:${p.id}`).row()
    .text('⬅️ К товарам', 'adm:products');
}
async function subscribed(userId) {
  try {
    const m = await bot.api.getChatMember(`@${CHANNEL}`, userId);
    return ['creator', 'administrator', 'member'].includes(m.status) || (m.status === 'restricted' && m.is_member);
  } catch (e) { console.error('Subscription check failed:', e.description || e.message); return false; }
}
function gateKeyboard() { return new InlineKeyboard().url('📢 Подписаться на канал', `https://t.me/${CHANNEL}`).row().text('✅ Проверить подписку', 'checksub'); }
async function gate(ctx) {
  if (await subscribed(ctx.from.id)) return true;
  await ctx.reply('🔒 <b>Сначала подпишись на канал</b>\n\nЧтобы открыть магазин, подпишись на @' + esc(CHANNEL) + ' и нажми «Проверить подписку».', { parse_mode: 'HTML', reply_markup: gateKeyboard() });
  return false;
}
function makeKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let a = '', b = '';
  for (let i = 0; i < 4; i++) { a += chars[Math.floor(Math.random() * chars.length)]; b += chars[Math.floor(Math.random() * chars.length)]; }
  return `LS-${a}-${b}`;
}
async function createKey(p, note = 'Выдача после Telegram Stars') {
  const meta = store.files[p.id] || {};
  const fileUrl = meta.url || process.env[`FILE_URL_${p.id}`] || '';
  if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_PASS) return { ok: false, error: 'Не настроены SUPABASE_URL, SUPABASE_KEY или ADMIN_PASS.' };
  if (!fileUrl) return { ok: false, error: `Для товара №${p.id} ещё не привязана ссылка на файл.` };
  const code = makeKey();
  const body = { p_pass: ADMIN_PASS, p_code: code, p_title: p.name, p_file_url: fileUrl, p_file_name: meta.name || null, p_note: meta.note || note, p_max_uses: 1 };
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_create_key`, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) return { ok: false, error: data?.message || data?.error || `Supabase HTTP ${response.status}` };
    return { ok: true, code: data.code || code };
  } catch (e) { return { ok: false, error: e.message }; }
}
function deliveryText(p, code) {
  return `🎉 <b>Спасибо за покупку!</b>\n\n🔑 Ваш ключ: <code>${esc(code)}</code>\n📦 Товар: <b>${esc(p.name)}</b>\n\nВвести ключ и получить покупку можно на сайте:\n${esc(SITE)}\n\nПодробнее об использовании — на сайте, в разделе <b>FAQ</b>.`;
}
async function recordOrder({ userId, username, product: p, amount, status, key }) {
  const row = { id: `LS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, userId: String(userId), username: username || '', productId: p.id, productName: p.name, amount: Number(amount), status, key: key || '', createdAt: new Date().toISOString() };
  store.orders.unshift(row); store.orders = store.orders.slice(0, 500); if (key) store.keys.unshift({ ...row, usedStatus: 'unknown' });
  store.keys = store.keys.slice(0, 500); await save();
  const logText = `🛍 <b>LIGHT SHOP · ПОКУПКА</b>\n\nСтатус: ${esc(status)}\nПользователь: @${esc(username || 'нет username')} (<code>${esc(userId)}</code>)\nТовар: <b>${esc(p.name)}</b>\nЦена: <b>${amount} Stars</b>\nКлюч: <code>${esc(key || 'ожидает выдачи')}</code>\nДата: ${new Date(row.createdAt).toLocaleString('ru-RU')}`;
  for (const admin of ADMIN_IDS) { try { await bot.api.sendMessage(Number(admin), logText, { parse_mode: 'HTML' }); } catch {} }
  if (LOG_BOT_TOKEN && LOG_CHAT_ID) {
    try { await fetch(`https://api.telegram.org/bot${LOG_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: LOG_CHAT_ID, text: logText, parse_mode: 'HTML' }) }); }
    catch (e) { console.error('External purchase log failed:', e.message); }
  }
  return row;
}

bot.command('start', async ctx => {
  if (!(await gate(ctx))) return;
  await ctx.reply(`✦ <b>LIGHT SHOP</b>\n\nДобро пожаловать, ${esc(ctx.from.first_name || 'друг')}!\n\nВыбирай товары, оплачивай Telegram Stars и получай ключ автоматически.`, { parse_mode: 'HTML', reply_markup: menuKeyboard() });
});
bot.command('admin', async ctx => { if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ Нет доступа.'); await ctx.reply('✦ <b>ПАНЕЛЬ УПРАВЛЕНИЯ</b>\nВыбери нужный раздел:', { parse_mode: 'HTML', reply_markup: adminKeyboard() }); });
bot.command('SendStars', async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ Нет доступа.');
  const [, id, rawAmount] = (ctx.message.text || '').trim().split(/\s+/);
  if (!id || !rawAmount || !/^\d+$/.test(rawAmount)) return ctx.reply('Формат: <code>/SendStars ID_товара сумма</code>\nПример: <code>/SendStars 2 400</code>', { parse_mode: 'HTML' });
  const p = product(id); const amount = Number(rawAmount);
  if (!p || amount < 1) return ctx.reply('Проверь ID товара и сумму.');
  if (amount < p.stars) return ctx.reply(`❌ Недостаточно. Для «${esc(p.name)}» нужно ${p.stars} Stars, указано ${amount}. Ключ не создан.`, { parse_mode: 'HTML' });
  const result = await createKey(p, 'Ручная тестовая выдача администратору');
  if (!result.ok) return ctx.reply(`Не удалось создать ключ: ${esc(result.error)}`, { parse_mode: 'HTML' });
  await recordOrder({ userId: ctx.from.id, username: ctx.from.username, product: p, amount, status: 'Тестовая выдача администратору', key: result.code });
  await ctx.reply(deliveryText(p, result.code), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().webApp('🌐 Открыть сайт', SITE).row().text('🛠 Админ-панель', 'adm:home') });
});
bot.command('products', async ctx => { if (!isAdmin(ctx.from.id)) return; await ctx.reply(store.products.map(p => `${p.id}. ${p.name} — ${p.stars} ★ ${p.enabled === false ? '(выключен)' : ''}`).join('\n')); });
bot.command('setfile', async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const [, rawId, url, ...name] = (ctx.message.text || '').trim().split(/\s+/); const p = product(rawId);
  if (!p || !url || !/^https:\/\//i.test(url)) return ctx.reply('Формат: /setfile ID https://ссылка-на-файл.zip имя-файла.zip');
  store.files[p.id] = { url, name: name.join(' ') || null }; await save();
  await ctx.reply(`✅ Ссылка для «${esc(p.name)}» сохранена.`, { parse_mode: 'HTML' });
});

bot.callbackQuery('checksub', async ctx => { await ctx.answerCallbackQuery(); if (await subscribed(ctx.from.id)) await ctx.reply('✅ Подписка подтверждена!', { reply_markup: menuKeyboard() }); else await ctx.reply('Подписку пока не вижу. Подпишись и проверь ещё раз.', { reply_markup: gateKeyboard() }); });
bot.callbackQuery('menu', async ctx => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await ctx.editMessageText('✦ <b>Главное меню</b>\nВыбери действие:', { parse_mode: 'HTML', reply_markup: menuKeyboard() }).catch(() => {}); });
bot.callbackQuery('shop', async ctx => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await ctx.editMessageText('🛍 <b>Каталог товаров</b>\nВыбери товар или категорию:', { parse_mode: 'HTML', reply_markup: catalogKeyboard() }).catch(async () => ctx.reply('🛍 Каталог:', { reply_markup: catalogKeyboard() })); });
bot.callbackQuery('categories', async ctx => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await ctx.editMessageText('📂 <b>Категории</b>', { parse_mode: 'HTML', reply_markup: categoriesKeyboard() }).catch(() => {}); });
bot.callbackQuery(/^category:(.+)$/, async ctx => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const cat = ctx.match[1]; await ctx.editMessageText(`📦 <b>${esc(cat)}</b>`, { parse_mode: 'HTML', reply_markup: catalogKeyboard(cat) }).catch(() => {}); });
bot.callbackQuery(/^product:(\d+)$/, async ctx => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const p = product(ctx.match[1]); if (!p || p.enabled === false) return; await ctx.editMessageText(`✦ <b>${esc(p.name)}</b>\n\n${esc(p.desc)}\nКатегория: ${esc(p.cat)}\n\n⭐ <b>${p.stars} Stars</b>\n\nПосле оплаты бот отправит ключ для сайта.`, { parse_mode: 'HTML', reply_markup: productKeyboard(p) }).catch(() => {}); });
bot.callbackQuery(/^buy:(\d+)$/, async ctx => {
  if (!(await subscribed(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Сначала подпишись на канал.', show_alert: true });
  const p = product(ctx.match[1]); if (!p || p.enabled === false) return ctx.answerCallbackQuery({ text: 'Товар недоступен.', show_alert: true });
  await ctx.answerCallbackQuery();
  const payload = `ls|${p.id}|${ctx.from.id}|${Date.now()}`;
  try { await ctx.replyWithInvoice(p.name.slice(0, 32), `${p.desc} · Light Shop`.slice(0, 255), payload, 'XTR', [{ label: p.name.slice(0, 32), amount: p.stars }], { provider_token: '', protect_content: true }); }
  catch (e) { await ctx.reply(`Не удалось создать счёт: ${esc(e.description || e.message)}`, { parse_mode: 'HTML' }); }
});
bot.on('pre_checkout_query', async ctx => {
  const q = ctx.preCheckoutQuery; const [prefix, id, userId] = String(q.invoice_payload).split('|'); const p = prefix === 'ls' ? product(id) : null;
  if (!p || String(userId) !== String(q.from.id) || q.currency !== 'XTR' || Number(q.total_amount) !== Number(p.stars)) return ctx.answerPreCheckoutQuery(false, 'Счёт недействителен. Открой товар и создай новый счёт.');
  await ctx.answerPreCheckoutQuery(true);
});
bot.on('message:successful_payment', async ctx => {
  const pay = ctx.message.successful_payment; const [prefix, id, userId] = String(pay.invoice_payload).split('|'); const p = prefix === 'ls' ? product(id) : null;
  if (pay.currency !== 'XTR' || !p || String(userId) !== String(ctx.from.id) || Number(pay.total_amount) !== Number(p.stars)) { await ctx.reply('Платёж получен, но заказ не удалось автоматически сопоставить. Напиши в поддержку и приложи скрин оплаты.'); return; }
  const result = await createKey(p);
  if (!result.ok) {
    await recordOrder({ userId: ctx.from.id, username: ctx.from.username, product: p, amount: pay.total_amount, status: `Оплачено · нужна ручная выдача: ${result.error}` });
    await ctx.reply(`✅ Оплата ${pay.total_amount} Stars получена.\n\nАвтоматическая выдача временно не удалась. Администратор увидел заказ и поможет тебе.`, { reply_markup: new InlineKeyboard().url('💬 Поддержка', SUPPORT) }); return;
  }
  await recordOrder({ userId: ctx.from.id, username: ctx.from.username, product: p, amount: pay.total_amount, status: 'Оплачено · ключ выдан', key: result.code });
  await ctx.reply(deliveryText(p, result.code), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().webApp('🌐 Открыть сайт', SITE).row().url('💬 Поддержка', SUPPORT) });
});
bot.callbackQuery('faq', async ctx => { await ctx.answerCallbackQuery(); await ctx.editMessageText(`❔ <b>Частые вопросы</b>\n\n• Оплата проходит через Telegram Stars.\n• После подтверждения оплаты бот отправляет ключ.\n• Ключ вводится на сайте.\n• Подробная инструкция — в разделе FAQ на сайте.\n\nЕсли возникла проблема, напиши в поддержку.`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().webApp('📖 Открыть FAQ', SITE).row().url('💬 Поддержка', SUPPORT).row().text('⬅️ В меню', 'menu') }).catch(() => {}); });
bot.callbackQuery('myorders', async ctx => { await ctx.answerCallbackQuery(); const rows = store.orders.filter(o => o.userId === String(ctx.from.id)).slice(0, 8); const text = rows.length ? rows.map(o => `• ${esc(o.productName)} — ${o.amount} ★\n  ${esc(o.status)} · ${new Date(o.createdAt).toLocaleDateString('ru-RU')}`).join('\n\n') : 'Покупок пока нет.'; await ctx.reply(`📦 <b>Мои покупки</b>\n\n${text}`, { parse_mode: 'HTML', reply_markup: backMenu() }); });

// Admin panel callbacks
bot.callbackQuery('adm:home', async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; await ctx.reply('✦ <b>ПАНЕЛЬ УПРАВЛЕНИЯ</b>\nВыбери раздел:', { parse_mode: 'HTML', reply_markup: adminKeyboard() }); });
bot.callbackQuery('adm:products', async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; await ctx.reply('📦 <b>Управление товарами</b>', { parse_mode: 'HTML', reply_markup: adminProductsKeyboard() }); });
bot.callbackQuery(/^adm:product:(\d+)$/, async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const p = product(ctx.match[1]); if (p) await ctx.reply(`📦 <b>${esc(p.name)}</b>\nID: ${p.id}\nЦена: ${p.stars} Stars\nКатегория: ${esc(p.cat)}\nФайл: ${store.files[p.id]?.url ? 'привязан ✅' : 'не привязан ⚠️'}`, { parse_mode: 'HTML', reply_markup: adminProductKeyboard(p) }); });
bot.callbackQuery(/^adm:(price|name|file):(\d+)$/, async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const [, action, id] = ctx.match; const p = product(id); if (!p) return; sessions.set(String(ctx.from.id), { action, productId: p.id }); const prompts = { price: `Отправь новую цену в Stars для «${p.name}» (только число).`, name: `Отправь новое название для товара №${p.id}.`, file: `Отправь ссылку на ZIP для «${p.name}» в формате:\nhttps://.../file.zip имя-файла.zip` }; await ctx.reply(prompts[action]); });
bot.callbackQuery(/^adm:toggle:(\d+)$/, async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const p = product(ctx.match[1]); if (!p) return; p.enabled = p.enabled === false; await save(); await ctx.reply(`Товар ${p.enabled ? 'включён' : 'выключен'}.`, { reply_markup: adminProductKeyboard(p) }); });
bot.callbackQuery('adm:addproduct', async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; sessions.set(String(ctx.from.id), { action: 'addproduct' }); await ctx.reply('Отправь новый товар одной строкой:\nНазвание | описание | цена в Stars | категория'); });
bot.on('message:text', async ctx => {
  const state = sessions.get(String(ctx.from.id)); if (!state || !isAdmin(ctx.from.id) || ctx.message.text.startsWith('/')) return;
  const raw = ctx.message.text.trim();
  if (state.action === 'testamount') {
    const amount = Number(raw); const p = product(state.productId);
    if (!Number.isInteger(amount) || amount < 1) return ctx.reply('Отправь целое число.');
    if (amount < p.stars) return ctx.reply(`❌ Недостаточно: нужно ${p.stars} Stars. Ключ не создан.`);
    const r = await createKey(p, 'Ручная тестовая выдача администратору');
    if (!r.ok) return ctx.reply(`Не удалось создать ключ: ${esc(r.error)}`, { parse_mode: 'HTML' });
    sessions.delete(String(ctx.from.id));
    await recordOrder({ userId: ctx.from.id, username: ctx.from.username, product: p, amount, status: 'Тестовая выдача администратору', key: r.code });
    return ctx.reply(deliveryText(p, r.code), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().webApp('🌐 Открыть сайт', SITE).row().text('🛠 Админ-панель', 'adm:home') });
  }
  if (state.action === 'price') { const n = Number(raw); if (!Number.isInteger(n) || n < 1) return ctx.reply('Цена должна быть целым числом больше нуля. Попробуй ещё раз.'); const p = product(state.productId); p.stars = n; await save(); sessions.delete(String(ctx.from.id)); return ctx.reply(`✅ Цена «${p.name}» изменена: ${n} Stars.`); }
  if (state.action === 'name') { const p = product(state.productId); p.name = raw.slice(0, 60); await save(); sessions.delete(String(ctx.from.id)); return ctx.reply('✅ Название сохранено.'); }
  if (state.action === 'file') { const [url, ...filename] = raw.split(/\s+/); if (!/^https:\/\//i.test(url)) return ctx.reply('Нужна HTTPS-ссылка. Попробуй ещё раз.'); const p = product(state.productId); store.files[p.id] = { url, name: filename.join(' ') || null }; await save(); sessions.delete(String(ctx.from.id)); return ctx.reply(`✅ Файл для «${p.name}» привязан.`); }
  if (state.action === 'addproduct') { const parts = raw.split('|').map(s => s.trim()); const price = Number(parts[2]); if (parts.length < 4 || !parts[0] || !Number.isInteger(price) || price < 1) return ctx.reply('Формат: Название | описание | цена | категория'); const id = Math.max(0, ...store.products.map(p => p.id)) + 1; store.products.push({ id, name: parts[0].slice(0, 60), desc: parts[1] || 'Цифровой товар', stars: price, cat: parts[3], enabled: true }); await save(); sessions.delete(String(ctx.from.id)); return ctx.reply(`✅ Товар добавлен. ID: ${id}`); }
});
bot.callbackQuery('adm:orders', async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const rows = store.orders.slice(0, 12); const text = rows.length ? rows.map(o => `#${esc(o.id)} · ${esc(o.productName)}\n${o.amount} ★ · ${esc(o.status)}\nID: ${esc(o.userId)} · ${new Date(o.createdAt).toLocaleString('ru-RU')}`).join('\n\n') : 'Заказов пока нет.'; await ctx.reply(`🧾 <b>Последние заказы</b>\n\n${text}`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Админ-панель', 'adm:home') }); });
bot.callbackQuery('adm:keys', async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const rows = store.keys.slice(0, 12); const text = rows.length ? rows.map(k => `🔑 <code>${esc(k.key)}</code>\n${esc(k.productName)} · ${esc(k.status)}\nСтатус использования: не проверяется (без изменения БД)`).join('\n\n') : 'Выданных ключей пока нет.'; await ctx.reply(`🔑 <b>Выданные ключи</b>\n\n${text}`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Админ-панель', 'adm:home') }); });
bot.callbackQuery('adm:files', async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const text = store.products.map(p => `${p.id}. ${esc(p.name)} — ${store.files[p.id]?.url ? 'ссылка привязана ✅' : 'нет ссылки ⚠️'}`).join('\n'); await ctx.reply(`🔗 <b>Файлы товаров</b>\n\n${text}\n\nНажми на товар → «Привязать файл».`, { parse_mode: 'HTML', reply_markup: adminProductsKeyboard() }); });
bot.callbackQuery('adm:stats', async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const paid = store.orders.filter(o => o.status.includes('Оплачено')); const stars = paid.reduce((s, o) => s + o.amount, 0); await ctx.reply(`📊 <b>Статистика</b>\n\nВсего записей: ${store.orders.length}\nОплаченных заказов: ${paid.length}\nСумма: ${stars} Stars\nВыдано ключей: ${store.keys.length}`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Админ-панель', 'adm:home') }); });
bot.callbackQuery('adm:test', async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const kb = new InlineKeyboard(); for (const p of enabledProducts()) kb.text(`${p.name} · ${p.stars} ★`, `adm:test:${p.id}`).row(); kb.text('⬅️ Админ-панель', 'adm:home'); await ctx.reply('⭐ <b>Тестовая выдача</b>\nВыбери товар. Это НЕ настоящая оплата Stars: бот проверит сумму, создаст ключ и запишет тест в локальный журнал.', { parse_mode: 'HTML', reply_markup: kb }); });
bot.callbackQuery(/^adm:test:(\d+)$/, async ctx => { await ctx.answerCallbackQuery(); if (!isAdmin(ctx.from.id)) return; const p = product(ctx.match[1]); if (!p) return; sessions.set(String(ctx.from.id), { action: 'testamount', productId: p.id }); await ctx.reply(`Отправь сумму для «${p.name}». Нужно не меньше ${p.stars} Stars.`); });

bot.catch(err => console.error('Bot error:', err.error?.description || err.message || err));

http.createServer((req, res) => { if (req.url === '/health' || req.url === '/') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, service: 'Light Shop Bot' })); } else { res.writeHead(404); res.end('Not found'); } }).listen(PORT, () => console.log(`Health server listening on ${PORT}`));

await load();
bot.start({ onStart: info => console.log(`Light Shop started as @${info.username}`) });
