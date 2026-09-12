import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabhdzqpgq.supabase.co'; // Verifica que esta URL sea exacta
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

export async function obtenerProductos() {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true);
    
    if (error) throw error;
    return data && data.length > 0 ? data : [{
      id: 1,
      nombre: 'Gemini Advanced 18 Meses',
      precio: 67.00,
      qr_url: 'https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/takenos-ok.jpeg',
      entregable_url: 'https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt'
    }];
  } catch (err) {
    console.error('Error al obtener productos de Supabase:', err.message);
    // Producto de respaldo para que el bot nunca falle aunque falle la BD
    return [{
      id: 1,
      nombre: 'Gemini Advanced 18 Meses',
      precio: 67.00,
      qr_url: 'https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/takenos-ok.jpeg',
      entregable_url: 'https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt'
    }];
  }
}

export async function gestionarCliente(userId, userName, userUsername) {
  try {
    const { data: existingClient } = await supabase
      .from('clientes')
      .select('id')
      .eq('telegram_id', userId)
      .single();

    if (existingClient) {
      await supabase
        .from('clientes')
        .update({ ultima_interaccion: new Date(), username: userUsername, nombre: userName })
        .eq('id', existingClient.id);
      return existingClient.id;
    } else {
      const { data: newClient } = await supabase
        .from('clientes')
        .insert([{ telegram_id: userId, nombre: userName, username: userUsername, estado_comercial: 'NUEVO' }])
        .select('id')
        .single();
      return newClient ? newClient.id : null;
    }
  } catch (err) {
    console.error('Error en CRM cliente:', err.message);
    return null;
  }
}
