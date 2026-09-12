import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ''; 

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot is running' });
  }

  try {
    const update = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';
      
      const hasPhoto = update.message.photo && update.message.photo.length > 0;
      const rawText = update.message.text || '';
      const text = rawText.toLowerCase().replace(/["'¿?¡!]/g, '').trim();

      // COMANDO SECRETO PARA EL ADMIN
      if (text === '/admin' || text === 'soy el admin') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🔐 *Panel de Administrador*\n\nTu Telegram Chat ID numérico es: \`${chatId}\``,
            parse_mode: 'Markdown'
          })
        });
        return res.status(200).json({ success: true });
      }

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

      // 2. SI EL CLIENTE ENVÍA UNA FOTO -> ANÁLISIS DE VISIÓN BLINDADO
      if (hasPhoto) {
        try {
          await supabase.from('mensajes_bot').insert([
            { chat_id: chatId, nombre: userName, mensaje: '[FOTO COMPROBANTE]' }
          ]);
        } catch (dbError) {}

        const photoArray = update.message.photo;
        const bestPhoto = photoArray[photoArray.length - 1];
        const fileId = bestPhoto.file_id;

        let imageUrl = '';
        try {
          const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
          const fileData = await fileRes.json();
          if (fileData.ok) {
            const filePath = fileData.result.file_path;
            imageUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
          }
        } catch (fileErr) {}

        let expectedAmount = 67.00;
        let productName = 'Gemini Advanced 18 Meses';
        let pedidoId = null;

        if (clienteId) {
          try {
            const { data: pedidoPendiente } = await supabase
              .from('pedidos')
              .select('*, productos(nombre)')
              .eq('cliente_id', clienteId)
              .eq('estado', 'ESPERANDO_PAGO')
              .order('id', { ascending: false })
              .limit(1)
              .single();

            if (pedidoPendiente) {
              expectedAmount = Number(pedidoPendiente.monto);
              pedidoId = pedidoPendiente.id;
              if (pedidoPendiente.productos?.nombre) {
                productName = pedidoPendiente.productos.nombre;
              }
            }
          } catch (pedErr) {}
        }

        let extractedAmount = -1;
        let rawVisionText = '';
        let jsonValid = false;

        if (imageUrl) {
          try {
            const visionRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'qwen/qwen3.6-27b',
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: `Analiza detalladamente este comprobante de pago. Extrae todo el texto visible y el monto numérico exacto de la transferencia. Responde estrictamente en formato JSON válido: {"monto": 0.00, "destinatario": "Texto"}`
                      },
                      {
                        type: 'image_url',
                        image_url: { url: imageUrl }
                      }
                    ]
                  }
                ],
                response_format: { type: "json_object" },
                temperature: 0.0
              })
            });

            const visionData = await visionRes.json();
            if (visionData.choices && visionData.choices.length > 0) {
              rawVisionText = visionData.choices[0].message.content.trim();
              const jsonContent = JSON.parse(rawVisionText);
              if (jsonContent && typeof jsonContent.monto === 'number') {
                extractedAmount = jsonContent.monto;
                jsonValid = true;
              }
            }
          } catch (visionErr) {}
        }

        const normalizeStr = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const fullTextNorm = normalizeStr(rawVisionText);

        const hasWilfredo = fullTextNorm.includes('wilfredo');
        const hasCuellar = fullTextNorm.includes('cuellar');
        const isTakenos = fullTextNorm.includes('takenos') || fullTextNorm.includes('564163021');
        const isBank = (hasWilfredo && hasCuellar) || fullTextNorm.includes('62211864') || fullTextNorm.includes('6207125') || fullTextNorm.includes('yolo pago');

        const isDestinatarioValid = isTakenos || isBank;
        const isAmountValid = jsonValid && (extractedAmount >= expectedAmount);

        let responseText = '';

        if (!jsonValid || !isDestinatarioValid) {
          if (pedidoId) {
            await supabase.from('pedidos').update({ estado: 'PAGO_RECHAZADO_DESTINATARIO' }).eq('id', pedidoId);
          }
          responseText = `❌ *Comprobante No Válido o No Legible*\n\nNo pudimos verificar las cuentas oficiales (Takenos / Wilfredo Cuellar) o la imagen no es clara.\n\nPor favor, **vuelve a enviar tu comprobante** correcto y nítido. 🔄📸`;
        } else if (!isAmountValid) {
          if (pedidoId) {
            await supabase.from('pedidos').update({ estado: 'PAGO_RECHAZADO_MONTO' }).eq('id', pedidoId);
          }
          responseText = `❌ *Pago Rechazado / Monto Insuficiente*\n\nHemos detectado un monto de *Bs. ${extractedAmount}*, el cual es menor al precio requerido de *Bs. ${expectedAmount.toFixed(2)}*.\n\nPor favor, completa el pago y **vuelve a enviar tu comprobante** correcto. 🔄`;
        } else {
          if (pedidoId) {
            await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('id', pedidoId);
          }
          responseText = `¡Hola!\nAquí tienes el comprobante de compra de tu *${productName}*:\n\n\`\`\`text\nDigital Boss - Factura Digital\n-------------------------------\nProducto: ${productName}\nPrecio Pagado: Bs. ${extractedAmount.toFixed(2)}\nDestinatario: Verificado Oficial\nFecha de compra: ${new Date().toISOString().split('T')[0]}\nMétodo de pago: Takenos / QR / Transferencia\nEstado: Pagado\n\nGracias por tu compra. Si necesitas algo más, avísanos.\n\`\`\`\n\n¡Disfruta de tu suscripción! 🚀`;
        }

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: responseText,
            parse_mode: 'Markdown'
          })
        });

        return res.status(200).json({ success: true });
      }

      // 3. GUARDAR MENSAJE DE TEXTO
      try {
        await supabase.from('mensajes_bot').insert([
          { chat_id: chatId, nombre: userName, mensaje: rawText }
        ]);
      } catch (dbError) {}

      // 4. DETECCIÓN DE INTENCIÓN DE COMPRA
      const isBuying = text.includes('comprar') || text.includes('quiero') || text.includes('adquirir') || text.includes('pagar') || text.includes('gemini');

      if (isBuying) {
        let matchedProduct = { id: null, nombre: 'Gemini Advanced 18 Meses', precio: 67.00 };
        try {
          const { data: products } = await supabase.from('productos').select('*');
          if (products && products.length > 0) matchedProduct = products[0];
        } catch (e) {}

        if (clienteId) {
          try {
            await supabase.from('pedidos').insert([{
              cliente_id: clienteId,
              producto_id: matchedProduct.id || null,
              monto: matchedProduct.precio,
              estado: 'ESPERANDO_PAGO'
            }]);
          } catch (orderErr) {}
        }

        const aiResponse = `🎉 *¡Excelente elección!* \n\nHas seleccionado:\n📦 *${matchedProduct.nombre}*\n💰 *Precio:* Bs. ${matchedProduct.precio}\n\n👇 *Selecciona tu método de pago principal:*`;

        let inlineKeyboard = {
          inline_keyboard: [
            [{ text: `🇧🇴 Pagar con QR Takenos (Bs. 67)`, callback_data: `pay_takenos` }],
            [{ text: `💵 Pagar con USDT Binance (USD)`, callback_data: `pay_binance` }]
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

      // 5. RESPUESTA DE IA (GROQ)
      let catalogContext = 'Gemini Advanced 18 Meses - Bs 67';
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
      } catch (aiError) {}

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
    // 6. MANEJO DE CLICS Y BOTONES DE ADMIN
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = process.env.TELEGRAM_BOT_TOKEN;

      // BOTÓN TAKENOS: ENVÍA LA FOTO DEL QR DESDE SUPABASE STORAGE
      if (data === 'pay_takenos') {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡QR Takenos seleccionado!' })
        });

        // ⚠️ REEMPLAZA ESTA URL CON EL ENLACE PÚBLICO DE SUPABASE PARA TAKENOS
        const takenosQrUrl = 'https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/takenos-ok.jpeg';
        const captionText = `🇧🇴 *QR Takenos - Bs. 67.00*\n\n• **Titular:** Wilfredo Cuellar Nohe\n• **Entidad:** Takenos (NIT: 564163021)\n\n📸 Escanea este QR o transfiere y **envía tu comprobante en foto** por este chat para activar tu suscripción. 🚀`;

        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: takenosQrUrl,
            caption: captionText,
            parse_mode: 'Markdown'
          })
        });
      } 
      // BOTÓN BINANCE: ENVÍA LA FOTO DEL QR DE BINANCE DESDE SUPABASE STORAGE
      else if (data === 'pay_binance') {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡Binance seleccionado!' })
        });

        // ⚠️ REEMPLAZA ESTA URL CON EL ENLACE PÚBLICO DE SUPABASE PARA BINANCE
        const binanceQrUrl = 'https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/QR%20Binance.jpeg';
        const captionText = `💵 *USDT Binance (TRC20)*\n\n• **Wallet:** \`TE1tMb4avzU1toWUNKAc8ReGeNyVZFRKxb\`\n• **Monto:** $10 USDT (Bs. 67)\n\n👇 Escanea el QR y haz clic en el botón de abajo una vez realizado tu pago para notificar al administrador:`;

        const binanceKeyboard = {
          inline_keyboard: [
            [{ text: `🔔 Ya pagué en Binance (Avisar al Admin)`, callback_data: `notify_binance_${chatId}` }]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: binanceQrUrl,
            caption: captionText,
            parse_mode: 'Markdown',
            reply_markup: binanceKeyboard
          })
        });
      } 
      else if (data.startsWith('notify_binance_')) {
        const targetClientChatId = data.replace('notify_binance_', '');

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡Aviso enviado al administrador con éxito!' })
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⏳ *Pago notificado*\nHemos enviado tu aviso de pago al equipo administrativo de Digital Boss. En breve verificaremos la llegada de los fondos y te liberaremos el producto. 🚀`,
            parse_mode: 'Markdown'
          })
        });

        const adminDest = ADMIN_CHAT_ID || chatId; 
        const adminAlertText = `🔔 *NUEVO PAGO DE BINANCE PENDIENTE*\n\n👤 *Cliente Chat ID:* \`${targetClientChatId}\`\n📦 *Producto:* Gemini Advanced 18 Meses\n💰 *Monto:* $10 USDT / Bs. 67\n\n¿Deseas aprobar este pago y entregar el producto?`;

        const adminKeyboard = {
          inline_keyboard: [
            [
              { text: `✅ Aprobar y Entregar`, callback_data: `admin_approve_${targetClientChatId}` },
              { text: `❌ Rechazar`, callback_data: `admin_reject_${targetClientChatId}` }
            ]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: adminDest,
            text: adminAlertText,
            parse_mode: 'Markdown',
            reply_markup: adminKeyboard
          })
        });
      }
      else if (data.startsWith('admin_approve_')) {
        const targetClientChatId = data.replace('admin_approve_', '');

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡Pago aprobado con éxito!' })
        });

        try {
          await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('estado', 'ESPERANDO_PAGO');
        } catch (e) {}

        const successText = `¡Hola!\nAquí tienes el comprobante de compra de tu *Gemini Advanced 18 Meses*:\n\n\`\`\`text\nDigital Boss - Factura Digital\n-------------------------------\nProducto: Gemini Advanced 18 Meses\nPrecio Pagado: USDT / Binance\nEstado: Pagado y Verificado\n\nGracias por tu compra. ¡Disfruta de tu suscripción! 🚀\n\`\`\``;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetClientChatId,
            text: successText,
            parse_mode: 'Markdown'
          })
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ *Pago Aprobado con Éxito*\nSe le entregó el producto al cliente (\`${targetClientChatId}\`).`,
            parse_mode: 'Markdown'
          })
        });
      }
      else if (data.startsWith('admin_reject_')) {
        const targetClientChatId = data.replace('admin_reject_', '');

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: 'Pago rechazado.' })
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetClientChatId,
            text: `❌ *Pago No Verificado*\n\nNo pudimos confirmar tu depósito en Binance. Si realizaste el pago, por favor contacta al soporte. ⚠️`,
            parse_mode: 'Markdown'
          })
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `❌ *Pago Rechazado*\nSe notificó al cliente que no se pudo verificar su pago.`,
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
