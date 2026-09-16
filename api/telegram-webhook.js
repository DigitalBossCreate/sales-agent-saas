import { gestionarCliente } from '../lib/bot-core.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1812341990';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8567773547:AAEE5QHxxSMOhnWyjR0QLS1R2vzTO9u3Dws';

const QR_POR_DEFECTO_TAKENOS = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/default-qr-takenos.jpg';
const QR_POR_DEFECTO_BINANCE = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/default-qr-binance.jpg';

async function obtenerProductosDirecto() {
  try {
    const { data, error } = await supabase.from('productos').select('*');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error obteniendo productos:', e.message);
    return [];
  }
}

async function guardarMensajeHistorial(telegramId, rol, mensaje) {
  try {
    await supabase.from('historial_chat').insert([{
      telegram_id: telegramId,
      rol: rol,
      mensaje: mensaje
    }]);
  } catch (e) {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot Core V6.7 is running' });
  }

  try {
    const update = req.body;
    const token = TELEGRAM_TOKEN;

    if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id, text: 'Procesando...' })
      });

      // 🛒 FLUJO DE COMPRA DIRECTO (Usa prefijo ultracorto 'b_' en vez de start_purchase_)
      if (data.startsWith('b_')) {
        const prodId = data.replace('b_', '').trim();
        let nombreP = 'Producto Digital';
        let precioP = 50;

        try {
          const { data: prod } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prod) {
            nombreP = prod.nombre || nombreP;
            precioP = prod.precio || precioP;
          }
        } catch (e) {}

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🎉 *${nombreP}*\n💰 *Precio:* Bs. ${precioP}\n\nSelecciona tu método de pago:`, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${precioP})`, callback_data: `pt_${prodId}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pb_${prodId}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('v_')) {
        const prodId = data.replace('v_', '').trim();
        let videoUrl = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/video%20gemini/video%20para%20gemini.mp4';
        
        try {
          const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prodData && prodData.video_url) videoUrl = prodData.video_url;
        } catch (e) {}
        
        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            video: videoUrl,
            caption: `🎥 *Demostración en Vivo*`,
            reply_markup: { inline_keyboard: [[{ text: `🛒 ¡Comprar Ahora!`, callback_data: `b_${prodId}` }]] }
          })
        });
      }
      // 💳 PROCESAMIENTO DE PAGO (Takenos = pt_, Binance = pb_)
      else if (data.startsWith('pt_') || data.startsWith('pb_')) {
        const isBinance = data.startsWith('pb_');
        const method = isBinance ? 'binance' : 'takenos';
        const prodId = data.replace(isBinance ? 'pb_' : 'pt_', '').trim();

        let qrUrl = '';
        let nombreProd = 'Producto Digital';
        let precioProd = 50;

        try {
          const { data: prod } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prod) {
            nombreProd = prod.nombre || nombreProd;
            precioProd = prod.precio || precioProd;

            if (method === 'takenos') {
              if (prod.qr_pago_url && typeof prod.qr_pago_url === 'string' && prod.qr_pago_url.trim().startsWith('http')) {
                qrUrl = prod.qr_pago_url.trim();
              }
            } else if (method === 'binance') {
              if (prod.qr_binance_url && typeof prod.qr_binance_url === 'string' && prod.qr_binance_url.trim().startsWith('http')) {
                qrUrl = prod.qr_binance_url.trim();
              }
            }
          }
        } catch (e) {}

        if (!qrUrl || !qrUrl.startsWith('http')) {
          qrUrl = (method === 'binance') ? QR_POR_DEFECTO_BINANCE : QR_POR_DEFECTO_TAKENOS;
        }

        try {
          await supabase.from('pedidos').insert([{
            producto_id: prodId,
            monto: precioProd,
            estado: 'ESPERANDO_PAGO',
            telegram_id: String(chatId),
            metodo_pago: method
          }]);
        } catch (e) {}

        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: qrUrl,
            caption: `📲 *Escanea el QR de ${method.toUpperCase()} para ${nombreProd}.*\n\nHaz clic abajo cuando realices el pago:`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: `🔔 Ya realicé el pago (Avisar al Admin)`, callback_data: `notify_admin_${chatId}_${prodId}` }]]
            }
          })
        });
      }
      else if (data.startsWith('notify_admin_')) {
        const parts = data.split('_');
        const targetChatId = parts[2];
        const prodId = parts[3].trim();

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `⏳ *Pago notificado.* Verificando comprobante... 🚀`, parse_mode: 'Markdown' })
        });

        const adminDest = ADMIN_CHAT_ID || chatId;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: adminDest, 
            text: `🔔 *NUEVO PAGO PENDIENTE*\n👤 Cliente: \`${targetChatId}\`\n📦 Producto ID: \`${prodId}\``, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: `✅ Aprobar y Entregar`, callback_data: `approve_delivery_${targetChatId}_${prodId}` },
                { text: `❌ Rechazar`, callback_data: `reject_payment_${targetChatId}` }
              ]]
            }
          })
        });
      }
      else if (data.startsWith('approve_delivery_')) {
        const parts = data.split('_');
        const targetChatId = parts[2];
        const prodId = parts[3].trim();

        let entregableUrl = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt';
        let nombreProd = 'Producto Digital';
        let tipoEntrega = 'manual';

        try {
          const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prodData) {
            nombreProd = prodData.nombre;
            tipoEntrega = (prodData.tipo_entrega || 'manual').toLowerCase();
            if (prodData.url_drive) entregableUrl = prodData.url_drive;
            else if (prodData.pdf_url) entregableUrl = prodData.pdf_url;
          }

          await supabase.from('pedidos')
            .update({ estado: 'PAGADO' })
            .eq('telegram_id', String(targetChatId))
            .eq('producto_id', prodId)
            .eq('estado', 'ESPERANDO_PAGO');

        } catch (e) {}

        if (tipoEntrega === 'automatico') {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: targetChatId, text: `¡Pago aprobado! 🎉\n\nTu producto: *${nombreProd}*\n🔗 *Enlace:* ${entregableUrl}`, parse_mode: 'Markdown' })
          });
        } else {
          await supabase.from('clientes').update({ estado_chat: 'ESPERANDO_CORREO' }).eq('telegram_id', String(targetChatId));
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: targetChatId, text: `¡Pago aprobado! 🎉\n\nPara activar *${nombreProd}*, escribe aquí tu correo electrónico personal. ✉️`, parse_mode: 'Markdown' })
          });
        }
      }

      return res.status(200).json({ success: true });
    }

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';
      const text = (update.message.text || '').toLowerCase().trim();
      const textOriginal = update.message.text || '';

      const isAdmin = String(userId) === String(ADMIN_CHAT_ID);
      await gestionarCliente(userId, userName, userUsername);
      await guardarMensajeHistorial(userId, 'user', text);

      if (isAdmin) {
        if (text === '/catalogo_admin' || text === 'catalogo') {
          const productos = await obtenerProductosDirecto();
          let listaMsg = `📦 *Catálogo Actual (${productos.length} productos)*:\n\n`;
          productos.forEach((p, index) => {
            listaMsg += `${index + 1}. *${p.nombre || 'Sin nombre'}* - Bs. ${p.precio || 0}\n`;
            listaMsg += `   ID: \`${p.id}\`\n`;
            listaMsg += `   _Borrar:_ \`/eliminar ${p.id}\`\n\n`;
          });
          listaMsg += `➕ *Comandos:* \`/nuevo\` o \`/actualizar ID | ...\``;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: listaMsg, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        if (text.startsWith('/eliminar ')) {
          const prodId = textOriginal.replace('/eliminar ', '').trim();
          await supabase.from('productos').delete().eq('id', prodId);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `🗑️ Producto eliminado correctamente.` })
          });
          return res.status(200).json({ success: true });
        }

        if (text.startsWith('/nuevo ')) {
          const partes = textOriginal.replace('/nuevo ', '').split('|');
          const nombreNuevo = partes[0] ? partes[0].trim() : 'Nuevo Producto';
          const precioNuevo = partes[1] && !isNaN(partes[1].trim()) ? parseFloat(partes[1].trim()) : 50;
          const promptNuevo = partes[2] ? partes[2].trim() : 'Acceso premium garantizado.';
          const img1 = partes[3] ? partes[3].trim() : null;
          const img2 = partes[4] ? partes[4].trim() : null;
          const vid1 = partes[5] ? partes[5].trim() : null;
          const vid2 = partes[6] ? partes[6].trim() : null;
          const pdfUrl = partes[7] ? partes[7].trim() : null;
          const qrPago = partes[8] ? partes[8].trim() : null;
          const tipoEntregaNuevo = partes[9] ? partes[9].trim().toLowerCase() : 'manual';
          const urlDriveNuevo = partes[10] ? partes[10].trim() : null;

          const nuevoObjeto = { nombre: nombreNuevo, precio: precioNuevo, prompt_ventas: promptNuevo, tipo_entrega: tipoEntregaNuevo };
          if (img1) nuevoObjeto.imagen_url = img1;
          if (img2) nuevoObjeto.imagen_url_2 = img2;
          if (vid1) nuevoObjeto.video_url = vid1;
          if (vid2) nuevoObjeto.video_url_2 = vid2;
          if (pdfUrl) nuevoObjeto.pdf_url = pdfUrl;
          if (qrPago) {
            nuevoObjeto.qr_pago_url = qrPago;
            nuevoObjeto.qr_binance_url = qrPago;
          }
          if (urlDriveNuevo) nuevoObjeto.url_drive = urlDriveNuevo;

          await supabase.from('productos').insert([nuevoObjeto]);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `✅ *¡Producto creado con éxito!*\n📦 *${nombreNuevo}*`, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        if (text.startsWith('/actualizar ')) {
          const partes = textOriginal.replace('/actualizar ', '').split('|');
          const prodId = partes[0] ? partes[0].trim() : '';
          const nombreAct = partes[1] ? partes[1].trim() : '';
          const precioAct = partes[2] && partes[2].trim() !== '' ? parseFloat(partes[2].trim()) : null;
          const promptAct = partes[3] ? partes[3].trim() : '';
          const img1Act = partes[4] ? partes[4].trim() : '';
          const img2Act = partes[5] ? partes[5].trim() : '';
          const vid1Act = partes[6] ? partes[6].trim() : '';
          const vid2Act = partes[7] ? partes[7].trim() : '';
          const pdfAct = partes[8] ? partes[8].trim() : '';
          const qrAct = partes[9] ? partes[9].trim() : '';
          const tipoAct = partes[10] ? partes[10].trim().toLowerCase() : '';
          const urlDriveAct = partes[11] ? partes[11].trim() : '';

          const datosActualizar = {};
          if (nombreAct) datosActualizar.nombre = nombreAct;
          if (precioAct !== null && !isNaN(precioAct)) datosActualizar.precio = precioAct;
          if (promptAct) datosActualizar.prompt_ventas = promptAct;
          if (img1Act) datosActualizar.imagen_url = img1Act;
          if (img2Act) datosActualizar.imagen_url_2 = img2Act;
          if (vid1Act) datosActualizar.video_url = vid1Act;
          if (vid2Act) datosActualizar.video_url_2 = vid2Act;
          if (pdfAct) datosActualizar.pdf_url = pdfAct;
          if (qrAct) {
            datosActualizar.qr_pago_url = qrAct;
            datosActualizar.qr_binance_url = qrAct;
          }
          if (tipoAct) datosActualizar.tipo_entrega = tipoAct;
          if (urlDriveAct) datosActualizar.url_drive = urlDriveAct;

          await supabase.from('productos').update(datosActualizar).eq('id', prodId);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `🔄 *¡Producto actualizado!*\nID: \`${prodId}\``, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }
      }

      const { data: clienteInfo } = await supabase.from('clientes').select('estado_chat').eq('telegram_id', String(userId)).single();

      if (clienteInfo && clienteInfo.estado_chat === 'ESPERANDO_CORREO') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID || chatId,
            text: `✉️ *Correo recibido del cliente (\`${chatId}\`)*:\n\n\`${update.message.text}\`\n\n_Libéralo con:_ \`/liberar ${chatId}\``,
            parse_mode: 'Markdown'
          })
        });

        const resp = `⏳ *¡Correo recibido correctamente!* En breve te enviamos tus datos. 🚀`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: resp })
        });
        return res.status(200).json({ success: true });
      }

      if (text.startsWith('/liberar ')) {
        const targetId = text.replace('/liberar ', '').trim();
        await supabase.from('clientes').update({ estado_chat: 'ACTIVO' }).eq('telegram_id', targetId);
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Cliente ${targetId} liberado.` })
        });
        return res.status(200).json({ success: true });
      }

      const textoLimpio = text.trim();
      
      if (
        textoLimpio.includes('hola') || 
        textoLimpio.includes('buen') || 
        textoLimpio.includes('buno') || 
        textoLimpio.includes('tardes') || 
        textoLimpio.includes('noches') || 
        textoLimpio.includes('que producto') || 
        textoLimpio.includes('catalogo') || 
        textoLimpio.includes('catálogo') || 
        textoLimpio.includes('curso') || 
        textoLimpio.includes('vende') || 
        textoLimpio.includes('info') || 
        textoLimpio.includes('ayuda') || 
        textoLimpio === 'start' || 
        textoLimpio === '/start'
      ) {
        const productos = await obtenerProductosDirecto();
        
        if (productos.length === 0) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `¡Hola, *${userName}*! 👋 Bienvenido. Pronto tendremos cursos disponibles para ti. 🚀`, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        let catalogoMsg = `¡Hola, *${userName}*! 👋 Bienvenido. Aquí tienes nuestros productos y cursos disponibles:\n\n`;
        const inlineKeyboard = [];
        
        productos.forEach((p) => {
          catalogoMsg += `📦 *${p.nombre}*\n💰 Precio: Bs. ${p.precio}\n\n`;
          // 🛡️ Usamos prefijo corto 'b_' para los botones del catálogo general
          inlineKeyboard.push([{ text: `👉 Ver ${p.nombre}`, callback_data: `b_${p.id}` }]);
        });

        catalogoMsg += `Haz clic en un botón abajo o escribe el nombre del curso que te interesa:`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: catalogoMsg, 
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: inlineKeyboard }
          })
        });
        return res.status(200).json({ success: true });
      }

      const productos = await obtenerProductosDirecto();
      let productoSeleccionado = null;

      for (const p of productos) {
        const nombreP = (p.nombre || '').toLowerCase().trim();
        if (text === nombreP || text.includes(nombreP) || (nombreP.length > 3 && text.includes(nombreP))) {
          productoSeleccionado = p;
          break;
        }
      }

      if (!productoSeleccionado) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `Mmm... no encontré un producto con ese nombre exacto 😅.\n\nEscribe *catalogo* para ver la lista completa de cursos disponibles.`, 
            parse_mode: 'Markdown' 
          })
        });
        return res.status(200).json({ success: true });
      }

      if (text.includes('video') || text.includes('ver')) {
        const p = productoSeleccionado;
        const videoUrl = p.video_url || 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/video%20gemini/video%20para%20gemini.mp4';
        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            video: videoUrl,
            caption: `🎥 *Mira ${p.nombre} en acción.*\n\n💰 Inversión: *Bs. ${p.precio}*`,
            parse_mode: 'Markdown',
            // 🛡️ Usamos 'b_' aquí también
            reply_markup: { inline_keyboard: [[{ text: `🛒 ¡Comprar Ahora!`, callback_data: `b_${p.id}` }]] }
          })
        });
        return res.status(200).json({ success: true });
      }

      if (text.includes('comprar') || text.includes('pagar') || text.includes('quiero')) {
        const p = productoSeleccionado;
        const compraMsg = `🎉 *¡Excelente decisión!*\n\n📦 *${p.nombre}*\n💰 *Precio:* Bs. ${p.precio}\n\n👇 Selecciona tu método de pago:`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: compraMsg, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${p.precio})`, callback_data: `pt_${p.id}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pb_${p.id}` }]
              ]
            }
          })
        });
        return res.status(200).json({ success: true });
      }

      const p = productoSeleccionado;
      const ventasTexto = `💡 *Información - ${p.nombre}*\n\n📝 ${p.prompt_ventas || 'Acceso completo.'}\n\n💰 *Precio:* Bs. ${p.precio}\n\n¿Deseas adquirirlo? 👇`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: ventasTexto, 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: `🛒 ¡Comprar Ahora!`, callback_data: `b_${p.id}` }],
              [{ text: `🎥 Ver Video`, callback_data: `v_${p.id}` }]
            ]
          }
        })
      });
      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
