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
            text: `¡Hola, *${userName}*! 👋 Bienvenido a Digital Boss. Soy tu asesor de inteligencia artificial y herramientas digitales. ¿Qué herramienta te gustaría potenciar hoy o sobre cuál deseas información? (Ej: *Gemini*) 🚀`, 
            parse_mode: 'Markdown' 
          })
        });
        return res.status(200).json({ success: true });
      }

      // Manejo de objeciones, preguntas frecuentes y argumentos comerciales de Gemini
      const isInfoQuery = text.includes('informacion') || text.includes('info') || text.includes('detalles') || text.includes('que es') || text.includes('cuanto cuesta') || text.includes('caro') || text.includes('duda') || text.includes('funciona');
      const isProductQuery = text.includes('gemin') || text.includes('gemeni') || text.includes('ia');

      if (isInfoQuery || (isProductQuery && !text.includes('comprar'))) {
        const productos = await obtenerProductos();
        const productoPrincipal = productos[0];

        const ventasTexto = `💡 *Información Oficial & Beneficios - ${productoPrincipal.nombre}*\n\n` +
          `✨ *¿Por qué elegir Gemini Advanced con nosotros?*\n` +
          `• *18 Meses de Acceso Continuo:* Olvídate de renovaciones mensuales caras.\n` +
          `• *Potencia Máxima:* Accede al modelo más avanzado de Google para programación, redacción, análisis de datos y proyectos complejos.\n\n` +
          `🛡️ *Manejo de Objeciones & Garantía:*\n` +
          `• _¿Es seguro?_ Totalmente, cuentas con soporte y estabilidad garantizada durante todo tu periodo.\n` +
          `• _¿Cómo se entrega?_ De forma inmediata en cuanto validamos tu pago local o cripto.\n\n` +
          `💰 *Inversión única:* Bs. ${productoPrincipal.precio}\n\n` +
          `¿Listo para dar el salto y llevar tu productividad al siguiente nivel? 👇`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: ventasTexto, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Lo quiero, Comprar Ahora!`, callback_data: `start_purchase_${productoPrincipal.id}` }],
                [{ text: `❓ Tengo otra duda / Pregunta frecuente`, callback_data: `faq_gemini_${productoPrincipal.id}` }]
              ]
            }
          })
        });
        return res.status(200).json({ success: true });
      }

      // Intención directa de compra
      if (text.includes('comprar') || text.includes('adquirir') || text.includes('pagar')) {
        const productos = await obtenerProductos();
        const productoPrincipal = productos[0];

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🎉 *¡Excelente decisión de compra!*\n\n📦 *${productoPrincipal.nombre}*\n💰 *Precio:* Bs. ${productoPrincipal.precio}\n\n👇 Selecciona tu método de pago preferido para emitir el QR:`, 
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
          text: 'Estoy aquí para ayudarte a elegir la mejor herramienta digital. Cuéntame, ¿qué deseas consultar? 😊', 
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

      // Manejo de Preguntas Frecuentes adicionales (Objeciones)
      if (data.startsWith('faq_gemini_')) {
        const prodId = data.replace('faq_gemini_', '');
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `📌 *Preguntas Frecuentes / Objeciones Resueltas:*\n\n1️⃣ *¿Cuándo recibo el acceso?* \nInmediatamente después de que el admin verifique tu comprobante de pago (toma menos de 5 minutos).\n\n2️⃣ *¿Funciona en mi cuenta personal?* \nSí, se configura de manera segura y privada para que disfrutes sin interrupciones.\n\n¿Te queda alguna otra duda o avanzamos con tu compra? 🚀`, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_${prodId}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('start_purchase_')) {
        const prodId = data.replace('start_purchase_', '');
        const { data: productoPrincipal } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const prod = productoPrincipal || { id: prodId, nombre: 'Gemini Advanced', precio: 72 };

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
        const prod = productoPrincipal || { id: prodId, nombre: 'Gemini Advanced', precio: 72, imagen_url: '', qr_binance_url: '' };

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
            text: `⏳ *Pago notificado.* Nuestro equipo está verificando tu comprobante. ¡En un momento te entregamos tu acceso! 🚀`, 
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

        // 1. Enviar el producto principal comprado al cliente
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: targetChatId, 
            text: `¡Pago aprobado con éxito! 🎉\n\nTu producto: *${nombreProd}*\n🔗 *Enlace de Acceso / Descarga:* ${entregableUrl}\n\n¡Gracias por confiar en Digital Boss! 🚀`, 
            parse_mode: 'Markdown' 
          })
        });

        // 2. Cross-Selling / Venta Cruzada automática post-venta
        setTimeout(async () => {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: targetChatId, 
              text: `🎁 *¡Oferta exclusiva para clientes VIP como tú!*\n\nYa que adquiriste Gemini Advanced, ¿te gustaría complementar tu ecosistema digital con acceso a herramientas de diseño o automatización con un descuento especial? Escribe *"ver catálogo"* para conocer más. 🔥`, 
              parse_mode: 'Markdown' 
            })
          });
        }, 2000);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
