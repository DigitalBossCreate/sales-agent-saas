import { gestionarCliente } from '../lib/bot-core.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

if (!TELEGRAM_TOKEN) {
  console.error('⚠️ TELEGRAM_BOT_TOKEN no está configurado en las variables de entorno de Vercel.');
}

// 🔗 Dos QR globales por defecto, uno por método de pago (moneda local vs. cripto)
const QR_POR_DEFECTO_TAKENOS = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/default-qr-takenos.jpg';
const QR_POR_DEFECTO_BINANCE = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/default-qr-binance.jpg';

// --- Utilidades ---

function normalizar(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .trim();
}

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

// Búsqueda por scoring: matchea en ambas direcciones y normaliza acentos.
// Devuelve el producto con mejor score, o null si nada supera el umbral.
function buscarProductoPorTexto(textoUsuario, productos) {
  const textNorm = normalizar(textoUsuario);
  let mejorMatch = null;
  let mejorScore = 0;

  for (const p of productos) {
    const nombreNorm = normalizar(p.nombre);
    if (!nombreNorm) continue;

    let score = 0;
    if (textNorm === nombreNorm) {
      score = 100;
    } else if (textNorm.includes(nombreNorm)) {
      score = 80;
    } else if (nombreNorm.includes(textNorm) && textNorm.length > 4) {
      score = 60;
    } else {
      const palabrasNombre = nombreNorm.split(' ').filter(w => w.length > 3);
      const coincidencias = palabrasNombre.filter(w => textNorm.includes(w)).length;
      if (palabrasNombre.length > 0) {
        score = (coincidencias / palabrasNombre.length) * 50;
      }
    }

    if (score > mejorScore) {
      mejorScore = score;
      mejorMatch = p;
    }
  }

  return mejorScore >= 50 ? mejorMatch : null;
}

async function enviarMensaje(token, chatId, text, extra = {}) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...extra })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot Core V7 is running' });
  }

  try {
    const update = req.body;
    const token = TELEGRAM_TOKEN;

    // ==========================================================
    // MANEJADOR DE BOTONES (CALLBACK QUERY)
    // ==========================================================
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
        const prodId = data.replace('send_demo_video_', '').trim();
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
            reply_markup: { inline_keyboard: [[{ text: `🛒 ¡Comprar Ahora!`, callback_data: `start_purchase_${prodId}` }]] }
          })
        });
      }

      else if (data.startsWith('start_purchase_')) {
        const prodId = data.replace('start_purchase_', '').trim();
        let nombreP = 'Producto Digital';
        let precioP = 50;

        try {
          const { data: prod } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prod) {
            nombreP = prod.nombre || nombreP;
            precioP = prod.precio || precioP;
          }
        } catch (e) {}

        await enviarMensaje(token, chatId, `🎉 *${nombreP}*\n💰 *Precio:* Bs. ${precioP}\n\nSelecciona tu método de pago:`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${precioP})`, callback_data: `pay_takenos_${prodId}` }],
              [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${prodId}` }]
            ]
          }
        });
      }

      // --- Selección de método de pago: aquí vive la lógica de QR corregida ---
      else if (data.startsWith('pay_takenos_') || data.startsWith('pay_binance_')) {
        const parts = data.split('_');
        const method = parts[1]; // 'takenos' o 'binance'
        const prodId = parts[2].trim();

        let qrUrl = '';
        let nombreProd = 'Producto Digital';
        let precioProd = 50;

        try {
          const { data: prod } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prod) {
            nombreProd = prod.nombre || nombreProd;
            precioProd = prod.precio || precioProd;

            // ✅ FIX: ya no cae en imagen_url genérica. Solo usa el QR propio del producto
            // para el método elegido, o nada (y abajo se resuelve con el default correcto).
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

        // 🛡️ REGLA ABSOLUTA: si no hay QR propio, usa el default QUE CORRESPONDE al método elegido
        if (!qrUrl || !qrUrl.startsWith('http')) {
          qrUrl = (method === 'binance') ? QR_POR_DEFECTO_BINANCE : QR_POR_DEFECTO_TAKENOS;
        }

        // ✅ FIX: el pedido ahora guarda telegram_id y metodo_pago, necesarios para
        // poder aprobar el pago correcto más adelante sin afectar otros pedidos.
        try {
          await supabase.from('pedidos').insert([{
            producto_id: prodId,
            monto: precioProd,
            estado: 'ESPERANDO_PAGO',
            telegram_id: chatId,
            metodo_pago: method
          }]);
        } catch (e) {
          console.error('Error insertando pedido:', e.message);
        }

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

        await enviarMensaje(token, chatId, `⏳ *Pago notificado.* Verificando comprobante... 🚀`);

        const adminDest = ADMIN_CHAT_ID || chatId;
        await enviarMensaje(token, adminDest, `🔔 *NUEVO PAGO PENDIENTE*\n👤 Cliente: \`${targetChatId}\`\n📦 Producto ID: \`${prodId}\``, {
          reply_markup: {
            inline_keyboard: [[
              { text: `✅ Aprobar y Entregar`, callback_data: `approve_delivery_${targetChatId}_${prodId}` },
              { text: `❌ Rechazar`, callback_data: `reject_payment_${targetChatId}_${prodId}` }
            ]]
          }
        });
      }

      // ✅ FIX CRÍTICO: antes esto marcaba TODOS los pedidos en ESPERANDO_PAGO como PAGADO.
      // Ahora busca el pedido específico de ese cliente + ese producto (el más reciente)
      // y solo actualiza ese registro puntual.
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

          const { data: pedidoData, error: pedidoError } = await supabase
            .from('pedidos')
            .select('id')
            .eq('telegram_id', targetChatId)
            .eq('producto_id', prodId)
            .eq('estado', 'ESPERANDO_PAGO')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (pedidoData && pedidoData.id) {
            await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('id', pedidoData.id);
          } else {
            console.error('No se encontró pedido ESPERANDO_PAGO para', targetChatId, prodId, pedidoError?.message);
            await enviarMensaje(token, ADMIN_CHAT_ID || chatId, `⚠️ No se encontró un pedido pendiente exacto para cliente \`${targetChatId}\` / producto \`${prodId}\`. Verifica manualmente en Supabase.`);
          }
        } catch (e) {
          console.error('Error en approve_delivery:', e.message);
        }

        if (tipoEntrega === 'automatico') {
          await enviarMensaje(token, targetChatId, `¡Pago aprobado! 🎉\n\nTu producto: *${nombreProd}*\n🔗 *Enlace:* ${entregableUrl}`);
        } else {
          await supabase.from('clientes').update({ estado_chat: 'ESPERANDO_CORREO' }).eq('telegram_id', targetChatId);
          await enviarMensaje(token, targetChatId, `¡Pago aprobado! 🎉\n\nPara activar *${nombreProd}*, escribe aquí tu correo electrónico personal. ✉️`);
        }
      }

      // ✅ NUEVO: handler de rechazo, antes no existía (el botón "Rechazar" no hacía nada).
      else if (data.startsWith('reject_payment_')) {
        const parts = data.split('_');
        const targetChatId = parts[2];
        const prodId = parts[3] ? parts[3].trim() : null;

        try {
          let query = supabase
            .from('pedidos')
            .update({ estado: 'RECHAZADO' })
            .eq('telegram_id', targetChatId)
            .eq('estado', 'ESPERANDO_PAGO');
          if (prodId) query = query.eq('producto_id', prodId);
          await query;
        } catch (e) {
          console.error('Error en reject_payment:', e.message);
        }

        await enviarMensaje(token, targetChatId, `❌ *No pudimos verificar tu comprobante de pago.*\n\nPor favor revisa el monto/referencia e inténtalo nuevamente, o contacta a soporte.`);
      }

      return res.status(200).json({ success: true });
    }

    // ==========================================================
    // MANEJADOR DE MENSAJES DE CHAT
    // ==========================================================
    if (update && update.message) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';
      const text = (update.message.text || '').toLowerCase().trim();
      const textOriginal = update.message.text || '';
      const textNorm = normalizar(text);

      const isAdmin = String(userId) === String(ADMIN_CHAT_ID);
      await gestionarCliente(userId, userName, userUsername);
      await guardarMensajeHistorial(userId, 'user', text);

      // --- Comandos de administración ---
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
          await enviarMensaje(token, chatId, listaMsg);
          return res.status(200).json({ success: true });
        }

        if (text.startsWith('/eliminar ')) {
          const prodId = textOriginal.replace('/eliminar ', '').trim();
          await supabase.from('productos').delete().eq('id', prodId);
          await enviarMensaje(token, chatId, `🗑️ Producto eliminado correctamente.`);
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
          await enviarMensaje(token, chatId, `✅ *¡Producto creado con éxito!*\n📦 *${nombreNuevo}*`);
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
          await enviarMensaje(token, chatId, `🔄 *¡Producto actualizado!*\nID: \`${prodId}\``);
          return res.status(200).json({ success: true });
        }
      }

      // --- Flujo de recopilación de correo (entrega manual) ---
      const { data: clienteInfo } = await supabase.from('clientes').select('estado_chat').eq('telegram_id', userId).single();

      if (clienteInfo && clienteInfo.estado_chat === 'ESPERANDO_CORREO') {
        await enviarMensaje(token, ADMIN_CHAT_ID || chatId, `✉️ *Correo recibido del cliente (\`${chatId}\`)*:\n\n\`${update.message.text}\`\n\n_Libéralo con:_ \`/liberar ${chatId}\``);
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `⏳ *¡Correo recibido correctamente!* En breve te enviamos tus datos. 🚀` })
        });
        return res.status(200).json({ success: true });
      }

      if (text.startsWith('/liberar ')) {
        const targetId = text.replace('/liberar ', '').trim();
        await supabase.from('clientes').update({ estado_chat: 'ACTIVO' }).eq('telegram_id', targetId);
        await enviarMensaje(token, chatId, `✅ Cliente ${targetId} liberado.`);
        return res.status(200).json({ success: true });
      }

      // --- Saludo / inicio ---
      if (textNorm === 'hola' || textNorm === 'start' || text === '/start') {
        await enviarMensaje(token, chatId, `¡Hola, *${userName}*! 👋 Bienvenido al catálogo. ¿Qué herramienta o curso deseas consultar hoy? 🚀\n\n_(Escribe el nombre de tu producto de interés o escribe *catalogo* para ver todas las opciones)_`);
        return res.status(200).json({ success: true });
      }

      // --- Catálogo público (nuevo: antes solo existía la versión admin) ---
      if (textNorm === 'catalogo' || textNorm === 'catálogo') {
        const productos = await obtenerProductosDirecto();
        if (productos.length === 0) {
          await enviarMensaje(token, chatId, `📭 Por el momento no hay productos cargados en el catálogo. Vuelve pronto.`);
        } else {
          const botones = productos.map(p => [{ text: `📦 ${p.nombre} - Bs. ${p.precio}`, callback_data: `start_purchase_${p.id}` }]);
          await enviarMensaje(token, chatId, `📚 *Nuestro catálogo:*\n\nSelecciona un producto para ver detalles y pagar:`, {
            reply_markup: { inline_keyboard: botones }
          });
        }
        return res.status(200).json({ success: true });
      }

      // --- Búsqueda de producto por nombre (con scoring + normalización de acentos) ---
      const productos = await obtenerProductosDirecto();
      const productoSeleccionado = buscarProductoPorTexto(text, productos);

      // 🛡️ Sin adivinar: si no hay match confiable, se informa en vez de inventar un producto
      if (!productoSeleccionado) {
        await enviarMensaje(token, chatId, `Mmm... no encontré un producto con ese nombre exacto 😅.\n\nEscribe *catalogo* para ver la lista de cursos disponibles o verifica el nombre.`);
        return res.status(200).json({ success: true });
      }

      const p = productoSeleccionado;

      // ✅ FIX: "comprar/pagar/quiero" ahora se evalúa ANTES que "video",
      // para que "quiero comprar el curso de video" no desvíe al demo.
      if (text.includes('comprar') || text.includes('pagar') || text.includes('quiero')) {
        await enviarMensaje(token, chatId, `🎉 *¡Excelente decisión!*\n\n📦 *${p.nombre}*\n💰 *Precio:* Bs. ${p.precio}\n\n👇 Selecciona tu método de pago:`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${p.precio})`, callback_data: `pay_takenos_${p.id}` }],
              [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${p.id}` }]
            ]
          }
        });
        return res.status(200).json({ success: true });
      }

      if (text.includes('video') || text.includes('ver')) {
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

      // --- Ficha de producto por defecto ---
      const ventasTexto = `💡 *Información - ${p.nombre}*\n\n📝 ${p.prompt_ventas || 'Acceso completo.'}\n\n💰 *Precio:* Bs. ${p.precio}\n\n¿Deseas adquirirlo? 👇`;
      await enviarMensaje(token, chatId, ventasTexto, {
        reply_markup: {
          inline_keyboard: [
            [{ text: `🛒 ¡Comprar Ahora!`, callback_data: `start_purchase_${p.id}` }],
            [{ text: `🎥 Ver Video`, callback_data: `send_demo_video_${p.id}` }]
          ]
        }
      });
      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
