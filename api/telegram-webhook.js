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

    // 1. MANEJO DE MENSAJES DE TEXTO Y FOTOS (COMPROBANTES)
    if (update && update.message) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';
      
      const hasPhoto = update.message.photo && update.message.photo.length > 0;
      const rawText = update.message.text || (hasPhoto ? 'COMPROBANTE_FOTO' : '');
      const text = rawText.toLowerCase().replace(/["'¿?¡!]/g, '').trim();

      // GESTIÓN DE CLIENTE (CRM)
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

      // GUARDAR MENSAJE
      try {
        await supabase.from('mensajes_bot').insert([
          { chat_id: chatId, nombre: userName, mensaje: hasPhoto ? '[FOTO COMPROBANTE]' : rawText }
        ]);
      } catch (dbError) {
        console.error('Error guardando mensaje:', dbError);
      }

      const token = process.env.TELEGRAM_BOT_TOKEN;

      // A. SI EL CLIENTE ENVÍA UNA FOTO (COMPROBANTE)
      if (hasPhoto && clienteId) {
        try {
          // Buscar si tiene un pedido pendiente
          const { data: pedidoPendiente } = await supabase
            .from('pedidos')
            .select('*')
            .eq('cliente_id', clienteId)
            .eq('estado', 'ESPERANDO_PAGO')
            .order('id', { ascending: false })
            .limit(1)
            .single();

          if (pedidoPendiente) {
            await supabase
              .from('pedidos')
              .update({ estado: 'PAGO_ENVIADO' })
              .eq('id', pedidoPendiente.id);
          }
        } catch (pedErr) {
          console.error('Error actualizando pedido con comprobante:', pedErr);
        }

        const confirmText = `📥 *¡Comprobante recibido con éxito!* \n\nHemos registrado tu comprobante y se lo hemos enviado a nuestro equipo para su verificación. En breve te enviaremos tu enlace de acceso y los detalles de activación. ¡Gracias por tu compra en Digital Boss! 🚀`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: confirmText,
            parse_mode: 'Markdown'
          })
        });

        return res.status(200).json({ success: true });
      }

      // B. DETECCIÓN DE INTENCIÓN DE COMPRA
      const isBuying = text.includes('comprar') || text.includes('quiero') || text.includes('adquirir') || text.includes('pagar') || text.includes('gemini');

      if (isBuying) {
        let matchedProduct = { id: null, nombre: 'Gemini Advanced 18 Meses', precio: 72.00 };
        try {
          const { data: products } = await supabase.from('productos').select('*');
          if (products && products.length > 0) {
            matchedProduct = products[0];
          }
        } catch (e) {}

        if (clienteId) {
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
        }

        const aiResponse = `🎉 *¡Excelente elección!* \n\nHas seleccionado:\n📦 *${matchedProduct.nombre}*\n💰 *Precio:* $${matchedProduct.precio}\n\n👇 *Selecciona tu método de pago haciendo clic en los botones de abajo:*`;

        let inlineKeyboard = {
          inline_keyboard: [
            [{ text: `💳 Transferencia Bancaria / QR`, callback_data: `pay_transferencia` }],
            [{ text: `💳 Tarjeta de Crédito / Débito`, callback_data: `pay_tarjeta` }]
          ]
        };

        try {
          const { data: payments } = await supabase.from('metodos_pago').select('*');
          if (payments && payments.length > 0) {
            inlineKeyboard = {
              inline_keyboard: payments.map(pm => [
                { text: `💳 Pagar con ${pm.nombre} (${pm.moneda})`, callback_data: `pay_${pm.id}` }
              ])
            };
          }
        } catch (e) {}

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

      // C. SI NO ES COMPRA NI FOTO, LLAMAR A LA IA (GROQ)
      let catalogContext = 'Gemini Advanced 18 Meses - $72';
      try {
        const { data: products } = await supabase.from('productos').select('*');
        if (products && products.length > 0) {
          catalogContext = products.map(p => `- ${p.nombre} | Precio: $${p.precio} | Desc: ${p.descripcion}`).join('\n');
        }
      } catch (e) {}

      const systemPrompt = `Eres el agente de ventas de "Digital Boss". Catálogo:\n${catalogContext}\nResponde de forma comercial y breve.`;

      let aiResponse = '¡Hola! Bienvenido al sistema. ¿En qué puedo ayudarte?';
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

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiResponse,
          parse_mode: 'Markdown'
        })
      });
    } 
    // 2. MANEJO DE CLICS EN LOS BOTONES DE PAGO
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = process.env.TELEGRAM_BOT_TOKEN;

      if (data.startsWith('pay_')) {
        const metodoId = data.replace('pay_', '');
        let responseText = `*Método de pago seleccionado.*\n\nPor favor realiza la transferencia por el monto exacto y envíanos tu comprobante (captura de pantalla o foto) por este medio. 🚀`;
        
        if (metodoId === 'transferencia') {
          responseText = `*Método seleccionado: Transferencia Bancaria / QR*\n\n📋 *Instrucciones:* Realiza el pago por el monto exacto.\n💳 *Datos:* Banco Nacional / QR Oficial de Digital Boss.\n\nEnvía tu comprobante (captura de pantalla o foto) por este chat para verificar y liberar tu acceso. 🚀`;
        } else if (metodoId === 'tarjeta') {
          responseText = `*Método seleccionado: Tarjeta de Crédito / Débito*\n\n📋 *Instrucciones:* Solicita el enlace seguro de pasarela de pagos al asesor.\n\nEnvía tu comprobante o confirmación por este chat. 🚀`;
        } else {
          try {
            const { data: pmData } = await supabase
              .from('metodos_pago')
              .select('*')
              .eq('id', metodoId)
              .single();

            if (pmData) {
              responseText = `*Método seleccionado: ${pmData.nombre}*\n\n📋 *Instrucciones:* ${pmData.instrucciones}\n💳 *Datos de pago:* \`${pmData.datos_pago}\`\n\nEnvíanos tu comprobante por este medio para validar tu pago de inmediato. 🚀`;
            }
          } catch (e) {}
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
