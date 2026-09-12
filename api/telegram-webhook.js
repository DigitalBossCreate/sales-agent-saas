import { obtenerProductos, gestionarCliente } from '../lib/bot-core.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot Core is running' });
  }

  try {
    const update = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';
      const text = (update.message.text || '').toLowerCase().trim();

      const clienteId = await gestionarCliente(userId, userName, userUsername);

      if (text === '/admin' || text === 'soy el admin') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🔐 *Panel de Administrador Pro*\n\nTu Telegram Chat ID es: \`${chatId}\``,
            parse_mode: 'Markdown'
          })
        });
        return res.status(200).json({ success: true });
      }

      // Saludo amigable general
      if (text === 'hola' || text === 'buenas' || text === 'buenas tardes' || text === 'buenas noches' || text === 'start' || text === '/start') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `¡Hola, *${userName}*! 👋 Bienvenido a nuestro asistente digital. ¿En qué producto o inteligencia artificial estás interesado hoy? (Por ejemplo: *Gemini*) 🚀`, 
            parse_mode: 'Markdown' 
          })
        });
        return res.status(200).json({ success: true });
      }

      // Si el cliente pide INFORMACIÓN sobre el producto
      const isInfoQuery = text.includes('informacion') || text.includes('info') || text.includes('detalles') || text.includes('que es') || text.includes('cuanto cuesta');
      const isProductQuery = text.includes('gemin') || text.includes('gemeni') || text.includes('ia');

      if (isInfoQuery || (isProductQuery && !text.includes('comprar'))) {
        const productos = await obtenerProductos();
        const productoPrincipal = productos[0];

        const infoText = `💡 *Información Oficial - ${productoPrincipal.nombre}*\n\n` +
          `✨ *¿Qué incluye?*\n` +
          `• Acceso completo y premium a Gemini Advanced durante 18 meses.\n` +
          `• Máxima potencia de razonamiento y análisis de Google.\n` +
          `• Privacidad y soporte garantizado.\n\n` +
          `🛡️ *Garantía Digital Boss:*\n` +
          `Servicio 100% estable y entrega inmediata al verificar tu pago.\n\n` +
          `💰 *Inversión única:* Bs. ${productoPrincipal.precio}\n\n` +
          `¿Listo para potenciar tu productividad? Haz clic abajo para adquirirlo 👇`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: infoText, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Quiero Comprar Ahora!`, callback_data: `start_purchase_${productoPrincipal.id}` }]
              ]
            }
          })
        });
        return res.status(200).json({ success: true });
      }

      // Si escribe directamente que quiere comprar
      if (text.includes('comprar') || text.includes('adquirir')) {
        const productos = await obtenerProductos();
        const productoPrincipal = productos[0];

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🎉 *¡Excelente elección!*\n\n📦 *${productoPrincipal.nombre}*\n💰 *Precio:* Bs. ${productoPrincipal.precio}\n\n👇 Selecciona tu método de pago preferido:`, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${productoPrincipal.precio})`, callback_data: `pay_takenos_${productoPrincipal.id}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${productoPrincipal.id}` }]
              ]
            }
          })
        });
        return res.status(200).json({ success: true });
      }

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: 'Cuéntame, ¿qué información necesitas o qué producto te gustaría consultar hoy? 😊', 
          parse_mode: 'Markdown' 
        })
      });
    } 
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = process.env.TELEGRAM_BOT_TOKEN;

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id, text: 'Procesando...' })
      });

      // Si el usuario hizo clic en "Quiero Comprar" desde el mensaje de información
      if (data.startsWith('start_purchase_')) {
        const prodId = data.replace('start_purchase_', '');
        const { data: productoPrincipal } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const prod = productoPrincipal || { id: prodId, nombre: 'Gemini Advanced', precio: 67 };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🎉 *¡Excelente elección!*\n\n📦 *${prod.nombre}*\n💰 *Precio:* Bs. ${prod.precio}\n\n👇 Selecciona tu método de pago preferido:`, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${prod.precio})`, callback_data: `pay_takenos_${prod.id}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${prod.id}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('pay_takenos_') || data.startsWith('pay_binance_')) {
        const parts = data.split('_');
        const method = parts[1]; // takenos o binance
        const prodId = parts[2];

        const { data: productoPrincipal } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const prod = productoPrincipal || { id: prodId, nombre: 'Gemini Advanced', precio: 67, imagen_url: '', qr_binance_url: '' };

        const qrUrl = method === 'takenos' ? prod.imagen_url : (prod.qr_binance_url || prod.imagen_url);

        try {
          await supabase.from('pedidos').insert([{
            producto_id: prod.id,
            monto: prod.precio,
            estado: 'ESPERANDO_PAGO'
          }]);
        } catch (e) {}

        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            photo: qrUrl,
            caption: `📲 *Escanea el QR de ${method.toUpperCase()} para realizar tu pago.*\n\nUna vez realizado, haz clic en el botón de abajo para notificar al administrador:`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🔔 Ya realicé el pago (Avisar al Admin)`, callback_data: `notify_admin_${chatId}_${prod.id}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('notify_admin_')) {
        const parts = data.split('_');
        const targetChatId = parts[2];
        const prodId = parts[3];

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `⏳ *Pago notificado.* El administrador verificará tu comprobante. 🚀`, 
            parse_mode: 'Markdown' 
          })
        });

        const adminDest = ADMIN_CHAT_ID || chatId;
        const adminAlertText = `🔔 *NUEVO PAGO PENDIENTE*\n\n👤 *Cliente Chat ID:* \`${targetChatId}\`\n📦 *Producto ID:* \`${prodId}\``;
        const adminKeyboard = {
          inline_keyboard: [
            [
              { text: `✅ Aprobar y Entregar`, callback_data: `approve_delivery_${targetChatId}_${prodId}` },
              { text: `❌ Rechazar`, callback_data: `reject_payment_${targetChatId}` }
            ]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: adminDest, text: adminAlertText, parse_mode: 'Markdown', reply_markup: adminKeyboard })
        });
      }
      else if (data.startsWith('approve_delivery_')) {
        const parts = data.split('_');
        const targetChatId = parts[2];
        const prodId = parts[3];

        let entregableUrl = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt';
        let nombreProd = 'Producto Digital';

        try {
          const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prodData) {
            nombreProd = prodData.nombre;
            if (prodData.pdf_url) entregableUrl = prodData.pdf_url;
            else if (prodData.video_url) entregableUrl = prodData.video_url;
          }
          await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('estado', 'ESPERANDO_PAGO');
        } catch (e) {}

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: targetChatId, 
            text: `¡Pago aprobado con éxito! 🎉\n\nTu producto: *${nombreProd}*\n🔗 *Enlace de Acceso / Descarga:* ${entregableUrl} 🚀`, 
            parse_mode: 'Markdown' 
          })
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
