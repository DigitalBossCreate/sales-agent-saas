import { obtenerProductos, gestionarCliente } from '../lib/bot-core.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1812341990';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8567773547:AAEE5QHxxSMOhnWyjR0QLS1R2vzTO9u3Dws';

// 🔗 QR Global por defecto original que sí funciona
const QR_POR_DEFECTO = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/default-qr.jpg';

// Función auxiliar para registrar mensajes en la memoria de chat
async function guardarMensajeHistorial(telegramId, rol, mensaje) {
  try {
    await supabase.from('historial_chat').insert([{
      telegram_id: telegramId,
      rol: rol,
      mensaje: mensaje
    }]);
  } catch (e) {
    console.error('Error guardando historial:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot Core V5.0 is running' });
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

      const clienteId = await gestionarCliente(userId, userName, userUsername);

      // Guardar mensaje entrante del usuario en el historial
      await guardarMensajeHistorial(userId, 'user', text);

      // --- FUNCIONES DE ADMINISTRACIÓN ---
      if (isAdmin) {
        if (text === '/catalogo_admin' || text === 'catalogo') {
          const productos = await obtenerProductos();
          let listaMsg = `📦 *Catálogo Actual (${productos.length} productos)*:\n\n`;
          productos.forEach((p, index) => {
            listaMsg += `${index + 1}. *${p.nombre || 'Sin nombre'}* - Bs. ${p.precio || 0}\n`;
            listaMsg += `   ID: \`${p.id}\`\n`;
            listaMsg += `   _Borrar:_ \`/eliminar ${p.id}\`\n`;
            listaMsg += `   _Actualizar:_ \`/actualizar ${p.id} | Nombre | Precio | Prompt | Img1 | Img2 | Video1 | Video2 | PDF | QR_Pago | Tipo | URL_Drive\`\n\n`;
          });
          listaMsg += `➕ *Para agregar un producto nuevo:*\n\`/nuevo Nombre | Precio | Prompt | Img1 | Img2 | Video1 | Video2 | PDF | QR_Pago | Tipo | URL_Drive\``;

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
            body: JSON.stringify({ chat_id: chatId, text: `🗑️ Producto con ID \`${prodId}\` eliminado correctamente.` })
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

          const nuevoObjeto = {
            nombre: nombreNuevo,
            precio: precioNuevo,
            prompt_ventas: promptNuevo,
            tipo_entrega: tipoEntregaNuevo
          };
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
            body: JSON.stringify({ chat_id: chatId, text: `✅ *¡Producto creado con éxito!*\n\n📦 *${nombreNuevo}*\n💰 *Precio:* Bs. ${precioNuevo}\n🚀 *Tipo:* ${tipoEntregaNuevo}`, parse_mode: 'Markdown' })
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
            body: JSON.stringify({ chat_id: chatId, text: `🔄 *¡Producto actualizado con éxito!*\nID: \`${prodId}\``, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }
      }

      // --- FILTRO INTELIGENTE DE PAUSA (Esperando correo) ---
      const { data: clienteInfo } = await supabase
        .from('clientes')
        .select('estado_chat')
        .eq('telegram_id', userId)
        .single();

      if (clienteInfo && clienteInfo.estado_chat === 'ESPERANDO_CORREO') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID || chatId,
            text: `✉️ *Correo recibido del cliente (\`${chatId}\`)*:\n\n\`${update.message.text}\`\n\n_Realiza la activación manual y luego libera al cliente con:_ \`/liberar ${chatId}\``,
            parse_mode: 'Markdown'
          })
        });

        const respuestaCorreo = `¡Perfecto! Hemos registrado tu correo. En unos minutos te enviaremos tus datos de acceso listos. 🚀`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: respuestaCorreo })
        });
        await guardarMensajeHistorial(userId, 'assistant', respuestaCorreo);
        return res.status(200).json({ success: true });
      }

      if (text === '/admin' || text === 'soy el admin') {
        const adminMsg = `🔐 *Panel de Administrador Pro*\n\nTu Telegram Chat ID es: \`${chatId}\``;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: adminMsg, parse_mode: 'Markdown' })
        });
        await guardarMensajeHistorial(userId, 'assistant', adminMsg);
        return res.status(200).json({ success: true });
      }

      // Comando de admin para liberar al cliente
      if (text.startsWith('/liberar ')) {
        const targetId = text.replace('/liberar ', '').trim();
        await supabase.from('clientes').update({ estado_chat: 'ACTIVO' }).eq('telegram_id', targetId);
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Cliente ${targetId} liberado y bot activado nuevamente.` })
        });
        return res.status(200).json({ success: true });
      }

      // --- MEMORIA E HISTORIAL DEL CLIENTE ---
      const { data: historialReciente } = await supabase
        .from('historial_chat')
        .select('mensaje, rol')
        .eq('telegram_id', userId)
        .order('creado_at', { ascending: false })
        .limit(4);

      const contextoPrevio = historialReciente ? historialReciente.map(h => h.mensaje).join(' ') : '';
      
      // Búsqueda inteligente de productos (Reconoce nombres y variaciones del catálogo)
      const productos = await obtenerProductos();
      let productoSeleccionado = productos.find(p => text.includes(p.nombre.toLowerCase().split(' ')[0])) || productos[0];

      const hablabaDeProducto = contextoPrevio.includes('gemin') || contextoPrevio.includes('ia') || contextoPrevio.includes('curso') || productos.some(p => contextoPrevio.includes(p.nombre.toLowerCase().split(' ')[0]));

      // Saludo amigable general (Solo si no hay contexto previo)
      if ((text === 'hola' || text === 'buenas' || text === 'buenas tardes' || text === 'buenas noches' || text === 'start' || text === '/start') && !hablabaDeProducto) {
        const saludoMsg = `¡Hola, *${userName}*! 👋 Bienvenido a Digital Boss. Soy tu asesor de inteligencia artificial. ¿Qué herramienta o curso te gustaría consultar hoy? 🚀`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: saludoMsg, parse_mode: 'Markdown' })
        });
        await guardarMensajeHistorial(userId, 'assistant', saludoMsg);
        return res.status(200).json({ success: true });
      }

      // Envío de video de persuasión
      if (text.includes('video') || text.includes('demosturacion') || text.includes('muestra') || text.includes('como funciona') || text.includes('ver')) {
        const p = productoSeleccionado;
        const videoUrl = p.video_url || 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/video%20gemini/video%20para%20gemini.mp4';

        const capVideo = `🎥 *Mira ${p.nombre} en acción.*\n\n💰 Inversión única: *Bs. ${p.precio}*\n\n¿Te gustaría adquirirlo ahora? 👇`;
        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            video: videoUrl,
            caption: capVideo,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_${p.id}` }]
              ]
            }
          })
        });
        await guardarMensajeHistorial(userId, 'assistant', '[Envío de Video Demo]');
        return res.status(200).json({ success: true });
      }

      // Manejo de preguntas sobre correo personal, activación o garantías
      if (text.includes('correo') || text.includes('personal') || text.includes('activa') || text.includes('cae') || text.includes('garantia') || text.includes('seguro') || (hablabaDeProducto && (text.includes('si') || text.includes('como') || text.includes('donde')))) {
        const p = productoSeleccionado;
        const respuestaContexto = `¡Exacto, *${userName}*! 🤝 Se configura de manera segura y privada para que disfrutes de todo su potencial sin interrupciones y con soporte garantizado.\n\n` +
          `💰 Inversión única: **Bs. ${p.precio}**\n\n` +
          `¿Deseas que avancemos con tu acceso seguro? 👇`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: respuestaContexto, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_${p.id}` }]
              ]
            }
          })
        });
        await guardarMensajeHistorial(userId, 'assistant', respuestaContexto);
        return res.status(200).json({ success: true });
      }

      // Solicitud general de información
      const isInfoQuery = text.includes('informacion') || text.includes('info') || text.includes('detalles') || text.includes('que es') || text.includes('cuanto cuesta') || text.includes('precio');
      const isProductQuery = text.includes('gemin') || text.includes('gemeni') || text.includes('ia') || text.includes('curso') || text.includes('catalogo');

      if (isInfoQuery || isProductQuery || hablabaDeProducto) {
        const p = productoSeleccionado;
        const ventasTexto = `💡 *Información Oficial - ${p.nombre}*\n\n` +
          `✨ *Detalles:*\n${p.prompt_ventas || 'Acceso completo y soporte continuo.'}\n\n` +
          `💰 *Inversión única:* Bs. ${p.precio}\n\n` +
          `💡 *Tip:* Escribe *"ver video"* si deseas una demostración visual.\n\n` +
          `¿Listo para dar el salto? 👇`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: ventasTexto, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Lo quiero, Comprar Ahora!`, callback_data: `start_purchase_${p.id}` }],
                [{ text: `🎥 Ver Demostración en Video`, callback_data: `send_demo_video_${p.id}` }]
              ]
            }
          })
        });
        await guardarMensajeHistorial(userId, 'assistant', ventasTexto);
        return res.status(200).json({ success: true });
      }

      // Intención directa de compra
      if (text.includes('comprar') || text.includes('adquirir') || text.includes('pagar')) {
        const p = productoSeleccionado;
        const compraMsg = `🎉 *¡Excelente decisión de compra!*\n\n📦 *${p.nombre}*\n💰 *Precio:* Bs. ${p.precio}\n\n👇 Selecciona tu método de pago preferido para emitir el QR:`;
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
        await guardarMensajeHistorial(userId, 'assistant', compraMsg);
        return res.status(200).json({ success: true });
      }

      const defaultMsg = 'Estoy aquí para ayudarte a elegir la mejor herramienta o curso digital. Cuéntame, ¿qué deseas consultar? 😊';
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: defaultMsg })
      });
      await guardarMensajeHistorial(userId, 'assistant', defaultMsg);
    } 
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = TELEGRAM_TOKEN;

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
            caption: `🎥 *Demostración en Vivo*\n\n¿Deseas adquirirlo ahora? 👇`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_${prodId}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('start_purchase_')) {
        const prodId = data.replace('start_purchase_', '');
        const { data: productoPrincipal } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const prod = productoPrincipal || { id: prodId, nombre: 'Producto Digital', precio: 67 };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🎉 *¡Excelente elección!*\n\n📦 *${prod.nombre}*\n💰 *Precio:* Bs. ${prod.precio}\n\n👇 Selecciona tu método de pago preferido:`, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${prod.precio})`, callback_data: `pay_takenos_${prod.id}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${prod.id}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('pay_takenos_') || data.startsWith('pay_binance_')) {
        const parts = data.split('_');
        const method = parts[1]; // takenos o binance
        const prodId = parts[2];

        const { data: productoPrincipal } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const prod = productoPrincipal || { id: prodId, nombre: 'Producto Digital', precio: 67 };

        // 🟢 MECANISMO ORIGINAL DE QR FUNCIONAL: Usa el QR específico del producto si existe, de lo contrario el QR por defecto
        const qrUrl = prod.qr_pago_url ? prod.qr_pago_url : QR_POR_DEFECTO;

        try {
          await supabase.from('pedidos').insert([{
            producto_id: prod.id,
            monto: prod.precio,
            estado: 'ESPERANDO_PAGO'
          }]);
        } catch (e) {}

        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            photo: qrUrl,
            caption: `📲 *Escanea el QR de ${method.toUpperCase()} para realizar tu pago.*\n\nUna vez realizado, haz clic en el botón de abajo para notificar al administrador:`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🔔 Ya realicé el pago (Avisar al Admin)`, callback_data: `notify_admin_${chatId}_${prod.id}` }]
              ]
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
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `⏳ *Pago notificado.* Nuestro equipo está verificando tu comprobante. ¡En un momento te entregamos tu acceso! 🚀`, 
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
        const prodId = parts[3];

        let entregableUrl = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt';
        let nombreProd = 'Producto Digital';
        let tipoEntrega = 'manual';

        try {
          const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prodData) {
            nombreProd = prodData.nombre;
            tipoEntrega = prodData.tipo_entrega || 'manual';
            if (prodData.url_drive) entregableUrl = prodData.url_drive;
            else if (prodData.pdf_url) entregableUrl = prodData.pdf_url;
            else if (prodData.video_url) entregableUrl = prodData.video_url;
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

        setTimeout(async () => {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: targetChatId, 
              text: `🎁 *¡Oferta exclusiva VIP!*\n\n¿Te gustaría complementar tu aprendizaje con más herramientas o cursos con descuento? Escribe *"ver catálogo"*. 🔥`, 
              parse_mode: 'Markdown' 
            })
          });
        }, 2000);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
