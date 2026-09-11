import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
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

      // 1. Guardar mensaje en Supabase
      try {
        await supabase.from('mensajes_bot').insert([
          { chat_id: chatId, mensaje: text, nombre: userName }
        ]);
      } catch (dbError) {
        console.error('Error guardando en Supabase:', dbError);
      }

      // 2. Descubrir un modelo de lenguaje de chat válido (excluyendo guardas y clasificadores)
      let selectedModel = 'llama-3.3-70b-versatile';
      try {
        const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
        });
        const modelsData = await modelsRes.json();
        if (modelsData && modelsData.data) {
          const chatModel = modelsData.data.find(m => 
            !m.id.includes('guard') && 
            !m.id.includes('prompt') && 
            !m.id.includes('whisper') && 
            (m.id.includes('llama') || m.id.includes('mixtral') || m.id.includes('gemma'))
          );
          if (chatModel) {
            selectedModel = chatModel.id;
          }
        }
      } catch (err) {
        console.warn('Usando modelo por defecto:', err);
      }

      // 3. Consultar a Groq con el modelo de chat detectado
      let aiResponse = '¡Hola! No pude conectar con la IA.';
      
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              {
                role: 'system',
                content: 'Eres un asistente de ventas amable, profesional y conciso para un negocio digital.'
              },
              {
                role: 'user',
                content: text
              }
            ],
            temperature: 0.7
          })
        });

        const groqData = await groqRes.json();
        
        if (groqData.choices && groqData.choices.length > 0) {
          aiResponse = groqData.choices[0].message.content;
        } else if (groqData.error) {
          aiResponse = `Error de Groq (${selectedModel}): ${groqData.error.message}`;
        }
      } catch (aiError) {
        aiResponse = `Excepción de red: ${aiError.message}`;
      }

      // 4. Enviar la respuesta a Telegram
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

      await fetch(telegramApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiResponse
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error procesando el webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
