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

      // Registro o actualización en CRM
      const clienteId = await gestionarCliente(userId, userName, userUsername);

      // Comando de Administrador para obtener ID y verificar control
      if (text === '/admin' || text === 'soy el admin') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🔐 *Panel de Administrador Pro*\n\nTu Telegram Chat ID es: \`${chatId}\`\nEstado: Conectado a Supabase Storage y DB.`,
            parse_mode: 'Markdown'
          })
        });
        return res.status(200).json({ success: true });
      }

      // Flujo de compra dinámico consultando la BD de productos
      const isBuying = text.includes('comprar') || text.includes('quiero') || text.includes('adquirir') || text.includes('pagar') || text.includes('gemini');
      if (isBuying) {
        const productos = await obtenerProductos();
        const productoPrincipal = productos[0]; // Producto activo principal

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
            [{ text: `🔔 Ya realicé el pago (Avisar al Admin)`, callback_data: `notify_admin_${chatId}` }]
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

      // Respuesta por defecto
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: '¡Hola! Escribe "Quiero Gemini" o el nombre de tu producto para iniciar el proceso de compra automática. 🚀', 
          parse_mode: 'Markdown' 
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general en webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
