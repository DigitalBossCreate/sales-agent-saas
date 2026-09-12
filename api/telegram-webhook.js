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
      } catch (clientErr) {}

      if (hasPhoto) {
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
              if (pedidoPendiente.productos?.nombre) productName = pedidoPendiente.productos.nombre;
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
                      { type: 'text', text: `Analiza este comprobante. Extrae el monto en JSON: {"monto": 0.00, "destinatario": "Texto"}` },
                      { type: 'image_url', image_url: { url: imageUrl } }
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
          if (pedidoId) await supabase.from('pedidos').update({ estado: 'PAGO_RECHAZADO_DESTINATARIO' }).eq('id', pedidoId);
          responseText = `❌ *Comprobante No Válido o No Legible*\n\nPor favor, **vuelve a enviar tu comprobante** nítido. 🔄`;
        } else if (!isAmountValid) {
          if (pedidoId) await supabase.from('pedidos').update({ estado: 'PAGO_RECHAZADO_MONTO' }).eq('id', pedidoId);
          responseText = `❌ *Monto Insuficiente*\n\nDetectamos Bs. ${extractedAmount}, el precio requerido es Bs. ${expectedAmount.toFixed(2)}. 🔄`;
        } else {
          if (pedidoId) await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('id', pedidoId);
          responseText = `¡Factura Digital - Pagado y Verificado! 🚀\nProducto: ${productName}\nMonto: Bs. ${extractedAmount.toFixed(2)}`;
        }

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: responseText, parse_mode: 'Markdown' })
        });

        return res.status(200).json({ success: true });
      }

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

        const aiResponse = `🎉 *¡Excelente elección!* \n\n📦 *${matchedProduct.nombre}*\n💰 *Precio:* Bs. ${matchedProduct.precio}\n\n👇 *Selecciona tu método de pago principal:*`;
        let inlineKeyboard = {
          inline_keyboard: [
            [{ text: `🇧🇴 Pagar con QR Takenos (Bs. 67)`, callback_data: `pay_takenos` }],
            [{ text: `💵 Pagar con USDT Binance (USD)`, callback_data: `pay_binance` }]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: aiResponse, parse_mode: 'Markdown', reply_markup: inlineKeyboard })
        });
        return res.status(200).json({ success: true });
      }

      let aiResponse = '¡Hola! Bienvenido al sistema. ¿En qué puedo ayudarte?';
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: aiResponse, parse_mode: 'Markdown' })
      });
    } 
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = process.env.TELEGRAM_BOT_TOKEN;

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '¡Método seleccionado!' })
      });

      if (data === 'pay_takenos') {
        // Enlace universal alojado de forma segura en Supabase Storage
        const qrTakenosUrl = `https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/takenos.jpeg`;
        const takenosText = `🇧🇴 *QR Takenos - Bs. 67.00*\n\n• **Titular:** Wilfredo Cuellar Nohe\n• **Entidad:** Takenos (NIT: 564163021)\n\n📲 *Haz clic en el botón de abajo para ver y escanear el QR:*`;

        const takenosKeyboard = {
          inline_keyboard: [
            [{ text: `🔍 Ver QR de Takenos en Pantalla`, url: qrTakenosUrl }]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: takenosText, 
            parse_mode: 'Markdown',
            reply_markup: takenosKeyboard 
          })
        });
      } 
      else if (data === 'pay_binance') {
        // Enlace universal alojado de forma segura en Supabase Storage
        const qrBinanceUrl = `https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/binance.jpeg`;
        const binanceText = `💵 *USDT Binance (TRC20)*\n\n• **Wallet:** \`TE1tMb4avzU1toWUNKAc8ReGeNyVZFRKxb\`\n• **Monto:** $10 USDT (Bs. 67)\n\n📲 *Haz clic en el botón de abajo para ver el QR de Binance:*`;

        const binanceKeyboard = {
          inline_keyboard: [
            [{ text: `🔍 Ver QR de Binance en Pantalla`, url: qrBinanceUrl }],
            [{ text: `🔔 Ya pagué en Binance (Avisar al Admin)`, callback_data: `notify_binance_${chatId}` }]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: binanceText, 
            parse_mode: 'Markdown', 
            reply_markup: binanceKeyboard 
          })
        });
      } 
      else if (data.startsWith('notify_binance_')) {
        const targetClientChatId = data.replace('notify_binance_', '');

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `⏳ *Pago notificado al administrador.* En breve te liberaremos el producto. 🚀`, parse_mode: 'Markdown' })
        });

        const adminDest = ADMIN_CHAT_ID || chatId; 
        const adminAlertText = `🔔 *NUEVO PAGO DE BINANCE PENDIENTE*\n\n👤 *Cliente ID:* \`${targetClientChatId}\`\n💰 *Monto:* $10 USDT / Bs. 67`;

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
          body: JSON.stringify({ chat_id: adminDest, text: adminAlertText, parse_mode: 'Markdown', reply_markup: adminKeyboard })
        });
      }
      else if (data.startsWith('admin_approve_')) {
        const targetClientChatId = data.replace('admin_approve_', '');

        try {
          await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('estado', 'ESPERANDO_PAGO');
        } catch (e) {}

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetClientChatId, text: `¡Pago verificado y aprobado! Disfruta de tu Gemini Advanced 18 Meses 🚀`, parse_mode: 'Markdown' })
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Producto entregado con éxito al cliente.`, parse_mode: 'Markdown' })
        });
      }
      else if (data.startsWith('admin_reject_')) {
        const targetClientChatId = data.replace('admin_reject_', '');

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetClientChatId, text: `❌ No pudimos verificar tu pago de Binance. Contacta a soporte.`, parse_mode: 'Markdown' })
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general:', error);
    return res.status(500).json({ error: error.message });
  }
}
