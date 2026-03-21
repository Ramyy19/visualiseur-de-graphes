import { useState, useRef, useEffect } from "react";
import CytoscapeComponent from "react-cytoscapejs";

let nodeCounter = 0;
const newNodeId = () => String(++nodeCounter);
const newEdgeId = (s, t) => `e_${s}_${t}_${Date.now()}`;

function computeStats(elements, directed) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source);
  const degreeMap = {};
  nodes.forEach((n) => { degreeMap[n.data.id] = { in: 0, out: 0, label: n.data.label }; });
  edges.forEach((e) => {
    const { source, target } = e.data;
    if (degreeMap[source]) degreeMap[source].out += 1;
    if (degreeMap[target]) degreeMap[target].in += 1;
  });
  return { order: nodes.length, size: edges.length, degrees: degreeMap };
}

function computeSuccessors(elements) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source);
  const dict = {};
  nodes.forEach((n) => { dict[n.data.label] = []; });
  edges.forEach((e) => {
    const s = nodes.find((n) => n.data.id === e.data.source);
    const t = nodes.find((n) => n.data.id === e.data.target);
    if (s && t && !dict[s.data.label].includes(t.data.label)) dict[s.data.label].push(t.data.label);
  });
  return dict;
}

function computePredecessors(elements) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source);
  const dict = {};
  nodes.forEach((n) => { dict[n.data.label] = []; });
  edges.forEach((e) => {
    const s = nodes.find((n) => n.data.id === e.data.source);
    const t = nodes.find((n) => n.data.id === e.data.target);
    if (s && t && !dict[t.data.label].includes(s.data.label)) dict[t.data.label].push(s.data.label);
  });
  return dict;
}

function computeAdjacencyMatrix(elements, directed) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source);
  const labels = nodes.map((n) => n.data.label);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });
  const matrix = {};
  labels.forEach((l) => { matrix[l] = {}; labels.forEach((l2) => { matrix[l][l2] = 0; }); });
  edges.forEach((e) => {
    const s = idToLabel[e.data.source], t = idToLabel[e.data.target];
    if (s && t) { matrix[s][t] += 1; if (!directed && s !== t) matrix[t][s] += 1; }
  });
  return { labels, matrix };
}

function computeIncidenceMatrix(elements, directed) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source).filter((e) => e.data.source !== e.data.target);
  const nodeLabels = nodes.map((n) => n.data.label);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });
  const edgeLabels = edges.map((e) => {
    const s = idToLabel[e.data.source], t = idToLabel[e.data.target];
    return directed ? `${s}\u2192${t}` : `${s}-${t}`;
  });
  const matrix = {};
  nodeLabels.forEach((l) => { matrix[l] = {}; edgeLabels.forEach((el) => { matrix[l][el] = 0; }); });
  edges.forEach((e, i) => {
    const s = idToLabel[e.data.source], t = idToLabel[e.data.target], el = edgeLabels[i];
    if (directed) { if (s) matrix[s][el] = 1; if (t) matrix[t][el] = -1; }
    else { if (s) matrix[s][el] = 1; if (t && t !== s) matrix[t][el] = 1; }
  });
  return { nodeLabels, edgeLabels, matrix };
}

function computeTransitiveClosure(elements) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source);
  if (nodes.length === 0) return { steps: [], uPlus: [] };
  const pairKey = (s, t) => `${s},${t}`;
  const U = new Set(edges.filter((e) => e.data.source !== e.data.target).map((e) => pairKey(e.data.source, e.data.target)));
  if (U.size === 0) return { steps: [], uPlus: [] };
  const steps = [{ power: 1, pairs: [...U].map((k) => k.split(",")) }];
  const uPlus = new Set(U);
  let prev = new Set(U);
  for (let k = 2; k <= nodes.length; k++) {
    const next = new Set();
    prev.forEach((pair) => {
      const [s, m] = pair.split(",");
      U.forEach((pair2) => {
        const [m2, t] = pair2.split(",");
        if (m === m2 && s !== t) { const key = pairKey(s, t); if (!uPlus.has(key)) next.add(key); }
      });
    });
    if (next.size === 0) break;
    steps.push({ power: k, pairs: [...next].map((k) => k.split(",")) });
    next.forEach((p) => uPlus.add(p));
    prev = next;
  }
  return { steps, uPlus: [...uPlus].map((k) => k.split(",")) };
}

function analyzeGraph(elements, directed) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source);
  const results = [];
  if (nodes.length === 0) return [];
  const edgePairs = edges.map((e) => `${e.data.source}-${e.data.target}`);
  const hasSelfLoop = edges.some((e) => e.data.source === e.data.target);
  const hasParallel = edgePairs.length !== new Set(edgePairs).size;
  const isSimple = !hasSelfLoop && !hasParallel;
  results.push({ label: "Graphe simple", ok: isSimple, reason: !isSimple ? (hasSelfLoop ? "Contient une boucle" : "Aretes paralleles") : null });
  results.push({ label: "Multigraphe", ok: hasParallel });
  const n = nodes.length;
  const expectedComplete = directed ? n * (n - 1) : (n * (n - 1)) / 2;
  const isComplete = isSimple && edges.length === expectedComplete;
  results.push({ label: "Graphe complet", ok: isComplete, reason: !isComplete ? `${edges.length}/${expectedComplete} aretes` : null });
  function bfsUndirected(startId) {
    const visited = new Set([startId]);
    const queue = [startId];
    while (queue.length > 0) {
      const curr = queue.shift();
      edges.forEach((e) => {
        const nb = e.data.source === curr ? e.data.target : e.data.target === curr ? e.data.source : null;
        if (nb && !visited.has(nb)) { visited.add(nb); queue.push(nb); }
      });
    }
    return visited;
  }
  const allVisited = new Set(); let components = 0;
  nodes.forEach((nd) => {
    if (!allVisited.has(nd.data.id)) { const c = bfsUndirected(nd.data.id); c.forEach((id) => allVisited.add(id)); components++; }
  });
  const isConnected = components === 1;
  results.push({ label: "Graphe connexe", ok: isConnected, reason: !isConnected ? `${components} composantes` : "1 composante" });
  if (directed) {
    function bfsDir(startId, rev) {
      const visited = new Set([startId]); const queue = [startId];
      while (queue.length > 0) {
        const curr = queue.shift();
        edges.forEach((e) => {
          const nb = rev ? (e.data.target === curr ? e.data.source : null) : (e.data.source === curr ? e.data.target : null);
          if (nb && !visited.has(nb)) { visited.add(nb); queue.push(nb); }
        });
      }
      return visited;
    }
    const sid = nodes[0].data.id;
    const isSC = bfsDir(sid, false).size === n && bfsDir(sid, true).size === n;
    results.push({ label: "Fortement connexe", ok: isSC });
  }
  if (isConnected && n <= 50) {
    function bfsDist(startId) {
      const dist = { [startId]: 0 }; const queue = [startId];
      while (queue.length > 0) {
        const curr = queue.shift();
        edges.forEach((e) => {
          const nb = !directed ? (e.data.source === curr ? e.data.target : e.data.target === curr ? e.data.source : null) : (e.data.source === curr ? e.data.target : null);
          if (nb && dist[nb] === undefined) { dist[nb] = dist[curr] + 1; queue.push(nb); }
        });
      }
      return dist;
    }
    let diameter = 0;
    nodes.forEach((nd) => { Object.values(bfsDist(nd.data.id)).forEach((d) => { if (d > diameter) diameter = d; }); });
    results.push({ label: "Diametre", ok: null, info: String(diameter) });
  }
  return results;
}

function analyzeSequence(sequence, elements, directed) {
  if (sequence.length < 2) return [];
  const edges = elements.filter((el) => !!el.data.source);
  const nodes = elements.filter((el) => !el.data.source);
  const nodeIds = new Set(nodes.map((n) => n.data.id));
  const isAlternating = sequence.every((item, i) => i % 2 === 0 ? nodeIds.has(item) : !nodeIds.has(item));
  if (!isAlternating) return [{ label: "Sequence invalide", ok: false, reason: "Doit alterner sommets et aretes" }];
  let valid = true;
  for (let i = 1; i < sequence.length - 1; i += 2) {
    const edge = edges.find((e) => e.data.id === sequence[i]);
    if (!edge) { valid = false; break; }
    const prev = sequence[i - 1], next = sequence[i + 1];
    const connects = directed ? edge.data.source === prev && edge.data.target === next : (edge.data.source === prev && edge.data.target === next) || (edge.data.source === next && edge.data.target === prev);
    if (!connects) { valid = false; break; }
  }
  if (!valid) return [{ label: "Sequence incoherente", ok: false, reason: "Une arete ne relie pas les bons sommets" }];
  const seqNodes = sequence.filter((_, i) => i % 2 === 0);
  const seqEdges = sequence.filter((_, i) => i % 2 === 1);
  const isClosed = seqNodes[0] === seqNodes[seqNodes.length - 1];
  const allNodesUnique = new Set(seqNodes).size === seqNodes.length;
  const allEdgesUnique = new Set(seqEdges).size === seqEdges.length;
  const results = [];
  if (!isClosed) {
    const word = directed ? "Chemin" : "Chaine";
    results.push({ label: word, ok: true, reason: `${seqNodes.length} sommets, ${seqEdges.length} arete(s)` });
    results.push({ label: `${word} simple`, ok: allEdgesUnique, reason: !allEdgesUnique ? "Aretes repetees" : null });
    results.push({ label: `${word} elementaire`, ok: allNodesUnique, reason: !allNodesUnique ? "Sommets repetes" : null });
  } else {
    const word = directed ? "Circuit" : "Cycle";
    results.push({ label: word, ok: true, reason: `Ferme sur ${seqNodes[0]}` });
    results.push({ label: `${word} simple`, ok: allEdgesUnique, reason: !allEdgesUnique ? "Aretes repetees" : null });
    const inner = seqNodes.slice(1); const innerUnique = new Set(inner).size === inner.length;
    results.push({ label: `${word} elementaire`, ok: innerUnique, reason: !innerUnique ? "Sommets interieurs repetes" : null });
  }
  return results;
}

function buildStylesheet(directed) {
  return [
    { selector: "node", style: { "background-color": "#ffffff", "border-width": 2, "border-color": "#334155", color: "#0f172a", label: "data(label)", "text-valign": "center", "text-halign": "center", "font-family": "JetBrains Mono, monospace", "font-size": "12px", "font-weight": "600", width: 42, height: 42 } },
    { selector: "node.highlighted", style: { "background-color": "#3b82f6", "border-color": "#93c5fd", "border-width": 3, color: "#ffffff" } },
    { selector: "edge", style: { width: 2, "line-color": "#475569", "target-arrow-color": "#475569", "target-arrow-shape": directed ? "triangle" : "none", "curve-style": "bezier", "loop-direction": "-45deg", "loop-sweep": "90deg", label: "data(weightLabel)", color: "#94a3b8", "font-family": "JetBrains Mono, monospace", "font-size": "11px", "text-background-color": "#111111", "text-background-opacity": 1, "text-background-padding": "4px" } },
    { selector: "edge:selected", style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 3 } },
    { selector: "node.seq-highlighted", style: { "background-color": "#8b5cf6", "border-color": "#c4b5fd", "border-width": 3, color: "#ffffff" } },
    { selector: "edge.seq-highlighted", style: { "line-color": "#8b5cf6", "target-arrow-color": "#8b5cf6", width: 3 } },
  ];
}

const DEFINITIONS = [
  { term: "Graphe simple", def: "Un graphe ou il existe au plus une arete entre deux sommets, et pas de boucle.", example: "Ex : un reseau routier ou deux villes sont reliees par une seule route." },
  { term: "Multigraphe", def: "Un graphe ou plusieurs aretes peuvent relier les memes deux sommets (aretes paralleles).", example: "Ex : deux villes reliees par une autoroute ET une route nationale." },
  { term: "Hypergraphe", def: "Une generalisation du graphe ou une arete peut relier plus de deux sommets a la fois.", example: "Ex : une hyperarete {A, B, C} relie trois sommets simultanement." },
  { term: "Graphe complet", def: "Un graphe simple ou chaque paire de sommets est reliee par exactement une arete. n sommets => n(n-1)/2 aretes.", example: "Ex : K4 a 4 sommets et 6 aretes." },
  { term: "Graphe partiel", def: "Obtenu en supprimant certaines aretes (on garde tous les sommets).", example: "Ex : retirer quelques routes sans retirer de villes." },
  { term: "Sous-graphe", def: "Obtenu en supprimant certains sommets et toutes les aretes qui leur sont incidentes.", example: "Ex : zoomer sur une region en retirant les villes hors de cette region." },
  { term: "Chemin", def: "Suite de sommets relies par des aretes. Sommets et aretes peuvent se repeter.", example: "Ex : A -> B -> C -> B est un chemin valide." },
  { term: "Chemin simple", def: "Chemin ou chaque arete est empruntee au plus une fois.", example: "Ex : A -> B -> C -> D sans arete repetee." },
  { term: "Chemin elementaire", def: "Chemin ou chaque sommet est visite au plus une fois.", example: "Ex : A -> B -> C -> D sans repasser par aucun sommet." },
  { term: "Circuit", def: "Chemin qui commence et se termine au meme sommet.", example: "Ex : A -> B -> C -> A." },
  { term: "Circuit elementaire", def: "Circuit ou chaque sommet interieur est visite exactement une fois.", example: "Ex : A -> B -> C -> A sans repasser par B ou C." },
  { term: "Chaine", def: "Suite de sommets relies par des aretes sans tenir compte de l'orientation.", example: "Ex : A - B - C - B est une chaine valide." },
  { term: "Cycle", def: "Chaine qui commence et se termine au meme sommet sans repeter d'aretes.", example: "Ex : A - B - C - A est un cycle de longueur 3." },
  { term: "Composantes connexes", def: "Sous-ensembles maximaux de sommets ou chaque paire est reliee par une chaine.", example: "Ex : {A,B,C} et {D,E} sans lien = 2 composantes connexes." },
  { term: "Graphe connexe", def: "Graphe non-orienté ou il existe une chaine entre chaque paire de sommets.", example: "Ex : un arbre est toujours connexe." },
  { term: "Graphe fortement connexe", def: "Graphe orienté ou il existe un chemin orienté de u vers v ET de v vers u pour toute paire (u,v).", example: "Ex : A->B->C->A est fortement connexe." },
  { term: "Composante fortement connexe", def: "Sous-ensemble maximal de sommets d'un digraphe ou tout sommet est accessible depuis tout autre.", example: "Ex : dans A->B->A et C->D, {A,B}, {C} et {D} sont 3 CFC." },
  { term: "Graphe reduit", def: "Graphe obtenu en condensant chaque CFC en un seul sommet. Toujours un DAG.", example: "Ex : si {A,B} forment une CFC et {C} une autre, le graphe reduit a 2 sommets." },
  { term: "Distance", def: "Nombre d'aretes du plus court chemin entre deux sommets. Infinie si aucun chemin n'existe.", example: "Ex : si le plus court chemin de A a D passe par B et C, d(A,D) = 3." },
  { term: "Diametre", def: "La plus grande distance entre deux sommets du graphe.", example: "Ex : si la plus grande distance est 4, le diametre vaut 4." },
  { term: "Degre de connexite", def: "Nombre minimal de sommets a supprimer pour deconnecter le graphe.", example: "Ex : un cycle Cn a un degre de connexite de 2." },
];

function btn(active, danger) {
  return {
    display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px",
    borderRadius: "9999px", fontSize: "12px", fontWeight: "500", cursor: "pointer",
    fontFamily: "Inter, sans-serif", border: active ? (danger ? "1px solid rgba(248,113,113,0.6)" : "1px solid rgba(59,130,246,0.6)") : "1px solid rgba(255,255,255,0.08)",
    background: active ? (danger ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.12)") : "rgba(255,255,255,0.04)",
    color: active ? (danger ? "#fca5a5" : "#93c5fd") : "#94a3b8",
  };
}

const menuItemStyle = {
  display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
  borderRadius: "8px", fontSize: "13px", fontFamily: "Inter, sans-serif",
  cursor: "pointer", border: "none", background: "transparent", color: "#e2e8f0",
};

function DefsPanel({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", width: "min(720px, 95vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: "600", fontSize: "15px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Definitions</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#94a3b8", cursor: "pointer", padding: "6px 10px" }}>x</button>
        </div>
        <div style={{ overflowY: "auto", padding: "16px 20px", display: "grid", gap: "10px" }}>
          {DEFINITIONS.map((d) => (
            <div key={d.term} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "12px 16px", borderLeft: "3px solid #3b82f6" }}>
              <div style={{ fontWeight: "bold", color: "#ffffff", marginBottom: "4px", fontSize: "14px" }}>{d.term}</div>
              <div style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: "1.5", marginBottom: "6px" }}>{d.def}</div>
              <div style={{ color: "#64748b", fontSize: "12px", fontStyle: "italic" }}>{d.example}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RenameModal({ node, onConfirm, onCancel }) {
  const [val, setVal] = useState(node?.data("label") ?? "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "24px", width: "280px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ fontWeight: "600", marginBottom: "4px", color: "white", fontFamily: "Inter, sans-serif" }}>Renommer le sommet</div>
        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "16px" }}>Nom actuel : {node?.data("label")}</div>
        <input autoFocus style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: "6px", padding: "8px 12px", color: "white", fontFamily: "monospace", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box", outline: "none" }}
          value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onConfirm(val)} />
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => onConfirm(val)} style={{ flex: 1, padding: "8px", background: "#3b82f6", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontWeight: "bold" }}>OK</button>
          <button onClick={onCancel} style={{ flex: 1, padding: "8px", background: "#1e293b", border: "none", borderRadius: "6px", color: "white", cursor: "pointer" }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function WeightModal({ edge, onConfirm, onCancel }) {
  const [val, setVal] = useState(edge?.data("weight") ?? "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "24px", width: "280px" }}>
        <div style={{ fontWeight: "600", marginBottom: "4px", color: "white", fontFamily: "Inter, sans-serif" }}>Poids</div>
        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "16px" }}>{edge?.data("source")} vers {edge?.data("target")}</div>
        <input autoFocus type="number" style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: "6px", padding: "8px 12px", color: "white", fontFamily: "monospace", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box", outline: "none" }}
          value={val} placeholder="Ex: 5" onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onConfirm(val)} />
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => onConfirm(val)} style={{ flex: 1, padding: "8px", background: "#3b82f6", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontWeight: "bold" }}>OK</button>
          <button onClick={onCancel} style={{ flex: 1, padding: "8px", background: "#1e293b", border: "none", borderRadius: "6px", color: "white", cursor: "pointer" }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function RepresentationPanel({ elements, directed, onClose, initialTab }) {
  const [tab, setTab] = useState(initialTab && initialTab !== true ? initialTab : "successors");
  const succ = computeSuccessors(elements);
  const pred = computePredecessors(elements);
  const { labels: adjLabels, matrix: adjMatrix } = computeAdjacencyMatrix(elements, directed);
  const { nodeLabels: incNodes, edgeLabels: incEdges, matrix: incMatrix } = computeIncidenceMatrix(elements, directed);
  const tabStyle = (active) => ({ padding: "6px 14px", borderRadius: "9999px", fontSize: "12px", fontWeight: "500", cursor: "pointer", fontFamily: "Inter, sans-serif", border: "none", background: active ? "rgba(59,130,246,0.15)" : "transparent", color: active ? "#93c5fd" : "#64748b" });
  const cellStyle = (header) => ({ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: header ? "#94a3b8" : "#e2e8f0", fontWeight: header ? "600" : "400", background: header ? "rgba(255,255,255,0.04)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.05)", textAlign: "center", whiteSpace: "nowrap" });
  const tabs = [{ key: "successors", label: "Successeurs" }, { key: "predecessors", label: "Predecesseurs" }, { key: "adjacency", label: "Matrice adjacence" }, { key: "incidence", label: "Matrice incidence" }];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", width: "min(700px, 96vw)", maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: "600", fontSize: "15px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Representations du graphe</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#94a3b8", cursor: "pointer", padding: "6px 10px" }}>x</button>
        </div>
        <div style={{ display: "flex", gap: "4px", padding: "12px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" }}>
          {tabs.map((t) => <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </div>
        <div style={{ overflowY: "auto", overflowX: "auto", padding: "18px 22px" }}>
          {(tab === "successors" || tab === "predecessors") && (() => {
            const data = tab === "successors" ? succ : pred;
            const title = tab === "successors" ? "Successeurs" : "Predecesseurs";
            const gamma = tab === "successors" ? "+" : "-";
            return (
              <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "JetBrains Mono, monospace" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", borderRight: "2px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: "13px", fontWeight: "600", textAlign: "center", minWidth: "60px" }}>
                      x<sub>i</sub>
                    </th>
                    <th style={{ padding: "8px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: "13px", fontWeight: "600", textAlign: "center" }}>
                      {"Γ"}<sup>{gamma}</sup>(x<sub>i</sub>)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data).map(([node, neighbors], i) => (
                    <tr key={node} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                      <td style={{ padding: "9px 16px", borderRight: "2px solid rgba(255,255,255,0.1)", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#3b82f6", fontWeight: "700", fontSize: "14px", textAlign: "center" }}>
                        {node}
                      </td>
                      <td style={{ padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#e2e8f0", fontSize: "13px", textAlign: "center" }}>
                        {neighbors.length === 0
                          ? <span style={{ color: "#475569" }}>&#8709;</span>
                          : "{ " + neighbors.join(", ") + " }"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
          {tab === "adjacency" && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse" }}>
                <thead><tr><th style={{ ...cellStyle(true), color: "#475569" }}></th>{adjLabels.map((l) => <th key={l} style={cellStyle(true)}>{l}</th>)}</tr></thead>
                <tbody>{adjLabels.map((row) => (<tr key={row}><td style={{ ...cellStyle(true), color: "#3b82f6" }}>{row}</td>{adjLabels.map((col) => <td key={col} style={{ ...cellStyle(false), color: adjMatrix[row][col] > 0 ? "#10b981" : "#334155" }}>{adjMatrix[row][col]}</td>)}</tr>))}</tbody>
              </table>
            </div>
          )}
          {tab === "incidence" && (
            incEdges.length === 0
              ? <div style={{ color: "#475569", fontSize: "13px", fontStyle: "italic" }}>Aucune arete (boucles exclues).</div>
              : <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse" }}>
                    <thead><tr><th style={{ ...cellStyle(true), color: "#475569" }}></th>{incEdges.map((e) => <th key={e} style={{ ...cellStyle(true), fontSize: "11px" }}>{e}</th>)}</tr></thead>
                    <tbody>{incNodes.map((row) => (<tr key={row}><td style={{ ...cellStyle(true), color: "#3b82f6" }}>{row}</td>{incEdges.map((col) => { const val = incMatrix[row][col]; return <td key={col} style={{ ...cellStyle(false), color: val === 1 ? "#10b981" : val === -1 ? "#f87171" : "#334155" }}>{val}</td>; })}</tr>))}</tbody>
                  </table>
                  {directed && <div style={{ fontSize: "11px", color: "#475569", marginTop: "10px" }}>1 = depart, -1 = arrivee</div>}
                </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClosurePanel({ elements, onClose }) {
  const { steps, uPlus } = computeTransitiveClosure(elements);
  const sup = (n) => ({ 1: "", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" }[n] || `^${n}`);
  const fmt = (pairs) => "{" + pairs.map(([s, t]) => `(${s},${t})`).join(", ") + "}";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", width: "min(600px, 95vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "600", fontSize: "15px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Fermeture Transitive</div>
            <div style={{ fontSize: "11px", color: "#475569", marginTop: "3px" }}>Composition successive des arcs</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#94a3b8", cursor: "pointer", padding: "6px 10px" }}>x</button>
        </div>
        <div style={{ overflowY: "auto", padding: "18px 22px", fontFamily: "JetBrains Mono, monospace" }}>
          {steps.length === 0
            ? <div style={{ color: "#475569", fontSize: "13px", fontStyle: "italic" }}>Aucun arc dans ce graphe.</div>
            : <>
                <div style={{ display: "grid", gap: "10px", marginBottom: "20px" }}>
                  {steps.map(({ power, pairs }) => (
                    <div key={power} style={{ display: "flex", gap: "12px", alignItems: "flex-start", fontSize: "13px" }}>
                      <span style={{ color: "#3b82f6", fontWeight: "600", minWidth: "32px" }}>U{sup(power)}</span>
                      <span style={{ color: "#94a3b8" }}>=</span>
                      <span style={{ color: "#e2e8f0", lineHeight: "1.6" }}>{fmt(pairs)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", marginBottom: "16px" }} />
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", fontSize: "13px" }}>
                  <span style={{ color: "#10b981", fontWeight: "700", minWidth: "32px" }}>U+</span>
                  <span style={{ color: "#94a3b8" }}>=</span>
                  <div style={{ color: "#f1f5f9", lineHeight: "1.8", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "8px", padding: "10px 14px" }}>{fmt(uPlus)}</div>
                </div>
              </>
          }
        </div>
      </div>
    </div>
  );
}

export default function GraphVisualizer() {
  const cyRef = useRef(null);
  const [elements, setElements] = useState([]);
  const [directed, setDirected] = useState(false);
  const [pendingSource, setPendingSource] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDefs, setShowDefs] = useState(false);
  const [showClosure, setShowClosure] = useState(false);
  const [showRepr, setShowRepr] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState(false);
  const [sequence, setSequence] = useState([]);
  const [globalAnalysis, setGlobalAnalysis] = useState([]);
  const [seqAnalysis, setSeqAnalysis] = useState([]);

  const pendingSourceRef = useRef(null);
  const analyzeModeRef = useRef(false);
  const sequenceRef = useRef([]);

  useEffect(() => { pendingSourceRef.current = pendingSource; }, [pendingSource]);
  useEffect(() => { analyzeModeRef.current = analyzeMode; }, [analyzeMode]);
  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);
  useEffect(() => { setGlobalAnalysis(analyzeGraph(elements, directed)); }, [elements, directed]);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap";
    link.rel = "stylesheet"; document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (menuOpen && !e.target.closest("[data-menu]")) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    const trySetup = setInterval(() => {
      const cy = cyRef.current; if (!cy) return; clearInterval(trySetup);

      cy.on("tap", (e) => {
        if (e.target !== cy) return;
        const { x, y } = e.position; const id = newNodeId();
        setElements((prev) => [...prev, { data: { id, label: id }, position: { x, y } }]);
      });

      cy.on("cxttap", (e) => {
        if (e.target !== cy) return;
        cy.nodes(".highlighted").removeClass("highlighted");
        cy.nodes(".seq-highlighted").removeClass("seq-highlighted");
        cy.edges(".seq-highlighted").removeClass("seq-highlighted");
        setPendingSource(null);
        if (analyzeModeRef.current) { setSequence([]); setSeqAnalysis([]); }
      });

      cy.on("cxttap", "node", (e) => {
        const nodeId = e.target.id();
        cy.nodes(".highlighted").removeClass("highlighted"); setPendingSource(null);
        setElements((prev) => prev.filter((el) => el.data.id !== nodeId && el.data.source !== nodeId && el.data.target !== nodeId));
      });

      cy.on("cxttap", "edge", (e) => {
        const edgeId = e.target.id();
        setElements((prev) => prev.filter((el) => el.data.id !== edgeId));
      });

      cy.on("tap", "node", (e) => {
        if (analyzeModeRef.current) return;
        const nodeId = e.target.id(); const src = pendingSourceRef.current;
        if (!src) { setPendingSource(nodeId); cy.getElementById(nodeId).addClass("highlighted"); }
        else if (src === nodeId) {
          const edgeId = newEdgeId(src, nodeId);
          setElements((prev) => [...prev, { data: { id: edgeId, source: src, target: nodeId, weight: null, weightLabel: "" } }]);
          cy.getElementById(src).removeClass("highlighted"); setPendingSource(null);
        } else {
          const edgeId = newEdgeId(src, nodeId);
          setElements((prev) => [...prev, { data: { id: edgeId, source: src, target: nodeId, weight: null, weightLabel: "" } }]);
          cy.getElementById(src).removeClass("highlighted"); setPendingSource(nodeId); cy.getElementById(nodeId).addClass("highlighted");
        }
      });

      cy.on("dbltap", "node", (e) => { setSelectedNode(e.target); setShowRenameModal(true); });

      cy.on("tap", "edge", (e) => {
        if (analyzeModeRef.current) {
          const edgeId = e.target.id(); const seq = sequenceRef.current;
          if (seq.length === 0 || seq.length % 2 === 0) return;
          const lastNode = seq[seq.length - 1]; const edge = e.target;
          if (edge.data("source") !== lastNode && edge.data("target") !== lastNode) return;
          e.target.addClass("seq-highlighted"); setSequence([...seq, edgeId]); return;
        }
        setSelectedEdge(e.target); setShowWeightModal(true);
      });

      cy.on("tap", "node", (e2) => {
        if (!analyzeModeRef.current) return;
        const nodeId = e2.target.id(); const seq = sequenceRef.current;
        if (seq.length % 2 !== 0) return;
        e2.target.addClass("seq-highlighted"); setSequence([...seq, nodeId]);
      });
    }, 100);
    return () => clearInterval(trySetup);
  }, []);

  useEffect(() => {
    const ids = elements.filter((el) => !el.data.source).map((el) => parseInt(el.data.id, 10)).filter((n) => !isNaN(n));
    nodeCounter = ids.length > 0 ? Math.max(...ids) : 0;
  }, [elements]);

  const toggleAnalyzeMode = () => {
    if (cyRef.current) { cyRef.current.nodes(".highlighted").removeClass("highlighted"); cyRef.current.nodes(".seq-highlighted").removeClass("seq-highlighted"); cyRef.current.edges(".seq-highlighted").removeClass("seq-highlighted"); }
    setPendingSource(null); setSequence([]); setSeqAnalysis([]); setAnalyzeMode((prev) => !prev);
  };

  const clearSequence = () => {
    if (cyRef.current) { cyRef.current.nodes(".seq-highlighted").removeClass("seq-highlighted"); cyRef.current.edges(".seq-highlighted").removeClass("seq-highlighted"); }
    setSequence([]); setSeqAnalysis([]);
  };

  const resetGraph = () => {
    if (cyRef.current) cyRef.current.nodes(".highlighted").removeClass("highlighted");
    setElements([]); setPendingSource(null); nodeCounter = 0;
  };

  const handleRenameConfirm = (val) => {
    const trimmed = val.trim(); if (!trimmed) { setShowRenameModal(false); return; }
    const nodeId = selectedNode?.id();
    setElements((prev) => prev.map((el) => el.data.id === nodeId ? { ...el, data: { ...el.data, label: trimmed } } : el));
    setShowRenameModal(false); setSelectedNode(null);
  };

  const runSeqAnalysis = () => setSeqAnalysis(analyzeSequence(sequence, elements, directed));

  const handleWeightConfirm = (val) => {
    const numVal = val === "" ? null : Number(val); const edgeId = selectedEdge?.id();
    setElements((prev) => prev.map((el) => el.data.id === edgeId ? { ...el, data: { ...el.data, weight: numVal, weightLabel: numVal !== null ? String(numVal) : "" } } : el));
    setShowWeightModal(false); setSelectedEdge(null);
  };

  const stats = computeStats(elements, directed);
  const edgeWord = directed ? "arc" : "arete";
  const hintText = analyzeMode
    ? sequence.length === 0 ? "MODE ANALYSE — Clic sommet pour commencer | Clic droit canvas pour annuler"
    : sequence.length % 2 === 1 ? `Sequence (${sequence.length}) — Clic sur une arete connectee`
    : `Sequence (${sequence.length}) — Clic sommet pour continuer, ou Lancer analyse`
    : pendingSource ? `Source : ${pendingSource} — clic sommet = ${edgeWord} | clic droit canvas = annuler`
    : `Clic canvas = sommet  |  Clic sommet = ${edgeWord}  |  Re-clic = boucle  |  Dbl-clic = renommer  |  Clic droit = supprimer`;

  const S = {
    app: { display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "#0d1117", color: "#e2e8f0", fontFamily: "Inter, -apple-system, sans-serif" },
    sidebar: { width: "256px", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)", overflowY: "auto" },
    sidebarHeader: { padding: "20px 16px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
    sectionTitle: { fontSize: "10px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: "600", marginBottom: "10px" },
    statCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "10px 14px", marginBottom: "8px" },
    statLabel: { fontSize: "10px", color: "#64748b", marginBottom: "4px" },
    statValue: { fontSize: "26px", fontWeight: "700", color: "#3b82f6", fontFamily: "JetBrains Mono, monospace" },
    degreeRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "12px" },
    badge: { background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#93c5fd", fontFamily: "JetBrains Mono, monospace", fontWeight: "600" },
    main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
    toolbar: { height: "54px", display: "flex", alignItems: "center", gap: "8px", padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#111827", flexShrink: 0, position: "relative", zIndex: 100 },
    hintBar: { height: "30px", display: "flex", alignItems: "center", padding: "0 20px", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "11px", color: "#475569", flexShrink: 0 },
    canvas: { flex: 1, position: "relative", background: "#0d1117", backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "28px 28px" },
    emptyMsg: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.08)", pointerEvents: "none", fontSize: "13px", gap: "8px" },
  };

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#f1f5f9" }}>Visualiseur de Graphes</div>
          <div style={{ fontSize: "13px", color: "#9a2424", marginTop: "3px" }}>par Allalou Ramy</div>
        </div>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={S.sectionTitle}>Statistiques</div>
          <div style={S.statCard}><div style={S.statLabel}>Ordre (sommets)</div><div style={S.statValue}>{stats.order}</div></div>
          <div style={S.statCard}><div style={S.statLabel}>{directed ? "Taille (arcs)" : "Taille (aretes)"}</div><div style={S.statValue}>{stats.size}</div></div>
          <div style={S.statCard}><div style={S.statLabel}>Type</div><div style={{ color: "#3b82f6", fontWeight: "600", fontSize: "13px" }}>{directed ? "Orienté" : "Non-orienté"}</div></div>
        </div>
        {globalAnalysis.length > 0 && (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={S.sectionTitle}>Analyse</div>
            {globalAnalysis.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <span style={{ color: "#cbd5e1" }}>{r.label}</span>
                <span style={{ color: r.ok === true ? "#10b981" : r.ok === false ? "#f87171" : "#64748b", fontWeight: "600", fontSize: "11px" }}>
                  {r.ok === true ? "oui" : r.ok === false ? "non" : r.info}
                  {r.reason && <span style={{ color: "#475569", fontWeight: "normal" }}> ({r.reason})</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "12px 16px" }}>
          <div style={S.sectionTitle}>Degres {directed && <span style={{ color: "#475569" }}>(in/out)</span>}</div>
          {stats.order === 0
            ? <div style={{ color: "#475569", fontSize: "12px", fontStyle: "italic" }}>Aucun sommet</div>
            : Object.entries(stats.degrees).map(([id, deg]) => (
              <div key={id} style={S.degreeRow}>
                <div style={S.badge}>{deg.label}</div>
                {directed
                  ? <div style={{ fontSize: "12px" }}><span style={{ color: "#10b981", fontFamily: "JetBrains Mono, monospace" }}>in:{deg.in}</span>{" / "}<span style={{ color: "#f87171", fontFamily: "JetBrains Mono, monospace" }}>out:{deg.out}</span></div>
                  : <span style={{ color: "#3b82f6", fontWeight: "700", fontFamily: "JetBrains Mono, monospace" }}>{deg.in + deg.out}</span>
                }
              </div>
            ))
          }
        </div>
      </div>

      <div style={S.main}>
        <div style={S.toolbar}>
          <button style={btn(directed, false)} onClick={() => setDirected((d) => !d)}>
            {directed ? "Orienté" : "Non-orienté"}
          </button>
          {analyzeMode && sequence.length >= 3 && (
            <button style={{ ...btn(true, false), background: "rgba(139,92,246,0.2)", borderColor: "#8b5cf6", color: "#c4b5fd" }} onClick={runSeqAnalysis}>Lancer analyse</button>
          )}
          {analyzeMode && sequence.length > 0 && (
            <button style={btn(false, true)} onClick={clearSequence}>Effacer</button>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ position: "relative" }} data-menu>
            <button style={btn(menuOpen, false)} onClick={() => setMenuOpen((o) => !o)}>
              Outils {menuOpen ? "▲" : "▼"}
            </button>
            {menuOpen && (
              <div style={{ position: "fixed", top: "62px", right: "80px", zIndex: 99999, background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "8px", minWidth: "240px", boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}>
                <div style={{ fontSize: "10px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 10px 4px", fontWeight: "600" }}>Representations</div>
                {[{ label: "Successeurs & Predecesseurs", tab: "successors" }, { label: "Matrice d'adjacence", tab: "adjacency" }, { label: "Matrice d'incidence", tab: "incidence" }].map((item) => (
                  <button key={item.tab} onClick={() => { setShowRepr(item.tab); setMenuOpen(false); }} style={menuItemStyle}>{item.label}</button>
                ))}
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "6px 0" }} />
                <div style={{ fontSize: "10px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 10px 4px", fontWeight: "600" }}>Analyse</div>
                <button onClick={() => { toggleAnalyzeMode(); setMenuOpen(false); }} style={{ ...menuItemStyle, color: analyzeMode ? "#a78bfa" : "#e2e8f0" }}>
                  {analyzeMode ? "Quitter analyse sequence" : "Analyser une sequence"}
                </button>
                {directed && (
                  <button onClick={() => { setShowClosure(true); setMenuOpen(false); }} style={menuItemStyle}>Fermeture transitive</button>
                )}
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "6px 0" }} />
                <button onClick={() => { setShowDefs(true); setMenuOpen(false); }} style={menuItemStyle}>Definitions</button>
              </div>
            )}
          </div>
          <button style={btn(false, true)} onClick={resetGraph}>Reset</button>
        </div>

        <div style={S.hintBar}>{hintText}</div>

        <div style={S.canvas}>
          {elements.length === 0 && (
            <div style={S.emptyMsg}>
              <div style={{ fontSize: "32px", opacity: 0.3 }}>o</div>
              <div style={{ opacity: 0.5 }}>Clique sur le canvas pour ajouter un sommet</div>
            </div>
          )}
          {analyzeMode && (sequence.length > 0 || seqAnalysis.length > 0) && (
            <div style={{ position: "absolute", bottom: "20px", left: "20px", zIndex: 11, background: "rgba(13,17,23,0.92)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 18px", minWidth: "260px", maxWidth: "380px", backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
              <div style={{ fontSize: "10px", color: "#8b5cf6", fontWeight: "600", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.12em" }}>Sequence</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "8px", display: "flex", flexWrap: "wrap", gap: "2px", alignItems: "center" }}>
                {sequence.length === 0 ? "Aucun element" : sequence.map((item, i) => {
                  const isNode = !item.startsWith("e_");
                  const edge = !isNode && elements.find((el) => el.data.id === item);
                  const sep = directed ? ">" : "-";
                  const label = isNode ? item : (edge ? `${edge.data.source}${sep}${edge.data.target}` : item);
                  return (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                      {i > 0 && <span style={{ color: "#475569", margin: "0 2px" }}>.</span>}
                      <span style={{ background: isNode ? "rgba(168,85,247,0.2)" : "rgba(100,116,139,0.2)", border: isNode ? "1px solid #a855f7" : "1px solid #475569", borderRadius: "4px", padding: "1px 6px", color: isNode ? "#d8b4fe" : "#94a3b8", fontWeight: isNode ? "bold" : "normal", fontSize: "12px" }}>{label}</span>
                    </span>
                  );
                })}
              </div>
              {seqAnalysis.length > 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px", display: "grid", gap: "4px" }}>
                  {seqAnalysis.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ color: "#cbd5e1" }}>{r.label}</span>
                      <span style={{ color: r.ok === true ? "#10b981" : r.ok === false ? "#f87171" : "#64748b", fontWeight: "600" }}>
                        {r.ok === true ? "oui" : r.ok === false ? "non" : r.info}
                        {r.reason && <span style={{ color: "#475569", fontWeight: "normal" }}> ({r.reason})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <CytoscapeComponent
            elements={[...elements]}
            stylesheet={buildStylesheet(directed)}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            cy={(cy) => { cyRef.current = cy; }}
            layout={{ name: "preset" }}
            userZoomingEnabled={true} userPanningEnabled={true} boxSelectionEnabled={false}
          />
        </div>
      </div>

      {showDefs && <DefsPanel onClose={() => setShowDefs(false)} />}
      {showRepr && <RepresentationPanel elements={elements} directed={directed} onClose={() => setShowRepr(false)} initialTab={showRepr} />}
      {showClosure && directed && <ClosurePanel elements={elements} onClose={() => setShowClosure(false)} />}
      {showRenameModal && selectedNode && <RenameModal node={selectedNode} onConfirm={handleRenameConfirm} onCancel={() => { setShowRenameModal(false); setSelectedNode(null); }} />}
      {showWeightModal && selectedEdge && <WeightModal edge={selectedEdge} onConfirm={handleWeightConfirm} onCancel={() => { setShowWeightModal(false); setSelectedEdge(null); }} />}
    </div>
  );
}