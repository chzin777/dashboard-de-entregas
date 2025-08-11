"use client";
import { useState, useEffect, useMemo } from "react";

// Agora a API pode trazer data_entrega e tempo_h (opcional)
type Nota = {
  numero_nf: string;
  cliente: string;
  status: "Entregue" | "Em rota" | "Pendente" | string;
  data_emissao: string;       // ISO
  data_entrega?: string|null; // ISO opcional
  tempo_h?: number|null;      // opcional (calculado no backend)
  cidade?: string;            // nova coluna
};

type CardColor = "green" | "yellow" | "red" | "blue";
type Bucket = "dentro" | "vencendo" | "acima";

export default function DashboardPage() {
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
        // Filtrar apenas cidades desejadas
        const cidadesPermitidas = ["GOIANIA", "APARECIDA DE GOIANIA"];
        const notasFiltradas = notas.filter(nota =>
          nota.cidade && cidadesPermitidas.includes(nota.cidade.toUpperCase())
        );
        const entregue: Nota[] = [];
        const emRota: Nota[] = [];
        const pendente: Nota[] = [];
        for (const nota of notasFiltradas) {
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
  const entregues = dados?.entregue ?? [];
  const emRota = dados?.emRota ?? [];
  const pendente = dados?.pendente ?? [];
  const abertas = useMemo(() => [...emRota, ...pendente], [emRota, pendente]);

  const agoraISO = new Date().toISOString();
  const diffHoras = (inicioISO: string, fimISO: string) =>
    (new Date(fimISO).getTime() - new Date(inicioISO).getTime()) / 36e5;

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
  }, [abertas, entregues.length]);

  const prioridadeBucket: Record<Bucket, number> = { acima: 0, vencendo: 1, dentro: 2 };
  const notasOrdenadas = useMemo(() => {
    return [...abertas].sort((a, b) => {
      const pa = prioridadeBucket[bucketNota(a)];
      const pb = prioridadeBucket[bucketNota(b)];
      if (pa !== pb) return pa - pb;
      return new Date(a.data_emissao).getTime() - new Date(b.data_emissao).getTime();
    });
  }, [abertas]);

  return (
    <main className="min-h-screen w-full bg-[#0a1833] text-slate-100 flex flex-col">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 border-b border-slate-700 pb-4 px-6 pt-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-blue-200 flex items-center gap-3">
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2563eb" /><path d="M7 13l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Dashboard de Entregas
        </h1>
  <span className="text-sm text-slate-400 font-medium">Atualizado em {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </header>

      {/* Loader não muda a ordem dos hooks */}
      {aguardando ? (
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900 mr-4"></div>
          <span className="text-lg text-slate-300 font-medium">Aguardando dados atualizados...</span>
        </div>
      ) : (
        <>
          {/* Quadro de 4 colunas */}
          <section className="px-6">
            <h2 className="text-lg font-semibold text-slate-300 mb-3">Resumo (SLA) - Dados dos últimos 7 dias</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card titulo="Entregues" cor="blue" total={contadores.entregues} />
              <Card titulo="Dentro do prazo (≤ 24h)" cor="green" total={contadores.dentro} />
              <Card titulo="Prazo vencendo (≤ 48h)" cor="yellow" total={contadores.vencendo} />
              <Card titulo="Fora do prazo (> 48h)" cor="red" total={contadores.acima} />
            </div>
          </section>

          {/* Tabela de Em rota + Pendentes ordenada por criticidade */}
          <section className="flex-1 px-6 mt-8">
            <h2 className="text-xl font-semibold mb-4 text-blue-200 flex items-center gap-2">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#f59e42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Notas Fiscais (Mais antigas para mais novas)
            </h2>
            <TabelaNotas
              notas={notasOrdenadas}
              bucketNota={bucketNota}
            />
          </section>
        </>
      )}
    </main>
  );
}

function Card({ titulo, cor, total }: { titulo: string; cor: CardColor; total: number }) {
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
    <div className={`flex flex-col items-start justify-center gap-2 p-6 rounded-2xl border-2 shadow-md transition hover:scale-[1.03] ${styles.bg}`}>
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

  return (
    <div className="overflow-x-auto border border-slate-700 rounded-2xl shadow-md bg-[#172447]">
      <table className="min-w-full table-auto text-sm">
        <thead className="bg-[#1e2a4a] text-slate-200 text-left">
          <tr>
            <th className="p-3 font-semibold">Número NF</th>
            <th className="p-3 font-semibold">Cliente</th>
            <th className="p-3 font-semibold">Cidade</th>
            <th className="p-3 font-semibold">Tempo</th>
            <th className="p-3 font-semibold">Status</th>
            <th className="p-3 font-semibold">Data Emissão</th>
          </tr>
        </thead>
        <tbody>
          {notas.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-6 text-center text-slate-500 italic">
                Nenhuma nota encontrada.
              </td>
            </tr>
          ) : (
            notas.map((n, i) => {
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
                  <td className="p-3">{badge(b)}</td>
                  <td className="p-3 font-bold">{n.status}</td>
                  <td className="p-3">{new Date(n.data_emissao).toLocaleString()}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
