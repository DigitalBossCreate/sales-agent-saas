import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const update = req.body;

    if (!update.message || !update.message.text) {
      return res.status(200).json({ status: 'Ignorado (no es un mensaje de texto)' });
    }

    const chatId = update.message.chat.id.toString();
    const nombreUsuario = update.message.from.first_name || 'Cliente';
    const textoMensaje = update.message.text;

    // Tenant de prueba configurado en la Fase 1
    const tenantId = 'a0000000-0000-0000-0000-000000000001';

    let { data: cliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('canal_origen', 'telegram')
      .eq('canal_usuario_id', chatId)
      .single();

    if (!cliente) {
      const { data: nuevoCliente, error: errorInsert } = await supabase
        .from('clientes')
        .insert([
          {
            tenant_id: tenantId,
            canal_origen: 'telegram',
            canal_usuario_id: chatId,
            nombre: nombreUsuario,
            estado_comercial: 'nuevo'
          }
        ])
        .select()
        .single();

      if (errorInsert) throw errorInsert;
      cliente = nuevoCliente;
    }

    const respuestaBot = `¡Hola ${nombreUsuario}! He recibido tu mensaje: "${textoMensaje}". La infraestructura omnicanal está conectada y operando.`;

    return res.status(200).json({
      method: 'sendMessage',
      chat_id: chatId,
      text: respuestaBot
    });

  } catch (error) {
    console.error('Error procesando el webhook:', error);
    return res.status(500).json({ error: 'Error interno en el servidor serverless' });
  }
}
