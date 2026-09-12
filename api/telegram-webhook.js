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
      const text = (update.message.text || '').trim().toLowerCase();

      // Si escribes admin, responde de inmediato sin importar nada más
      if (text === '/admin' || text === 'soy el admin' || text === '/nuevo') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🔐 *¡Panel de Administrador Activo!*\n\nTu Chat ID es: \`${chatId}\`\nEl bot está respondiendo correctamente. 🚀`, 
            parse_mode: 'Markdown' 
          })
        });
        return res.status(200).json({ success: true });
      }

      // Respuesta normal para cualquier otra cosa
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: `Mensaje recibido: "${text}". Escribe */admin* para entrar al panel.`, 
          parse_mode: 'Markdown' 
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
