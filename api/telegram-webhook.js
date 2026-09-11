import { createClient } from '@supabase/supabase-js';

// URL y credenciales fijadas para evitar errores de DNS o variables de entorno en Vercel
const SUPABASE_URL = 'https://nvzovzegagabhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'aqui_tu_anon_key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Bot is running' });
  }

  try {
    const update = req.body;

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const userName = update.message.from.first_name || 'Usuario';

      // Ejemplo de inserción en Supabase para validar la conexión
      await supabase.from('mensajes_bot').insert([
        { chat_id: chatId, mensaje: text, nombre: userName }
      ]);

      // Aquí puedes integrar la respuesta de tu bot o IA
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

      await fetch(telegramApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `¡Hola ${userName}! Recibí tu mensaje correctamente.`
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error procesando el webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
