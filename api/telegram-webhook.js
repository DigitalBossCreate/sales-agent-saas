import { obtenerProductos, gestionarCliente } from '../lib/bot-core.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1812341990';
const TELEGRAM_TOKEN = '8567773547:AAEE5QHxxSMOhnWyjR0QLS1R2vzTO9u3Dws';

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
    return res.status(200).json({ status: 'Digital Boss Bot Core is running' });
  }

  try {
    const update = req.body;
    const token = TELEGRAM_TOKEN;

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

      // --- FUNCIONES DE ADMINISTRACIÓN ---
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
          if (qrPago) nuevoObjeto.qr_pago_url = qrPago;
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
          if (qrAct) datosActualizar.qr_pago_url = qrAct;
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

      // --- COMANDO LIBERAR CLIENTE ---
      if (text.startsWith('/liberar ')) {
        const targetId = text.replace('/liberar ', '').trim();
        await supabase.from('clientes').update({ estado_chat: 'ACTIVO' }).eq('telegram_id', targetId);
        
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetId, text: `🎁 *¡Activación completada con éxito!*\nYa puedes disfrutar de tu cuenta. Escribe *"catalogo"*. 🔥`, parse_mode: 'Markdown' })
        });
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Cliente ${targetId} liberado.` })
        });
        return res.status(200).json({ success: true });
      }

      // --- FILTRO PAUSA DE CORREO ---
      const { data: clienteInfo } = await supabase.from('clientes').select('estado_chat').eq('telegram_id', userId).single();

      if (clienteInfo && clienteInfo.estado_chat === 'ESPERANDO_CORREO') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID || chatId,
            text: `✉️ *Correo recibido del cliente (\`${chatId}\`)*:\n\n\`${update.message.text}\`\n\n_Realiza la activación y luego escribe:_ \`/liberar ${chatId}\``,
            parse_mode: 'Markdown'
          })
        });

        await supabase.from('clientes').update({ estado_chat: 'EN_ESPERANDO_ENTREGA' }).eq('telegram_id', userId);

        const resp = `⏳ *¡Correo recibido correctamente!* Estamos procesando tu pedido. En breve te enviamos tus datos por aquí. 🚀`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: resp, parse_mode: 'Markdown' })
        });
        return res.status(200).json({ success: true });
      }

      if (clienteInfo && clienteInfo.estado_chat === 'EN_ESPERANDO_ENTREGA') {
        return res.status(200).json({ success: true });
      }

      if (text === '/admin' || text === 'soy el admin') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `🔐 *Panel Admin Pro*\nTu ID: \`${chatId}\``, parse_mode: 'Markdown' })
        });
        return res.status(200).json({ success: true });
      }

      if (text.startsWith('no ') || text.includes('no quiero') || text.includes('no gracias')) {
        const msgNo = `Comprendo perfectamente, *${userName}* 👍. Aquí estaré si necesitas algo más. ¡Excelente día! 😊`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msgNo, parse_mode: 'Markdown' })
        });
        return res.status(200).json({ success: true });
      }

      if (text === 'hola' || text === 'buenas' || text === 'start' || text === '/start' || text === 'catalogo' || text === 'ver catalogo') {
        const productos = await obtenerProductos();
        let catText = `✨ *Catálogo de Herramientas & Cursos Digitales* ✨\n\nElige o escribe el nombre del producto que deseas consultar:\n\n`;
        const inlineKeyboard = [];

        productos.forEach(p => {
          catText += `📦 *${p.nombre}* - Bs. ${p.precio}\n`;
          inlineKeyboard.push([{ text: `🔍 Ver: ${p.nombre} (Bs. ${p.precio})`, callback_data: `ver_prod_${p.id}` }]);
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: catText,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: inlineKeyboard }
          })
        });
        return res.status(200).json({ success: true });
      }

      // 🧠 BÚSQUEDA INTELIGENTE DE PRODUCTO POR TEXTO
      const productos = await obtenerProductos();
      let productoSeleccionado = null;

      for (const p of productos) {
        const nombreLower = p.nombre.toLowerCase();
        const palabras = nombreLower.split(' ');
        const coincide = palabras.some(palabra => {
          if (palabra.length > 3 && text.includes(palabra.substring(0, 4))) return true;
          return text.includes(palabra);
        });

        if (coincide || text.includes(nombreLower)) {
          productoSeleccionado = p;
          break;
        }
      }

      if (productoSeleccionado) {
        const p = productoSeleccionado;
        const ventasTexto = `💡 *Información Oficial - ${p.nombre}*\n\n` +
          `✨ *Detalles:*\n${p.prompt_ventas || 'Acceso completo garantizado.'}\n\n` +
          `💰 *Inversión:* Bs. ${p.precio}\n\n👇 ¿Qué deseas hacer?`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: ventasTexto, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Comprar ${p.nombre} (Bs. ${p.precio})!`, callback_data: `start_purchase_${p.id}` }]
              ]
            }
          })
        });
        return res.status(200).json({ success: true });
      }

      const defaultMsg = 'No logré identificar exactamente el producto. Escribe *"catalogo"* para ver la lista completa de opciones disponibles. 😊';
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: defaultMsg })
      });
    } 
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = TELEGRAM_TOKEN;

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id, text: 'Cargando...' })
      });

      if (data.startsWith('ver_prod_')) {
        const prodId = data.replace('ver_prod_', '').trim();
        const { data: p } = await supabase.from('productos').select('*').eq('id', prodId).single();

        if (p) {
          const textoProd = `📦 *${p.nombre}*\n\n📝 ${p.prompt_ventas}\n\n💰 *Precio:* Bs. ${p.precio}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: textoProd,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: `🛒 ¡Comprar Ahora (Bs. ${p.precio})!`, callback_data: `start_purchase_${p.id}` }]
                ]
              }
            })
          });
        }
      }
      else if (data.startsWith('start_purchase_')) {
        const prodId = data.replace('start_purchase_', '').trim();
        const { data: prod } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const producto = prod || { id: prodId, nombre: 'Producto Digital', precio: 50 };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🎉 *¡Excelente decisión!*\n\n📦 *${producto.nombre}*\n💰 *Precio:* Bs. ${producto.precio}\n\n👇 Selecciona tu método de pago para emitir el QR:`, 
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
        const method = parts[1];
        const prodId = parts[2].trim();

        // Búsqueda segura con respaldo para evitar que se caiga si el ID no cruza exacto
        let nombreProd = 'Producto Digital';
        let precioProd = 50;
        let qrUrlToUse = QR_POR_DEFECTO;

        try {
          const { data: prod } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prod) {
            nombreProd = prod.nombre || nombreProd;
            precioProd = prod.precio || precioProd;
            if (prod.qr_pago_url && prod.qr_pago_url.trim() !== '') {
              qrUrlToUse = prod.qr_pago_url.trim();
            }
          }
        } catch (e) {}

        try {
          await supabase.from('pedidos').insert([{
            producto_id: prodId,
            monto: precioProd,
            estado: 'ESPERANDO_PAGO'
          }]);
        } catch (e) {}

        // Envío blindado de la foto del QR
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            photo: qrUrlToUse,
            caption: `📲 *Escanea el QR de ${method.toUpperCase()} para ${nombreProd}.*\n\nUna vez realizado, haz clic abajo para notificar al administrador:`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🔔 Ya realicé el pago (Avisar al Admin)`, callback_data: `notify_admin_${chatId}_${prodId}` }]
              ]
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
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `⏳ *Pago notificado.* Estamos verificando tu comprobante. ¡En un momento te entregamos tu acceso! 🚀`, 
            parse_mode: 'Markdown' 
          })
        });

        const adminDest = ADMIN_CHAT_ID || chatId;
        const adminAlertText = `🔔 *NUEVO PAGO PENDIENTE*\n\n👤 *Cliente Chat ID:* \`${targetChatId}\`\n📦 *Producto ID:* \`${prodId}\``;
        const adminKeyboard = {
          inline_keyboard: [
            [
              { text: `✅ Aprobar y Entregar`, callback_data: `approve_delivery_${targetChatId}_${prodId}` },
              { text: `❌ Rechazar`, callback_data: `reject_payment_${targetChatId}` }
            ]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: adminDest, text: adminAlertText, parse_mode: 'Markdown', reply_markup: adminKeyboard })
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
          await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('estado', 'ESPERANDO_PAGO');
        } catch (e) {}

        if (tipoEntrega === 'automatico') {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: targetChatId, 
              text: `¡Pago aprobado con éxito! 🎉\n\nTu producto: *${nombreProd}*\n🔗 *Enlace de Acceso / Drive:* ${entregableUrl}\n\n¡Gracias por tu compra! 🚀`, 
              parse_mode: 'Markdown' 
            })
          });

          setTimeout(async () => {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                chat_id: targetChatId, 
                text: `🎁 *¡Oferta exclusiva VIP!*\n\n¿Te gustaría ver más herramientas? Escribe *"catalogo"*. 🔥`, 
                parse_mode: 'Markdown' 
              })
            });
          }, 2000);

        } else {
          await supabase.from('clientes').update({ estado_chat: 'ESPERANDO_CORREO' }).eq('telegram_id', targetChatId);

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: targetChatId, 
              text: `¡Pago aprobado con éxito! 🎉\n\nPara activar tu acceso a *${nombreProd}*, por favor *escribe aquí tu correo electrónico* personal en el siguiente mensaje. ✉️`, 
              parse_mode: 'Markdown' 
            })
          });
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
