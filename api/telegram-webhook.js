import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const TELEGRAM_TOKEN = '8567773547:AAEE5QHxxSMOhnWyjR0QLS1R2vzTO9u3Dws';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot Core is running' });
  }

  try {
    const update = req.body;
    const token = TELEGRAM_TOKEN;

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const userName = update.message.from.first_name || 'Cliente';
      const text = (update.message.text || '').toLowerCase().trim();

      // Respuesta directa y rápida de prueba para verificar que el bot ya responde
      if (text.includes('hola') || text.includes('gemini') || text.includes('quiero')) {
        const respuesta = `¡Hola, *${userName}*! 👋 Bienvenido a Digital Boss. Veo que te interesa *Gemini*. ¿Deseas adquirirlo ahora por Bs. 67? 🚀`;
        
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: respuesta, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_gemini` }]
              ]
            }
          })
        });
        return res.status(200).json({ success: true });
      }

      // Respuesta predeterminada
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: `¡Hola ${userName}! Estoy aquí para ayudarte con tus herramientas digitales. Escribe *hola* o *gemini*. 😊`,
          parse_mode: 'Markdown'
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error crítico en webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
