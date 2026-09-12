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
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';
      
      const hasPhoto = update.message.photo && update.message.photo.length > 0;
      const rawText = update.message.text || '';
      const text = rawText.toLowerCase().replace(/["'¿?¡!]/g, '').trim();

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

      // 2. SI EL CLIENTE ENVÍA UNA FOTO -> ANÁLISIS DE VISIÓN FLEXIBLE Y ROBUSTO
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
        } catch (fileErr) {
          console.error('Error obteniendo ruta de archivo Telegram:', fileErr);
        }

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

        let extractedAmount = 0;
        let extractedDestinatario = '';
        let extractedInfo = '';

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
                        text: `Analiza esta imagen de comprobante de pago completo (incluso si está un poco cortada o inclinada). Extrae:
1. Cualquier monto numérico visible de pago (ej. 67, 70, etc., o 0 si no se ve).
2. El texto del destinatario o cuenta (ej. CUELLAR, WILFREDO, Takenos, etc.).
3. Los números de cuenta, celular o datos visibles (ej. 62211864).
Responde estrictamente en formato JSON válido con esta estructura exacta y sin texto adicional: {"monto": 0.00, "destinatario": "Texto", "identificador": "Texto"}`
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
              const jsonContent = JSON.parse(visionData.choices[0].message.content.trim());
              if (jsonContent) {
                if (typeof jsonContent.monto === 'number') extractedAmount = jsonContent.monto;
                if (typeof jsonContent.destinatario === 'string') extractedDestinatario = jsonContent.destinatario.trim();
                if (typeof jsonContent.identificador === 'string') extractedInfo = jsonContent.identificador.trim();
              }
            }
          } catch (visionErr) {
            console.error('Error en análisis de visión JSON Groq:', visionErr);
          }
        }

        // VALIDACIÓN FLEXIBLE: Si la cuenta destino es correcta (62211864 o Wilfredo/Takenos), aprobamos el pago (permitiendo si el monto es mayor o si la foto salió cortada pero la cuenta es 100% tuya)
        const normalizeStr = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const destNorm = normalizeStr(extractedDestinatario);
        const infoNorm = normalizeStr(extractedInfo);
        
        const hasWilfredo = destNorm.includes('wilfredo');
        const hasCuellar = destNorm.includes('cuellar');
        
        const isAccountValid = (
          (hasWilfredo && hasCuellar) || 
          destNorm.includes('takenos') || 
          destNorm.includes('yolo pago') || 
          infoNorm.includes('62211864') ||
          infoNorm.includes('6207125') ||
          infoNorm.includes('564163021')
        );

        // Se aprueba si el número de cuenta/destinatario es tuyo Y el monto es >= esperado (o si la cuenta es tuya y la foto salió cortada sin mostrar monto)
        const isPaymentValid = isAccountValid && (extractedAmount >= expectedAmount || extractedAmount === 0);

        let responseText = '';

        if (!isAccountValid) {
          if (pedidoId) {
            await supabase.from('pedidos').update({ estado: 'PAGO_RECHAZADO_DESTINATARIO' }).eq('id', pedidoId);
          }
          responseText = `❌ *Pago Rechazado / Destinatario Inválido*\n\nEl comprobante indica que fue enviado a *"${extractedDestinatario || 'Desconocido'}"*, el cual no corresponde a nuestras cuentas oficiales.\n\nPor favor verifica tu pago. ⚠️`;
        } else if (extractedAmount > 0 && extractedAmount < expectedAmount) {
          if (pedidoId) {
            await supabase.from('pedidos').update({ estado: 'PAGO_RECHAZADO_MONTO' }).eq('id', pedidoId);
          }
          responseText = `❌ *Pago Rechazado / Monto Insuficiente*\n\nHemos detectado un monto de *Bs. ${extractedAmount}*, el cual es menor al precio requerido de *Bs. ${expectedAmount.toFixed(2)}*.\n\nPor favor, completa el pago por el monto correcto. 🤝`;
        } else {
          // PAGO EXITOSO Y VALIDADO
          if (pedidoId) {
            await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('id', pedidoId);
          }
          responseText = `¡Hola!\nAquí tienes el comprobante de compra de tu *${productName}*:\n\n\`\`\`text\nDigital Boss - Factura Digital\n-------------------------------\nProducto: ${productName}\nPrecio Pagado: Bs. ${extractedAmount > 0 ? extractedAmount.toFixed(2) : expectedAmount.toFixed(2)}\nDestinatario: ${extractedDestinatario || 'Wilfredo Cuellar Nohe'}\nFecha de compra: ${new Date().toISOString().split('T')[0]}\nMétodo de pago: QR / Transferencia\nEstado: Pagado\n\nGracias por tu compra. Si necesitas algo más, avísanos.\n\`\`\`\n\n¡Disfruta de tu suscripción! 🚀`;
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
          } catch (orderErr) {}
        }

        const aiResponse = `🎉 *¡Excelente elección!* \n\nHas seleccionado:\n📦 *${matchedProduct.nombre}*\n💰 *Precio:* Bs. ${matchedProduct.precio}\n\n👇 *Selecciona tu método de pago principal haciendo clic abajo:*`;

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

      // 5. SI NO ES COMPRA NI FOTO, LLAMAR A LA IA (GROQ)
      let catalogContext = 'Gemini Advanced 18 Meses - Bs 67';
      try {
        const { data: products } = await supabase.from('productos').select('*');
        if (products && products.length > 0) {
          catalogContext = products.map(p => `- ${p.nombre} | Precio: Bs. ${p.precio} | Desc: ${p.descripcion}`).join('\n');
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
        aiResponse = `¡Hola! Tenemos disponible Gemini Advanced por Bs. 67. ¿Te gustaría adquirirlo?`;
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
    // 6. MANEJO DE CLICS EN LOS BOTONES DE PAGO
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = process.env.TELEGRAM_BOT_TOKEN;

      if (data === 'pay_takenos') {
        const responseText = `*Método seleccionado: QR Takenos / Bs. 67.00*\n\n📋 *Instrucciones:* Realiza la transferencia por el monto exacto de **Bs. 67.00** a nombre de **Wilfredo Cuellar Nohe** (Cel: 62211864 / NIT: 6207125).\n\nEnvía tu comprobante en foto por este chat para validarlo automáticamente. 🚀`;

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡QR Takenos seleccionado!' })
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
      } else if (data === 'pay_binance') {
        const responseText = `*Método seleccionado: USDT Binance (TRC20)*\n\n📋 *Instrucciones:* Realiza el depósito en USDT a la siguiente dirección de red TRC20:\n\`TE1tMb4avzU1toWUNKAc8ReGeNyVZFRKxb\`\n\nEnvía tu comprobante o captura de la transacción por este chat para validarlo. 🚀`;

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡Binance seleccionado!' })
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
