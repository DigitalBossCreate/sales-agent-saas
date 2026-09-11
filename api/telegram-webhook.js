import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot is running' });
  }

  try {
    const update = req.body;

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const rawText = update.message.text || '';
      const text = rawText.toLowerCase().replace(/["'¿?¡!]/g, '').trim();
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';

      // 1. GESTIÓN DE CLIENTE (CRM)
      let clienteId = null;
      try {
        const { data: existingClient } = await supabase
          .from('clientes')
          .select('id')
          .eq('telegram_id', userId)
          .single();

        if (existingClient) {
          clienteId = existingClient.id;
          await supabase
            .from('clientes')
            .update({ ultima_interaccion: new Date(), username: userUsername, nombre: userName })
            .eq('id', clienteId);
        } else {
          const { data: newClient } = await supabase
            .from('clientes')
            .insert([{ telegram_id: userId, nombre: userName, username: userUsername, estado_comercial: 'NUEVO' }])
            .select('id')
            .single();
          if (newClient) clienteId = newClient.id;
        }
      } catch (clientErr) {
        console.error('Error CRM:', clientErr);
      }

      // 2. GUARDAR MENSAJE
      try {
        await supabase.from('mensajes_bot').insert([
          { chat_id: chatId, nombre: userName, mensaje: rawText }
        ]);
      } catch (dbError) {
        console.error('Error guardando mensaje:', dbError);
      }

      // 3. CONSULTAR CATÁLOGO Y MÉTODOS DE PAGO
      let productosList = [];
      try {
        const { data: products } = await supabase.from('productos').select('*');
        if (products) productosList = products;
      } catch (e) {}

      let paymentsList = [];
      try {
        const { data: payments } = await supabase.from('metodos_pago').select('*');
        if (payments) paymentsList = payments;
      } catch (e) {}

      // 4. DETECCIÓN DE COMPRA Y ASIGNACIÓN FORZOSA DE BOTONES
      const isBuying = text.includes('comprar') || text.includes('quiero') || text.includes('adquirir') || text.includes('pagar') || text.includes('gemini') || text.includes('si');
      
      let aiResponse = '';
      let inlineKeyboard = null;

      if (isBuying && clienteId) {
        const matchedProduct = productosList[0] || { nombre: 'Gemini Advanced 18 Meses', precio: 72.00 };
        
        try {
          await supabase.from('pedidos').insert([{
            cliente_id: clienteId,
            producto_id: matchedProduct.id || null,
            monto: matchedProduct.precio,
            estado: 'ESPERANDO_PAGO'
          }]);
        } catch (orderErr) {
          console.error('Error pedido:', orderErr);
        }

        aiResponse = `🎉 *¡Excelente!* \n\nHas seleccionado:\n📦 *${matchedProduct.nombre}*\n💰 *Precio:* $${matchedProduct.precio}\n\n👇 *Selecciona tu método de pago haciendo clic abajo:*`;

        if (paymentsList.length > 0) {
          inlineKeyboard = {
            inline_keyboard: paymentsList.map(pm => [
              { text: `💳 Pagar con ${pm.nombre} (${pm.moneda})`, callback_data: `pay_${pm.id}` }
            ])
          };
        } else {
          inlineKeyboard = {
            inline_keyboard: [
              [{ text: `💳 Transferencia Bancaria / QR`, callback_data: `pay_transferencia` }],
              [{ text: `💳 Tarjeta de Crédito / Débito`, callback_data: `pay_tarjeta` }]
            ]
          };
        }
      }

      // 5. SI NO ES COMPRA, LLAMAR A LA IA
      if (!aiResponse) {
        let catalogContext = productosList.length > 0 ? productosList.map(p => `- ${p.nombre} | Precio: $${p.precio} | Desc: ${p.descripcion}`).join('\n') : 'Gemini Advanced 18 Meses - $72';
        
        const systemPrompt = `Eres el agente de ventas de "Digital Boss". Catálogo:\n${catalogContext}\nResponde de forma comercial y breve.`;

        aiResponse = '¡Hola! Bienvenido a Digital Boss. ¿En qué puedo ayudarte?';
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'openai/gpt-oss-20b',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: rawText }
              ],
              temperature: 0.7
            })
          });

          const groqData = await groqRes.json();
          if (groqData.choices && groqData.choices.length > 0) {
            aiResponse = groqData.choices[0].message.content;
          }
        } catch (aiError) {
          aiResponse = `¡Hola! Tenemos disponible Gemini Advanced por $72. ¿Te gustaría adquirirlo?`;
        }
      }

      // 6. RESPUESTA A TELEGRAM
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const payload = {
        chat_id: chatId,
        text: aiResponse,
        parse_mode: 'Markdown'
      };

      if (inlineKeyboard) {
        payload.reply_markup = inlineKeyboard;
      }

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } 
    // 7. MANEJO DE CLICS EN LOS BOTONES
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = process.env.TELEGRAM_BOT_TOKEN;

      if (data.startsWith('pay_')) {
        const metodoId = data.replace('pay_', '');
        let responseText = `*Método de pago seleccionado.*\n\nPor favor realiza la transferencia por el monto exacto y envíanos tu comprobante por este medio. 🚀`;
        
        if (metodoId === 'transferencia') {
          responseText = `*Método seleccionado: Transferencia Bancaria / QR*\n\n📋 *Instrucciones:* Realiza el pago por el monto exacto.\n💳 *Datos:* Banco Nacional / QR Oficial de Digital Boss.\n\nEnvía tu comprobante por este chat para liberar tu acceso. 🚀`;
        } else if (metodoId === 'tarjeta') {
          responseText = `*Método seleccionado: Tarjeta de Crédito / Débito*\n\n📋 *Instrucciones:* Solicita el enlace seguro de pasarela de pagos al asesor.\n\nEnvía tu comprobante o confirmación por este chat. 🚀`;
        } else {
          const { data: pmData } = await supabase
            .from('metodos_pago')
            .select('*')
            .eq('id', metodoId)
            .single();

          if (pmData) {
            responseText = `*Método seleccionado: ${pmData.nombre}*\n\n📋 *Instrucciones:* ${pmData.instrucciones}\n💳 *Datos de pago:* \`${pmData.datos_pago}\`\n\nEnvíanos tu comprobante por este medio. 🚀`;
          }
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡Método seleccionado!' })
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: responseText,
            parse_mode: 'Markdown'
          })
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general:', error);
    return res.status(500).json({ error: error.message });
  }
}
