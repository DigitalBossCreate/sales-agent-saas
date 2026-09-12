import { obtenerProductos, gestionarCliente } from '../lib/bot-core.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabhdzqpgq.supabase.co';
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
            text: `🔐 *Panel de Administrador Pro*\n\nTu Telegram Chat ID es: \`${chatId}\`\nEstado: Conectado y Sincronizado.`,
            parse_mode: 'Markdown'
          })
        });
        return res.status(200).json({ success: true });
      }

      const isBuying = text.includes('comprar') || text.includes('quiero') || text.includes('adquirir') || text.includes('pagar') || text.includes('gemini');
      if (isBuying) {
        const productos = await obtenerProductos();
        const productoPrincipal = productos[0];

        if (clienteId) {
          try {
            await supabase.from('pedidos').insert([{
              cliente_id: clienteId,
              producto_id: productoPrincipal.id,
              monto: productoPrincipal.precio,
              estado: 'ESPERANDO_PAGO'
            }]);
          } catch (e) {}
        }

        const aiResponse = `🎉 *¡Excelente elección!* \n\n📦 *${productoPrincipal.nombre}*\n💰 *Precio:* Bs. ${productoPrincipal.precio}\n\n👇 *Selecciona tu método de pago:*`;
        
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: `🇧🇴 Pagar con QR (Bs. ${productoPrincipal.precio})`, url: productoPrincipal.qr_url }],
            [{ text: `🔔 Ya realicé el pago (Avisar al Admin)`, callback_data: `notify_admin_${chatId}_${productoPrincipal.id}` }]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: aiResponse, 
            parse_mode: 'Markdown', 
            reply_markup: inlineKeyboard 
          })
        });
        return res.status(200).json({ success: true });
      }

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: '¡Hola! Escribe "Quiero Gemini" para iniciar tu compra automática. 🚀', 
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
        body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡Procesando solicitud!' })
      });

      if (data.startsWith('notify_admin_')) {
        const parts = data.split('_');
        const targetChatId = parts[2];
        const prodId = parts[3];

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `⏳ *Pago notificado.* En breve el administrador verificará y te enviará tu producto digital. 🚀`, 
            parse_mode: 'Markdown' 
          })
        });

        const adminDest = ADMIN_CHAT_ID || chatId;
        const adminAlertText = `🔔 *NUEVO PAGO PENDIENTE DE VALIDACIÓN*\n\n👤 *Cliente Chat ID:* \`${targetChatId}\`\n📦 *Producto ID:* \`${prodId}\``;
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

        let entregableUrl = 'https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt';
        let nombreProd = 'Producto Digital';

        try {
          const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prodData) {
            nombreProd = prodData.nombre;
            if (prodData.entregable_url) entregableUrl = prodData.entregable_url;
          }
          await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('estado', 'ESPERANDO_PAGO');
        } catch (e) {}

        // Enviar el producto digital o enlace de descarga de forma automática al cliente
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: targetChatId, 
            text: `¡Pago verificado y aprobado con éxito! 🎉\n\nAquí tienes tu producto: *${nombreProd}*\n🔗 *Enlace de Acceso / Descarga:* ${entregableUrl} 🚀`, 
            parse_mode: 'Markdown' 
          })
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Producto entregado automáticamente al cliente.`, parse_mode: 'Markdown' })
        });
      }
      else if (data.startsWith('reject_payment_')) {
        const targetChatId = data.replace('reject_payment_', '');
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetChatId, text: `❌ Tu comprobante no pudo ser verificado. Contacta con soporte.`, parse_mode: 'Markdown' })
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general:', error);
    return res.status(500).json({ error: error.message });
  }
}
