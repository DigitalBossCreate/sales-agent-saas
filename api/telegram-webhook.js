import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot Core is running' });
  }

  try {
    const update = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (update && update.message) {
      const chatId = update.message.chat.id.toString();
      const text = (update.message.text || '').trim();
      const textLower = text.toLowerCase();

      // ==========================================
      // 1. COMANDO ADMIN (Prioridad absoluta)
      // ==========================================
      if (textLower === '/admin' || textLower === 'soy el admin' || textLower === '/nuevo') {
        const adminMsg = `🔐 *Panel de Administrador Pro*\n\nTu Telegram Chat ID es: \`${chatId}\`\n\n🛠️ *Comandos Disponibles:*\n• /nuevo (Crear producto guiado)\n• /catalogo_admin (Ver productos)\n• /eliminar [ID] (Borrar producto)`;
        
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: adminMsg, 
            parse_mode: 'Markdown' 
          })
        });
        return res.status(200).json({ success: true });
      }

      // ==========================================
      // 2. FLUJO NORMAL DEL BOT
      // ==========================================
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: `¡Hola! Bienvenido a Digital Boss. Soy tu asesor de inteligencia artificial. Escribe */admin* para ver el panel de control. 😊`, 
          parse_mode: 'Markdown' 
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general:', error);
    return res.status(500).json({ error: error.message });
  }
}
