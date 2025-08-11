import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente SUPABASE não estão definidas corretamente no .env.local');
  throw new Error('Variáveis de ambiente do Supabase ausentes');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('notas_entregas')
      .select('numero_nf, cliente, status, data_emissao, cidade, transportadora')
      .order('data_emissao', { ascending: false });

    // Filtrar notas que NÃO contenham 'HEINZ' no nome do cliente
    const dataFiltrada = Array.isArray(data)
      ? data.filter(nota => !String(nota.cliente).toUpperCase().includes('HEINZ'))
      : [];

    if (error) {
      console.error('🔴 Erro ao consultar Supabase:', error);
      return NextResponse.json({ erro: 'Erro na consulta ao banco' }, { status: 500 });
    }

    return NextResponse.json(dataFiltrada);
  } catch (err) {
    console.error('❌ Erro inesperado na API /api/notas:', err);
    return NextResponse.json({ erro: 'Erro interno do servidor' }, { status: 500 });
  }
}
