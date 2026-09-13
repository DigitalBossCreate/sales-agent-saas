import { obtenerProductos, gestionarCliente } from '../lib/bot-core.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1812341990';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8567773547:AAEE5QHxxSMOhnWyjR0QLS1R2vzTO9u3Dws';

const QR_POR_DEFECTO = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/default-qr.jpg';

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
    return res.status(200).json({ status: 'Digital Boss Bot Core V5.4 is running' });
  }

  try {
    const update = req.body;
    const token = TELEGRAM_TOKEN;

    // --- MANEJADOR DE BOTONES (CALLBACK QUERY) ---
    if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id, text: 'Procesando...' })
      });

      if (data.startsWith('send_demo_video_')) {
        const prodId = data.replace('send_demo_video_', '');
        const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const videoUrl = prodData?.video_url || 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/video%20gemini/video%20para%20gemini.mp4';
        
        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            video: videoUrl,
            caption: `🎥 *Demostración en Vivo*`,
            reply_markup: { inline_keyboard: [[{ text: `🛒 ¡Comprar Ahora!`, callback_data: `start_purchase_${prodId}` }]] }
          })
        });
      }
      else if (data.startsWith('start_purchase_')) {
        const prodId = data.replace('start_purchase_', '');
        const { data: prod } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const producto = prod || { id: prodId, nombre: 'Producto Digital', precio: 67 };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🎉 *${producto.nombre}*\n💰 *Precio:* Bs. ${producto.precio}\n\nSelecciona tu método de pago:`, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${producto.precio})`, callback_data: `pay_takenos_${producto.id}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${producto.id}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('pay_takenos_') || data.startsWith('pay_binance_')) {
        const parts = data.split('_');
        const method = parts[1]; // 'takenos' o 'binance'
        const prodId = parts[2];

        const { data: prod } = await supabase.from('productos').select('*').eq('id', prodId).single();
        
        let qrUrl = QR_POR_DEFECTO;
        let nombreProd = 'Producto Digital';
        let precioProd = 67;

        if (prod) {
          nombreProd = prod.nombre || nombreProd;
          precioProd = prod.precio || precioProd;

          if (method === 'takenos') {
            if (prod.qr_pago_url && prod.qr_pago_url.trim() !== '') {
              qrUrl = prod.qr_pago_url.trim();
            } else if (prod.imagen_url && prod.imagen_url.trim() !== '') {
              qrUrl = prod.imagen_url.trim();
            }
          } else if (method === 'binance') {
            if (prod.qr_binance_url && prod.qr_binance_url.trim() !== '') {
              qrUrl = prod.qr_binance_url.trim();
            }
          }
        }

        try {
          await supabase.from('pedidos').insert([{ producto_id: prodId, monto: precioProd, estado: 'ESPERANDO_PAGO' }]);
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
        const prodId = parts[3];

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
        const prodId = parts[3];

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
          await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('estado', 'ESPERANDO_PAGO');
        } catch (e) {}

        if (tipoEntrega === 'automatico') {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: targetChatId, text: `¡Pago aprobado! 🎉\n\nTu producto: *${nombreProd}*\n🔗 *Enlace:* ${entregableUrl}`, parse_mode: 'Markdown' })
          });
        } else {
          await supabase.from('clientes').update({ estado_chat: 'ESPERANDO_CORREO' }).eq('telegram_id', targetChatId);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: targetChatId, text: `¡Pago aprobado! 🎉\n\nPara activar *${nombreProd}*, escribe aquí tu correo electrónico personal. ✉️`, parse_mode: 'Markdown' })
          });
        }
      }

      return res.status(200).json({ success: true });
    }

    // --- MANEJADOR DE MENSAJES DE CHAT ---
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
          const productos = await obtenerProductos();
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

      const { data: clienteInfo } = await supabase.from('clientes').select('estado_chat').eq('telegram_id', userId).single();

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

      // 🧠 BÚSQUEDA MULTIPRODUCTO MEJORADA (Busca coincidencias exactas o parciales en todo el nombre del producto)
      const productos = await obtenerProductos();
      let productoSeleccionado = productos.find(p => text.includes(p.nombre.toLowerCase()) || p.nombre.toLowerCase().split(' ').some(palabra => palabra.length > 3 && text.includes(palabra))) || productos[0];

      if ((text === 'hola' || text === 'start' || text === '/start' || text === 'catalogo')) {
        const saludoMsg = `¡Hola, *${userName}*! 👋 Bienvenido al catálogo. ¿Qué herramienta o curso deseas consultar hoy? 🚀`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: saludoMsg, parse_mode: 'Markdown' })
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
            reply_markup: { inline_keyboard: [[{ text: `🛒 ¡Comprar Ahora!`, callback_data: `start_purchase_${p.id}` }]] }
          })
        });
        return res.status(200).json({ success: true });
      }

      if (text.includes('comprar') || text.includes('pagar') || text.includes('quiero') || text.includes('catalogo')) {
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
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${p.precio})`, callback_data: `pay_takenos_${p.id}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${p.id}` }]
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
              [{ text: `🛒 ¡Comprar Ahora!`, callback_data: `start_purchase_${p.id}` }],
              [{ text: `🎥 Ver Video`, callback_data: `send_demo_video_${p.id}` }]
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
