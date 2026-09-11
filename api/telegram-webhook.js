import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot is running' });
  }

  try {
    const update = req.body;

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';

      // 1. GESTIÓN DE CLIENTE (CRM / Memoria)
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
        console.error('Error gestionando cliente en CRM:', clientErr);
      }

      // 2. GUARDAR MENSAJE EN HISTORIAL
      try {
        await supabase.from('mensajes_bot').insert([
          { chat_id: chatId, nombre: userName, mensaje: text }
        ]);
      } catch (dbError) {
        console.error('Error guardando mensaje:', dbError);
      }

      // 3. CONSULTAR CATÁLOGO ACTIVO DESDE SUPABASE
      let catalogContext = 'No hay productos cargados en el sistema actualmente.';
      let productosList = [];
      try {
        const { data: products } = await supabase
          .from('productos')
          .select('*')
          .eq('estado', 'ACTIVO');

        if (products && products.length > 0) {
          productosList = products;
          catalogContext = products.map(p => 
            `- Producto: ${p.nombre} | SKU: ${p.sku} | Precio: $${p.precio} | Descripción: ${p.descripcion} | Tipo de Entrega: ${p.tipo_entrega}`
          ).join('\n');
        }
      } catch (catErr) {
        console.error('Error consultando catálogo:', catErr);
      }

      // 4. CONSULTAR MÉTODOS DE PAGO DISPONIBLES
      let paymentContext = '';
      try {
        const { data: payments } = await supabase
          .from('metodos_pago')
          .select('*')
          .eq('estado', 'ACTIVO');

        if (payments && payments.length > 0) {
          paymentContext = payments.map(pm => 
            `Método: ${pm.nombre} (${pm.moneda}) - Instrucciones: ${pm.instrucciones} | Datos: ${pm.datos_pago}`
          ).join('\n');
        }
      } catch (payErr) {
        console.error('Error consultando métodos de pago:', payErr);
      }

      // 5. CONSTRUCCIÓN DEL PROMPT MAESTRO PARA LA IA
      const systemPrompt = `
Eres el agente de ventas autónomo y profesional de "Digital Boss". Tu objetivo es guiar al cliente, responder dudas, ofrecer el catálogo, manejar objeciones y cerrar ventas de manera concisa y amable en Telegram.

CATÁLOGO DE PRODUCTOS DISPONIBLES:
${catalogContext}

MÉTODOS DE PAGO DISPONIBLES:
${paymentContext}

REGLAS DE NEGOCIO:
- Si el cliente pregunta por precios o productos, preséntalos basándote estrictamente en la información del catálogo anterior.
- Si el cliente muestra interés claro en comprar un producto, recuérdale el precio y dile cómo proceder al pago con los métodos disponibles.
- Mantén un tono comercial, cercano y profesional. Respuestas directas y limpias para chat móvil de Telegram.
`;

      // 6. CONSULTAR A GROQ (IA)
      let aiResponse = '¡Hola! Bienvenido a Digital Boss. ¿En qué puedo ayudarte hoy?';
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
              { role: 'user', content: text }
            ],
            temperature: 0.7
          })
        });

        const groqData = await groqRes.json();
        if (groqData.choices && groqData.choices.length > 0) {
          aiResponse = groqData.choices[0].message.content;
        } else if (groqData.error) {
          aiResponse = `Error del sistema de IA: ${groqData.error.message}`;
        }
      } catch (aiError) {
        aiResponse = `Excepción conectando con la IA: ${aiError.message}`;
      }

      // 7. DETECCIÓN DE INTENCIÓN DE COMPRA Y CREACIÓN DE PEDIDO AUTOMÁTICO
      const lowerText = text.toLowerCase();
      if ((lowerText.includes('comprar') || lowerText.includes('quiero') || lowerText.includes('adquirir') || lowerText.includes('pagar')) && clienteId) {
        // Intentar hacer match con algún producto del catálogo
        const matchedProduct = productosList.find(p => lowerText.includes(p.nombre.toLowerCase()) || (p.sku && lowerText.includes(p.sku.toLowerCase())));
        
        if (matchedProduct) {
          try {
            await supabase.from('pedidos').insert([{
              cliente_id: clienteId,
              producto_id: matchedProduct.id,
              monto: matchedProduct.precio,
              estado: 'ESPERANDO_PAGO'
            }]);
            aiResponse += `\n\n📝 He registrado tu intención de compra para *${matchedProduct.nombre}* por un valor de $${matchedProduct.precio}. Sigue las instrucciones de pago anteriores para confirmar tu pedido.`;
          } catch (orderErr) {
            console.error('Error creando pedido:', orderErr);
          }
        }
      }

      // 8. ENVIAR RESPUESTA A TELEGRAM
      const token = process.env.TELEGRAM_BOT_TOKEN;
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

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error procesando webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
