"use client";
// Função para calcular horas úteis (segunda a sexta, 8h às 18h)
function calcularHorasUteis(inicioISO: string, fimISO: string) {
  const inicio = new Date(inicioISO);
  const fim = new Date(fimISO);
  if (fim <= inicio) return 0;
  let total = 0;
  let atual = new Date(inicio);
  while (atual < fim) {
    const diaSemana = atual.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
    // Se for sábado (6) ou domingo (0), pula para segunda 8h
    if (diaSemana === 6) {
      atual.setDate(atual.getDate() + 2);
      atual.setHours(8, 0, 0, 0);
      continue;
    }
    if (diaSemana === 0) {
      atual.setDate(atual.getDate() + 1);
      atual.setHours(8, 0, 0, 0);
      continue;
    }
    // Se antes de segunda 8h, pula para segunda 8h
    if (diaSemana === 1 && atual.getHours() < 8) {
      atual.setHours(8, 0, 0, 0);
    }
    // Se depois de sexta 18h, pula para próxima segunda 8h
    if (diaSemana === 5 && atual.getHours() >= 18) {
      atual.setDate(atual.getDate() + 3);
      atual.setHours(8, 0, 0, 0);
      continue;
    }
    // Calcula o próximo limite de contagem (fim do expediente ou fim do período)
  const fimExpediente = new Date(atual);
  fimExpediente.setHours(18, 0, 0, 0);
  const proximo = fim < fimExpediente ? fim : fimExpediente;
    // Soma apenas se estiver dentro do intervalo permitido
    if (atual < proximo) {
      total += (proximo.getTime() - atual.getTime()) / 36e5;
    }
    // Avança para o próximo ponto de contagem
    atual = new Date(proximo);
    if (atual.getHours() >= 18) {
      atual.setDate(atual.getDate() + 1);
      atual.setHours(8, 0, 0, 0);
    }
  }
  return total;
}
import { useState, useEffect, useMemo } from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FixedSizeList as List } from "react-window";

// Agora a API pode trazer data_entrega e tempo_h (opcional)
type Nota = {
  numero_nf: string;
  cliente: string;
  status: "Entregue" | "Em rota" | "Pendente" | string;
  data_emissao: string;       // ISO
  data_entrega?: string|null; // ISO opcional
  tempo_h?: number|null;      // opcional (calculado no backend)
  cidade?: string;            // nova coluna
  transportadora?: string;    // nova coluna
};

type CardColor = "green" | "yellow" | "red" | "blue";
type Bucket = "dentro" | "vencendo" | "acima";

export default function DashboardPage() {
  // Filtros de cidade e data
  const [visualizacao, setVisualizacao] = useState<'todos' | 'entregues' | 'dentro' | 'vencendo' | 'acima'>('todos');
  const [cidadeFiltro, setCidadeFiltro] = useState<string>('TODAS');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [dados, setDados] = useState<{
    entregue: Nota[];
    emRota: Nota[];
    pendente: Nota[];
  } | null>(null);

  const [aguardando, setAguardando] = useState(true);

  useEffect(() => {
    const buscarDados = async () => {
      try {
        const res = await fetch("/api/notas");
        const notas: Nota[] = await res.json();
        if (!Array.isArray(notas)) {
          setDados({ entregue: [], emRota: [], pendente: [] });
          return;
        }
        // Separar por status, sem filtrar cidade ainda
        const entregue: Nota[] = [];
        const emRota: Nota[] = [];
        const pendente: Nota[] = [];
        for (const nota of notas) {
          switch (nota.status) {
            case "Entregue":
              entregue.push(nota);
              break;
            case "Em rota":
              emRota.push(nota);
              break;
            case "Pendente":
            default:
              pendente.push(nota);
              break;
          }
        }
        setDados({ entregue, emRota, pendente });
      } catch {
        setDados({ entregue: [], emRota: [], pendente: [] });
      } finally {
        setAguardando(false);
      }
    };
    buscarDados();
  const interval = setInterval(buscarDados, 600000);
    return () => clearInterval(interval);
  }, []);

  // ===== NUNCA condicione hooks. Use defaults quando 'dados' for null. =====
  // Aplica filtro de cidade e data
  const todasNotas = useMemo(() => [
    ...(dados?.entregue ?? []),
    ...(dados?.emRota ?? []),
    ...(dados?.pendente ?? [])
  ], [dados]);
  const cidadesUnicas = useMemo(() => {
    const set = new Set<string>();
    todasNotas.forEach(n => {
      if (n.cidade) set.add(n.cidade);
    });
    return Array.from(set);
  }, [todasNotas]);

  const filtrarPorCidade = (notas: Nota[]) =>
    cidadeFiltro === 'TODAS' ? notas : notas.filter(n => n.cidade === cidadeFiltro);

  const filtrarPorData = (notas: Nota[]) => {
    if (!dataInicio && !dataFim) return notas;
    return notas.filter(n => {
      const data = new Date(n.data_emissao);
  const inicio = dataInicio ? new Date(dataInicio + 'T00:00:00') : null;
  const fim = dataFim ? new Date(dataFim + 'T23:59:59') : null;
      if (inicio && data < inicio) return false;
      if (fim && data > fim) return false;
      return true;
    });
  };

  const entregues = filtrarPorData(filtrarPorCidade(dados?.entregue ?? []));
  const emRota = filtrarPorData(filtrarPorCidade(dados?.emRota ?? []));
  const pendente = filtrarPorData(filtrarPorCidade(dados?.pendente ?? []));
  const abertas = useMemo(() => [...emRota, ...pendente], [emRota, pendente]);

  const agoraISO = new Date().toISOString();
  const diffHoras = (inicioISO: string, fimISO: string) =>
    calcularHorasUteis(inicioISO, fimISO);

  const horasNota = (n: Nota) => {
    if (n.status === "Entregue") {
      if (typeof n.tempo_h === "number" && !Number.isNaN(n.tempo_h)) return n.tempo_h!;
      if (n.data_entrega) return diffHoras(n.data_emissao, n.data_entrega);
      return diffHoras(n.data_emissao, agoraISO);
    } else {
      return diffHoras(n.data_emissao, agoraISO);
    }
  };

  const bucketNota = (n: Nota): Bucket => {
    const h = horasNota(n);
    if (h <= 24) return "dentro";
    if (h <= 48) return "vencendo";
    return "acima";
  };

  const contadores = useMemo(() => {
    let dentro = 0, vencendo = 0, acima = 0;
    for (const n of abertas) {
      const b = bucketNota(n);
      if (b === "dentro") dentro++;
      else if (b === "vencendo") vencendo++;
      else acima++;
    }
    return { dentro, vencendo, acima, entregues: entregues.length };
  }, [abertas, entregues.length, bucketNota]);

  const prioridadeBucket: Record<Bucket, number> = { acima: 0, vencendo: 1, dentro: 2 };
  const notasOrdenadas = useMemo(() => {
    return [...abertas].sort((a, b) => {
      const pa = prioridadeBucket[bucketNota(a)];
      const pb = prioridadeBucket[bucketNota(b)];
      if (pa !== pb) return pa - pb;
      return new Date(a.data_emissao).getTime() - new Date(b.data_emissao).getTime();
    });
  }, [abertas, bucketNota, prioridadeBucket]);

  return (
    <main className="min-h-screen w-full bg-[#0a1833] text-slate-100 flex flex-col">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 border-b border-slate-700 pb-4 px-6 pt-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-blue-200 flex items-center gap-3">
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2563eb" /><path d="M7 13l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Dashboard de Entregas
        </h1>
        <span className="text-sm text-slate-400 font-medium">Atualizado em {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </header>
      <section className="flex flex-col md:flex-row gap-4 px-6 mb-6">
        <div className="flex flex-row gap-2 mb-2 items-end">
          <div>
            <label className="block text-xs mb-1 text-slate-400">Cidade</label>
            <Select value={cidadeFiltro} onValueChange={setCidadeFiltro}>
              <SelectTrigger className="p-2 rounded bg-[#1e2a4a] text-slate-200 w-56 border-none hover:cursor-pointer">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="bg-[#1e2a4a] text-slate-200">
                <SelectItem value="TODAS">Todas</SelectItem>
                <List
                  height={200}
                  itemCount={cidadesUnicas.length}
                  itemSize={36}
                  width={220}
                >
                  {({ index, style }: { index: number; style: React.CSSProperties }) => (
                    <div style={style}>
                      <SelectItem key={cidadesUnicas[index]} value={cidadesUnicas[index]} className="hover:cursor-pointer">{cidadesUnicas[index]}</SelectItem>
                    </div>
                  )}
                </List>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs mb-1 text-slate-400">Data início</label>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="p-2 rounded bg-[#1e2a4a] text-slate-200 hover:cursor-pointer h-9" />
          </div>
          <div>
            <label className="block text-xs mb-1 text-slate-400">Data fim</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="p-2 rounded bg-[#1e2a4a] text-slate-200 hover:cursor-pointer h-9" />
          </div>
          <button
            className="px-3 h-9 rounded bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-all duration-200 hover:scale-105 flex items-center hover:cursor-pointer"
            onClick={() => {
              setCidadeFiltro('TODAS');
              setDataInicio('');
              setDataFim('');
              setVisualizacao('todos');
            }}
          >
            Limpar filtros
          </button>
          {visualizacao !== 'todos' && (
            <button
              className="px-5 py-2 rounded bg-gradient-to-r  bg-blue-700 text-white text-sm font-bold shadow-lg hover:bg-blue-800 transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 hover:cursor-pointer"
              onClick={() => setVisualizacao('todos')}
            >
              Mostrar todas as notas
            </button>
          )}
        </div>
      </section>

      {/* Loader não muda a ordem dos hooks */}
      {aguardando ? (
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900 mr-4"></div>
          <span className="text-lg text-slate-300 font-medium">Aguardando dados atualizados...</span>
        </div>
      ) : (
        <>
          {/* ...existing code... */}
          <section className="px-6">
            <h2 className="text-lg font-semibold text-slate-300 mb-3">Resumo (SLA) - Dados dos últimos 7 dias</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card titulo="Entregues" cor="blue" total={contadores.entregues} onClick={() => setVisualizacao('entregues')} isActive={visualizacao === 'entregues'} />
              <Card titulo="Dentro do prazo (≤ 24h)" cor="green" total={contadores.dentro} onClick={() => setVisualizacao('dentro')} isActive={visualizacao === 'dentro'} />
              <Card titulo="Prazo vencendo (≤ 48h)" cor="yellow" total={contadores.vencendo} onClick={() => setVisualizacao('vencendo')} isActive={visualizacao === 'vencendo'} />
              <Card titulo="Fora do prazo (> 48h)" cor="red" total={contadores.acima} onClick={() => setVisualizacao('acima')} isActive={visualizacao === 'acima'} />
            </div>
          </section>

          {/* Tabela de Em rota + Pendentes ordenada por criticidade */}
          <section className="flex-1 px-6 mt-8 mb-7">
            <h2 className="text-xl font-semibold mb-4 text-blue-200 flex items-center gap-2">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#f59e42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Notas Fiscais (Mais antigas para mais novas)
            </h2>
            <TabelaNotas
              notas={
                visualizacao === 'entregues' ? entregues :
                visualizacao === 'dentro' ? abertas.filter(n => bucketNota(n) === 'dentro') :
                visualizacao === 'vencendo' ? abertas.filter(n => bucketNota(n) === 'vencendo') :
                visualizacao === 'acima' ? abertas.filter(n => bucketNota(n) === 'acima') :
                notasOrdenadas
              }
              bucketNota={bucketNota}
            />
          </section>
        </>
      )}
    </main>
  );
}

function Card({ titulo, cor, total, onClick, isActive }: { titulo: string; cor: CardColor; total: number; onClick?: () => void; isActive?: boolean }) {
  const styleMap = {
    blue: {
      bg: "bg-blue-900/30 border-blue-500",
      text: "text-blue-300",
      icon: (
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#3b82f6" /><path d="M7 13l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ),
    },
    green: {
      bg: "bg-green-900/30 border-green-500",
      text: "text-green-300",
      icon: (
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e" /><path d="M7 13l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ),
    },
    yellow: {
      bg: "bg-yellow-900/30 border-yellow-500",
      text: "text-yellow-300",
      icon: (
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#facc15" /><path d="M12 8v4m0 4h.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ),
    },
    red: {
      bg: "bg-red-900/30 border-red-500",
      text: "text-red-300",
      icon: (
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ef4444" /><path d="M15 9l-6 6M9 9l6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ),
    },
  } as const;
  const styles = styleMap[cor];

  return (
    <div
      className={`flex flex-col items-start justify-center gap-2 p-6 rounded-2xl border-2 shadow-md transition hover:scale-[1.03] cursor-pointer ${styles.bg} ${isActive ? 'ring-2 ring-blue-400' : ''}`}
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-pressed={isActive}
    >
      <div className="flex flex-row items-center gap-3 mb-1">
        <span>{styles.icon}</span>
        <span className={`text-base font-semibold ${styles.text}`}>{titulo}</span>
      </div>
      <div className="text-5xl font-extrabold tracking-tight text-slate-100 drop-shadow-lg text-left">{total}</div>
    </div>
  );
}

function TabelaNotas({
  notas,
  bucketNota,
}: {
  notas: Nota[];
  bucketNota: (n: Nota) => "dentro" | "vencendo" | "acima";
}) {
  const badge = (b: Bucket) => {
    if (b === "acima") return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-300 border border-red-600/40">Acima &gt; 48h</span>;
    if (b === "vencendo") return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-600/40">Vencendo ≤ 48h</span>;
    return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-300 border border-green-600/40">Dentro ≤ 24h</span>;
  };

  // Paginação
  const [pagina, setPagina] = useState(1);
  const porPagina = 15;
  const totalPaginas = Math.ceil(notas.length / porPagina);
  const notasPaginadas = notas.slice((pagina - 1) * porPagina, pagina * porPagina);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(1);
  }, [notas.length, totalPaginas]);

  return (
    <div className="overflow-x-auto border border-slate-700 rounded-2xl shadow-md bg-[#172447]">
      <table className="min-w-full table-auto text-sm">
        <thead className="bg-[#1e2a4a] text-slate-200 text-left">
          <tr>
            <th className="p-3 font-semibold">Número NF</th>
            <th className="p-3 font-semibold">Cliente</th>
            <th className="p-3 font-semibold">Cidade</th>
            <th className="p-3 font-semibold">Transportadora</th>
            <th className="p-3 font-semibold">Tempo</th>
            <th className="p-3 font-semibold">Status</th>
            <th className="p-3 font-semibold">Data Emissão</th>
          </tr>
        </thead>
        <tbody>
          {notasPaginadas.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                Nenhuma nota encontrada.
              </td>
            </tr>
          ) : (
            notasPaginadas.map((n, i) => {
              const b = bucketNota(n);
              const rowStyle =
                b === "acima"
                  ? "border-l-4 border-red-500 bg-red-900/10 hover:bg-red-900/20"
                  : b === "vencendo"
                  ? "border-l-4 border-yellow-500 bg-yellow-900/10 hover:bg-yellow-900/20"
                  : "border-l-4 border-green-500 bg-green-900/10 hover:bg-green-900/20";
              return (
                <tr key={i} className={`border-t border-slate-700 transition ${rowStyle}`}>
                  <td className="p-3 font-mono text-xs md:text-sm text-blue-200">{n.numero_nf}</td>
                  <td className="p-3">{n.cliente}</td>
                  <td className="p-3">{n.cidade ?? '-'}</td>
                  <td className="p-3">{n.transportadora ?? '-'}</td>
                  <td className="p-3">{badge(b)}</td>
                  <td className="p-3 font-bold">{n.status}</td>
                  <td className="p-3">{new Date(n.data_emissao).toLocaleString()}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex justify-center items-center gap-2 py-4 flex-wrap">
          <button
            className="px-2 py-1 rounded bg-transparent text-white text-xs font-semibold hover:bg-slate-100 hover:text-blue-700 transition"
            onClick={() => setPagina(1)}
            disabled={pagina === 1}
          >&lt; Primeira Página</button>
          <button
            className="px-2 py-1 rounded bg-transparent text-white text-xs font-semibold hover:bg-slate-100 hover:text-blue-700 transition"
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            disabled={pagina === 1}
          >&lt; Anterior</button>
          <div className="flex gap-1 items-center">
            {/* Lógica para mostrar no máximo 10 números, sempre a primeira e última página visíveis */}
            {(() => {
              const maxVisible = 10;
              let pages = [];
              if (totalPaginas <= maxVisible) {
                for (let i = 1; i <= totalPaginas; i++) pages.push(i);
              } else {
                const left = Math.max(2, pagina - Math.floor((maxVisible - 2) / 2));
                const right = Math.min(totalPaginas - 1, left + maxVisible - 3);
                if (right >= totalPaginas - 1) {
                  // Ajusta para mostrar últimas páginas
                  for (let i = totalPaginas - (maxVisible - 2); i < totalPaginas; i++) pages.push(i);
                } else {
                  for (let i = left; i <= right; i++) pages.push(i);
                }
                pages = [1, ...pages, totalPaginas];
              }
              let last = 0;
              return pages.map((num, idx) => {
                if (num - last > 1) {
                  last = num;
                  return [<span key={"dots-"+num} className="px-1 text-slate-400">...</span>,
                    <button
                      key={num}
                      className={`px-2 py-1 rounded text-xs font-semibold transition-all duration-150 ${
                        num === pagina
                          ? 'bg-slate-100 text-blue-700 font-bold shadow border border-slate-300'
                          : 'bg-transparent text-white hover:bg-slate-100 hover:text-blue-700 border border-transparent'
                      }`}
                      onClick={() => setPagina(num)}
                      disabled={num === pagina}
                      aria-current={num === pagina ? 'page' : undefined}
                    >{num}</button>
                  ];
                }
                last = num;
                return (
                  <button
                    key={num}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-all duration-150 ${
                      num === pagina
                        ? 'bg-slate-100 text-blue-700 font-bold shadow border border-slate-300'
                        : 'bg-transparent text-white hover:bg-slate-100 hover:text-blue-700 border border-transparent'
                    }`}
                    onClick={() => setPagina(num)}
                    disabled={num === pagina}
                    aria-current={num === pagina ? 'page' : undefined}
                  >{num}</button>
                );
              });
            })()}
          </div>
          <button
            className="px-2 py-1 rounded bg-transparent text-white text-xs font-semibold hover:bg-slate-100 hover:text-blue-700 transition disabled:opacity-50"
            onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
            disabled={pagina === totalPaginas}
          >Próxima &gt;</button>
          <button
            className="px-2 py-1 rounded bg-transparent text-white text-xs font-semibold hover:bg-slate-100 hover:text-blue-700 transition disabled:opacity-50"
            onClick={() => setPagina(totalPaginas)}
            disabled={pagina === totalPaginas}
          >Última Página &gt;</button>
        </div>
      )}
    </div>
  );
}
