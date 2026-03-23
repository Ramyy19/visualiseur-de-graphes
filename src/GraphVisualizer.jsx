import { useState, useRef, useEffect, useMemo } from "react";
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

 // Arbre : connexe ET acyclique (exactement n-1 aretes, sans boucle)
 const isTree = isConnected && !hasSelfLoop && edges.length === nodes.length - 1;
 results.push({ label: "Arbre", ok: isTree, reason: !isTree ? (!isConnected ? "Non connexe" : hasSelfLoop ? "Contient une boucle" : `${edges.length} aretes (besoin de ${nodes.length - 1})`) : "Connexe et acyclique" });

 // Foret : acyclique non necessairement connexe
 // Acyclique ssi |E| = |V| - nb_composantes
 const isForest = !hasSelfLoop && edges.length === nodes.length - components;
 if (!isTree) results.push({ label: "Foret", ok: isForest, reason: isForest ? `${components} arbre(s)` : "Contient un cycle" });

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

function buildStylesheet(directed, darkMode = true) {
  const nodeBg     = darkMode ? "#e5e7eb" : "#1f2937";
  const nodeColor  = darkMode ? "#111827" : "#f9fafb";
  const nodeBorder = darkMode ? "#6b7280" : "#374151";
  const edgeColor  = darkMode ? "#4b5563" : "#6b7280";
  const labelColor = darkMode ? "#f3f4f6" : "#f9fafb";
  const labelBg    = darkMode ? "#18181b" : "#111827";
  return [
    { selector: "node", style: { "background-color": nodeBg, "border-width": 2, "border-color": nodeBorder, color: nodeColor, label: "data(label)", "text-valign": "center", "text-halign": "center", "font-family": "JetBrains Mono, monospace", "font-size": "12px", "font-weight": "700", width: 40, height: 40 } },
    { selector: "node.highlighted", style: { "background-color": "#3b82f6", "border-color": "#93c5fd", "border-width": 3, color: "#ffffff" } },
    { selector: "edge", style: { width: 1.5, "line-color": edgeColor, "target-arrow-color": edgeColor, "target-arrow-shape": directed ? "triangle" : "none", "curve-style": "bezier", "loop-direction": "-45deg", "loop-sweep": "90deg", label: "data(weightLabel)", color: labelColor, "font-family": "JetBrains Mono, monospace", "font-size": "11px", "font-weight": "700", "text-background-color": labelBg, "text-background-opacity": 0.85, "text-background-padding": "3px" } },
    { selector: "edge:selected", style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 3 } },
    { selector: "edge.kruskal-acm",      style: { "line-color": "#10b981", "target-arrow-color": "#10b981", width: 4 } },
    { selector: "edge.kruskal-current",   style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 3, "line-style": "dashed" } },
    { selector: "edge.kruskal-rejected",  style: { "line-color": "#ef4444", "target-arrow-color": "#ef4444", width: 1.5, opacity: 0.5 } },
    { selector: "node.kruskal-connected", style: { "background-color": "#10b981", "border-color": "#6ee7b7", "border-width": 3, color: "#ffffff" } },
    { selector: "node.prim-visited",   style: { "background-color": "#10b981", "border-color": "#6ee7b7", "border-width": 3, color: "#ffffff" } },
    { selector: "node.prim-start",     style: { "background-color": "#059669", "border-color": "#34d399", "border-width": 4, color: "#ffffff" } },
    { selector: "edge.prim-tree",      style: { "line-color": "#3b82f6", "target-arrow-color": "#3b82f6", width: 3.5 } },
    { selector: "edge.prim-candidate", style: { "line-color": "#ec4899", "target-arrow-color": "#ec4899", width: 2, "line-style": "dashed" } },
    { selector: "node.multi-selected", style: { "background-color": "#f59e0b", "border-color": "#fcd34d", "border-width": 3, color: "#111111" } },
    { selector: "edge.multi-selected", style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 3 } },
    { selector: "node.seq-highlighted", style: { "background-color": "#8b5cf6", "border-color": "#c4b5fd", "border-width": 3, color: "#ffffff" } },
    { selector: "edge.seq-highlighted", style: { "line-color": "#8b5cf6", "target-arrow-color": "#8b5cf6", width: 3 } },
    // BFS styles
    { selector: "node.bfs-queue",   style: { "background-color": nodeBg, "border-color": "#f59e0b", "border-width": 3, color: nodeColor } },
    { selector: "node.bfs-visited", style: { "background-color": nodeBg, "border-color": "#ef4444", "border-width": 3, color: nodeColor } },
    { selector: "node.bfs-start",   style: { "background-color": "#f59e0b", "border-color": "#fcd34d", "border-width": 3, color: "#111111" } },
    { selector: "edge.bfs-tree",    style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 3 } },
    // DFS styles
    { selector: "node.dfs-stack",   style: { "background-color": nodeBg, "border-color": "#f59e0b", "border-width": 3, color: nodeColor } },
    { selector: "node.dfs-visited", style: { "background-color": nodeBg, "border-color": "#ef4444", "border-width": 3, color: nodeColor } },
    { selector: "node.dfs-done",    style: { "background-color": "#374151", "border-color": "#6b7280", "border-width": 2, color: "#9ca3af" } },
    { selector: "edge.dfs-tree",    style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 3 } },
    // Dijkstra styles
    { selector: "node.dijkstra-selected", style: { "background-color": "#3b82f6", "border-color": "#93c5fd", "border-width": 3, color: "#fff" } },
    { selector: "node.dijkstra-source",   style: { "background-color": "#1d4ed8", "border-color": "#93c5fd", "border-width": 4, color: "#fff" } },
    { selector: "node.dijkstra-pending",    style: { "background-color": "#f59e0b", "border-color": "#fcd34d", "border-width": 4, color: "#111" } },
    { selector: "node.dijkstra-path",       style: { "background-color": "#f59e0b", "border-color": "#fcd34d", "border-width": 4, color: "#111" } },
    { selector: "edge.dijkstra-tree",       style: { "line-color": "#3b82f6", "target-arrow-color": "#3b82f6", width: 2.5, opacity: 0.6 } },
    { selector: "edge.dijkstra-highlight",  style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 4 } },
    { selector: "edge.dijkstra-path",       style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 4 } },
    // Ford styles
    { selector: "node.ford-updated",  style: { "background-color": "#8b5cf6", "border-color": "#c4b5fd", "border-width": 3, color: "#fff" } },
    { selector: "node.ford-source",   style: { "background-color": "#6d28d9", "border-color": "#c4b5fd", "border-width": 4, color: "#fff" } },
  ];
}


const DEFINITIONS = [
  {
    term: "Graphe simple",
    def: "Un graphe sans boucles et avec au plus une arête entre deux sommets.",
    example: "Ex : Un réseau social où deux personnes sont soit amies, soit ne le sont pas."
  },
  {
    term: "Multigraphe",
    def: "Un graphe où plusieurs arêtes (parallèles) peuvent relier les mêmes sommets.",
    example: "Ex : Deux villes reliées par une autoroute ET une route nationale."
  },
  {
    term: "Hypergraphe",
    def: "Une généralisation du graphe où une arête peut relier plusieurs sommets.",
    example: "Ex : Une relation de groupe {A, B, C} liant trois personnes simultanément."
  },
  {
    term: "Graphe complet",
    def: "Un graphe simple où chaque paire de sommets est reliée par une arête. Pour n sommets, il possède n(n - 1) / 2 arêtes.",
    example: "Ex : Le graphe K4 possède 4 sommets et 6 arêtes."
  },
  {
    term: "Graphe partiel",
    def: "Un sous-ensemble des arêtes du graphe original en conservant tous les sommets.",
    example: "Ex : Planifier des travaux sur certaines routes sans supprimer de villes."
  },
  {
    term: "Sous-graphe",
    def: "Graphe obtenu en sélectionnant certains sommets et les arêtes entre eux.",
    example: "Ex : Extraire les gares d'une région à partir d'un réseau national."
  },
  {
    term: "Chemin",
    def: "Suite de sommets reliés par des arcs dans un graphe orienté (répétitions possibles).",
    example: "Ex : A → B → C → B."
  },
  {
    term: "Chemin simple",
    def: "Chemin où chaque arc est utilisé au plus une fois.",
    example: "Ex : A → B → C → D."
  },
  {
    term: "Chemin élémentaire",
    def: "Chemin où chaque sommet est visité au plus une fois.",
    example: "Ex : Un trajet qui ne repasse jamais par la même ville."
  },
  {
    term: "Chaîne",
    def: "Suite de sommets reliés par des arêtes dans un graphe non orienté.",
    example: "Ex : A - B - C - B."
  },
  {
    term: "Cycle",
    def: "Chaîne fermée où aucune arête n'est répétée.",
    example: "Ex : A - B - C - A."
  },
  {
    term: "Circuit",
    def: "Chemin fermé dans un graphe orienté.",
    example: "Ex : A → B → C → A."
  },
  {
    term: "Composante connexe",
    def: "Dans un graphe non orienté, c'est un sous-graphe maximal dans lequel n'importe quelle paire de sommets est reliée par une chaîne.",
    example: "Ex : Si un réseau social est divisé en deux groupes qui ne se connaissent pas, chaque groupe est une composante connexe."
  },
  {
    term: "Composante fortement connexe (CFC)",
    def: "Dans un graphe orienté, c'est un sous-graphe maximal où chaque sommet est accessible depuis n'importe quel autre par un chemin orienté.",
    example: "Ex : Un groupe de pages Web qui pointent toutes les unes vers les autres de manière cyclique."
  },
  {
    term: "Graphe connexe",
    def: "Graphe non orienté où chaque paire de sommets est reliée par un chemin.",
    example: "Ex : Un réseau où tous les ordinateurs communiquent."
  },
  {
    term: "Graphe fortement connexe",
    def: "Graphe orienté où chaque sommet est accessible depuis n'importe quel autre.",
    example: "Ex : Un circuit à sens unique fermé."
  },
  {
    term: "Graphe réduit",
    def: "Graphe obtenu en regroupant chaque composante fortement connexe en un sommet (résultat : DAG).",
    example: "Ex : Simplifier un réseau complexe en groupes."
  },
  {
    term: "Distance",
    def: "Nombre d'arêtes du plus court chemin entre deux sommets.",
    example: "Ex : Si A → B → C → D, alors distance(A, D) = 3."
  },
  {
    term: "Diamètre",
    def: "Plus grande distance entre deux sommets du graphe.",
    example: "Ex : Nombre maximum de sauts dans un réseau."
  },
  {
    term: "Arbre",
    def: "Graphe connexe sans cycle avec n sommets et n - 1 arêtes.",
    example: "Ex : Supprimer une arête déconnecte le graphe."
  },
  {
    term: "Forêt",
    def: "Graphe composé de plusieurs arbres (k composantes : |E| = |V| - k).",
    example: "Ex : Plusieurs arbres généalogiques séparés."
  },
  {
    term: "Arborescence",
    def: "Arbre orienté avec une racine et un chemin unique vers chaque sommet.",
    example: "Ex : Structure des dossiers d’un système."
  },
  {
    term: "Arbre couvrant de poids minimum (ACM)",
    def: "Sous-graphe reliant tous les sommets sans cycle avec un poids total minimal.",
    example: "Ex : Relier des bâtiments avec le moins de câble possible."
  }
];

function btn(active, danger) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    height: "32px",
    padding: "0 14px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
    background: "#1a1a1b",
    border: active 
      ? (danger ? "1px solid #ef4444" : "1px solid #f59e0b") 
      : "1px solid #1a1a1b",
    color: active ? (danger ? "#fca5a5" : "#fcd34d") : "#ffffff",
    transition: "all 0.2s ease",
  };
}

const menuItemStyle = {
 display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
 borderRadius: "8px", fontSize: "13px", fontFamily: "Inter, sans-serif",
 cursor: "pointer", border: "none", background: "transparent", color: "#111827",
};

// --- COMPOSANT INTERNE POUR LES CARTES DE CONTACT ---
function ContactCard({ ct, darkMode, cardBg, cardBorder, linkColor, text, muted }) {
  const [copied, setCopied] = useState(false);

  const handleAction = () => {
    if (ct.url) {
      window.open(ct.url, "_blank");
    } else {
      navigator.clipboard.writeText(ct.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      onClick={handleAction}
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: "10px",
        padding: "14px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.15s ease",
        userSelect: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = linkColor)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = cardBorder)}
    >
      <div style={{ marginBottom: "10px", display: "flex", justifyContent: "center" }}>
        <img
          src={`https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/${ct.label.toLowerCase()}.svg`}
          style={{
            width: "22px",
            height: "22px",
            // Inversion de couleur auto selon le thème
            filter: darkMode ? "invert(1) opacity(0.9)" : "invert(0) opacity(0.8)",
          }}
          alt={ct.label}
        />
      </div>

      <div style={{ fontSize: "11px", fontWeight: "700", color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
        {ct.label}
      </div>
      <div style={{ fontSize: "12px", color: text, fontFamily: "Inter, sans-serif", fontWeight: "500", wordBreak: "break-all" }}>
        {ct.value}
      </div>

      <div style={{ 
        fontSize: "9px", 
        color: copied ? "#10b981" : linkColor, 
        marginTop: "6px", 
        fontWeight: "700",
        transition: "color 0.2s ease" 
      }}>
        {ct.url ? "VISITER →" : (copied ? "COPIÉ !" : "COPIER")}
      </div>
    </div>
  );
}

// --- PANNEAU RÉFÉRENCES & CONTACT ---
function AboutPanel({ onClose, darkMode }) {
  const bg = darkMode ? "#111111" : "#ffffff";
  const border = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.14)";
  const text = darkMode ? "#f3f4f6" : "#111827";
  const muted = darkMode ? "#6b7280" : "#9ca3af";
  const cardBg = darkMode ? "rgba(255,255,255,0.04)" : "#f9fafb";
  const cardBorder = darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const linkColor = darkMode ? "#60a5fa" : "#1e3354";

  const refs = [
    {
      title: "Algorithme de Prim",
      desc: "Algorithme glouton qui construit un arbre couvrant de poids minimum en ajoutant à chaque étape l'arête de poids minimal reliant l'arbre courant au reste du graphe.",
      url: "https://fr.wikipedia.org/wiki/Algorithme_de_Prim",
      tag: "Prim",
      color: "#10b981",
    },
    {
      title: "Algorithme de Kruskal",
      desc: "Algorithme glouton qui construit un ACM en triant toutes les arêtes par poids et en les ajoutant une à une si elles ne créent pas de cycle (Union-Find).",
      url: "https://fr.wikipedia.org/wiki/Algorithme_de_Kruskal",
      tag: "Kruskal",
      color: "#f59e0b",
    },
  ];

  const contacts = [
    { label: "GitHub", value: "Ramyy19", url: "https://github.com/Ramyy19" },
    { label: "Discord", value: "pliskin19", url: null },
    { label: "LinkedIn", value: "Ramy Allalou", url: "https://www.linkedin.com/in/ramy-allalou-8a493a380/" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: "16px", width: "min(640px, 95vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "15px", color: text, fontFamily: "Inter, sans-serif" }}>Références & Contact</div>
            <div style={{ fontSize: "12px", color: muted, marginTop: "2px" }}>Ressources et informations sur l'auteur</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: "8px", color: muted, cursor: "pointer", padding: "6px 10px", fontSize: "14px" }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Références */}
          <div>
            <div style={{ fontSize: "10px", fontWeight: "700", color: muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>Références Wikipedia</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {refs.map((r) => (
                <a key={r.title} href={r.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderLeft: `3px solid ${r.color}`, borderRadius: "10px", padding: "14px 16px", cursor: "pointer", transition: "border-color 0.15s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontWeight: "600", fontSize: "13px", color: text, fontFamily: "Inter, sans-serif" }}>{r.title}</span>
                      <span style={{ fontSize: "10px", fontWeight: "600", color: r.color, background: `${r.color}18`, padding: "2px 8px", borderRadius: "9999px", border: `1px solid ${r.color}30` }}>{r.tag}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: muted, lineHeight: "1.5", marginBottom: "8px" }}>{r.desc}</div>
                    <div style={{ fontSize: "11px", color: linkColor, fontFamily: "Inter, sans-serif" }}>En savoir plus →</div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Séparateur */}
          <div style={{ height: "1px", background: border, margin: "10px 0" }} />

          {/* Contact — Allalou Ramy */}
          <div>
            <div style={{ fontSize: "10px", fontWeight: "700", color: muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>
              Me contacter
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              {contacts.map((ct) => (
                <ContactCard 
                  key={ct.label} 
                  ct={ct} 
                  darkMode={darkMode} 
                  cardBg={cardBg} 
                  cardBorder={cardBorder} 
                  linkColor={linkColor} 
                  text={text} 
                  muted={muted}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DefsPanel({ onClose, darkMode = true }) {
 return (
 <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
 <div style={{ background: darkMode ? "#0d0605" : "#ffffff", border: `1px solid ${darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.14)"}`, borderRadius: "16px", width: "min(720px, 95vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
 <div style={{ padding: "18px 22px", borderBottom: `1px solid ${darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
 <div style={{ fontWeight: "600", fontSize: "15px", color: darkMode ? "#f3f4f6" : "#111827", fontFamily: "Inter, sans-serif" }}>Définitions</div>
 <button onClick={onClose} style={{ background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)", border: `1px solid ${darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.14)"}`, borderRadius: "6px", color: darkMode ? "#6b7280" : "#9ca3af", cursor: "pointer", padding: "6px 10px" }}>✕</button>
 </div>
 <div style={{ overflowY: "auto", padding: "16px 20px", display: "grid", gap: "10px" }}>
 {DEFINITIONS.map((d) => (
 <div key={d.term} style={{ background: darkMode ? "rgba(255,255,255,0.02)" : "#f9fafb", border: `1px solid ${darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"}`, borderRadius: "10px", padding: "12px 16px", borderLeft: `3px solid ${darkMode ? "#8b0000" : "#3b82f6"}` }}>
 <div style={{ fontWeight: "700", color: darkMode ? "#f3f4f6" : "#111827", marginBottom: "4px", fontSize: "14px" }}>{d.term}</div>
 <div style={{ color: darkMode ? "#9ca3af" : "#374151", fontSize: "13px", lineHeight: "1.5", marginBottom: "6px" }}>{d.def}</div>
 <div style={{ color: darkMode ? "#6b7280" : "#9ca3af", fontSize: "12px", fontStyle: "italic" }}>{d.example}</div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}

function RenameModal({ node, onConfirm, onCancel }) {
 const [val, setVal] = useState(node?.data("label") ?? "");
 const inputRef = useRef(null);
 useEffect(() => {
   // Delay focus to ensure modal is fully rendered and "r" keyup has fired
   const t = setTimeout(() => {
     if (inputRef.current) {
       inputRef.current.focus();
       inputRef.current.select();
     }
   }, 50);
   return () => clearTimeout(t);
 }, []);
 return (
 <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
 <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "24px", width: "280px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
 <div style={{ fontWeight: "600", marginBottom: "4px", color: "white", fontFamily: "Inter, sans-serif" }}>Renommer le sommet</div>
 <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "16px" }}>Nom actuel : {node?.data("label")}</div>
 <input style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: "6px", padding: "8px 12px", color: "white", fontFamily: "monospace", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box", outline: "none" }}
 ref={inputRef} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onConfirm(val); if (e.key === "Escape") onCancel(); }} />
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
 <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "24px", width: "280px" }}>
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

function RepresentationPanel({ elements, directed, onClose, initialTab, darkMode = true }) {
 const [tab, setTab] = useState(initialTab && initialTab !== true ? initialTab : "successors");
 const succ = computeSuccessors(elements);
 const pred = computePredecessors(elements);
 const { labels: adjLabels, matrix: adjMatrix } = computeAdjacencyMatrix(elements, directed);
 const { nodeLabels: incNodes, edgeLabels: incEdges, matrix: incMatrix } = computeIncidenceMatrix(elements, directed);

 const textMain = darkMode ? "#f3f4f6" : "#111827";
 const textMuted = darkMode ? "#6b7280" : "#6b7280";
 const borderColor = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.22)";
 const borderFaint = darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.06)";
 const headerBg = darkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.04)";
 const panelBg = darkMode ? "#0d0605" : "#ffffff";
 const nodeLabelColor = darkMode ? "#e05252" : "#1d4ed8";
 const nodeAccentBg = darkMode ? "rgba(139,0,0,0.08)" : "rgba(29,78,216,0.04)";
 const valueColor = darkMode ? "#d1d5db" : "#1f2937";
 const accentGreen = darkMode ? "#10b981" : "#059669";
 const accentRed = darkMode ? "#ef4444" : "#dc2626";
 const zeroColor = darkMode ? "#4b5563" : "#9ca3af";
 const tabActiveColor = darkMode ? "#e05252" : "#1d4ed8";
 const tabActiveBg = darkMode ? "rgba(139,0,0,0.12)" : "rgba(29,78,216,0.08)";

 const tabStyle = (active) => ({ padding: "6px 14px", borderRadius: "9999px", fontSize: "12px", fontWeight: "500", cursor: "pointer", fontFamily: "Inter, sans-serif", border: "none", background: active ? tabActiveBg : "transparent", color: active ? tabActiveColor : textMuted });
 const tabs = [{ key: "successors", label: "Successeurs" }, { key: "predecessors", label: "Predecesseurs" }, { key: "adjacency", label: "Matrice adjacence" }, { key: "incidence", label: "Matrice incidence" }];

 return (
 <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
 <div style={{ background: panelBg, border: `1px solid ${borderColor}`, borderRadius: "16px", width: "min(700px, 96vw)", maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
 <div style={{ padding: "18px 22px", borderBottom: `1px solid ${borderColor}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
 <div style={{ fontWeight: "600", fontSize: "15px", color: textMain, fontFamily: "Inter, sans-serif" }}>Representations du graphe</div>
 <button onClick={onClose} style={{ background: headerBg, border: `1px solid ${borderColor}`, borderRadius: "6px", color: textMuted, cursor: "pointer", padding: "6px 10px" }}>✕</button>
 </div>
 <div style={{ display: "flex", gap: "4px", padding: "12px 22px", borderBottom: `1px solid ${borderColor}`, flexWrap: "wrap" }}>
 {tabs.map((t) => <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
 </div>
 <div style={{ overflowY: "auto", overflowX: "auto", padding: "18px 22px" }}>
 {(tab === "successors" || tab === "predecessors") && (() => {
   const data = tab === "successors" ? succ : pred;
   const gamma = tab === "successors" ? "+" : "−";
   const entries = Object.entries(data);
   return (
     <table style={{ borderCollapse: "collapse", fontFamily: "JetBrains Mono, monospace", width: "100%" }}>
       <thead>
         <tr>
           <th style={{ padding: "8px 16px", border: `1px solid ${borderColor}`, color: textMuted, fontSize: "12px", fontWeight: "700", textAlign: "center", background: headerBg, whiteSpace: "nowrap" }}>
             x<sub>i</sub>
           </th>
           <th style={{ padding: "8px 16px", border: `1px solid ${borderColor}`, color: textMuted, fontSize: "12px", fontWeight: "700", textAlign: "center", background: headerBg }}>
             Γ<sup style={{ fontSize: "9px" }}>{gamma}</sup>(x<sub>i</sub>)
           </th>
         </tr>
       </thead>
       <tbody>
         {entries.map(([node, neighbors]) => (
           <tr key={node}>
             <td style={{ padding: "9px 16px", border: `1px solid ${borderFaint}`, color: nodeLabelColor, fontWeight: "700", fontSize: "14px", textAlign: "center", background: nodeAccentBg, whiteSpace: "nowrap" }}>{node}</td>
             <td style={{ padding: "9px 16px", border: `1px solid ${borderFaint}`, color: valueColor, fontSize: "13px", textAlign: "left" }}>
               {neighbors.length === 0
                 ? <span style={{ color: textMuted }}>∅</span>
                 : <span>{"{" + neighbors.join(", ") + "}"}</span>}
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
 <thead><tr><th style={{ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: textMuted, fontWeight: "600", background: headerBg, borderBottom: `2px solid ${borderColor}`, textAlign: "center", whiteSpace: "nowrap" }}></th>{adjLabels.map((l) => <th key={l} style={{ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: textMuted, fontWeight: "600", background: headerBg, borderBottom: `2px solid ${borderColor}`, textAlign: "center", whiteSpace: "nowrap" }}>{l}</th>)}</tr></thead>
 <tbody>{adjLabels.map((row) => (<tr key={row}><td style={{ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: nodeLabelColor, fontWeight: "700", background: headerBg, borderBottom: `1px solid ${borderFaint}`, textAlign: "center" }}>{row}</td>{adjLabels.map((col) => <td key={col} style={{ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: adjMatrix[row][col] > 0 ? accentGreen : zeroColor, borderBottom: `1px solid ${borderFaint}`, textAlign: "center" }}>{adjMatrix[row][col]}</td>)}</tr>))}</tbody>
 </table>
 </div>
 )}
 {tab === "incidence" && (
 incEdges.length === 0
 ? <div style={{ color: textMuted, fontSize: "13px", fontStyle: "italic" }}>Aucune arete (boucles exclues).</div>
 : <div style={{ overflowX: "auto" }}>
 <table style={{ borderCollapse: "collapse" }}>
 <thead><tr><th style={{ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: textMuted, fontWeight: "600", background: headerBg, borderBottom: `2px solid ${borderColor}`, textAlign: "center", whiteSpace: "nowrap" }}></th>{incEdges.map((e) => <th key={e} style={{ padding: "7px 12px", fontSize: "11px", fontFamily: "JetBrains Mono, monospace", color: textMuted, fontWeight: "600", background: headerBg, borderBottom: `2px solid ${borderColor}`, textAlign: "center", whiteSpace: "nowrap" }}>{e}</th>)}</tr></thead>
 <tbody>{incNodes.map((row) => (<tr key={row}><td style={{ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: nodeLabelColor, fontWeight: "700", background: headerBg, borderBottom: `1px solid ${borderFaint}`, textAlign: "center" }}>{row}</td>{incEdges.map((col) => { const val = incMatrix[row][col]; return <td key={col} style={{ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: val === 1 ? accentGreen : val === -1 ? accentRed : zeroColor, borderBottom: `1px solid ${borderFaint}`, textAlign: "center" }}>{val}</td>; })}</tr>))}</tbody>
 </table>
 {directed && <div style={{ fontSize: "11px", color: textMuted, marginTop: "10px" }}>1 = départ, −1 = arrivée</div>}
 </div>
 )}
 </div>
 </div>
 </div>
 );
}


// ─── Algorithme de Prim ──────────────────────────────────────────────────────

function computePrimSteps(elements, startId) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source && el.data.source !== el.data.target);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });

  const inTree = [startId];
  const treeEdges = [];
  const steps = [];

  const getCandidates = (tree) => edges.filter(e => tree.includes(e.data.source) !== tree.includes(e.data.target));
  const getIgnored = (tree) => edges.filter(e => tree.includes(e.data.source) && tree.includes(e.data.target) && !treeEdges.includes(e.data.id));

  const pushStep = (chosen, total, msg) => {
    steps.push({
      inTree: [...inTree],
      treeEdges: [...treeEdges],
      candidates: getCandidates(inTree).map(e => e.data.id),
      ignored: getIgnored(inTree).map(e => e.data.id), // On calcule les cycles ici
      chosenEdge: chosen,
      totalWeight: total,
      message: msg,
    });
  };

  pushStep(null, 0, `Départ : ${idToLabel[startId]}`);

  let totalWeight = 0;
  while (inTree.length < nodes.length) {
    const candidates = getCandidates(inTree);
    if (candidates.length === 0) break;
    const best = candidates.reduce((m, e) => ((e.data.weight ?? 0) < (m.data.weight ?? 0) ? e : m));
    const newNode = inTree.includes(best.data.source) ? best.data.target : best.data.source;
    totalWeight += (best.data.weight ?? 0);
    inTree.push(newNode);
    treeEdges.push(best.data.id);
    pushStep(best.data.id, totalWeight, `Ajout de ${idToLabel[best.data.source]}—${idToLabel[best.data.target]} (poids ${best.data.weight ?? 0})`);
  }
  return steps;
}

// ─── Panneau Prim ────────────────────────────────────────────────────────────

// ─── Dijkstra ─────────────────────────────────────────────────────────────────

function computeDijkstraSteps(elements, startId) {
  const nodes = elements.filter(el => !el.data.source);
  const edges = elements.filter(el => !!el.data.source && el.data.source !== el.data.target);
  const idToLabel = {};
  nodes.forEach(n => { idToLabel[n.data.id] = n.data.label; });
  const ids = nodes.map(n => n.data.id);

  const adj = {};
  ids.forEach(id => { adj[id] = []; });
  edges.forEach(e => {
    if (e.data.weight !== null && e.data.weight !== undefined)
      adj[e.data.source].push({ to: e.data.target, w: Number(e.data.weight), eid: e.data.id });
  });

  const lambda = {};
  const predEdge = {}; // predEdge[nodeId] = edgeId of the best known arc to nodeId
  ids.forEach(id => { lambda[id] = id === startId ? 0 : Infinity; predEdge[id] = null; });

  const S = new Set(); // selected nodes
  const committedRows = [];
  const steps = [];

  committedRows.push({ selectedId: '__init__', lambdaSnap: { ...lambda }, S: new Set(S) });

  // Each step carries explicit cy instructions:
  //   cyNodes: { id -> 'source'|'selected'|'pending'|'path'|null }
  //   cyEdges: { eid -> 'tree'|'highlight'|'path'|null }
  const makeCyState = (overrides = {}) => {
    const cyNodes = {};
    const cyEdges = {};
    // Default: source = source, S members = selected, predEdge arcs = tree
    ids.forEach(id => {
      if (id === startId) cyNodes[id] = 'source';
      else if (S.has(id)) cyNodes[id] = 'selected';
      else cyNodes[id] = null;
    });
    Object.entries(predEdge).forEach(([, eid]) => {
      if (eid) cyEdges[eid] = 'tree';
    });
    // Apply overrides
    Object.assign(cyNodes, overrides.cyNodes || {});
    Object.assign(cyEdges, overrides.cyEdges || {});
    return { cyNodes, cyEdges };
  };

  // Step 0: init
  steps.push({
    committedRows: committedRows.map(r => ({ ...r, lambdaSnap: { ...r.lambdaSnap }, S: new Set(r.S) })),
    pendingRow: null, S: new Set(S), lambda: { ...lambda }, done: false,
    phase: 'init',
    cy: makeCyState(),
    message: 'Initialisation : λ(source) = 0, λ(autres) = ∞',
  });

  while (S.size < ids.length) {
    let minVal = Infinity, chosen = null;
    ids.forEach(id => { if (!S.has(id) && lambda[id] < minVal) { minVal = lambda[id]; chosen = id; } });
    if (chosen === null || minVal === Infinity) break;

    // ── STEP A : i sélectionné (orange) ──────────────────────────────────
    const cellsA = {};
    ids.forEach(id => {
      cellsA[id] = (S.has(id) || id === chosen)
        ? { slash: true }
        : { slash: false, formula: null, value: lambda[id] };
    });

    steps.push({
      committedRows: committedRows.map(r => ({ ...r, lambdaSnap: { ...r.lambdaSnap }, S: new Set(r.S) })),
      pendingRow: { selectedId: chosen, cells: cellsA, phase: 'selected' },
      S: new Set(S), lambda: { ...lambda }, done: false,
      phase: 'selected',
      cy: makeCyState({ cyNodes: { [chosen]: 'pending' } }),
      message: `① Sélection de ${idToLabel[chosen]} (λ = ${minVal}) — on examine ses successeurs.`,
    });

    // ── STEP B : Formules calculées, arc amélioré surligné ────────────────
    // Compute which arcs improve lambda
    const improvingArcs = []; // { to, w, eid } where lambda[chosen]+w < lambda[to]
    const formulaMap = {};
    adj[chosen].forEach(({ to, w, eid }) => {
      if (!S.has(to)) {
        const nd = lambda[chosen] + w;
        const lStr = String(minVal);
        formulaMap[to] = { formula: `${lStr}+${w}`, newVal: nd };
        if (nd < lambda[to]) improvingArcs.push({ to, w, eid });
      }
    });

    // nextMin after potential updates
    const tempLambda = { ...lambda };
    improvingArcs.forEach(({ to, w }) => { if (lambda[chosen] + w < tempLambda[to]) tempLambda[to] = lambda[chosen] + w; });
    let nextMin = Infinity;
    ids.forEach(id => { if (!S.has(id) && id !== chosen && tempLambda[id] < nextMin) nextMin = tempLambda[id]; });

    const cellsB = {};
    ids.forEach(id => {
      if (S.has(id) || id === chosen) {
        cellsB[id] = { slash: true };
      } else if (formulaMap[id]) {
        cellsB[id] = { slash: false, formula: formulaMap[id].formula, value: formulaMap[id].newVal, isMin: tempLambda[id] === nextMin };
      } else {
        cellsB[id] = { slash: false, formula: null, value: lambda[id], isMin: tempLambda[id] === nextMin };
      }
    });

    // cyEdges: improving arcs highlighted, existing tree stays
    const cyEdgesB = {};
    Object.entries(predEdge).forEach(([, eid]) => { if (eid) cyEdgesB[eid] = 'tree'; });
    improvingArcs.forEach(({ eid }) => { cyEdgesB[eid] = 'highlight'; });

    steps.push({
      committedRows: committedRows.map(r => ({ ...r, lambdaSnap: { ...r.lambdaSnap }, S: new Set(r.S) })),
      pendingRow: { selectedId: chosen, cells: cellsB, phase: 'formulas' },
      S: new Set(S), lambda: { ...lambda }, done: false,
      phase: 'formulas',
      cy: { cyNodes: makeCyState({ cyNodes: { [chosen]: 'pending' } }).cyNodes, cyEdges: cyEdgesB },
      message: `② Calcul des distances via ${idToLabel[chosen]}. Arc(s) amélioré(s) surligné(s).`,
    });

    // ── STEP C : Validation — i intègre S ────────────────────────────────
    S.add(chosen);
    const committedEdges = []; // newly set predEdge arcs
    adj[chosen].forEach(({ to, w, eid }) => {
      if (!S.has(to)) {
        const nd = lambda[chosen] + w;
        if (nd < lambda[to]) { lambda[to] = nd; predEdge[to] = eid; committedEdges.push(eid); }
      }
    });

    committedRows.push({ selectedId: chosen, lambdaSnap: { ...lambda }, S: new Set(S) });
    const isDone = S.size === ids.length || ids.every(id => S.has(id) || lambda[id] === Infinity);

    // cyEdges: only the newly committed arcs highlighted
    const cyEdgesC = {};
    committedEdges.forEach(eid => { cyEdgesC[eid] = 'highlight'; });

    steps.push({
      committedRows: committedRows.map(r => ({ ...r, lambdaSnap: { ...r.lambdaSnap }, S: new Set(r.S) })),
      pendingRow: null,
      S: new Set(S), lambda: { ...lambda }, done: isDone,
      phase: isDone ? 'done' : 'committed',
      cy: isDone
        ? (() => {
            const cyNodesD = {};
            const cyEdgesD = {};
            ids.forEach(id => { cyNodesD[id] = id === startId ? 'source' : S.has(id) ? 'path' : null; });
            Object.entries(predEdge).forEach(([, eid]) => { if (eid) cyEdgesD[eid] = 'path'; });
            return { cyNodes: cyNodesD, cyEdges: cyEdgesD };
          })()
        : { cyNodes: makeCyState().cyNodes, cyEdges: cyEdgesC },
      message: isDone
        ? `✓ Dijkstra terminé — toutes les distances optimales depuis ${idToLabel[startId]}.`
        : `③ ${idToLabel[chosen]} intègre S. Arc(s) mis à jour surligné(s).`,
    });

    if (isDone) break;
  }

  return { steps, ids, idToLabel };
}


function DijkstraPanel({ elements, startNodeId, onClose, onHide, darkMode, onStep }) {
  const frozenElements = useMemo(() => elements, []);
  const { steps, ids, idToLabel } = useMemo(() => {
    try { return computeDijkstraSteps(frozenElements, startNodeId); }
    catch(e) { return { steps: [], ids: [], idToLabel: {} }; }
  }, []);
  const [idx, setIdx] = useState(0);
  useEffect(() => { if (steps[idx] && onStep) onStep(steps[idx]); }, [idx]);

  const bg = darkMode ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.98)";
  const borderC = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.22)";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textMuted = darkMode ? "#6b7280" : "#9ca3af";
  const mono = "JetBrains Mono, monospace";
  const thBg = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const thBorder = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.18)";
  const rowBorder = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.1)";
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };

  if (steps.length === 0) return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: bg, border: `1px solid ${borderC}`, borderRadius: "14px", padding: "18px 24px", maxWidth: "420px", textAlign: "center" }}>
      <div style={{ color: textMain, fontWeight: "600", marginBottom: "6px", fontFamily: "Inter, sans-serif" }}>Impossible de lancer Dijkstra</div>
      <div style={{ color: textMuted, fontSize: "12px", marginBottom: "16px" }}>Le graphe doit être orienté pondéré avec un sommet source.</div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer le panneau" style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", fontSize: "13px", padding: "3px 8px", lineHeight: 1 }}>👁</button>
              <button onClick={onClose} style={{ padding: "7px 20px", background: "#3b82f6", border: "none", borderRadius: "8px", color: "#fff", cursor: "pointer" }}>Fermer</button>
            </div>
    </div>
  );

  const step = steps[idx];
  const done = step.done;
  const { committedRows, pendingRow } = step;

  // Column widths: we need a fixed width for the label column
  const labelColW = "148px";
  const dataColW = "68px";

  return (
    <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: bg, border: `1px solid ${borderC}`, borderRadius: "16px", width: "min(900px, 96vw)", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" }}>

      <div style={{ height: "3px", background: thBorder, borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#3b82f6", transition: "width 0.3s" }} />
      </div>

      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${borderC}` }}>
        <span style={{ fontWeight: "700", fontSize: "13px", color: textMain, fontFamily: "Inter, sans-serif" }}>
          Dijkstra — Étape {idx + 1}/{steps.length}
          {step.S.size > 0 && <span style={{ color: "#3b82f6", marginLeft: "10px", fontSize: "11px", fontWeight: "500" }}>S = {"{" + [...step.S].map(id => idToLabel[id]).join(", ") + "}"}</span>}
        </span>
              <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", fontSize: "14px", padding: "2px 8px", lineHeight: 1 }}>👁</button>
              
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: textMuted, cursor: "pointer", fontSize: "16px" }}>✕</button>
      </div>

      <div style={{ padding: "6px 16px 4px", fontSize: "12px", color: done ? "#10b981" : (step.phase === 'selected' ? (darkMode ? "#fcd34d" : "#b45309") : step.phase === 'formulas' ? (darkMode ? "#93c5fd" : "#1d4ed8") : textMuted), fontFamily: "Inter, sans-serif" }}>
        {step.phase === 'selected' && <span style={{ marginRight: "6px" }}>①</span>}
        {step.phase === 'formulas' && <span style={{ marginRight: "6px" }}>②</span>}
        {step.phase === 'committed' && <span style={{ marginRight: "6px" }}>③</span>}
        {step.message}
      </div>

      {/* Graph legend */}
      <div style={{ padding: "0 16px 8px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
        {!done ? [
          ["#1d4ed8","Source (S₀)"],
          ["#3b82f6","Dans S (sélectionné)"],
          ["#f59e0b","En cours d'évaluation"],
        ].map(([col, lab]) => (
          <div key={lab} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: textMuted }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: col, flexShrink: 0 }} />{lab}
          </div>
        )) : [
          ["#1d4ed8","Source"],
          ["#f59e0b","Plus courts chemins (arborescence)"],
        ].map(([col, lab]) => (
          <div key={lab} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: textMuted }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: col, flexShrink: 0 }} />{lab}
          </div>
        ))}
      </div>

      <div style={{ overflowX: "auto", padding: "0 12px 4px" }}>
        <table style={{ borderCollapse: "collapse", fontFamily: mono, fontSize: "12px", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: labelColW }} />
            {ids.map(id => <col key={id} style={{ width: dataColW }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding: "6px 12px", textAlign: "left", color: textMuted, fontSize: "11px", fontWeight: "700", background: thBg, borderBottom: `2px solid ${thBorder}`, borderRight: `1px solid ${thBorder}`, whiteSpace: "nowrap" }}>Sommets sélectionnés</th>
              {ids.map(id => (
                <th key={id} style={{ padding: "6px 0", textAlign: "center", color: textMain, fontWeight: "700", background: thBg, borderBottom: `2px solid ${thBorder}`, borderLeft: `1px solid ${rowBorder}` }}>
                  {idToLabel[id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Committed rows */}
            {(() => {
              // For done state: find the last committed row where each id was NOT yet slashed
              // That's the row showing its definitive value → circle in gold
              const definitiveRowIdx = {};
              if (done) {
                ids.forEach(id => {
                  for (let r = committedRows.length - 1; r >= 0; r--) {
                    const row = committedRows[r];
                    const isInit = row.selectedId === '__init__';
                    const inSAtRow = !isInit && row.S.has(id);
                    if (!inSAtRow) { definitiveRowIdx[id] = r; break; }
                  }
                });
              }
              return committedRows.map((row, ri) => {
                const isInit = row.selectedId === '__init__';
                return (
                  <tr key={ri} style={{ background: "transparent" }}>
                    <td style={{ padding: "5px 12px", fontFamily: "Inter, sans-serif", fontSize: "11px", color: isInit ? textMuted : textMain, fontWeight: "400", borderBottom: `1px solid ${rowBorder}`, borderRight: `1px solid ${thBorder}`, whiteSpace: "nowrap" }}>
                      {isInit ? "Initialisation" : idToLabel[row.selectedId]}
                    </td>
                    {ids.map(id => {
                      const inSAtRow = !isInit && row.S.has(id);
                      const val = row.lambdaSnap[id];
                      const isDefinitive = done && definitiveRowIdx[id] === ri;
                      return (
                        <td key={id} style={{ padding: "5px 0", textAlign: "center", borderLeft: `1px solid ${rowBorder}`, borderBottom: `1px solid ${rowBorder}` }}>
                          {inSAtRow ? (
                            <span style={{ color: textMuted }}>╱</span>
                          ) : isDefinitive ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              minWidth: "32px", height: "28px", borderRadius: "4px",
                              border: `2px solid ${darkMode ? "#f59e0b" : "#b45309"}`,
                              color: darkMode ? "#fcd34d" : "#b45309",
                              fontWeight: "700", fontSize: "12px", padding: "0 4px",
                            }}>
                              {val === Infinity ? "∞" : val}
                            </span>
                          ) : (
                            <span style={{ color: val === Infinity ? textMuted : textMain }}>
                              {val === Infinity ? "∞" : val}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              });
            })()}

            {/* Pending row (formulas) */}
            {pendingRow && (
              <tr style={{ background: darkMode ? "rgba(59,130,246,0.07)" : "rgba(59,130,246,0.04)" }}>
                <td style={{ padding: "5px 12px", fontFamily: "Inter, sans-serif", fontSize: "11px", color: "#3b82f6", fontWeight: "700", borderBottom: `1px solid ${rowBorder}`, borderRight: `1px solid ${thBorder}`, whiteSpace: "nowrap" }}>
                  {idToLabel[pendingRow.selectedId]}
                </td>
                {ids.map(id => {
                  const cell = pendingRow.cells[id];
                  return (
                    <td key={id} style={{ padding: "5px 0", textAlign: "center", borderLeft: `1px solid ${rowBorder}`, borderBottom: `1px solid ${rowBorder}` }}>
                      {cell.slash ? (
                        <span style={{ color: textMuted }}>╱</span>
                      ) : cell.formula ? (
                        <span style={{
                          display: "inline-block",
                          padding: "1px 4px",
                          borderRadius: "3px",
                          border: cell.isMin ? "2px solid #ef4444" : "none",
                          color: cell.isMin ? "#ef4444" : (darkMode ? "#93c5fd" : "#1d4ed8"),
                          fontWeight: "700",
                          fontSize: "11px",
                        }}>
                          {cell.formula}
                        </span>
                      ) : (
                        <span style={{ color: cell.value === Infinity ? textMuted : textMain }}>
                          {cell.value === Infinity ? "∞" : cell.value}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}

            {/* STOP row */}
            {done && (
              <tr>
                <td style={{ padding: "5px 12px", color: "#10b981", fontWeight: "700", fontFamily: "Inter, sans-serif", fontSize: "11px", borderRight: `1px solid ${thBorder}` }}>STOP</td>
                {ids.map(id => <td key={id} style={{ borderLeft: `1px solid ${rowBorder}` }} />)}
              </tr>
            )}
          </tbody>
        </table>

        {/* "min" annotation row under pending */}
        {pendingRow && (() => {
          const hasMin = ids.some(id => pendingRow.cells[id]?.isMin);
          if (!hasMin) return null;
          return (
            <div style={{ display: "flex", marginTop: "2px" }}>
              <div style={{ width: labelColW, flexShrink: 0 }} />
              {ids.map(id => (
                <div key={id} style={{ width: dataColW, textAlign: "center", fontSize: "11px", fontWeight: "700", color: "#ef4444", fontFamily: "Inter, sans-serif", flexShrink: 0 }}>
                  {pendingRow.cells[id]?.isMin ? "min" : ""}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <div style={{ padding: "10px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${borderC}` }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ ...btnBase, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: idx === 0 ? textMuted : textMain, border: `1px solid ${borderC}`, cursor: idx === 0 ? "default" : "pointer" }}>
          ← Précédent
        </button>
        <span style={{ fontSize: "11px", color: done ? "#10b981" : textMuted, fontWeight: done ? "600" : "400" }}>
          {done ? "Terminé" : `Étape ${idx + 1} / ${steps.length}`}
        </span>
        <button onClick={() => setIdx(i => Math.min(steps.length - 1, i + 1))} disabled={idx === steps.length - 1}
          style={{ ...btnBase, background: idx === steps.length - 1 ? "transparent" : "rgba(59,130,246,0.1)", color: idx === steps.length - 1 ? textMuted : (darkMode ? "#93c5fd" : "#1d4ed8"), border: `1px solid ${idx === steps.length - 1 ? borderC : "rgba(59,130,246,0.4)"}`, cursor: idx === steps.length - 1 ? "default" : "pointer" }}>
          Suivant →
        </button>
      </div>
    </div>
  );
}

// ─── Bellman-Ford ─────────────────────────────────────────────────────────────

function computeFordSteps(elements, startId) {
  const nodes = elements.filter(el => !el.data.source);
  const edges = elements.filter(el => !!el.data.source && el.data.source !== el.data.target);
  const idToLabel = {};
  nodes.forEach(n => { idToLabel[n.data.id] = n.data.label; });
  const ids = nodes.map(n => n.data.id);
  const n = ids.length;

  // predAdj[j] = list of {src, w} (predecessors of j)
  const predAdj = {};
  ids.forEach(id => { predAdj[id] = []; });
  edges.forEach(e => {
    if (e.data.weight !== null && e.data.weight !== undefined)
      predAdj[e.data.target].push({ src: e.data.source, w: Number(e.data.weight) });
  });

  let lambda = {};
  ids.forEach(id => { lambda[id] = id === startId ? 0 : Infinity; });

  // Each step: full row of lambda values + per-cell computation details
  const allRows = [{ k: 0, lambda: { ...lambda }, computations: {} }];
  const steps = [];

  // Step 0: init
  steps.push({
    k: 0, rows: [allRows[0]], done: false,
    message: 'Initialisation : λ₀(source) = 0, λ₀(autres) = ∞',
    computationDetail: '',
  });

  let stopped = false;
  for (let k = 1; k <= n && !stopped; k++) {
    const newLambda = { ...lambda };
    const computations = {}; // j -> { terms: [{src, w, val}], result }

    ids.forEach(j => {
      const terms = predAdj[j]
        .filter(({ src }) => lambda[src] !== Infinity)
        .map(({ src, w }) => ({ src, w, val: lambda[src] + w }));

      if (terms.length > 0) {
        const best = Math.min(...terms.map(t => t.val));
        if (best < lambda[j]) newLambda[j] = best;
        computations[j] = { terms, result: newLambda[j] };
      }
    });

    const same = ids.every(id => newLambda[id] === lambda[id]);
    lambda = newLambda;

    const row = { k, lambda: { ...lambda }, computations };
    allRows.push(row);

    // Build detail message for the most interesting computations
    const changed = ids.filter(j => computations[j] && computations[j].result !== allRows[allRows.length-2].lambda[j]);
    const detail = changed.slice(0, 3).map(j => {
      const { terms, result } = computations[j];
      const termsStr = '[' + terms.map(t => `λ${k-1}(${idToLabel[t.src]})+${t.w}=${t.val}`).join(', ') + ']';
      return `λ${k}(${idToLabel[j]}) = min${termsStr} = ${result}`;
    }).join(' · ');

    steps.push({
      k, rows: allRows.slice(0, k + 1),
      done: same || k === n,
      stopped: same,
      message: same
        ? `λ${k} = λ${k-1} — Aucun changement : STOP. Distances optimales trouvées.`
        : `Itération k=${k} : λᵢ(j) = min_{i∈Γ⁻(j)} (λ${k-1}(i) + l(i,j))`,
      computationDetail: detail,
    });
    if (same) stopped = true;
  }

  return { steps, ids, idToLabel };
}

function FordPanel({ elements, startNodeId, onClose, onHide, darkMode, onStep }) {
  const frozenElements = useMemo(() => elements, []);
  const { steps, ids, idToLabel } = useMemo(() => {
    try { return computeFordSteps(frozenElements, startNodeId); }
    catch(e) { return { steps: [], ids: [], idToLabel: {} }; }
  }, []);
  const [idx, setIdx] = useState(0);
  useEffect(() => { if (steps[idx] && onStep) onStep(steps[idx]); }, [idx]);

  const bg = darkMode ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.98)";
  const borderC = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.22)";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textMuted = darkMode ? "#6b7280" : "#9ca3af";
  const mono = "JetBrains Mono, monospace";
  const thBg = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const thBorder = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.18)";
  const rowBorder = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.1)";
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };

  if (steps.length === 0) return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: bg, border: `1px solid ${borderC}`, borderRadius: "14px", padding: "18px 24px", maxWidth: "420px", textAlign: "center" }}>
      <div style={{ color: textMain, fontWeight: "600", marginBottom: "6px" }}>Impossible de lancer Bellman-Ford</div>
      <div style={{ color: textMuted, fontSize: "12px", marginBottom: "16px" }}>Le graphe doit être orienté pondéré avec un sommet source.</div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer le panneau" style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", fontSize: "13px", padding: "3px 8px", lineHeight: 1 }}>👁</button>
              <button onClick={onClose} style={{ padding: "7px 20px", background: "#8b5cf6", border: "none", borderRadius: "8px", color: "#fff", cursor: "pointer" }}>Fermer</button>
            </div>
    </div>
  );

  const step = steps[idx];
  const done = step.done;

  return (
    <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: bg, border: `1px solid ${borderC}`, borderRadius: "16px", width: "min(900px, 96vw)", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" }}>

      <div style={{ height: "3px", background: thBorder, borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#8b5cf6", transition: "width 0.3s" }} />
      </div>

      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${borderC}` }}>
        <span style={{ fontWeight: "700", fontSize: "13px", color: textMain, fontFamily: "Inter, sans-serif" }}>
          Bellman-Ford — k = {step.k} / {steps.length - 1}
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", fontSize: "14px", padding: "2px 8px" }}>👁</button>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: textMuted, cursor: "pointer", fontSize: "16px" }}>✕</button>
        </div>
      </div>

      <div style={{ padding: "6px 16px", fontSize: "12px", color: done ? "#10b981" : textMuted, fontFamily: "Inter, sans-serif" }}>{step.message}</div>
      {step.computationDetail && (
        <div style={{ padding: "2px 16px 8px", fontSize: "11px", color: darkMode ? "#a78bfa" : "#7c3aed", fontFamily: mono, whiteSpace: "pre-wrap" }}>
          {step.computationDetail}
        </div>
      )}

      <div style={{ overflowX: "auto", padding: "0 12px 12px" }}>
        <table style={{ borderCollapse: "collapse", fontFamily: mono, fontSize: "12px" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 10px", textAlign: "center", color: textMuted, fontSize: "11px", fontWeight: "700", background: thBg, borderBottom: `2px solid ${thBorder}`, whiteSpace: "nowrap" }}>k</th>
              <th style={{ padding: "6px 14px", textAlign: "left", color: textMuted, fontSize: "11px", fontWeight: "700", background: thBg, borderBottom: `2px solid ${thBorder}`, borderLeft: `1px solid ${rowBorder}`, whiteSpace: "nowrap" }}>Sommets</th>
              {ids.map(id => (
                <th key={id} style={{ padding: "6px 16px", textAlign: "center", color: textMain, fontWeight: "700", background: thBg, borderBottom: `2px solid ${thBorder}`, borderLeft: `1px solid ${rowBorder}`, minWidth: "52px" }}>
                  {idToLabel[id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {step.rows.map((row, ri) => {
              const isCurrentRow = ri === step.rows.length - 1;
              const prevLambda = ri > 0 ? step.rows[ri - 1].lambda : null;
              return (
                <tr key={ri} style={{ background: isCurrentRow ? (darkMode ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.04)") : "transparent" }}>
                  <td style={{ padding: "5px 10px", textAlign: "center", color: isCurrentRow ? "#a78bfa" : textMuted, fontWeight: isCurrentRow ? "700" : "400", borderBottom: `1px solid ${rowBorder}` }}>
                    {row.k}
                  </td>
                  <td style={{ padding: "5px 14px", color: textMuted, fontSize: "10px", fontFamily: "Inter, sans-serif", fontWeight: "600", borderLeft: `1px solid ${rowBorder}`, borderBottom: `1px solid ${rowBorder}`, whiteSpace: "nowrap" }}>
                    λ{row.k === 0 ? "₀" : row.k === 1 ? "₁" : row.k === 2 ? "₂" : row.k === 3 ? "₃" : row.k === 4 ? "₄" : row.k === 5 ? "₅" : `(${row.k})`}
                  </td>
                  {ids.map(id => {
                    const val = row.lambda[id];
                    const changed = isCurrentRow && prevLambda && val !== prevLambda[id];
                    return (
                      <td key={id} style={{ padding: "5px 12px", textAlign: "center", borderLeft: `1px solid ${rowBorder}`, borderBottom: `1px solid ${rowBorder}` }}>
                        <span style={{
                          color: changed ? (darkMode ? "#a78bfa" : "#7c3aed") : (val === Infinity ? textMuted : textMain),
                          fontWeight: changed ? "700" : "400",
                          fontSize: changed ? "13px" : "12px",
                        }}>
                          {val === Infinity ? "∞" : val}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {done && step.stopped && (
              <tr>
                <td colSpan={2} style={{ padding: "5px 14px", color: "#10b981", fontWeight: "700", fontFamily: "Inter, sans-serif", fontSize: "11px", borderRight: `1px solid ${thBorder}` }}>STOP</td>
                {ids.map(id => <td key={id} style={{ borderLeft: `1px solid ${rowBorder}` }} />)}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${borderC}` }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ ...btnBase, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: idx === 0 ? textMuted : textMain, border: `1px solid ${borderC}`, cursor: idx === 0 ? "default" : "pointer" }}>
          ← Précédent
        </button>
        <span style={{ fontSize: "11px", color: done ? "#10b981" : textMuted, fontWeight: done ? "600" : "400" }}>
          {done ? (step.stopped ? "STOP — convergé" : "Maximum atteint") : `k = ${step.k}`}
        </span>
        <button onClick={() => setIdx(i => Math.min(steps.length - 1, i + 1))} disabled={idx === steps.length - 1}
          style={{ ...btnBase, background: idx === steps.length - 1 ? "transparent" : "rgba(139,92,246,0.1)", color: idx === steps.length - 1 ? textMuted : "#a78bfa", border: `1px solid ${idx === steps.length - 1 ? borderC : "rgba(139,92,246,0.4)"}`, cursor: idx === steps.length - 1 ? "default" : "pointer" }}>
          Suivant →
        </button>
      </div>
    </div>
  );
}

function PrimPanel({ elements, startNodeId, onClose, onHide, onStep, darkMode }) {
  const [idx, setIdx] = useState(0);
  // Freeze elements at mount — never recompute if elements change externally
  const frozenElements = useMemo(() => elements, []);
  const steps = useMemo(() => {
    try { return computePrimSteps(frozenElements, startNodeId); } catch(e) { return []; }
  }, []);

  const nodes = frozenElements.filter((el) => !el.data.source);
  const edges = frozenElements.filter((el) => !!el.data.source);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });

  useEffect(() => {
    if (steps[idx] && onStep) onStep(steps[idx]);
  }, [idx]);

  if (steps.length === 0) return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(10,10,10,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "18px 24px", maxWidth: "420px", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
      <div style={{ color: "#f1f5f9", fontWeight: "600", marginBottom: "6px", fontFamily: "Inter, sans-serif" }}>Impossible de lancer Prim</div>
      <div style={{ color: "#6b7280", fontSize: "12px", marginBottom: "16px" }}>Le graphe doit être non-orienté, connexe et avoir des arêtes pondérées.</div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer le panneau" style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", fontSize: "13px", padding: "3px 8px", lineHeight: 1 }}>👁</button>
              <button onClick={onClose} style={{ padding: "7px 20px", background: "#3b82f6", border: "none", borderRadius: "8px", color: "white", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Fermer</button>
            </div>
    </div>
  );

  const step = steps[idx];
  const done = idx === steps.length - 1;
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };

  return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(10,10,10,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", width: "min(760px, 93vw)", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", backdropFilter: "blur(12px)" }}>

      <div style={{ height: "3px", background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#3b82f6", transition: "width 0.3s" }} />
      </div>

      <div style={{ padding: "12px 16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: "600", fontSize: "13px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Prim — Étape {idx + 1}/{steps.length}</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#64748b", cursor: "pointer", fontSize: "14px", padding: "2px 8px" }}>👁</button>
              <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px", padding: "0 4px" }}>✕</button>
            </div>
          </div>
          
          <div style={{ fontSize: "12px", color: "#94a3b8", fontFamily: "Inter, sans-serif", marginBottom: "4px", lineHeight: "1.5" }}>{step.message}</div>
          
          {/* Note explicative pour les arêtes jetées */}
          {step.ignored && step.ignored.length > 0 && (
            <div style={{ fontSize: "11px", color: "#f87171", marginBottom: "8px", fontStyle: "italic" }}>
              Note : {step.ignored.length} arête(s) jetée(s) (évite un cycle).
            </div>
          )}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[["#10b981","Dans l'arbre"],["#3b82f6","ACM validé"],["#ec4899","Candidats"],["#27272a","Jetées (Cycles)"]].map(([c,l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#64748b" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: c, flexShrink: 0, border: c === "#27272a" ? "1px solid #334155" : "none" }} />{l}
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: "220px", flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.06)", paddingLeft: "12px" }}>
          <div style={{ fontSize: "10px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px", fontWeight: "600" }}>Arêtes ACM</div>
          <div style={{ maxHeight: "80px", overflowY: "auto" }}>
            {step.treeEdges.length === 0 ? <div style={{ color: "#334155", fontSize: "11px", fontStyle: "italic" }}>Aucune</div> :
              step.treeEdges.map((eid) => {
                const e = edges.find((el) => el.data.id === eid);
                if (!e) return null;
                return (
                  <div key={eid} style={{ display: "flex", justifyContent: "space-between", padding: "3px 6px", marginBottom: "2px", background: eid === step.chosenEdge ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.02)", borderRadius: "4px" }}>
                    <span style={{ color: "#e2e8f0", fontFamily: "JetBrains Mono", fontSize: "11px" }}>{idToLabel[e.data.source]}—{idToLabel[e.data.target]}</span>
                    <span style={{ color: "#3b82f6", fontFamily: "JetBrains Mono", fontSize: "11px", fontWeight: "700" }}>{e.data.weight ?? "—"}</span>
                  </div>
                );
              })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "4px", marginTop: "4px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ color: "#475569", fontSize: "11px" }}>Total</span>
            <span style={{ color: "#10b981", fontWeight: "700", fontFamily: "JetBrains Mono", fontSize: "12px" }}>{step.totalWeight}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} style={{ ...btnBase, background: "rgba(255,255,255,0.05)", color: idx === 0 ? "#334155" : "#e2e8f0", border: "1px solid rgba(255,255,255,0.08)", cursor: idx === 0 ? "default" : "pointer" }}>← Précédent</button>
        <span style={{ fontSize: "11px", color: done ? "#10b981" : "#475569" }}>{done ? "ACM terminé !" : step.inTree.length + " / " + nodes.length + " sommets"}</span>
        <button onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))} disabled={done} style={{ ...btnBase, background: done ? "transparent" : "rgba(59,130,246,0.1)", color: done ? "#334155" : "#93c5fd", border: "1px solid " + (done ? "rgba(255,255,255,0.06)" : "rgba(59,130,246,0.4)"), cursor: done ? "default" : "pointer" }}>Suivant →</button>
      </div>
    </div>
  );
}


function computeKruskalSteps(elements) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source && el.data.source !== el.data.target);
  if (nodes.length === 0 || edges.length === 0) return [];

  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });
  const labelToId = {};
  nodes.forEach((n) => { labelToId[n.data.label] = n.data.id; });
  // Sort nodeIds by label (same sort as KruskalPanel's nodeLabels) so snapshot columns align
  const nodeIds = [...nodes].sort((a, b) => a.data.label.localeCompare(b.data.label, undefined, { numeric: true, sensitivity: "base" })).map((n) => n.data.id);

  const sorted = [...edges].sort((a, b) => (a.data.weight ?? 0) - (b.data.weight ?? 0));

  // Union-Find sans compression — parent[id] = id du parent direct
  const parent = {};
  nodeIds.forEach((id) => { parent[id] = id; });

  const find = (x) => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };

  // union: on écrit find(x) dans la case de find(y)
  // => colonne s reçoit la valeur r (comme dans le cours)
  const union = (x, y) => {
    const rx = find(x);
    const ry = find(y);
    parent[ry] = rx;
  };

  // snapshot: pour chaque label de noeud, la valeur affichée dans sa case
  // case vide si le noeud se pointe lui-même, sinon label de son parent direct
  const snapshot = () => {
    const s = {};
    nodeIds.forEach((id) => {
      const lbl = idToLabel[id];
      s[lbl] = parent[id] === id ? lbl : idToLabel[parent[id]];
    });
    return s;
  };

  const steps = [];
  const acmEdges = [];
  const tableRows = [];
  let totalWeight = 0;
  let rejectedEdges = [];
  const initSnap = snapshot();

  steps.push({
    acmEdges: [], currentEdge: null, rejectedEdges: [],
    totalWeight: 0, accepted: null, done: false,
    tableRows: [], snap: { ...initSnap },
    message: `${sorted.length} arêtes triées par poids. Union-Find initialisé.`,
  });

  for (const edge of sorted) {
    const { source, target, id, weight } = edge.data;
    const w = weight ?? 0;
    const x1 = idToLabel[source];
    const x2 = idToLabel[target];
    const rxId = find(source);
    const ryId = find(target);
    const rx = idToLabel[rxId];
    const ry = idToLabel[ryId];
    const accepted = rxId !== ryId;

    if (accepted) {
      union(source, target);
      acmEdges.push(id);
      totalWeight += w;
    } else {
      rejectedEdges.push(id);
    }

    const snap = snapshot();
    tableRows.push({ w, x1, x2, rx, ry, accepted, snap: { ...snap } });
    const isComplete = accepted && acmEdges.length === nodes.length - 1;

    steps.push({
      acmEdges: [...acmEdges], currentEdge: id,
      rejectedEdges: [...rejectedEdges],
      totalWeight, accepted, done: isComplete,
      tableRows: tableRows.map((r) => ({ ...r })),
      snap,
      message: accepted
        ? (isComplete
          ? `✓ ${x1}—${x2} (poids ${w}) acceptée. ACM complet ! Total : ${totalWeight}.`
          : `✓ ${x1}—${x2} (poids ${w}) acceptée. r(${x1})=${rx} ≠ r(${x2})=${ry}.`)
        : `✗ ${x1}—${x2} (poids ${w}) rejetée. r(${x1})=${rx} = r(${x2})=${ry} → cycle.`,
    });

    if (isComplete) {
      steps.push({
        acmEdges: [...acmEdges], currentEdge: null,
        rejectedEdges: [...rejectedEdges],
        totalWeight, accepted: null, done: true,
        tableRows: tableRows.map((r) => ({ ...r })),
        snap,
        message: `ACM terminé ! ${acmEdges.length} arêtes, poids total : ${totalWeight}.`,
      });
      break;
    }
  }

  return steps;
}

function KruskalVisPanel({ elements, onClose, onHide, onStep, darkMode }) {
  const [idx, setIdx] = useState(0);
  const frozenElements = useMemo(() => elements, []);
  const steps = useMemo(() => {
    try { return computeKruskalSteps(frozenElements); } catch(e) { return []; }
  }, []);

  const nodes = frozenElements.filter((el) => !el.data.source);
  const edges = frozenElements.filter((el) => !!el.data.source);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });

  useEffect(() => {
    if (steps[idx] && onStep) onStep(steps[idx]);
  }, [idx]);

  if (steps.length === 0) return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "20px 24px", maxWidth: "400px", textAlign: "center" }}>
      <div style={{ color: "#f1f5f9", fontWeight: "600", marginBottom: "6px", fontFamily: "Inter, sans-serif" }}>Impossible de lancer Kruskal</div>
      <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "16px" }}>Graphe non-orienté pondéré requis.</div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#6b7280", cursor: "pointer", fontSize: "13px", padding: "3px 8px" }}>👁</button>
              <button onClick={onClose} style={{ padding: "7px 18px", background: "#3b82f6", border: "none", borderRadius: "8px", color: "white", cursor: "pointer" }}>Fermer</button></div>
    </div>
  );

  const step = steps[idx];
  const done = step.done || idx === steps.length - 1;
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };
  const allSortedEdges = frozenElements.filter((el) => !!el.data.source && el.data.source !== el.data.target).sort((a, b) => (a.data.weight ?? 0) - (b.data.weight ?? 0));

  return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(10,10,10,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", width: "min(760px, 93vw)", boxShadow: "0 8px 40px rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}>
      <div style={{ height: "3px", background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#f59e0b", transition: "width 0.3s" }} />
      </div>
      <div style={{ padding: "12px 16px", display: "flex", gap: "14px", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: "600", fontSize: "13px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Kruskal — Étape {idx + 1}/{steps.length}</span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#64748b", cursor: "pointer", fontSize: "14px", padding: "2px 8px" }}>👁</button>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>
          </div>
          <div style={{ fontSize: "12px", color: step.accepted === true ? "#10b981" : step.accepted === false ? "#ef4444" : "#94a3b8", fontFamily: "Inter, sans-serif", marginBottom: "10px", lineHeight: "1.5" }}>{step.message}</div>
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            {[["#10b981","Acceptée"],["#ef4444","Rejetée (cycle)"],["#f59e0b","En cours"],["#4b5563","Non examinée"]].map(([col,lab]) => (
              <div key={lab} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#64748b" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: col }} />{lab}
              </div>
            ))}
          </div>
        </div>
        <div style={{ width: "220px", flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.06)", paddingLeft: "14px" }}>
          <div style={{ fontSize: "10px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px", fontWeight: "600" }}>Arêtes (triées)</div>
          <div style={{ maxHeight: "90px", overflowY: "auto", display: "grid", gap: "2px" }}>
            {allSortedEdges.map((e) => {
              const isAcm = step.acmEdges.includes(e.data.id);
              const isRej = step.rejectedEdges.includes(e.data.id);
              const isCur = step.currentEdge === e.data.id;
              const color = isCur ? "#f59e0b" : isAcm ? "#10b981" : isRej ? "#ef4444" : "#4b5563";
              const bg = isCur ? "rgba(245,158,11,0.12)" : isAcm ? "rgba(16,185,129,0.08)" : isRej ? "rgba(239,68,68,0.08)" : "transparent";
              return (
                <div key={e.data.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", borderRadius: "4px", background: bg, border: `1px solid ${isCur ? "rgba(245,158,11,0.3)" : "transparent"}` }}>
                  <span style={{ color, fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>{isCur ? "→ " : isAcm ? "✓ " : isRej ? "✗ " : "  "}{idToLabel[e.data.source]}—{idToLabel[e.data.target]}</span>
                  <span style={{ color: isAcm ? "#10b981" : "#475569", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", fontWeight: "700" }}>{e.data.weight ?? "—"}</span>
                </div>
              );
            })}
          </div>
          {step.acmEdges.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "5px", marginTop: "4px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "#475569", fontSize: "11px" }}>Total ACM</span>
              <span style={{ color: "#10b981", fontWeight: "700", fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>{step.totalWeight}</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ ...btnBase, background: "rgba(255,255,255,0.05)", color: idx === 0 ? "#334155" : "#e2e8f0", border: "1px solid rgba(255,255,255,0.08)", cursor: idx === 0 ? "default" : "pointer" }}>
          ← Précédent
        </button>
        <span style={{ fontSize: "11px", color: done ? "#10b981" : "#475569", fontWeight: done ? "600" : "400" }}>
          {done ? `ACM terminé ! Poids = ${step.totalWeight}` : `${step.acmEdges.length} / ${nodes.length - 1} arêtes`}
        </span>
        <button onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))} disabled={idx === steps.length - 1}
          style={{ ...btnBase, background: idx === steps.length - 1 ? "transparent" : "rgba(245,158,11,0.1)", color: idx === steps.length - 1 ? "#334155" : "#fcd34d", border: `1px solid ${idx === steps.length - 1 ? "rgba(255,255,255,0.06)" : "rgba(245,158,11,0.4)"}`, cursor: idx === steps.length - 1 ? "default" : "pointer" }}>
          Suivant →
        </button>
      </div>
    </div>
  );
}

function KruskalPanel({ elements, onClose, onHide, onStep, darkMode }) {
  const [idx, setIdx] = useState(0);
  const frozenElements = useMemo(() => elements, []);
  const steps = useMemo(() => {
    try { return computeKruskalSteps(frozenElements); } catch(e) { console.error(e); return []; }
  }, []);

  const nodes = frozenElements.filter((el) => !el.data.source);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });
  const nodeLabels = nodes.map((n) => n.data.label).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const frozenSortedEdges = frozenElements
    .filter((el) => !!el.data.source && el.data.source !== el.data.target)
    .sort((a, b) => (a.data.weight ?? 0) - (b.data.weight ?? 0));

  useEffect(() => {
    if (steps[idx] && onStep) onStep(steps[idx]);
  }, [idx]);

  if (steps.length === 0) return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "20px 24px", maxWidth: "400px", textAlign: "center" }}>
      <div style={{ color: "#f1f5f9", fontWeight: "600", marginBottom: "6px", fontFamily: "Inter, sans-serif" }}>Impossible de lancer Kruskal</div>
      <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "16px" }}>Graphe non-orienté pondéré requis.</div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#6b7280", cursor: "pointer", fontSize: "13px", padding: "3px 8px" }}>👁</button>
              <button onClick={onClose} style={{ padding: "7px 18px", background: "#3b82f6", border: "none", borderRadius: "8px", color: "white", cursor: "pointer" }}>Fermer</button></div>
    </div>
  );

  const step = steps[idx];
  const done = step.done || idx === steps.length - 1;
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };
  const mono = "JetBrains Mono, monospace";
  const TH = (extra = {}) => ({ padding: "5px 10px", fontSize: "11px", fontWeight: "700", color: "#94a3b8", textAlign: "center", background: "rgba(255,255,255,0.05)", borderBottom: "2px solid rgba(255,255,255,0.1)", fontFamily: mono, whiteSpace: "nowrap", ...extra });
  const TD = (extra = {}) => ({ padding: "4px 10px", fontSize: "11px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.04)", fontFamily: mono, color: "#e2e8f0", ...extra });
  const SEP = { borderLeft: "2px solid rgba(255,255,255,0.12)" };
  const initSnap = Object.fromEntries(nodeLabels.map((l) => [l, l]));

  return (
    <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(10,10,10,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", width: "min(760px, 93vw)", boxShadow: "0 8px 40px rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }}>

      <div style={{ height: "3px", background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#f59e0b", transition: "width 0.3s" }} />
      </div>

      <div style={{ padding: "10px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: "700", fontSize: "13px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Kruskal + Union-Find — Étape {idx + 1}/{steps.length}</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#64748b", cursor: "pointer", fontSize: "14px", padding: "2px 8px" }}>👁</button>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#64748b", cursor: "pointer", fontSize: "14px", padding: "2px 8px" }}>👁</button>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px" }}>✕</button>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 16px 8px", fontSize: "12px", fontFamily: "Inter, sans-serif", color: step.accepted === true ? "#10b981" : step.accepted === false ? "#ef4444" : "#94a3b8" }}>
        {step.message}
      </div>

      {/* Étape 0 : affichage simple des sommets triés, sans tableau */}
      {idx === 0 ? (
        <div style={{ padding: "16px 20px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "10px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: "700", marginBottom: "14px" }}>
            Sommets triés — Union-Find initialisé
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
            {nodeLabels.map((l) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "JetBrains Mono, monospace", fontSize: "13px", fontWeight: "700", color: "#e2e8f0" }}>
                  {l}
                </div>
                <div style={{ fontSize: "10px", color: "#475569", fontFamily: "JetBrains Mono, monospace" }}>p={l}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: "#4b5563", fontStyle: "italic" }}>
            Chaque sommet est sa propre racine. Cliquez sur <span style={{ color: "#fcd34d", fontStyle: "normal", fontWeight: "600" }}>Suivant →</span> pour démarrer l'algorithme.
          </div>
        </div>
      ) : (
      <div style={{ overflowX: "auto", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th colSpan={3} style={{ ...TH({ color: "#f59e0b" }), borderRight: "2px solid rgba(255,255,255,0.12)" }}>Arête</th>
              <th colSpan={2} style={{ ...TH({ color: "#a78bfa" }), borderRight: "2px solid rgba(255,255,255,0.12)" }}>p(x1) / p(x2)</th>
              <th style={{ ...TH({ color: "#60a5fa" }), borderRight: "2px solid rgba(255,255,255,0.12)" }}>x</th>
              {nodeLabels.map((l, i) => <th key={l} style={{ ...TH({ color: "#60a5fa" }), ...(i === 0 ? SEP : {}) }}>{l}</th>)}
            </tr>
            <tr>
              <th style={TH({ color: "#f59e0b" })}>Poids</th>
              <th style={TH()}>x1</th>
              <th style={{ ...TH(), borderRight: "2px solid rgba(255,255,255,0.12)" }}>x2</th>
              <th style={{ ...TH({ color: "#a78bfa" }), ...SEP }}>r</th>
              <th style={{ ...TH({ color: "#a78bfa" }), borderRight: "2px solid rgba(255,255,255,0.12)" }}>s</th>
              <th style={{ ...TH({ color: "#60a5fa" }), ...SEP, borderRight: "2px solid rgba(255,255,255,0.12)" }}>p(x)</th>
              {nodeLabels.map((l, i) => <th key={l} style={{ ...TH({ color: "#64748b", fontWeight: "400" }), ...(i === 0 ? SEP : {}) }}>{l}</th>)}
            </tr>
            {/* Ligne Init */}
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              <td colSpan={6} style={{ ...TD({ color: "#4b5563", fontStyle: "italic", textAlign: "right", paddingRight: "14px" }), borderRight: "2px solid rgba(255,255,255,0.08)" }}>Init →</td>
              {nodeLabels.map((l, i) => <td key={l} style={{ ...TD({ color: "#4b5563" }), ...(i === 0 ? SEP : {}) }}>{l}</td>)}
            </tr>
          </thead>
          <tbody>
            {step.tableRows.map((row, i) => {
              const isLast = i === step.tableRows.length - 1 && step.currentEdge !== null;
              const rowBg = isLast
                ? (row.accepted ? "rgba(16,185,129,0.13)" : "rgba(245,158,11,0.13)")
                : (row.accepted ? "rgba(16,185,129,0.04)" : "rgba(245,158,11,0.05)");
              const prevSnap = i === 0 ? initSnap : step.tableRows[i - 1].snap;

              return (
                <tr key={i} style={{ background: rowBg }}>
                  <td style={TD({ color: isLast ? "#fcd34d" : "#f59e0b", fontWeight: "700" })}>{row.w}</td>
                  <td style={TD()}>{row.x1}</td>
                  <td style={{ ...TD(), borderRight: "2px solid rgba(255,255,255,0.08)" }}>{row.x2}</td>
                  <td style={{ ...TD({ color: "#a78bfa" }), ...SEP }}>{row.rx}</td>
                  <td style={{ ...TD({ color: "#a78bfa" }), borderRight: "2px solid rgba(255,255,255,0.08)" }}>{row.ry}</td>
                  <td style={{ ...TD({ color: "#94a3b8" }), ...SEP, borderRight: "2px solid rgba(255,255,255,0.08)" }}>p(x)</td>
                  {nodeLabels.map((l, li) => {
                    if (!row.accepted) {
                      return <td key={l} style={{ ...TD({ color: "#4b5563" }), ...(li === 0 ? SEP : {}) }}></td>;
                    }
                    const val = row.snap[l];
                    const prevVal = prevSnap[l];
                    const changed = val !== prevVal;
                    return (
                      <td key={l} style={{
                        ...TD({ color: "#fbbf24", fontWeight: "700", background: changed ? "rgba(251,191,36,0.15)" : "transparent" }),
                        ...(li === 0 ? SEP : {}),
                      }}>
                        {changed ? val : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ ...btnBase, background: "rgba(255,255,255,0.05)", color: idx === 0 ? "#334155" : "#e2e8f0", border: "1px solid rgba(255,255,255,0.08)", cursor: idx === 0 ? "default" : "pointer" }}>
          ← Précédent
        </button>
        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          {[["#10b981","Acceptée"],["#f59e0b","Rejetée (cycle)"],["#fbbf24","Case modifiée"]].map(([col, lab]) => (
            <div key={lab} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#6b7280" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: col }} />{lab}
            </div>
          ))}
          <span style={{ fontSize: "11px", color: done ? "#10b981" : "#6b7280", fontWeight: done ? "600" : "400" }}>
            {done ? `ACM terminé ! Poids = ${step.totalWeight}` : `${step.acmEdges.length} / ${nodes.length - 1} arêtes`}
          </span>
        </div>
        <button onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))} disabled={idx === steps.length - 1}
          style={{ ...btnBase, background: idx === steps.length - 1 ? "transparent" : "rgba(245,158,11,0.1)", color: idx === steps.length - 1 ? "#334155" : "#fcd34d", border: `1px solid ${idx === steps.length - 1 ? "rgba(255,255,255,0.06)" : "rgba(245,158,11,0.4)"}`, cursor: idx === steps.length - 1 ? "default" : "pointer" }}>
          Suivant →
        </button>
      </div>
    </div>
  );
}


// ─── BFS ─────────────────────────────────────────────────────────────────────

function computeBFSSteps(elements, startId, directed) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source && el.data.source !== el.data.target);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });

  const getAdj = (id) => {
    const nbrs = [];
    edges.forEach((e) => {
      if (e.data.source === id) nbrs.push({ id: e.data.target, edgeId: e.data.id });
      else if (!directed && e.data.target === id) nbrs.push({ id: e.data.source, edgeId: e.data.id });
    });
    return nbrs;
  };

  const steps = [];
  const visited = new Set([startId]);   // dejaVu
  const queue = [startId];              // aTraiter
  const treeEdges = [];
  const pi = { [startId]: null };       // parents pour l'arborescence

  // Étape 0 : état initial
  steps.push({
    queue: [...queue], visited: [...visited], treeEdges: [...treeEdges], pi: { ...pi },
    currentId: startId, justAdded: [startId],
    message: `Départ : ${idToLabel[startId]} ajouté à la file.`,
    done: false,
  });

  while (queue.length > 0) {
    const curr = queue.shift();
    const adj = getAdj(curr).filter(({ id }) => !visited.has(id));

    if (adj.length === 0) {
      const isDone = queue.length === 0;
      steps.push({
        queue: [...queue], visited: [...visited], treeEdges: [...treeEdges], pi: { ...pi },
        currentId: curr, justAdded: [],
        message: isDone
          ? `Traitement de ${idToLabel[curr]} terminé. Aucun nouveau voisin. Parcours terminé.`
          : `Traitement de ${idToLabel[curr]} terminé. Aucun nouveau voisin.`,
        done: isDone,
      });
    } else {
      for (let i = 0; i < adj.length; i++) {
        const { id: nb, edgeId } = adj[i];
        visited.add(nb);
        queue.push(nb);
        treeEdges.push(edgeId);
        pi[nb] = curr;
        const isDone = i === adj.length - 1 && queue.length === 0;
        steps.push({
          queue: [...queue], visited: [...visited], treeEdges: [...treeEdges], pi: { ...pi },
          currentId: curr, justAdded: [nb],
          message: isDone
            ? `Traitement de ${idToLabel[curr]} → ${idToLabel[nb]} découvert. Parcours terminé.`
            : `Traitement de ${idToLabel[curr]} → ${idToLabel[nb]} ajouté à la file.`,
          done: isDone,
        });
      }
    }
  }

  return steps;
}

function BFSTreeModal({ pi, idToLabel, startId, onClose, darkMode }) {
  const nodeIds = Object.keys(pi);

  const bg = darkMode ? "#0d0605" : "#ffffff";
  const borderC = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.22)";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textMuted = darkMode ? "#6b7280" : "#9ca3af";
  const nodeBg = darkMode ? "#e5e7eb" : "#1f2937";
  const nodeColor = darkMode ? "#111827" : "#f9fafb";
  const nodeBorder = darkMode ? "#6b7280" : "#374151";

  const children = {};
  nodeIds.forEach(id => { children[id] = []; });
  nodeIds.forEach(id => { if (pi[id] !== null) children[pi[id]].push(id); });

  const nodeX = {}, nodeY = {};
  let counter = 0;
  const rowH = 90, colW = 70;

  function assignPositions(id, depth) {
    const ch = children[id] || [];
    ch.forEach(c => assignPositions(c, depth + 1));
    if (ch.length === 0) {
      nodeX[id] = counter++ * colW;
    } else {
      nodeX[id] = (nodeX[ch[0]] + nodeX[ch[ch.length - 1]]) / 2;
    }
    nodeY[id] = depth * rowH + 60;
  }
  assignPositions(startId, 0);

  const allX = Object.values(nodeX);
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const totalW = Math.max(640, maxX - minX + 120);
  const offsetX = (totalW - (maxX - minX)) / 2 - minX;

  const cyElements = [
    ...nodeIds.map(id => ({
      data: { id, label: idToLabel[id] },
      position: { x: nodeX[id] + offsetX, y: nodeY[id] },
    })),
    ...nodeIds.filter(id => pi[id] !== null).map(id => ({
      data: { id: `e_${pi[id]}_${id}`, source: pi[id], target: id },
    })),
  ];

  const maxDepth = Math.max(...Object.values(nodeY));
  const canvasHeight = Math.max(320, maxDepth + 100);

  const stylesheet = [
    { selector: "node", style: { "background-color": nodeBg, "border-width": 2, "border-color": nodeBorder, color: nodeColor, label: "data(label)", "text-valign": "center", "text-halign": "center", "font-family": "JetBrains Mono, monospace", "font-size": "13px", "font-weight": "700", width: 40, height: 40 } },
    { selector: `node[id="${startId}"]`, style: { "background-color": "#10b981", "border-color": "#6ee7b7", color: "#fff" } },
    { selector: "edge", style: { width: 2, "line-color": "#10b981", "target-arrow-color": "#10b981", "target-arrow-shape": "triangle", "curve-style": "straight" } },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <div style={{ background: bg, border: `1px solid ${borderC}`, borderRadius: "16px", width: `min(${totalW + 40}px, 96vw)`, maxWidth: "780px", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: textMain, fontFamily: "Inter, sans-serif" }}>Arborescence du parcours en largeur</div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>Sous-graphe des prédécesseurs G<sub>π</sub> — racine en vert</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", padding: "6px 10px" }}>✕</button>
        </div>
        <div style={{ height: `${canvasHeight}px`, position: "relative", overflow: "hidden" }}>
          <CytoscapeComponent
            elements={cyElements}
            stylesheet={stylesheet}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            layout={{ name: "preset" }}
            userZoomingEnabled={true}
            userPanningEnabled={true}
            boxSelectionEnabled={false}
            autounselectify={true}
          />
        </div>
      </div>
    </div>
  );
}

function BFSPanel({ elements, startNodeId, directed, onClose, onHide, onStep, darkMode, onShowTree }) {
  const [idx, setIdx] = useState(0);
  const frozenElements = useMemo(() => elements, []);
  const steps = useMemo(() => {
    try { return computeBFSSteps(frozenElements, startNodeId, directed); } catch(e) { return []; }
  }, []);

  const nodes = frozenElements.filter((el) => !el.data.source);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });

  useEffect(() => { if (steps[idx] && onStep) onStep(steps[idx]); }, [idx]);

  if (steps.length === 0) return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(10,10,10,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "18px 24px", maxWidth: "400px", textAlign: "center" }}>
      <div style={{ color: "#f1f5f9", fontWeight: "600", marginBottom: "6px" }}>Impossible de lancer le BFS</div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer le panneau" style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", fontSize: "13px", padding: "3px 8px", lineHeight: 1 }}>👁</button>
              <button onClick={onClose} style={{ padding: "7px 20px", background: "#f59e0b", border: "none", borderRadius: "8px", color: "#111", cursor: "pointer" }}>Fermer</button>
            </div>
    </div>
  );

  const step = steps[idx];
  const done = step.done;
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };
  const mono = "JetBrains Mono, monospace";
  const justAddedSet = new Set(step.justAdded || []);

  const NodeCircle = ({ id, color, highlightColor, isHighlighted }) => (
    <div style={{
      width: "40px", height: "40px", borderRadius: "50%",
      background: "transparent",
      border: `2px solid ${isHighlighted ? highlightColor : color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: mono, fontSize: "13px", fontWeight: "700",
      color: isHighlighted ? highlightColor : color,
      flexShrink: 0,
    }}>
      {idToLabel[id]}
    </div>
  );

  return (
    <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: darkMode ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"}`, borderRadius: "16px", width: done ? "min(900px, 96vw)" : "min(700px, 93vw)", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", backdropFilter: "blur(12px)", transition: "width 0.35s ease" }}>

      {/* Progress bar */}
      <div style={{ height: "3px", background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#f59e0b", transition: "width 0.3s" }} />
      </div>

      {/* Header */}
      <div style={{ padding: "10px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: "700", fontSize: "13px", color: darkMode ? "#f1f5f9" : "#111827", fontFamily: "Inter, sans-serif" }}>
          BFS — Parcours en largeur &nbsp;·&nbsp; Étape {idx + 1}/{steps.length}
          {step.currentId && !step.done && <span style={{ color: darkMode ? "#f59e0b" : "#b45309", marginLeft: "8px", fontSize: "12px", fontWeight: "500" }}>· Traitement : {idToLabel[step.currentId]}</span>}
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: `1px solid ${darkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, borderRadius: "6px", color: darkMode ? "#64748b" : "#9ca3af", cursor: "pointer", fontSize: "14px", padding: "2px 8px" }}>👁</button>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: darkMode ? "#64748b" : "#9ca3af", cursor: "pointer", fontSize: "16px" }}>✕</button>
        </div>
      </div>

      {/* Message */}
      <div style={{ padding: "4px 16px 10px", fontSize: "12px", fontFamily: "Inter, sans-serif", color: done ? "#10b981" : (darkMode ? "#94a3b8" : "#6b7280") }}>
        {step.message}
      </div>

      {/* aTraiter + dejaVu */}
      <div style={{ borderTop: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.14)"}`, padding: "14px 20px", display: "flex", gap: "24px" }}>

        {/* aTraiter */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "10px", color: darkMode ? "#f59e0b" : "#b45309", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>
            ATRAITER
          </div>
          {step.queue.length === 0
            ? <div style={{ color: darkMode ? "#334155" : "#9ca3af", fontSize: "18px", marginBottom: "6px" }}>∅</div>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                {step.queue.map((id, i) => (
                  <NodeCircle key={i} id={id} color={darkMode ? "#f59e0b" : "#b45309"} highlightColor={darkMode ? "#fcd34d" : "#92400e"} isHighlighted={justAddedSet.has(id)} />
                ))}
              </div>
          }
          <div style={{ fontFamily: mono, fontSize: "12px", color: darkMode ? "#475569" : "#9ca3af", letterSpacing: "0.08em" }}>
            {step.queue.map(id => idToLabel[id]).join(" ")}
          </div>
        </div>

        {/* Séparateur */}
        <div style={{ width: "1px", background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.14)", flexShrink: 0 }} />

        {/* dejaVu */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "10px", color: "#ef4444", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>
            DEJAVU
          </div>
          {step.visited.length === 0
            ? <div style={{ color: darkMode ? "#334155" : "#9ca3af", fontSize: "18px", marginBottom: "6px" }}>∅</div>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                {step.visited.map((id, i) => (
                  <NodeCircle key={i} id={id} color="#ef4444" highlightColor="#fca5a5" isHighlighted={justAddedSet.has(id)} />
                ))}
              </div>
          }
          <div style={{ fontFamily: mono, fontSize: "12px", color: darkMode ? "#475569" : "#9ca3af", letterSpacing: "0.08em" }}>
            {step.visited.map(id => idToLabel[id]).join(" ")}
          </div>
        </div>
      </div>

      {/* Légende + Navigation */}
      <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "16px" }}>
        {[[darkMode ? "#f59e0b" : "#b45309","aTraiter (file)"],["#ef4444","Déjà vu"]].map(([col,lab]) => (
          <div key={lab} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "#6b7280" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", border: `2px solid ${col}` }} />{lab}
          </div>
        ))}
      </div>

      {/* Arborescence BFS — visible uniquement quand terminé */}
      {done && step.pi && (
        <div style={{ borderTop: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.14)"}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "11px", color: darkMode ? "#6b7280" : "#9ca3af", fontFamily: "Inter, sans-serif" }}>
            Arborescence G<sub>π</sub> disponible
          </div>
          <button
            onClick={() => onShowTree && onShowTree(step.pi)}
            style={{ padding: "7px 18px", borderRadius: "8px", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", fontWeight: "600" }}
          >
            Voir l'arborescence →
          </button>
        </div>
      )}

      <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ ...btnBase, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: idx === 0 ? (darkMode ? "#334155" : "#d1d5db") : (darkMode ? "#e2e8f0" : "#374151"), border: darkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.1)", cursor: idx === 0 ? "default" : "pointer" }}>
          ← Précédent
        </button>
        <span style={{ fontSize: "11px", color: done ? "#10b981" : (darkMode ? "#6b7280" : "#9ca3af"), fontWeight: done ? "600" : "400" }}>
          {done ? `Terminé — ${step.visited.length} sommet(s) visité(s)` : `File : ${step.queue.length} · Visités : ${step.visited.length}`}
        </span>
        <button onClick={() => setIdx(i => Math.min(steps.length - 1, i + 1))} disabled={idx === steps.length - 1}
          style={{ ...btnBase, background: idx === steps.length - 1 ? "transparent" : (darkMode ? "rgba(245,158,11,0.1)" : "rgba(180,83,9,0.08)"), color: idx === steps.length - 1 ? (darkMode ? "#334155" : "#9ca3af") : (darkMode ? "#fcd34d" : "#b45309"), border: idx === steps.length - 1 ? (darkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)") : (darkMode ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(180,83,9,0.3)"), cursor: idx === steps.length - 1 ? "default" : "pointer" }}>
          Suivant →
        </button>
      </div>
    </div>
  );
}

// ─── DFS ─────────────────────────────────────────────────────────────────────

function computeDFSSteps(elements, startId, directed) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source && el.data.source !== el.data.target);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });
  const allIds = nodes.map(n => n.data.id);

  const getSuccessors = (id) => {
    const nbrs = [];
    edges.forEach((e) => {
      if (e.data.source === id) nbrs.push({ id: e.data.target, edgeId: e.data.id });
      else if (!directed && e.data.target === id) nbrs.push({ id: e.data.source, edgeId: e.data.id });
    });
    return nbrs;
  };

  const steps = [];
  const visited = new Set();
  const dates = {};
  const treeEdges = [];
  let clock = 1;
  let stack = [];

  const snap = () => ({
    stack: stack.map(x => x.id),
    visited: [...visited],
    dates: Object.fromEntries(Object.entries(dates).map(([k,v]) => [k, {...v}])),
    treeEdges: [...treeEdges],
  });

  // Determine traversal order: startId first, then remaining nodes in declaration order
  const traversalOrder = [startId, ...allIds.filter(id => id !== startId)];

  for (const rootId of traversalOrder) {
    if (visited.has(rootId)) continue;

    // Start a new tree from rootId
    stack = [{ id: rootId, parentEdge: null, explored: 0 }];
    steps.push({ ...snap(), message: `Nouveau départ : ${idToLabel[rootId]} empilé.`, done: false });

    while (stack.length > 0) {
      const top = stack[stack.length - 1];

      if (!visited.has(top.id)) {
        visited.add(top.id);
        dates[top.id] = { pre: clock++, post: null };
        steps.push({ ...snap(), message: `Pré-visite de ${idToLabel[top.id]} — date ${dates[top.id].pre}.`, done: false });
      }

      const succs = getSuccessors(top.id);
      let pushed = false;
      while (top.explored < succs.length) {
        const { id: nb, edgeId } = succs[top.explored];
        top.explored++;
        if (!visited.has(nb)) {
          stack.push({ id: nb, parentEdge: edgeId, explored: 0 });
          steps.push({ ...snap(), message: `${idToLabel[top.id]} → ${idToLabel[nb]} non visité : empilé.`, done: false });
          pushed = true;
          break;
        }
      }

      if (!pushed) {
        dates[top.id].post = clock++;
        stack.pop();
        if (top.parentEdge && !treeEdges.includes(top.parentEdge)) treeEdges.push(top.parentEdge);
        const allDone = stack.length === 0 && traversalOrder.filter(id => !visited.has(id)).length === 0;
        steps.push({
          ...snap(),
          message: allDone
            ? `Post-visite de ${idToLabel[top.id]} — date ${dates[top.id].post}. DFS terminé (tous les sommets visités).`
            : `Post-visite de ${idToLabel[top.id]} — date ${dates[top.id].post}. Dépilé.`,
          done: allDone,
        });
      }
    }
  }

  return steps;
}

function DFSPanel({ elements, startNodeId, directed, onClose, onHide, onStep, darkMode, onShowForest, onShowSCC, onShowTopo }) {
  const [idx, setIdx] = useState(0);
  const frozenElements = useMemo(() => elements, []);
  const steps = useMemo(() => {
    try { return computeDFSSteps(frozenElements, startNodeId, directed); } catch(e) { return []; }
  }, []);

  const nodes = frozenElements.filter((el) => !el.data.source);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });

  useEffect(() => { if (steps[idx] && onStep) onStep(steps[idx]); }, [idx]);

  if (steps.length === 0) return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(10,10,10,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "18px 24px", maxWidth: "400px", textAlign: "center" }}>
      <div style={{ color: "#f1f5f9", fontWeight: "600", marginBottom: "6px" }}>Impossible de lancer le DFS</div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer le panneau" style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", fontSize: "13px", padding: "3px 8px", lineHeight: 1 }}>👁</button>
              <button onClick={onClose} style={{ padding: "7px 20px", background: "#f59e0b", border: "none", borderRadius: "8px", color: "#111", cursor: "pointer" }}>Fermer</button>
            </div>
    </div>
  );

  const step = steps[idx];
  const done = step.done;
  const atLastStep = idx === steps.length - 1;
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };
  const mono = "JetBrains Mono, monospace";

  return (
    <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: darkMode ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"}`, borderRadius: "16px", width: "min(700px, 93vw)", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", backdropFilter: "blur(12px)" }}>

      {/* Progress bar */}
      <div style={{ height: "3px", background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#f59e0b", transition: "width 0.3s" }} />
      </div>

      {/* Header */}
      <div style={{ padding: "10px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: "700", fontSize: "13px", color: darkMode ? "#f1f5f9" : "#111827", fontFamily: "Inter, sans-serif" }}>
          DFS — Parcours en profondeur &nbsp;·&nbsp; Étape {idx + 1}/{steps.length}
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={onHide} title="Masquer" style={{ background: "transparent", border: `1px solid ${darkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, borderRadius: "6px", color: darkMode ? "#64748b" : "#9ca3af", cursor: "pointer", fontSize: "14px", padding: "2px 8px" }}>👁</button>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: darkMode ? "#64748b" : "#9ca3af", cursor: "pointer", fontSize: "16px" }}>✕</button>
        </div>
      </div>

      {/* Message */}
      <div style={{ padding: "4px 16px 10px", fontSize: "12px", fontFamily: "Inter, sans-serif", color: done ? "#10b981" : (darkMode ? "#94a3b8" : "#6b7280") }}>
        {step.message}
      </div>

      {/* aTraiter + dejaVu + Date */}
      <div style={{ borderTop: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.14)"}`, padding: "12px 16px", display: "flex", gap: "20px" }}>

        {/* aTraiter — pile */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "10px", color: darkMode ? "#f59e0b" : "#b45309", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>aTraiter</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", minHeight: "36px", alignItems: "center" }}>
            {step.stack.length === 0
              ? <span style={{ color: "#334155", fontSize: "12px", fontStyle: "italic" }}>∅</span>
              : step.stack.map((id, i) => (
                <div key={i} style={{
                  width: "34px", height: "34px", borderRadius: "50%", background: "transparent",
                  border: `2px solid ${i === step.stack.length - 1 ? (darkMode ? "#fcd34d" : "#92400e") : (darkMode ? "#f59e0b" : "#b45309")}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: mono, fontSize: "12px", fontWeight: "700",
                  color: i === step.stack.length - 1 ? (darkMode ? "#fcd34d" : "#92400e") : (darkMode ? "#f59e0b" : "#b45309"),
                }}>
                  {idToLabel[id]}
                </div>
              ))
            }
          </div>
          <div style={{ marginTop: "6px", fontFamily: mono, fontSize: "12px", color: "#475569" }}>
            {step.stack.map(id => idToLabel[id]).join("  ")}
          </div>
        </div>

        <div style={{ width: "1px", background: "rgba(255,255,255,0.06)" }} />

        {/* dejaVu */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "10px", color: "#ef4444", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>dejaVu</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", minHeight: "36px", alignItems: "center" }}>
            {step.visited.length === 0
              ? <span style={{ color: "#334155", fontSize: "12px", fontStyle: "italic" }}>∅</span>
              : step.visited.map((id, i) => (
                <div key={i} style={{
                  width: "34px", height: "34px", borderRadius: "50%", background: "transparent",
                  border: "2px solid #ef4444",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: mono, fontSize: "12px", fontWeight: "700", color: "#ef4444",
                }}>
                  {idToLabel[id]}
                </div>
              ))
            }
          </div>
          <div style={{ marginTop: "6px", fontFamily: mono, fontSize: "12px", color: "#475569" }}>
            {step.visited.map(id => idToLabel[id]).join("  ")}
          </div>
        </div>

        <div style={{ width: "1px", background: "rgba(255,255,255,0.06)" }} />

        {/* Dates */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "10px", color: "#a78bfa", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>Date</div>
          <div style={{ display: "grid", gap: "3px" }}>
            {Object.entries(step.dates).map(([id, d]) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: mono, fontSize: "11px" }}>
                <span style={{ color: "#e2e8f0", fontWeight: "700", minWidth: "18px" }}>{idToLabel[id]}</span>
                <span style={{ color: "#a78bfa" }}>{d.pre}</span>
                <span style={{ color: "#475569" }}>/</span>
                <span style={{ color: d.post !== null ? "#10b981" : "#334155" }}>
                  {d.post !== null ? d.post : "…"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tableau final des dates — visible seulement quand done */}
      {done && (
        <div style={{ borderTop: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.14)"}`, padding: "12px 16px" }}>
          <div style={{ fontSize: "10px", color: "#a78bfa", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>
            Tableau final — dates de visite (pré / post)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontFamily: mono, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ padding: "5px 12px", fontSize: "11px", color: darkMode ? "#94a3b8" : "#6b7280", fontWeight: "700", background: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderBottom: darkMode ? "2px solid rgba(255,255,255,0.1)" : "2px solid rgba(0,0,0,0.1)", textAlign: "center", whiteSpace: "nowrap" }}>x</th>
                  {Object.entries(step.dates).sort((a,b) => a[1].pre - b[1].pre).map(([id]) => (
                    <th key={id} style={{ padding: "5px 12px", fontSize: "11px", color: darkMode ? "#e2e8f0" : "#111827", fontWeight: "700", background: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderBottom: darkMode ? "2px solid rgba(255,255,255,0.1)" : "2px solid rgba(0,0,0,0.1)", textAlign: "center", borderLeft: darkMode ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.06)" }}>
                      {idToLabel[id]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "5px 12px", fontSize: "11px", color: "#7c3aed", fontWeight: "700", background: darkMode ? "rgba(167,139,250,0.05)" : "rgba(124,58,237,0.06)", textAlign: "center", whiteSpace: "nowrap" }}>x.d (pré)</td>
                  {Object.entries(step.dates).sort((a,b) => a[1].pre - b[1].pre).map(([id, d]) => (
                    <td key={id} style={{ padding: "5px 12px", fontSize: "12px", color: darkMode ? "#a78bfa" : "#7c3aed", fontWeight: "700", textAlign: "center", borderLeft: darkMode ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.06)" }}>
                      {d.pre}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: "5px 12px", fontSize: "11px", color: "#059669", fontWeight: "700", background: darkMode ? "rgba(16,185,129,0.05)" : "rgba(5,150,105,0.06)", textAlign: "center", whiteSpace: "nowrap" }}>x.f (post)</td>
                  {Object.entries(step.dates).sort((a,b) => a[1].pre - b[1].pre).map(([id, d]) => (
                    <td key={id} style={{ padding: "5px 12px", fontSize: "12px", color: darkMode ? "#10b981" : "#059669", fontWeight: "700", textAlign: "center", borderLeft: darkMode ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.06)" }}>
                      {d.post}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Légende */}
      <div style={{ padding: "6px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "16px" }}>
        {[[darkMode ? "#f59e0b" : "#b45309","aTraiter (pile)"],["#ef4444","Déjà vu"],["#a78bfa","Pré"],["#10b981","Post"]].map(([col,lab]) => (
          <div key={lab} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "#6b7280" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: col }} />{lab}
          </div>
        ))}
      </div>

      {done && (
        <div style={{ borderTop: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.14)"}`, padding: "10px 16px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => onShowForest && onShowForest(step.treeEdges, step.dates)}
            style={{ padding: "7px 14px", borderRadius: "8px", background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: `1px solid ${darkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, color: darkMode ? "#e2e8f0" : "#374151", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", fontWeight: "500" }}>
            Voir la forêt
          </button>
          {directed && <button onClick={() => onShowSCC && onShowSCC()}
            style={{ padding: "7px 14px", borderRadius: "8px", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", color: "#a78bfa", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", fontWeight: "500" }}>
            Composantes fortement connexes
          </button>}
          {directed && <button onClick={() => onShowTopo && onShowTopo(step.dates)}
            style={{ padding: "7px 14px", borderRadius: "8px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", fontWeight: "500" }}>
            Tri topologique
          </button>}
        </div>
      )}

      {/* Navigation */}
      <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: darkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)" }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ ...btnBase, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: idx === 0 ? (darkMode ? "#334155" : "#d1d5db") : (darkMode ? "#e2e8f0" : "#374151"), border: darkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.1)", cursor: idx === 0 ? "default" : "pointer" }}>
          ← Précédent
        </button>
        <span style={{ fontSize: "11px", color: done ? "#10b981" : (darkMode ? "#6b7280" : "#9ca3af"), fontWeight: done ? "600" : "400" }}>
          {done ? `Terminé — ${step.visited.length} sommet(s)` : `Pile : ${step.stack.length} · Visités : ${step.visited.length}`}
        </span>
        <button onClick={() => setIdx(i => Math.min(steps.length - 1, i + 1))} disabled={idx === steps.length - 1}
          style={{ ...btnBase, background: idx === steps.length - 1 ? "transparent" : (darkMode ? "rgba(245,158,11,0.1)" : "rgba(180,83,9,0.08)"), color: idx === steps.length - 1 ? (darkMode ? "#334155" : "#9ca3af") : (darkMode ? "#fcd34d" : "#b45309"), border: idx === steps.length - 1 ? (darkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)") : (darkMode ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(180,83,9,0.3)"), cursor: idx === steps.length - 1 ? "default" : "pointer" }}>
          Suivant →
        </button>
      </div>
    </div>
  );
}

// ─── DFS Forest Modal ─────────────────────────────────────────────────────────

function DFSForestModal({ treeEdges, dates, elements, idToLabel, onClose, darkMode }) {
  const nodes = elements.filter(el => !el.data.source);
  const nodeIds = nodes.map(n => n.data.id);
  const bg = darkMode ? "#0d0605" : "#ffffff";
  const borderC = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.22)";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textMuted = darkMode ? "#6b7280" : "#9ca3af";
  const nodeBg = darkMode ? "#e5e7eb" : "#1f2937";
  const nodeTextColor = darkMode ? "#111827" : "#f9fafb";

  const parent = {}, children = {};
  nodeIds.forEach(id => { children[id] = []; });
  treeEdges.forEach(eid => {
    const e = elements.find(el => el.data.id === eid);
    if (e) { parent[e.data.target] = e.data.source; children[e.data.source].push(e.data.target); }
  });

  // All visited nodes are roots if they have no parent in tree
  const visitedIds = nodeIds.filter(id => dates[id]);
  const roots = visitedIds.filter(id => !parent[id]);
  // Isolated nodes = not visited at all
  const isolatedIds = nodeIds.filter(id => !dates[id]);

  const nodeX = {}, nodeY = {};
  let globalCounter = 0;
  const rowH = 85, colW = 68;

  function assignPos(id, depth) {
    const ch = children[id] || [];
    ch.forEach(c => assignPos(c, depth + 1));
    if (ch.length === 0) { nodeX[id] = globalCounter++ * colW; }
    else { nodeX[id] = (nodeX[ch[0]] + nodeX[ch[ch.length - 1]]) / 2; }
    nodeY[id] = depth * rowH + 60;
  }

  let treeOffset = 0;
  roots.forEach(root => {
    globalCounter = 0;
    assignPos(root, 0);
    const treeNodes = [];
    const collect = id => { treeNodes.push(id); (children[id] || []).forEach(collect); };
    collect(root);
    const minX = Math.min(...treeNodes.map(id => nodeX[id]));
    treeNodes.forEach(id => { nodeX[id] += treeOffset - minX; });
    const maxX = Math.max(...treeNodes.map(id => nodeX[id]));
    treeOffset = maxX + colW * 2;
  });

  // Place isolated nodes to the right
  isolatedIds.forEach(id => {
    nodeX[id] = treeOffset;
    nodeY[id] = 60;
    treeOffset += colW * 1.5;
  });

  const allX = Object.values(nodeX), allY = Object.values(nodeY);
  if (!allX.length) return null;
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const totalW = Math.max(660, maxX - minX + 100);
  const offset = (totalW - (maxX - minX)) / 2 - minX;
  const canvasH = Math.max(280, Math.max(...allY) + 80);

  const rootColors = ["#10b981","#3b82f6","#f59e0b","#a78bfa","#ef4444","#ec4899"];
  const rootOf = {};
  roots.forEach((root, ri) => {
    const col = id => { rootOf[id] = ri; (children[id]||[]).forEach(col); };
    col(root);
  });

  const cyEls = [
    ...nodeIds.map(id => ({
      data: { id, label: idToLabel[id] },
      position: { x: (nodeX[id] ?? 0) + offset, y: nodeY[id] ?? 60 },
    })),
    ...treeEdges.map((eid, i) => {
      const e = elements.find(el => el.data.id === eid);
      return e ? { data: { id: `t${i}`, source: e.data.source, target: e.data.target } } : null;
    }).filter(Boolean),
  ];

  const stylesheet = [
    { selector: "node", style: { "background-color": nodeBg, "border-width": 2, "border-color": darkMode ? "#6b7280" : "#374151", color: nodeTextColor, label: "data(label)", "text-valign": "center", "text-halign": "center", "font-family": "JetBrains Mono, monospace", "font-size": "13px", "font-weight": "700", width: 40, height: 40 } },
    // Isolated nodes — dashed border
    ...isolatedIds.map(id => ({ selector: `node[id="${id}"]`, style: { "border-style": "dashed", "border-color": darkMode ? "#4b5563" : "#9ca3af", "border-width": 2 } })),
    // Root colors
    ...roots.map((root, ri) => ({ selector: `node[id="${root}"]`, style: { "background-color": rootColors[ri % rootColors.length], "border-color": rootColors[ri % rootColors.length], color: "#fff", "border-width": 3 } })),
    { selector: "edge", style: { width: 2, "line-color": darkMode ? "#6b7280" : "#374151", "target-arrow-color": darkMode ? "#6b7280" : "#374151", "target-arrow-shape": "triangle", "curve-style": "straight" } },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <div style={{ background: bg, border: `1px solid ${borderC}`, borderRadius: "16px", width: `min(${totalW + 40}px, 96vw)`, maxWidth: "820px", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: textMain, fontFamily: "Inter, sans-serif" }}>Forêt du parcours en profondeur</div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
              {roots.length} arbre(s) · racines colorées
              {isolatedIds.length > 0 && ` · ${isolatedIds.length} sommet(s) non visité(s) (bordure pointillée)`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", padding: "6px 10px" }}>✕</button>
        </div>
        <div style={{ height: `${canvasH}px`, position: "relative" }}>
          <CytoscapeComponent elements={cyEls} stylesheet={stylesheet}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            layout={{ name: "preset" }} userZoomingEnabled={true} userPanningEnabled={true}
            boxSelectionEnabled={false} autounselectify={true} />
        </div>
      </div>
    </div>
  );
}

// ─── SCC (Kosaraju) ─────────────────────────────────────────────────────────

function computeSCC(elements, idToLabel) {
  const nodes = elements.filter(el => !el.data.source);
  const edges = elements.filter(el => !!el.data.source && el.data.source !== el.data.target);
  const ids = nodes.map(n => n.data.id);

  const succ = {}, pred = {};
  ids.forEach(id => { succ[id] = []; pred[id] = []; });
  edges.forEach(e => {
    succ[e.data.source].push(e.data.target);
    pred[e.data.target].push(e.data.source);
  });

  // DFS1 on G — record finish order
  const visited1 = new Set();
  const finishOrder = [];
  function dfs1(id) {
    visited1.add(id);
    succ[id].forEach(nb => { if (!visited1.has(nb)) dfs1(nb); });
    finishOrder.push(id);
  }
  ids.forEach(id => { if (!visited1.has(id)) dfs1(id); });

  // G^T adjacency (pred = successors in transposed)
  const transposed = {};
  ids.forEach(id => { transposed[id] = [...pred[id]]; });

  // DFS2 on G^T in reverse finish order — generate step-by-step trace
  // Each step: { stack, visited, dates, currentTree, message, done }
  const dfs2Steps = [];
  const visited2 = new Set();
  const components = [];
  const dates2 = {};   // { id: { pre, post } }
  let clock2 = 1;
  let currentTreeIdx = -1; // index of component being built

  // Traversal order for DFS2: finishOrder reversed
  const dfs2Order = [...finishOrder].reverse();

  // Iterative DFS2 with step generation
  let stack2 = [];

  const snap2 = () => ({
    stack: [...stack2.map(x => x.id)],
    visited: [...visited2],
    dates: Object.fromEntries(Object.entries(dates2).map(([k,v]) => [k,{...v}])),
    currentTree: currentTreeIdx,
    components: components.map(c => [...c]),
  });

  for (const rootId of dfs2Order) {
    if (visited2.has(rootId)) continue;

    // New tree = new component
    currentTreeIdx++;
    const currentComp = [];
    components.push(currentComp);

    stack2 = [{ id: rootId, explored: 0 }];
    dfs2Steps.push({ ...snap2(), message: `Nouveau départ sur Gᵀ : ${idToLabel[rootId]} empilé (ordre de fin décroissant).`, done: false });

    while (stack2.length > 0) {
      const top = stack2[stack2.length - 1];

      if (!visited2.has(top.id)) {
        visited2.add(top.id);
        currentComp.push(top.id);
        dates2[top.id] = { pre: clock2++, post: null };
        dfs2Steps.push({ ...snap2(), message: `Pré-visite de ${idToLabel[top.id]} sur Gᵀ — date ${dates2[top.id].pre}.`, done: false });
      }

      const succs = transposed[top.id] || [];
      let pushed = false;
      while (top.explored < succs.length) {
        const nb = succs[top.explored];
        top.explored++;
        if (!visited2.has(nb)) {
          stack2.push({ id: nb, explored: 0 });
          dfs2Steps.push({ ...snap2(), message: `${idToLabel[top.id]} → ${idToLabel[nb]} non visité sur Gᵀ : empilé.`, done: false });
          pushed = true;
          break;
        }
      }

      if (!pushed) {
        dates2[top.id].post = clock2++;
        stack2.pop();
        const allDone = stack2.length === 0 && dfs2Order.filter(id => !visited2.has(id)).length === 0;
        dfs2Steps.push({ ...snap2(), message: allDone
          ? `Post-visite de ${idToLabel[top.id]} sur Gᵀ — date ${dates2[top.id].post}. DFS² terminé.`
          : `Post-visite de ${idToLabel[top.id]} sur Gᵀ — date ${dates2[top.id].post}. Dépilé.`,
          done: allDone });
      }
    }
  }

  return { components, finishOrder, transposed, succ, pred, dfs2Steps, dates2 };
}

function SCCPanel({ elements, idToLabel, onClose, darkMode }) {
  const result = useMemo(() => computeSCC(elements, idToLabel), []);
  const { components, finishOrder, transposed, dfs2Steps, dates2 } = result;
  const colors = ["#10b981","#3b82f6","#f59e0b","#a78bfa","#ef4444","#ec4899","#14b8a6","#f97316"];

  const [tab, setTab] = useState(0); // 0=DFS1, 1=GT dict, 2=DFS2 animated, 3=result
  const [dfs2Idx, setDfs2Idx] = useState(0);

  const bg = darkMode ? "#0d0605" : "#ffffff";
  const borderC = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.22)";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textMuted = darkMode ? "#6b7280" : "#9ca3af";
  const sectionBg = darkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)";
  const codeBg = darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const mono = "JetBrains Mono, monospace";

  const edges = elements.filter(el => !!el.data.source && el.data.source !== el.data.target);
  const nodeToComp = {};
  components.forEach((comp, ci) => comp.forEach(id => { nodeToComp[id] = ci; }));
  const interEdgesSet = new Set();
  edges.forEach(e => {
    const ci = nodeToComp[e.data.source], cj = nodeToComp[e.data.target];
    if (ci !== undefined && cj !== undefined && ci !== cj) interEdgesSet.add(`${ci}->${cj}`);
  });
  const interEdgesList = [...interEdgesSet].map(k => { const [a,b] = k.split("->"); return { from: Number(a), to: Number(b) }; });

  const ids = elements.filter(el => !el.data.source).map(n => n.data.id);

  // DFS2 current step
  const dfs2Step = dfs2Steps[dfs2Idx] || dfs2Steps[dfs2Steps.length - 1];
  const dfs2Done = dfs2Step && dfs2Step.done;

  const tabs = ["1. DFS sur G", "2. Graphe Gᵀ", "3. DFS sur Gᵀ", "4. Résultat"];

  const NodeBubble = ({ id, color, size = 34, dimmed = false }) => (
    <div style={{
      width: size+"px", height: size+"px", borderRadius: "50%",
      background: color ? color : codeBg,
      border: color ? "none" : `1.5px solid ${borderC}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: mono, fontSize: size > 38 ? "13px" : "11px", fontWeight: "700",
      color: color ? "#fff" : (dimmed ? textMuted : textMain),
      opacity: dimmed ? 0.4 : 1,
      flexShrink: 0,
    }}>
      {idToLabel[id]}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <div style={{ background: bg, border: `1px solid ${borderC}`, borderRadius: "16px", width: "min(860px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: textMain, fontFamily: "Inter, sans-serif" }}>Composantes fortement connexes</div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>Algorithme de Kosaraju — {components.length} composante(s)</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", padding: "6px 10px" }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${borderC}`, flexShrink: 0, overflowX: "auto" }}>
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              padding: "10px 16px", fontFamily: "Inter, sans-serif", fontSize: "12px", fontWeight: tab === i ? "700" : "400",
              color: tab === i ? (darkMode ? "#f3f4f6" : "#111827") : textMuted,
              background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap",
              borderBottom: tab === i ? "2px solid #e05252" : "2px solid transparent",
              transition: "color 0.15s",
            }}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column" }}>

          {/* ── Tab 0: DFS1 result ── */}
          {tab === 0 && (
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "11px", color: textMuted, fontFamily: "Inter, sans-serif" }}>
                On effectue un DFS sur G. On note l'ordre dans lequel les sommets terminent (x.f).
              </div>
              <div style={{ background: sectionBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
                <div style={{ fontSize: "10px", color: textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", fontFamily: "Inter, sans-serif" }}>
                  Ordre de fin — x.f croissant (premier terminé à gauche)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-end" }}>
                  {finishOrder.map((id, i) => (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                        <NodeBubble id={id} />
                        <span style={{ fontFamily: mono, fontSize: "9px", color: textMuted }}>f={i+1}</span>
                      </div>
                      {i < finishOrder.length - 1 && <span style={{ color: textMuted, fontSize: "9px", marginBottom: "10px" }}>→</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: sectionBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
                <div style={{ fontSize: "10px", color: textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", fontFamily: "Inter, sans-serif" }}>
                  Ordre de départ du DFS² sur Gᵀ (fin décroissante = dernier terminé en premier)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-end" }}>
                  {[...finishOrder].reverse().map((id, i) => (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                        <NodeBubble id={id} />
                        <span style={{ fontFamily: mono, fontSize: "9px", color: "#e05252" }}>f={finishOrder.length - i}</span>
                      </div>
                      {i < finishOrder.length - 1 && <span style={{ color: textMuted, fontSize: "9px", marginBottom: "10px" }}>→</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 1: G^T dict ── */}
          {tab === 1 && (
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "11px", color: textMuted, fontFamily: "Inter, sans-serif" }}>
                On construit Gᵀ en inversant tous les arcs de G. Γ⁺(x) dans Gᵀ = Γ⁻(x) dans G.
              </div>
              <div style={{ background: sectionBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
                  {ids.map(id => (
                    <div key={id} style={{ display: "flex", alignItems: "baseline", gap: "6px", fontFamily: mono, fontSize: "12px" }}>
                      <span style={{ color: darkMode ? "#e05252" : "#b91c1c", fontWeight: "700", minWidth: "24px" }}>{idToLabel[id]}</span>
                      <span style={{ color: textMuted }}>→</span>
                      <span style={{ color: textMain }}>
                        {transposed[id] && transposed[id].length > 0
                          ? transposed[id].map(nb => idToLabel[nb]).join(", ")
                          : <span style={{ color: textMuted, fontStyle: "italic" }}>∅</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 2: DFS2 animated ── */}
          {tab === 2 && dfs2Step && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {/* Progress bar */}
              <div style={{ height: "3px", background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", flexShrink: 0 }}>
                <div style={{ height: "100%", width: (dfs2Steps.length > 1 ? dfs2Idx / (dfs2Steps.length - 1) * 100 : 0) + "%", background: dfs2Done ? "#10b981" : "#e05252", transition: "width 0.3s" }} />
              </div>

              <div style={{ padding: "12px 20px", borderBottom: `1px solid ${borderC}`, flexShrink: 0 }}>
                <div style={{ fontSize: "11px", color: dfs2Done ? "#10b981" : textMuted, fontFamily: "Inter, sans-serif" }}>
                  {dfs2Step.message}
                </div>
              </div>

              <div style={{ padding: "14px 20px", display: "flex", gap: "16px", flex: 1, overflow: "hidden" }}>

                {/* aTraiter (pile) */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: darkMode ? "#b45309" : "#b45309", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "Inter, sans-serif" }}>aTraiter</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", minHeight: "36px" }}>
                    {dfs2Step.stack.length === 0
                      ? <span style={{ color: textMuted, fontSize: "12px", fontStyle: "italic" }}>∅</span>
                      : dfs2Step.stack.map((id, i) => (
                          <div key={i} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "transparent", border: `2px solid ${i === dfs2Step.stack.length - 1 ? (darkMode ? "#fcd34d" : "#92400e") : (darkMode ? "#f59e0b" : "#b45309")}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: "11px", fontWeight: "700", color: i === dfs2Step.stack.length - 1 ? (darkMode ? "#fcd34d" : "#92400e") : (darkMode ? "#f59e0b" : "#b45309") }}>
                            {idToLabel[id]}
                          </div>
                      ))}
                  </div>
                </div>

                <div style={{ width: "1px", background: borderC }} />

                {/* dejaVu */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#ef4444", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "Inter, sans-serif" }}>Déjà vu</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", minHeight: "36px" }}>
                    {dfs2Step.visited.length === 0
                      ? <span style={{ color: textMuted, fontSize: "12px", fontStyle: "italic" }}>∅</span>
                      : dfs2Step.visited.map((id, i) => (
                          <div key={i} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "transparent", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: "11px", fontWeight: "700", color: "#ef4444" }}>
                            {idToLabel[id]}
                          </div>
                      ))}
                  </div>
                </div>

                <div style={{ width: "1px", background: borderC }} />

                {/* Composantes en cours */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "Inter, sans-serif" }}>Composantes</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {dfs2Step.components.map((comp, ci) => {
                      const color = colors[ci % colors.length];
                      return comp.length > 0 ? (
                        <div key={ci} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ fontFamily: mono, fontSize: "10px", fontWeight: "700", color, minWidth: "22px" }}>C{ci+1}</span>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            {comp.map(id => (
                              <div key={id} style={{ width: "28px", height: "28px", borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: "10px", fontWeight: "700", color: "#fff" }}>
                                {idToLabel[id]}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>

                <div style={{ width: "1px", background: borderC }} />

                {/* Dates pré/post */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "Inter, sans-serif" }}>Dates</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    {Object.entries(dfs2Step.dates).map(([id, d]) => (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: mono, fontSize: "11px" }}>
                        <span style={{ color: textMain, fontWeight: "700", minWidth: "16px" }}>{idToLabel[id]}</span>
                        <span style={{ color: darkMode ? "#a78bfa" : "#7c3aed" }}>{d.pre}</span>
                        <span style={{ color: textMuted }}>/</span>
                        <span style={{ color: d.post !== null ? (darkMode ? "#10b981" : "#059669") : textMuted }}>
                          {d.post !== null ? d.post : "…"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Navigation */}
              <div style={{ padding: "8px 16px 12px", borderTop: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <button onClick={() => setDfs2Idx(i => Math.max(0, i-1))} disabled={dfs2Idx === 0}
                  style={{ padding: "7px 14px", borderRadius: "8px", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none", cursor: dfs2Idx === 0 ? "default" : "pointer", background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: dfs2Idx === 0 ? textMuted : textMain }}>
                  ← Précédent
                </button>
                <span style={{ fontSize: "11px", color: dfs2Done ? "#10b981" : textMuted, fontFamily: "Inter, sans-serif" }}>
                  Étape {dfs2Idx+1}/{dfs2Steps.length} · {dfs2Step.visited.length}/{ids.length} sommet(s) visité(s)
                </span>
                <button onClick={() => setDfs2Idx(i => Math.min(dfs2Steps.length-1, i+1))} disabled={dfs2Idx === dfs2Steps.length-1}
                  style={{ padding: "7px 14px", borderRadius: "8px", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none", cursor: dfs2Idx === dfs2Steps.length-1 ? "default" : "pointer", background: dfs2Idx === dfs2Steps.length-1 ? "transparent" : (darkMode ? "rgba(224,82,82,0.1)" : "rgba(224,82,82,0.08)"), color: dfs2Idx === dfs2Steps.length-1 ? textMuted : "#e05252" }}>
                  Suivant →
                </button>
              </div>
            </div>
          )}

          {/* ── Tab 3: Résultat ── */}
          {tab === 3 && (
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "11px", color: textMuted, fontFamily: "Inter, sans-serif" }}>
                Chaque arborescence du DFS sur Gᵀ correspond à une composante fortement connexe.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {components.map((comp, ci) => {
                  const color = colors[ci % colors.length];
                  return (
                    <div key={ci} style={{ border: `2px solid ${color}`, borderRadius: "12px", padding: "12px 16px", background: `${color}14`, minWidth: "90px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color }} />
                        <span style={{ fontSize: "11px", fontWeight: "700", color, fontFamily: "Inter, sans-serif", letterSpacing: "0.06em" }}>C{ci + 1}</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {comp.map(id => (
                          <div key={id} style={{ width: "34px", height: "34px", borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: "13px", fontWeight: "700" }}>
                            {idToLabel[id]}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {interEdgesList.length > 0 && (
                <div style={{ background: sectionBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "10px", color: textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "Inter, sans-serif" }}>Arcs entre composantes (graphe réduit)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {interEdgesList.map(({ from, to }) => {
                      const cf = colors[from % colors.length], ct = colors[to % colors.length];
                      return (
                        <div key={`${from}->${to}`} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "9999px", background: codeBg, border: `1px solid ${borderC}` }}>
                          <span style={{ fontFamily: mono, fontSize: "12px", fontWeight: "700", color: cf }}>C{from+1}</span>
                          <span style={{ color: textMuted, fontSize: "11px" }}>→</span>
                          <span style={{ fontFamily: mono, fontSize: "12px", fontWeight: "700", color: ct }}>C{to+1}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Tri Topologique ─────────────────────────────────────────────────────────

function TopoSortPanel({ elements, idToLabel, onClose, darkMode, dfsFinishDates }) {
  const nodes = elements.filter(el => !el.data.source);
  const edges = elements.filter(el => !!el.data.source && el.data.source !== el.data.target);
  const ids = nodes.map(n => n.data.id);

  const bg = darkMode ? "#0d0605" : "#ffffff";
  const borderC = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.22)";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textMuted = darkMode ? "#6b7280" : "#9ca3af";
  const cardBg = darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
  const cardBorder = darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.14)";
  const mono = "JetBrains Mono, monospace";

  // Sort nodes by finish time ascending (first finished = index 0)
  const visitedIds = ids.filter(id => dfsFinishDates && dfsFinishDates[id] && dfsFinishDates[id].post !== null);
  const finishOrder = [...visitedIds].sort((a, b) => dfsFinishDates[a].post - dfsFinishDates[b].post);

  // Cycle detection: back edge = v.pre < u.pre AND v.post > u.post
  let hasCycle = false;
  edges.forEach(e => {
    const su = dfsFinishDates[e.data.source], sv = dfsFinishDates[e.data.target];
    if (su && sv && sv.pre < su.pre && sv.post > su.post) hasCycle = true;
  });

  // Build animation steps:
  // Step 0: show DFS finish table, nothing in topo yet
  // Step i (1..n): reveal the i-th node added to the topo list (prepended to the left)
  // At each step, the "current" node is highlighted (it just finished)
  // topoOrder[0] = last to finish, topoOrder[n-1] = first to finish
  const topoOrder = [...finishOrder].reverse(); // topo order left→right

  // steps[i] = how many nodes are revealed so far (0..n)
  // At step i, nodes topoOrder[0..i-1] are shown, topoOrder[i-1] is the newly added one
  const totalSteps = topoOrder.length;
  const [step, setStep] = useState(0);

  // The current node being "noted" = finishOrder[step-1] (i-th to finish, 0-indexed)
  // It gets prepended: topoOrder so far = topoOrder.slice(0, step)
  const revealedTopo = topoOrder.slice(0, step);
  const currentNode = step > 0 ? topoOrder[step - 1] : null; // just added (leftmost of revealed)
  const currentFinishRank = step; // this node was the step-th to finish (1-based)

  // Verify arcs (only when all revealed)
  const topoPos = {};
  topoOrder.forEach((id, i) => { topoPos[id] = i; });
  const violations = edges.filter(e =>
    topoPos[e.data.source] !== undefined && topoPos[e.data.target] !== undefined &&
    topoPos[e.data.source] > topoPos[e.data.target]
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <div style={{ background: bg, border: `1px solid ${borderC}`, borderRadius: "16px", width: "min(860px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: textMain, fontFamily: "Inter, sans-serif" }}>Tri topologique</div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
              {hasCycle ? "Impossible — graphe cyclique" : "Basé sur les dates de fin du DFS"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", padding: "6px 10px" }}>✕</button>
        </div>

        {hasCycle ? (
          <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "36px" }}>⛔</div>
            <div style={{ fontWeight: "700", fontSize: "15px", color: "#ef4444", fontFamily: "Inter, sans-serif" }}>Tri topologique impossible</div>
            <div style={{ fontSize: "13px", color: textMuted, textAlign: "center", maxWidth: "360px", fontFamily: "Inter, sans-serif", lineHeight: "1.6" }}>
              Ce graphe contient un cycle. Un tri topologique n'existe que pour les graphes orientés acycliques (DAG).
            </div>
          </div>
        ) : (
          <>
            <div style={{ overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* DFS finish table */}
              <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "12px", padding: "14px 16px" }}>
                <div style={{ fontSize: "10px", color: textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", fontFamily: "Inter, sans-serif" }}>
                  Dates de fin du DFS (x.f) — ordre croissant
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-end" }}>
                  {finishOrder.map((id, i) => {
                    const rank = i + 1; // 1-based finish rank
                    const isCurrent = step > 0 && rank === step;
                    const isDone = step > 0 && rank <= step;
                    return (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                          <div style={{
                            width: "36px", height: "36px", borderRadius: "50%",
                            background: isCurrent
                              ? (darkMode ? "rgba(224,82,82,0.25)" : "rgba(224,82,82,0.12)")
                              : isDone
                                ? (darkMode ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.1)")
                                : cardBg,
                            border: isCurrent ? "2px solid #e05252" : isDone ? "2px solid #10b981" : `1.5px solid ${cardBorder}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: mono, fontSize: "12px", fontWeight: "700",
                            color: isCurrent ? "#e05252" : isDone ? "#10b981" : textMuted,
                            transition: "all 0.2s",
                          }}>
                            {idToLabel[id]}
                          </div>
                          <span style={{ fontFamily: mono, fontSize: "9px", color: isCurrent ? "#e05252" : isDone ? "#10b981" : textMuted, fontWeight: isCurrent ? "700" : "400" }}>
                            f={dfsFinishDates[id].post}
                          </span>
                        </div>
                        {i < finishOrder.length - 1 && <span style={{ color: textMuted, fontSize: "9px", marginBottom: "10px" }}>→</span>}
                      </div>
                    );
                  })}
                </div>
                {step > 0 && step <= totalSteps && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: textMuted, fontFamily: "Inter, sans-serif" }}>
                    <span style={{ color: "#e05252", fontWeight: "700" }}>{idToLabel[topoOrder[step-1]]}</span>
                    {" est le "}
                    <span style={{ color: textMain, fontWeight: "600" }}>{step}{step===1?"er":"ème"}</span>
                    {" sommet à avoir terminé (f="}
                    <span style={{ color: darkMode ? "#a78bfa" : "#7c3aed", fontWeight: "600" }}>{dfsFinishDates[topoOrder[step-1]].post}</span>
                    {"). On le place à gauche."}
                  </div>
                )}
              </div>

              {/* Topo list being built */}
              <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "12px", padding: "14px 16px" }}>
                <div style={{ fontSize: "10px", color: textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", fontFamily: "Inter, sans-serif" }}>
                  Construction de l'ordre topologique
                  {step === totalSteps && <span style={{ marginLeft: "8px", color: "#10b981" }}>— Terminé</span>}
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", minHeight: "64px" }}>
                  {step === 0 ? (
                    <span style={{ fontSize: "12px", color: textMuted, fontFamily: "Inter, sans-serif", fontStyle: "italic" }}>
                      Appuyez sur Suivant pour commencer…
                    </span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0" }}>
                      {revealedTopo.map((id, i) => (
                        <div key={id} style={{ display: "flex", alignItems: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                            <div style={{
                              width: "46px", height: "46px", borderRadius: "50%",
                              background: i === 0
                                ? (darkMode ? "rgba(224,82,82,0.2)" : "rgba(224,82,82,0.1)")
                                : (darkMode ? "rgba(224,82,82,0.06)" : "rgba(224,82,82,0.04)"),
                              border: i === 0 ? "2px solid #e05252" : "2px solid rgba(224,82,82,0.35)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: mono, fontSize: "14px", fontWeight: "700",
                              color: darkMode ? "#f3f4f6" : "#111827",
                              boxShadow: i === 0 ? "0 0 0 3px rgba(224,82,82,0.15)" : "none",
                            }}>
                              {idToLabel[id]}
                            </div>
                            <span style={{ fontFamily: mono, fontSize: "9px", color: darkMode ? "#a78bfa" : "#7c3aed" }}>
                              f={dfsFinishDates[id].post}
                            </span>
                          </div>
                          {i < revealedTopo.length - 1 && (
                            <div style={{ width: "28px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                              <span style={{ color: textMuted, fontSize: "13px" }}>→</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Arc verification when complete */}
                {step === totalSteps && (
                  <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "8px", background: violations.length === 0 ? (darkMode ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.06)") : "rgba(239,68,68,0.08)", border: "1px solid " + (violations.length === 0 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)") }}>
                    <span style={{ fontSize: "11px", fontFamily: "Inter, sans-serif", color: violations.length === 0 ? "#10b981" : "#ef4444", fontWeight: "600" }}>
                      {violations.length === 0
                        ? "Condition vérifiée : pour tout arc u → v, u est à gauche de v."
                        : `${violations.length} arc(s) violent la condition — le graphe a peut-être des cycles.`}
                    </span>
                  </div>
                )}
              </div>

            </div>

            {/* Navigation */}
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                style={{ padding: "7px 16px", borderRadius: "8px", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none", cursor: step === 0 ? "default" : "pointer", background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: step === 0 ? (darkMode ? "#334155" : "#d1d5db") : (darkMode ? "#e2e8f0" : "#374151") }}>
                ← Précédent
              </button>
              <span style={{ fontSize: "11px", color: step === totalSteps ? "#10b981" : textMuted, fontFamily: "Inter, sans-serif", fontWeight: step === totalSteps ? "600" : "400" }}>
                {step === 0
                  ? `0 / ${totalSteps} sommet(s) placé(s)`
                  : step === totalSteps
                    ? `Tri terminé — ${totalSteps} sommet(s)`
                    : `${step} / ${totalSteps} sommet(s) placé(s)`}
              </span>
              <button onClick={() => setStep(s => Math.min(totalSteps, s + 1))} disabled={step === totalSteps}
                style={{ padding: "7px 16px", borderRadius: "8px", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none", cursor: step === totalSteps ? "default" : "pointer", background: step === totalSteps ? "transparent" : (darkMode ? "rgba(224,82,82,0.1)" : "rgba(224,82,82,0.08)"), color: step === totalSteps ? (darkMode ? "#334155" : "#9ca3af") : "#e05252" }}>
                Suivant →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Graphe Réduit ────────────────────────────────────────────────────────────

function GrapheReduitPanel({ elements, idToLabel, onClose, darkMode }) {
  const { components } = useMemo(() => computeSCC(elements, idToLabel), []);
  const colors = ["#10b981","#3b82f6","#f59e0b","#a78bfa","#ef4444","#ec4899","#14b8a6","#f97316"];

  const bg = darkMode ? "#0d0605" : "#ffffff";
  const borderC = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.22)";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textMuted = darkMode ? "#6b7280" : "#9ca3af";

  const edges = elements.filter(el => !!el.data.source && el.data.source !== el.data.target);

  // Map each node → its component index
  const nodeToComp = {};
  components.forEach((comp, ci) => comp.forEach(id => { nodeToComp[id] = ci; }));

  // Build reduced graph edges (no self-loops, no duplicates)
  const reducedEdgeSet = new Set();
  const reducedEdges = [];
  edges.forEach(e => {
    const ci = nodeToComp[e.data.source], cj = nodeToComp[e.data.target];
    if (ci !== undefined && cj !== undefined && ci !== cj) {
      const key = `${ci}->${cj}`;
      if (!reducedEdgeSet.has(key)) {
        reducedEdgeSet.add(key);
        reducedEdges.push({ id: key, source: `c${ci}`, target: `c${cj}` });
      }
    }
  });

  // Layout: topological sort of the reduced DAG
  const compIds = components.map((_, ci) => `c${ci}`);
  const succR = {};
  compIds.forEach(id => { succR[id] = []; });
  reducedEdges.forEach(e => { succR[e.source].push(e.target); });

  // BFS-based level assignment for DAG layout
  const inDeg = {};
  compIds.forEach(id => { inDeg[id] = 0; });
  reducedEdges.forEach(e => { inDeg[e.target]++; });

  const levels = {};
  const queue = compIds.filter(id => inDeg[id] === 0);
  queue.forEach(id => { levels[id] = 0; });
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    succR[cur].forEach(nb => {
      levels[nb] = Math.max(levels[nb] ?? 0, (levels[cur] ?? 0) + 1);
      queue.push(nb);
    });
  }
  // Any unplaced (cycle-free DAG should have none, but safety)
  compIds.forEach(id => { if (levels[id] === undefined) levels[id] = 0; });

  const byLevel = {};
  compIds.forEach(id => {
    const lv = levels[id];
    if (!byLevel[lv]) byLevel[lv] = [];
    byLevel[lv].push(id);
  });

  const W = 660, rowH = 110, nodeSize = 54;
  const positions = {};
  Object.entries(byLevel).forEach(([lv, ids]) => {
    ids.forEach((id, i) => {
      positions[id] = {
        x: (W / (ids.length + 1)) * (i + 1),
        y: 60 + Number(lv) * rowH,
      };
    });
  });

  const maxY = Math.max(...Object.values(positions).map(p => p.y));
  const canvasH = Math.max(280, maxY + 80);

  // Build cytoscape nodes for the reduced graph
  const cyNodes = components.map((comp, ci) => ({
    data: {
      id: `c${ci}`,
      label: `C${ci + 1}`,
      members: '{' + comp.map(id => idToLabel[id]).join(',') + '}',
    },
    position: positions[`c${ci}`] || { x: 300, y: 200 },
  }));

  const cyEdges = reducedEdges.map(e => ({ data: e }));

  const stylesheet = [
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        width: nodeSize + 20,
        height: nodeSize,
        'text-valign': 'center',
        'text-halign': 'center',
        'font-family': 'JetBrains Mono, monospace',
        'font-size': '11px',
        'font-weight': '700',
        color: '#fff',
        label: 'data(label)',
        'text-wrap': 'none',
      }
    },
    ...components.map((_, ci) => ({
      selector: `node[id="c${ci}"]`,
      style: {
        'background-color': colors[ci % colors.length],
        'border-color': colors[ci % colors.length],
        'border-width': 2,
      }
    })),
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': darkMode ? '#94a3b8' : '#6b7280',
        'target-arrow-color': darkMode ? '#94a3b8' : '#6b7280',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
      }
    }
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <div style={{ background: bg, border: `1px solid ${borderC}`, borderRadius: "16px", width: "min(780px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>

        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: textMain, fontFamily: "Inter, sans-serif" }}>Graphe réduit</div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>Chaque CFC condensée en un sommet — résultat : DAG · {components.length} sommet(s)</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", padding: "6px 10px" }}>✕</button>
        </div>

        {/* Legend */}
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${borderC}`, display: "flex", flexWrap: "wrap", gap: "8px", flexShrink: 0 }}>
          {components.map((comp, ci) => (
            <div key={ci} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 10px", borderRadius: "9999px", background: `${colors[ci % colors.length]}18`, border: `1px solid ${colors[ci % colors.length]}40` }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: colors[ci % colors.length] }} />
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", fontWeight: "700", color: colors[ci % colors.length] }}>C{ci + 1}</span>
              <span style={{ fontSize: "11px", color: textMuted, fontFamily: "JetBrains Mono, monospace" }}>
                {"= {" + comp.map(id => idToLabel[id]).join(", ") + "}"}
              </span>
            </div>
          ))}
        </div>

        <div style={{ height: `${canvasH}px`, position: "relative", flexShrink: 0 }}>
          <CytoscapeComponent
            elements={[...cyNodes, ...cyEdges]}
            stylesheet={stylesheet}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            layout={{ name: "preset" }}
            userZoomingEnabled={true}
            userPanningEnabled={true}
            boxSelectionEnabled={false}
            autounselectify={true}
          />
        </div>

        {reducedEdges.length === 0 && (
          <div style={{ padding: "12px 20px", textAlign: "center", fontSize: "12px", color: textMuted, fontFamily: "Inter, sans-serif", fontStyle: "italic" }}>
            Aucun arc entre composantes — le graphe est fortement connexe.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mise en niveaux ──────────────────────────────────────────────────────────

function MiseEnNiveauxPanel({ elements, idToLabel, onClose, darkMode }) {
  const nodes = elements.filter(el => !el.data.source);
  const edges = elements.filter(el => !!el.data.source && el.data.source !== el.data.target);
  const ids = nodes.map(n => n.data.id);

  const bg = darkMode ? "#0d0605" : "#ffffff";
  const borderC = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.22)";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textMuted = darkMode ? "#6b7280" : "#9ca3af";
  const cardBg = darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  const mono = "JetBrains Mono, monospace";

  // Build predecessors dict
  const pred = {};
  ids.forEach(id => { pred[id] = []; });
  edges.forEach(e => {
    if (pred[e.data.target]) pred[e.data.target].push(e.data.source);
  });

  // Mise en niveaux algorithm (from course):
  // N0 = nodes with no predecessors
  // Nk = nodes with no predecessors in G minus N0..N(k-1)
  const levelOf = {};
  const levels = [];
  const placed = new Set();

  let k = 0;
  while (placed.size < ids.length) {
    const Nk = ids.filter(id => {
      if (placed.has(id)) return false;
      // All predecessors must already be placed
      return pred[id].every(p => placed.has(p));
    });

    if (Nk.length === 0) {
      // Circuit detected — remaining nodes can't be placed
      break;
    }

    levels.push({ k, nodes: Nk });
    Nk.forEach(id => { levelOf[id] = k; placed.add(id); });
    k++;
  }

  const hasCycle = placed.size < ids.length;
  const unplaced = ids.filter(id => !placed.has(id));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <div style={{ background: bg, border: `1px solid ${borderC}`, borderRadius: "16px", width: "min(820px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>

        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: textMain, fontFamily: "Inter, sans-serif" }}>Mise en niveaux</div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
              {hasCycle
                ? `Circuit détecté — ${levels.length} niveau(x) calculé(s), ${unplaced.length} sommet(s) dans des circuits`
                : `${levels.length} niveau(x) — graphe sans circuit`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", color: textMuted, cursor: "pointer", padding: "6px 10px" }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Level display */}
          {levels.map(({ k, nodes: Nk }) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              {/* Level label */}
              <div style={{ minWidth: "36px", textAlign: "right", fontFamily: mono, fontSize: "12px", fontWeight: "700", color: darkMode ? "#a78bfa" : "#7c3aed" }}>
                N{k}
              </div>
              <div style={{ width: "1px", alignSelf: "stretch", background: darkMode ? "rgba(167,139,250,0.3)" : "rgba(124,58,237,0.2)" }} />
              {/* Nodes */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {Nk.map(id => (
                  <div key={id} style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    background: k === 0
                      ? (darkMode ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.12)")
                      : cardBg,
                    border: `2px solid ${k === 0 ? "#10b981" : (darkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)")}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: mono, fontSize: "13px", fontWeight: "700",
                    color: k === 0 ? "#10b981" : textMain,
                  }}>
                    {idToLabel[id]}
                  </div>
                ))}
              </div>
              {/* Predecessor info */}
              <div style={{ marginLeft: "auto", fontSize: "11px", color: textMuted, fontFamily: mono, whiteSpace: "nowrap" }}>
                Γ⁻ ⊆ N0…N{k > 0 ? k - 1 : "∅"}
              </div>
            </div>
          ))}

          {/* Circuit warning */}
          {hasCycle && (
            <div style={{ marginTop: "8px", padding: "12px 16px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", color: "#ef4444", fontFamily: "Inter, sans-serif", marginBottom: "6px" }}>
                Circuit détecté
              </div>
              <div style={{ fontSize: "11px", color: textMuted, fontFamily: "Inter, sans-serif", marginBottom: "8px" }}>
                Les sommets suivants appartiennent à un circuit et ne peuvent pas être placés dans un niveau :
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {unplaced.map(id => (
                  <div key={id} style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: "12px", fontWeight: "700", color: "#ef4444" }}>
                    {idToLabel[id]}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dict of predecessors */}
          <div style={{ marginTop: "4px", background: cardBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
            <div style={{ fontSize: "10px", color: textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", fontFamily: "Inter, sans-serif" }}>
              Dictionnaire Γ⁻ (prédécesseurs)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "5px" }}>
              {ids.map(id => (
                <div key={id} style={{ display: "flex", alignItems: "baseline", gap: "6px", fontFamily: mono, fontSize: "12px" }}>
                  <span style={{ color: darkMode ? "#e05252" : "#b91c1c", fontWeight: "700", minWidth: "20px" }}>{idToLabel[id]}</span>
                  <span style={{ color: textMuted }}>:</span>
                  <span style={{ color: textMain }}>
                    {pred[id].length > 0
                      ? pred[id].map(p => idToLabel[p]).join(", ")
                      : <span style={{ color: textMuted, fontStyle: "italic" }}>∅</span>}
                  </span>
                  {levelOf[id] !== undefined && (
                    <span style={{ marginLeft: "auto", fontSize: "10px", color: darkMode ? "#a78bfa" : "#7c3aed", fontWeight: "600" }}>N{levelOf[id]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


function ClosurePanel({ elements, onClose }) {
 const { steps, uPlus } = computeTransitiveClosure(elements);
 const sup = (n) => { const map = { 1: "", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" }; return n in map ? map[n] : `^${n}`; };
 const fmt = (pairs) => "{" + pairs.map(([s, t]) => `(${s},${t})`).join(", ") + "}";
 return (
 <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
 <div style={{ background: "#0d0605", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px", width: "min(600px, 95vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
 <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
 <div>
 <div style={{ fontWeight: "600", fontSize: "15px", color: "#f3f4f6", fontFamily: "Inter, sans-serif" }}>Fermeture Transitive</div>
 <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>Composition successive des arcs</div>
 </div>
 <button onClick={onClose} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", color: "#6b7280", cursor: "pointer", padding: "6px 10px" }}>✕</button>
 </div>
 <div style={{ overflowY: "auto", padding: "18px 22px", fontFamily: "JetBrains Mono, monospace" }}>
 {steps.length === 0
 ? <div style={{ color: "#6b7280", fontSize: "13px", fontStyle: "italic" }}>Aucun arc dans ce graphe.</div>
 : <>
 <div style={{ display: "grid", gap: "10px", marginBottom: "20px" }}>
 {steps.map(({ power, pairs }) => (
 <div key={power} style={{ display: "flex", gap: "12px", alignItems: "flex-start", fontSize: "13px" }}>
 <span style={{ color: "#e05252", fontWeight: "600", minWidth: "32px" }}>U{sup(power)}</span>
 <span style={{ color: "#6b7280" }}>=</span>
 <span style={{ color: "#d1d5db", lineHeight: "1.6" }}>{fmt(pairs)}</span>
 </div>
 ))}
 </div>
 <div style={{ height: "1px", background: "rgba(255,255,255,0.05)", marginBottom: "16px" }} />
 <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", fontSize: "13px" }}>
 <span style={{ color: "#10b981", fontWeight: "700", minWidth: "32px" }}>U+</span>
 <span style={{ color: "#6b7280" }}>=</span>
 <div style={{ color: "#f3f4f6", lineHeight: "1.8", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "8px", padding: "10px 14px" }}>{fmt(uPlus)}</div>
 </div>
 </>
 }
 </div>
 </div>
 </div>
 );
}

function HelpModal({ onClose, darkMode, T }) {
  const sections = [
    {
      title: "Création et édition",
      items: [
        { key: "Ajouter un sommet", desc: "Clic gauche sur une zone vide du canvas." },
        { key: "Créer une arête / arc", desc: "Clic sur un sommet (source, bleu) puis un autre (cible)." },
        { key: "Créer une boucle", desc: "Clic deux fois sur le même sommet." },
        { key: "Renommer un sommet", desc: "Sélectionne un sommet (bleu) puis appuie sur R." },
        { key: "Modifier le poids", desc: "Clic gauche sur une arête (hors mode sélection)." },
        { key: "Supprimer", desc: "Clic droit sur un sommet ou une arête." },
        { key: "Annuler / Rétablir", desc: "Ctrl+Z / Ctrl+Y (ou Ctrl+Shift+Z)." },
      ]
    },
    {
      title: "Mode Sélection",
      items: [
        { key: "Activer", desc: "Bouton Sélection dans la barre d'outils." },
        { key: "Sélectionner", desc: "Clic sur sommets et arêtes (orange = sélectionné). Les sommets d'une arête sont auto-sélectionnés." },
        { key: "Désélectionner tout", desc: "Clic gauche sur le canvas ou re-clique sur l'élément." },
        { key: "Supprimer la sélection", desc: "Clic droit n'importe où." },
        { key: "Analyse temps réel", desc: "Le panneau affiche si le sous-graphe est un arbre, forêt, connexe… et la somme des poids (Σ)." },
      ]
    },
    {
      title: "Analyse de séquence",
      items: [
        { key: "Lancer", desc: "Outils > Analyser une séquence." },
        { key: "Construire", desc: "Alterne : sommet → arête → sommet → …" },
        { key: "Résultat", desc: "Chaîne/Chemin simple, élémentaire, Circuit/Cycle." },
      ]
    },
    {
      title: "Algorithmes (ACM)",
      items: [
        { key: "Prim", desc: "Outils > Prim : choisis un sommet de départ, navigue étape par étape." },
        { key: "Kruskal Visuel", desc: "Visualisation avec liste d'arêtes colorées sur le graphe." },
        { key: "Kruskal + Union-Find", desc: "Tableau complet avec colonnes r, s, p(x) et état des cases." },
        { key: "Couleurs", desc: "Vert = dans l'ACM · Rose = candidat · Rouge = rejeté · Orange = en cours." },
      ]
    },
    {
      title: "Templates et navigation",
      items: [
        { key: "Templates", desc: "Bouton Templates : charge un graphe prêt" },
        { key: "Undo / Redo", desc: "Boutons ↩ ↪ dans la barre ou Ctrl+Z / Ctrl+Y." },
        { key: "Réinitialiser", desc: "Bouton Réinitialiser : efface tout." },
        { key: "Thème", desc: "Bouton en haut à droite pour basculer sombre / clair." },
      ]
    },
  ];

  const modalBg = darkMode ? "#0d0605" : "#ffffff";
  const headerBg = darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";

  return (
    <div style={{ 
      position: "fixed", 
      inset: 0, 
      background: "rgba(0,0,0,0.55)", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      zIndex: 99999,
      backdropFilter: "blur(10px)", 
      WebkitBackdropFilter: "blur(10px)",
      transition: "all 0.3s ease"
    }}>
      <div style={{ 
        background: darkMode ? "#0d0605" : "#ffffff", 
        border: `1px solid ${T.border}`, 
        borderRadius: "24px", // Un peu plus arrondi pour le style
        width: "min(850px, 90vw)", 
        maxHeight: "80vh", 
        display: "flex", 
        flexDirection: "column", 
        boxShadow: "0 30px 60px rgba(0,0,0,0.4)", // Ombre portée plus profonde
        overflow: "hidden"
      }}>
        {/* Header de la modale */}
        <div style={{ 
          padding: "25px 35px", 
          borderBottom: `1px solid ${T.border}`, 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          background: darkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"
        }}>
          <h2 style={{ margin: 0, fontSize: "22px", color: T.text, fontWeight: "700" }}>Guide d'utilisation</h2>
          <button 
            onClick={onClose} 
            style={{ 
              background: "#1a1a1b", 
              border: "none", 
              borderRadius: "8px", 
              color: "#fff", 
              cursor: "pointer", 
              padding: "10px 20px", 
              fontSize: "13px",
              fontWeight: "600"
            }}
          >
            Fermer
          </button>
        </div>

        {/* Corps de la modale */}
        <div style={{ 
          overflowY: "auto", 
          padding: "35px", 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", 
          gap: "30px" 
        }}>
          {sections.map((s) => (
            <div key={s.title}>
              <h3 style={{ 
                fontSize: "12px", 
                color: darkMode ? "#ef4444" : "#8b4513", // Rouge en sombre, Brun en clair
                textTransform: "uppercase", 
                letterSpacing: "0.15em", 
                marginBottom: "18px",
                fontWeight: "800" 
              }}>
                {s.title}
              </h3>
              {s.items.map(item => (
                <div key={item.key} style={{ marginBottom: "15px" }}>
                  <div style={{ color: T.text, fontSize: "14px", fontWeight: "700", marginBottom: "3px" }}>{item.key}</div>
                  <div style={{ color: T.textMuted, fontSize: "12px", lineHeight: "1.5" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};



const TEMPLATES = [
  // ── SIMPLES ─────────────────────────────────────────────────────────────────
  {
    id: "triangle",
    name: "Triangle",
    description: "3 sommets formant un cycle simple",
    category: "Simple",
    directed: false,
    nodes: [
      { id: "A", label: "A", x: 280, y: 80 },
      { id: "B", label: "B", x: 140, y: 320 },
      { id: "C", label: "C", x: 420, y: 320 },
    ],
    edges: [
      { s: "A", t: "B" }, { s: "B", t: "C" }, { s: "C", t: "A" },
    ],
  },
  {
    id: "chemin",
    name: "Chaîne",
    description: "5 sommets en ligne, graphe chemin P5",
    category: "Simple",
    directed: false,
    nodes: [
      { id: "A", label: "A", x: 80,  y: 220 },
      { id: "B", label: "B", x: 220, y: 220 },
      { id: "C", label: "C", x: 360, y: 220 },
      { id: "D", label: "D", x: 500, y: 220 },
      { id: "E", label: "E", x: 640, y: 220 },
    ],
    edges: [
      { s: "A", t: "B" }, { s: "B", t: "C" }, { s: "C", t: "D" }, { s: "D", t: "E" },
    ],
  },

  {
    id: "arbre_binaire",
    name: "Arbre binaire",
    description: "Arbre binaire complet à 3 niveaux, 7 nœuds",
    category: "Simple",
    directed: false,
    nodes: [
      { id: "A", label: "A", x: 360, y: 60  },
      { id: "B", label: "B", x: 180, y: 200 },
      { id: "C", label: "C", x: 540, y: 200 },
      { id: "D", label: "D", x: 90,  y: 360 },
      { id: "E", label: "E", x: 270, y: 360 },
      { id: "F", label: "F", x: 450, y: 360 },
      { id: "G", label: "G", x: 630, y: 360 },
    ],
    edges: [
      { s: "A", t: "B" }, { s: "A", t: "C" },
      { s: "B", t: "D" }, { s: "B", t: "E" },
      { s: "C", t: "F" }, { s: "C", t: "G" },
    ],
  },
  // ── ORIENTÉS ────────────────────────────────────────────────────────────────
  {
    id: "dag_simple",
    name: "DAG simple",
    description: "Graphe orienté acyclique, 5 sommets",
    category: "Orienté",
    directed: true,
    nodes: [
      { id: "A", label: "A", x: 100, y: 240 },
      { id: "B", label: "B", x: 280, y: 120 },
      { id: "C", label: "C", x: 280, y: 360 },
      { id: "D", label: "D", x: 460, y: 240 },
      { id: "E", label: "E", x: 640, y: 240 },
    ],
    edges: [
      { s: "A", t: "B" }, { s: "A", t: "C" },
      { s: "B", t: "D" }, { s: "C", t: "D" },
      { s: "D", t: "E" },
    ],
  },
  {
    id: "cfc_cours",
    name: "Graphe CFC",
    description: "Graphe orienté avec plusieurs composantes fortement connexes",
    category: "Orienté",
    directed: true,
    nodes: [
      { id: "a", label: "a", x: 120, y: 80  },
      { id: "b", label: "b", x: 320, y: 80  },
      { id: "c", label: "c", x: 520, y: 80  },
      { id: "d", label: "d", x: 120, y: 240 },
      { id: "e", label: "e", x: 320, y: 240 },
      { id: "f", label: "f", x: 520, y: 240 },
      { id: "g", label: "g", x: 120, y: 400 },
      { id: "h", label: "h", x: 320, y: 400 },
      { id: "i", label: "i", x: 520, y: 400 },
      { id: "j", label: "j", x: 720, y: 240 },
    ],
    edges: [
      { s: "a", t: "g" }, { s: "a", t: "j" },
      { s: "b", t: "c" },
      { s: "c", t: "b" }, { s: "c", t: "g" },
      { s: "d", t: "a" }, { s: "d", t: "g" },
      { s: "e", t: "b" }, { s: "e", t: "i" }, { s: "e", t: "j" },
      { s: "f", t: "d" }, { s: "f", t: "h" },
      { s: "j", t: "b" }, { s: "j", t: "d" }, { s: "j", t: "g" },
    ],
  },
  {
    id: "dag_compilation",
    name: "DAG dépendances",
    description: "Graphe de dépendances orienté, 8 tâches",
    category: "Orienté",
    directed: true,
    nodes: [
      { id: "A", label: "A", x: 80,  y: 240 },
      { id: "B", label: "B", x: 240, y: 100 },
      { id: "C", label: "C", x: 240, y: 380 },
      { id: "D", label: "D", x: 400, y: 180 },
      { id: "E", label: "E", x: 400, y: 320 },
      { id: "F", label: "F", x: 560, y: 100 },
      { id: "G", label: "G", x: 560, y: 260 },
      { id: "H", label: "H", x: 700, y: 180 },
    ],
    edges: [
      { s: "A", t: "B" }, { s: "A", t: "C" },
      { s: "B", t: "D" }, { s: "C", t: "E" },
      { s: "D", t: "F" }, { s: "D", t: "G" },
      { s: "E", t: "G" }, { s: "F", t: "H" },
      { s: "G", t: "H" },
    ],
  },
  // ── PONDÉRÉS ACM ────────────────────────────────────────────────────────────
  {
    id: "kruskal_cours",
    name: "ACM — Kruskal",
    description: "7 sommets A-G, classique pour Kruskal/Prim",
    category: "Pondéré",
    directed: false,
    nodes: [
      { id: "A", label: "A", x: 120, y: 80  },
      { id: "B", label: "B", x: 310, y: 80  },
      { id: "C", label: "C", x: 500, y: 80  },
      { id: "D", label: "D", x: 120, y: 280 },
      { id: "E", label: "E", x: 460, y: 280 },
      { id: "F", label: "F", x: 280, y: 400 },
      { id: "G", label: "G", x: 520, y: 400 },
    ],
    edges: [
      { s: "A", t: "B", w: 7 }, { s: "A", t: "D", w: 5 },
      { s: "B", t: "C", w: 8 }, { s: "B", t: "D", w: 9 }, { s: "B", t: "E", w: 7 },
      { s: "C", t: "E", w: 5 }, { s: "D", t: "E", w: 15 }, { s: "D", t: "F", w: 6 },
      { s: "E", t: "F", w: 8 }, { s: "E", t: "G", w: 9 }, { s: "F", t: "G", w: 11 },
    ],
  },
  {
    id: "prim_cours",
    name: "ACM — Prim",
    description: "10 sommets, idéal pour l'algorithme de Prim",
    category: "Pondéré",
    directed: false,
    nodes: [
      { id: "1",  label: "1",  x: 95,  y: 325 },
      { id: "2",  label: "2",  x: 210, y: 165 },
      { id: "3",  label: "3",  x: 190, y: 325 },
      { id: "4",  label: "4",  x: 320, y: 520 },
      { id: "5",  label: "5",  x: 270, y: 245 },
      { id: "6",  label: "6",  x: 435, y: 65  },
      { id: "7",  label: "7",  x: 480, y: 355 },
      { id: "8",  label: "8",  x: 585, y: 150 },
      { id: "9",  label: "9",  x: 605, y: 45  },
      { id: "10", label: "10", x: 720, y: 175 },
    ],
    edges: [
      { s: "8",  t: "9",  w: 1  }, { s: "3",  t: "5",  w: 2  }, { s: "5",  t: "2",  w: 2  },
      { s: "3",  t: "1",  w: 3  }, { s: "10", t: "8",  w: 3  }, { s: "2",  t: "3",  w: 4  },
      { s: "6",  t: "9",  w: 4  }, { s: "9",  t: "10", w: 4  }, { s: "6",  t: "8",  w: 5  },
      { s: "1",  t: "2",  w: 6  }, { s: "6",  t: "7",  w: 7  }, { s: "5",  t: "7",  w: 8  },
      { s: "4",  t: "7",  w: 8  }, { s: "1",  t: "4",  w: 9  }, { s: "4",  t: "3",  w: 9  },
      { s: "7",  t: "3",  w: 9  }, { s: "2",  t: "6",  w: 9  }, { s: "8",  t: "7",  w: 9  },
      { s: "6",  t: "5",  w: 9  }, { s: "10", t: "4",  w: 18 },
    ],
  },
  {
    id: "petersen_pondere",
    name: "Graphe de Petersen",
    description: "Graphe de Petersen pondéré, 10 sommets, 15 arêtes",
    category: "Pondéré",
    directed: false,
    nodes: [
      { id: "0", label: "0", x: 360, y: 40  },
      { id: "1", label: "1", x: 588, y: 207 },
      { id: "2", label: "2", x: 501, y: 474 },
      { id: "3", label: "3", x: 219, y: 474 },
      { id: "4", label: "4", x: 132, y: 207 },
      { id: "5", label: "5", x: 360, y: 160 },
      { id: "6", label: "6", x: 464, y: 271 },
      { id: "7", label: "7", x: 420, y: 400 },
      { id: "8", label: "8", x: 300, y: 400 },
      { id: "9", label: "9", x: 256, y: 271 },
    ],
    edges: [
      { s: "0", t: "1", w: 4 }, { s: "1", t: "2", w: 6 }, { s: "2", t: "3", w: 3 },
      { s: "3", t: "4", w: 5 }, { s: "4", t: "0", w: 7 },
      { s: "5", t: "7", w: 2 }, { s: "7", t: "9", w: 8 }, { s: "9", t: "6", w: 4 },
      { s: "6", t: "8", w: 5 }, { s: "8", t: "5", w: 3 },
      { s: "0", t: "5", w: 9 }, { s: "1", t: "6", w: 6 }, { s: "2", t: "7", w: 4 },
      { s: "3", t: "8", w: 7 }, { s: "4", t: "9", w: 5 },
    ],
  },
  // ── COMPLEXES ───────────────────────────────────────────────────────────────
  {
    id: "reseau_routier",
    name: "Réseau routier",
    description: "15 villes reliées, distances en km",
    category: "Complexe",
    directed: false,
    nodes: [
      { id: "V1",  label: "V1",  x: 100, y: 100 }, { id: "V2",  label: "V2",  x: 280, y: 60  },
      { id: "V3",  label: "V3",  x: 460, y: 100 }, { id: "V4",  label: "V4",  x: 620, y: 80  },
      { id: "V5",  label: "V5",  x: 160, y: 260 }, { id: "V6",  label: "V6",  x: 340, y: 220 },
      { id: "V7",  label: "V7",  x: 520, y: 240 }, { id: "V8",  label: "V8",  x: 700, y: 220 },
      { id: "V9",  label: "V9",  x: 100, y: 420 }, { id: "V10", label: "V10", x: 260, y: 380 },
      { id: "V11", label: "V11", x: 440, y: 400 }, { id: "V12", label: "V12", x: 620, y: 380 },
      { id: "V13", label: "V13", x: 180, y: 540 }, { id: "V14", label: "V14", x: 380, y: 540 },
      { id: "V15", label: "V15", x: 560, y: 520 },
    ],
    edges: [
      { s: "V1",  t: "V2",  w: 12 }, { s: "V2",  t: "V3",  w: 18 }, { s: "V3",  t: "V4",  w: 9  },
      { s: "V1",  t: "V5",  w: 15 }, { s: "V2",  t: "V6",  w: 10 }, { s: "V3",  t: "V7",  w: 14 },
      { s: "V4",  t: "V8",  w: 11 }, { s: "V5",  t: "V6",  w: 8  }, { s: "V6",  t: "V7",  w: 13 },
      { s: "V7",  t: "V8",  w: 16 }, { s: "V5",  t: "V9",  w: 20 }, { s: "V6",  t: "V10", w: 7  },
      { s: "V7",  t: "V11", w: 12 }, { s: "V8",  t: "V12", w: 9  }, { s: "V9",  t: "V10", w: 14 },
      { s: "V10", t: "V11", w: 11 }, { s: "V11", t: "V12", w: 17 }, { s: "V9",  t: "V13", w: 8  },
      { s: "V10", t: "V13", w: 15 }, { s: "V11", t: "V14", w: 10 }, { s: "V12", t: "V15", w: 13 },
      { s: "V13", t: "V14", w: 18 }, { s: "V14", t: "V15", w: 12 }, { s: "V3",  t: "V6",  w: 22 },
      { s: "V7",  t: "V12", w: 19 },
    ],
  },
  {
    id: "graphe_social",
    name: "Réseau social",
    description: "12 personnes, relations non-orientées sans poids",
    category: "Complexe",
    directed: false,
    nodes: [
      { id: "P1",  label: "P1",  x: 360, y: 60  }, { id: "P2",  label: "P2",  x: 560, y: 140 },
      { id: "P3",  label: "P3",  x: 640, y: 320 }, { id: "P4",  label: "P4",  x: 520, y: 500 },
      { id: "P5",  label: "P5",  x: 300, y: 560 }, { id: "P6",  label: "P6",  x: 120, y: 460 },
      { id: "P7",  label: "P7",  x: 80,  y: 260 }, { id: "P8",  label: "P8",  x: 180, y: 100 },
      { id: "P9",  label: "P9",  x: 360, y: 240 }, { id: "P10", label: "P10", x: 500, y: 320 },
      { id: "P11", label: "P11", x: 240, y: 360 }, { id: "P12", label: "P12", x: 360, y: 440 },
    ],
    edges: [
      { s: "P1", t: "P2" }, { s: "P1", t: "P8" }, { s: "P1", t: "P9" },
      { s: "P2", t: "P3" }, { s: "P2", t: "P10" },
      { s: "P3", t: "P4" }, { s: "P3", t: "P10" },
      { s: "P4", t: "P5" }, { s: "P4", t: "P12" },
      { s: "P5", t: "P6" }, { s: "P5", t: "P11" }, { s: "P5", t: "P12" },
      { s: "P6", t: "P7" }, { s: "P6", t: "P11" },
      { s: "P7", t: "P8" }, { s: "P7", t: "P11" },
      { s: "P8", t: "P9" },
      { s: "P9", t: "P10" }, { s: "P9", t: "P11" },
      { s: "P10", t: "P12" }, { s: "P11", t: "P12" },
    ],
  },
  {
    id: "digraphe_fort_connexe",
    name: "Digraphe fortement connexe",
    description: "8 sommets orientés, fortement connexe",
    category: "Complexe",
    directed: true,
    nodes: [
      { id: "A", label: "A", x: 360, y: 60  },
      { id: "B", label: "B", x: 580, y: 160 },
      { id: "C", label: "C", x: 640, y: 360 },
      { id: "D", label: "D", x: 460, y: 520 },
      { id: "E", label: "E", x: 220, y: 520 },
      { id: "F", label: "F", x: 80,  y: 360 },
      { id: "G", label: "G", x: 140, y: 160 },
      { id: "H", label: "H", x: 360, y: 300 },
    ],
    edges: [
      { s: "A", t: "B" }, { s: "B", t: "C" }, { s: "C", t: "D" },
      { s: "D", t: "E" }, { s: "E", t: "F" }, { s: "F", t: "G" },
      { s: "G", t: "A" }, { s: "A", t: "H" }, { s: "H", t: "D" },
      { s: "B", t: "H" }, { s: "H", t: "F" }, { s: "C", t: "H" },
      { s: "E", t: "H" }, { s: "G", t: "H" },
    ],
  },
  {
    id: "grille_4x4",
    name: "Grille 4×4",
    description: "16 sommets en grille, pondéré, idéal pour les chemins",
    category: "Complexe",
    directed: false,
    nodes: [
      { id: "11", label: "11", x: 100, y: 100 }, { id: "12", label: "12", x: 260, y: 100 },
      { id: "13", label: "13", x: 420, y: 100 }, { id: "14", label: "14", x: 580, y: 100 },
      { id: "21", label: "21", x: 100, y: 260 }, { id: "22", label: "22", x: 260, y: 260 },
      { id: "23", label: "23", x: 420, y: 260 }, { id: "24", label: "24", x: 580, y: 260 },
      { id: "31", label: "31", x: 100, y: 420 }, { id: "32", label: "32", x: 260, y: 420 },
      { id: "33", label: "33", x: 420, y: 420 }, { id: "34", label: "34", x: 580, y: 420 },
      { id: "41", label: "41", x: 100, y: 580 }, { id: "42", label: "42", x: 260, y: 580 },
      { id: "43", label: "43", x: 420, y: 580 }, { id: "44", label: "44", x: 580, y: 580 },
    ],
    edges: [
      { s: "11", t: "12", w: 3 }, { s: "12", t: "13", w: 7 }, { s: "13", t: "14", w: 2 },
      { s: "21", t: "22", w: 5 }, { s: "22", t: "23", w: 4 }, { s: "23", t: "24", w: 6 },
      { s: "31", t: "32", w: 8 }, { s: "32", t: "33", w: 3 }, { s: "33", t: "34", w: 9 },
      { s: "41", t: "42", w: 4 }, { s: "42", t: "43", w: 5 }, { s: "43", t: "44", w: 7 },
      { s: "11", t: "21", w: 6 }, { s: "12", t: "22", w: 2 }, { s: "13", t: "23", w: 8 }, { s: "14", t: "24", w: 4 },
      { s: "21", t: "31", w: 3 }, { s: "22", t: "32", w: 9 }, { s: "23", t: "33", w: 5 }, { s: "24", t: "34", w: 7 },
      { s: "31", t: "41", w: 6 }, { s: "32", t: "42", w: 4 }, { s: "33", t: "43", w: 2 }, { s: "34", t: "44", w: 8 },
    ],
  },
  {
    id: "multigraphe",
    name: "Multigraphe",
    description: "6 sommets avec arêtes parallèles et boucles",
    category: "Spécial",
    directed: false,
    nodes: [
      { id: "A", label: "A", x: 180, y: 120 },
      { id: "B", label: "B", x: 420, y: 120 },
      { id: "C", label: "C", x: 560, y: 320 },
      { id: "D", label: "D", x: 400, y: 500 },
      { id: "E", label: "E", x: 160, y: 500 },
      { id: "F", label: "F", x: 60,  y: 300 },
    ],
    edges: [
      { s: "A", t: "B" }, { s: "A", t: "B" },
      { s: "B", t: "C" }, { s: "C", t: "D" }, { s: "C", t: "D" },
      { s: "D", t: "E" }, { s: "E", t: "F" }, { s: "F", t: "A" },
      { s: "A", t: "A" }, { s: "C", t: "C" },
    ],
  },
  {
    id: "foret",
    name: "Forêt",
    description: "3 arbres disjoints formant une forêt",
    category: "Spécial",
    directed: false,
    nodes: [
      { id: "A", label: "A", x: 120, y: 80  }, { id: "B", label: "B", x: 60,  y: 220 },
      { id: "C", label: "C", x: 180, y: 220 }, { id: "D", label: "D", x: 60,  y: 360 },
      { id: "E", label: "E", x: 360, y: 80  }, { id: "F", label: "F", x: 300, y: 240 },
      { id: "G", label: "G", x: 420, y: 240 }, { id: "H", label: "H", x: 360, y: 400 },
      { id: "I", label: "I", x: 580, y: 140 }, { id: "J", label: "J", x: 520, y: 300 },
      { id: "K", label: "K", x: 640, y: 300 },
    ],
    edges: [
      { s: "A", t: "B" }, { s: "A", t: "C" }, { s: "B", t: "D" },
      { s: "E", t: "F" }, { s: "E", t: "G" }, { s: "G", t: "H" },
      { s: "I", t: "J" }, { s: "I", t: "K" },
    ],
  },
];

function TemplatesPanel({ onClose, onLoad, darkMode }) {
  const [hovered, setHovered] = useState(null);
  const [activeCategory, setActiveCategory] = useState("Tous");

  const bg = darkMode ? "#0d0605" : "#ffffff";
  const border = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.14)";
  const text = darkMode ? "#f3f4f6" : "#111827";
  const muted = darkMode ? "#6b7280" : "#9ca3af";
  const cardBg = darkMode ? "rgba(255,255,255,0.03)" : "#f9fafb";
  const cardBorder = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  const cardHover = darkMode ? "rgba(255,255,255,0.07)" : "#f0f4ff";
  const tabBg = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const tabActiveBg = darkMode ? "rgba(139,0,0,0.18)" : "rgba(59,130,246,0.1)";
  const tabActiveColor = darkMode ? "#e05252" : "#1d4ed8";

  const categories = ["Tous", "Simple", "Orienté", "Pondéré", "Complexe", "Spécial"];
  const filtered = activeCategory === "Tous" ? TEMPLATES : TEMPLATES.filter(t => t.category === activeCategory);

  const categoryColor = (cat) => {
    const map = {
      Simple: ["rgba(16,185,129,0.12)", "#10b981", "rgba(16,185,129,0.25)"],
      Orienté: ["rgba(139,92,246,0.12)", "#a78bfa", "rgba(139,92,246,0.25)"],
      Pondéré: ["rgba(245,158,11,0.12)", "#f59e0b", "rgba(245,158,11,0.25)"],
      Complexe: ["rgba(239,68,68,0.12)", "#f87171", "rgba(239,68,68,0.25)"],
      Spécial: ["rgba(59,130,246,0.12)", "#60a5fa", "rgba(59,130,246,0.25)"],
    };
    return map[cat] || ["rgba(107,114,128,0.12)", "#9ca3af", "rgba(107,114,128,0.25)"];
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: "16px", width: "min(860px, 96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "15px", color: text, fontFamily: "Inter, sans-serif" }}>Templates de graphes</div>
            <div style={{ fontSize: "12px", color: muted, marginTop: "2px" }}>{TEMPLATES.length} graphes disponibles</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: "8px", color: muted, cursor: "pointer", padding: "6px 10px", fontSize: "14px" }}>✕</button>
        </div>

        {/* Category tabs */}
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${border}`, display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: "5px 14px", borderRadius: "9999px", fontSize: "12px", fontWeight: "500",
              cursor: "pointer", fontFamily: "Inter, sans-serif", border: "none",
              background: activeCategory === cat ? tabActiveBg : tabBg,
              color: activeCategory === cat ? tabActiveColor : muted,
              transition: "all 0.15s ease",
            }}>
              {cat}
              {cat !== "Tous" && <span style={{ marginLeft: "5px", fontSize: "10px", opacity: 0.7 }}>
                {TEMPLATES.filter(t => t.category === cat).length}
              </span>}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div style={{ overflowY: "auto", padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
          {filtered.map((t) => {
            const [catBg, catColor, catBorder] = categoryColor(t.category);
            return (
              <div
                key={t.id}
                onMouseEnter={() => setHovered(t.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => { onLoad(t); onClose(); }}
                style={{
                  background: hovered === t.id ? cardHover : cardBg,
                  border: `1px solid ${hovered === t.id ? (darkMode ? "rgba(224,82,82,0.35)" : "rgba(59,130,246,0.3)") : cardBorder}`,
                  borderRadius: "12px", padding: "14px 16px", cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: hovered === t.id ? (darkMode ? "0 4px 16px rgba(139,0,0,0.15)" : "0 4px 16px rgba(59,130,246,0.1)") : "none",
                }}
              >
                {/* Top row: name + directed badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px", gap: "8px" }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: text, fontFamily: "Inter, sans-serif", lineHeight: "1.3" }}>{t.name}</div>
                  <span style={{ fontSize: "9px", fontWeight: "600", padding: "2px 7px", borderRadius: "9999px", flexShrink: 0, background: t.directed ? "rgba(139,92,246,0.12)" : "rgba(16,185,129,0.1)", color: t.directed ? "#a78bfa" : "#10b981", border: `1px solid ${t.directed ? "rgba(139,92,246,0.2)" : "rgba(16,185,129,0.2)"}` }}>
                    {t.directed ? "Orienté" : "Non-orienté"}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: muted, marginBottom: "10px", lineHeight: "1.4" }}>{t.description}</div>
                {/* Bottom row: stats + category */}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: muted, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", padding: "2px 7px", borderRadius: "5px" }}>
                    {t.nodes.length} sommets
                  </span>
                  <span style={{ fontSize: "10px", color: muted, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", padding: "2px 7px", borderRadius: "5px" }}>
                    {t.edges.length} arêtes
                  </span>
                  {t.edges.some((e) => e.w) && (
                    <span style={{ fontSize: "10px", color: "#f59e0b", background: "rgba(245,158,11,0.08)", padding: "2px 7px", borderRadius: "5px", border: "1px solid rgba(245,158,11,0.15)" }}>
                      pondéré
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: "9px", fontWeight: "600", padding: "2px 7px", borderRadius: "5px", background: catBg, color: catColor, border: `1px solid ${catBorder}` }}>
                    {t.category}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DictImportModal({ onClose, onLoad, darkMode }) {
  const [mode, setMode] = useState("successors"); // "successors" | "predecessors"
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [directed, setDirected] = useState(true);

  const bg = darkMode ? "#0d0605" : "#ffffff";
  const border = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.22)";
  const textColor = darkMode ? "#f3f4f6" : "#111827";
  const muted = darkMode ? "#6b7280" : "#9ca3af";
  const inputBg = darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBorder = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)";

  // Dynamic hint depending on mode
  const rowHint = mode === "successors"
    ? { label: "A", neighbors: "B(5), C(3)", meaning: "A → B (poids 5), A → C (poids 3)" }
    : { label: "A", neighbors: "B(5), C(3)", meaning: "B → A (poids 5), C → A (poids 3)" };

  const placeholder = mode === "successors"
    ? "A: B(7), C(5)\nB: D(9), E(7)\nC: E(5)\nD:"
    : "A:\nB: A(7)\nC: A(5)\nD: B(9), C(5)";

  const parse = () => {
    setError("");
    const lines = text.trim().split("\n").filter(l => l.trim());
    if (lines.length === 0) { setError("Aucune donnée à parser."); return; }

    // Parse each neighbor token: "B", "B(5)", "B:5", "B 5"
    const parseNeighbor = (token) => {
      token = token.trim();
      if (!token) return null;
      // B(5) or B(5.2)
      const parenMatch = token.match(/^([^(]+)\(([^)]+)\)$/);
      if (parenMatch) return { id: parenMatch[1].trim(), w: Number(parenMatch[2]) };
      // B:5
      const colonMatch = token.match(/^([^:]+):(.+)$/);
      if (colonMatch) return { id: colonMatch[1].trim(), w: Number(colonMatch[2]) };
      // plain label (no weight)
      return { id: token, w: null };
    };

    const dict = {}; // { node: [{ id, w }] }
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) { setError(`Ligne invalide : "${line.trim()}"`); return; }
      const node = line.slice(0, colonIdx).trim();
      if (!node) { setError("Sommet manquant avant ':'"); return; }
      const rest = line.slice(colonIdx + 1).trim();
      if (rest === "" || rest === "∅" || rest === "{}") {
        dict[node] = [];
      } else {
        // Split on commas (but not inside parens)
        const tokens = rest.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean);
        const parsed = tokens.map(parseNeighbor).filter(Boolean);
        dict[node] = parsed;
      }
    }

    const nodeSet = new Set(Object.keys(dict));
    Object.values(dict).forEach(nbrs => nbrs.forEach(n => nodeSet.add(n.id)));
    const nodeList = [...nodeSet];

    const edgeSet = new Set();
    const edgeList = [];

    if (mode === "successors") {
      Object.entries(dict).forEach(([src, targets]) => {
        targets.forEach(({ id: tgt, w }) => {
          const key = `${src}->${tgt}`;
          if (!edgeSet.has(key)) { edgeSet.add(key); edgeList.push({ s: src, t: tgt, w }); }
        });
      });
    } else {
      Object.entries(dict).forEach(([tgt, sources]) => {
        sources.forEach(({ id: src, w }) => {
          const key = `${src}->${tgt}`;
          if (!edgeSet.has(key)) { edgeSet.add(key); edgeList.push({ s: src, t: tgt, w }); }
        });
      });
    }

    const n = nodeList.length;
    const cx = 400, cy = 300, r = Math.min(260, 60 * n / (2 * Math.PI) + 80);
    const nodes = nodeList.map((lbl, i) => ({
      id: lbl, label: lbl,
      x: cx + r * Math.cos((2 * Math.PI * i / n) - Math.PI / 2),
      y: cy + r * Math.sin((2 * Math.PI * i / n) - Math.PI / 2),
    }));

    onLoad({ nodes, edges: edgeList, directed });
    onClose();
  };

  const accentColor = darkMode ? "#e05252" : "#1d4ed8";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: "16px", width: "min(540px, 95vw)", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "15px", color: textColor, fontFamily: "Inter, sans-serif" }}>Création depuis un dictionnaire</div>
            <div style={{ fontSize: "12px", color: muted, marginTop: "2px" }}>Créer un graphe à partir de Γ⁺ ou Γ⁻</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: "8px", color: muted, cursor: "pointer", padding: "6px 10px" }}>✕</button>
        </div>

        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Mode + Directed toggles */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              {[["successors", "Γ⁺ Successeurs"], ["predecessors", "Γ⁻ Prédécesseurs"]].map(([val, label]) => (
                <button key={val} onClick={() => { setMode(val); setError(""); }} style={{
                  padding: "6px 14px", borderRadius: "9999px", fontSize: "12px", fontWeight: "500",
                  cursor: "pointer", fontFamily: "Inter, sans-serif", border: "none",
                  background: mode === val ? (darkMode ? "rgba(224,82,82,0.18)" : "rgba(29,78,216,0.1)") : inputBg,
                  color: mode === val ? accentColor : muted,
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: muted, fontFamily: "Inter, sans-serif" }}>Orienté</span>
              <div onClick={() => setDirected(d => !d)} style={{
                width: "36px", height: "20px", borderRadius: "9999px", cursor: "pointer",
                background: directed ? "#3b82f6" : (darkMode ? "#374151" : "#d1d5db"),
                position: "relative", transition: "background 0.2s",
              }}>
                <div style={{ position: "absolute", top: "3px", left: directed ? "18px" : "3px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </div>
            </div>
          </div>

          {/* Dynamic explanation of what each line means */}
          <div style={{ background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: "8px", padding: "10px 14px", fontSize: "12px", fontFamily: "Inter, sans-serif", lineHeight: "1.7", color: muted }}>
            <div style={{ marginBottom: "4px" }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: accentColor }}>sommet</span>
              {" : "}
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: darkMode ? "#10b981" : "#059669" }}>voisin1</span>
              {", "}
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: darkMode ? "#10b981" : "#059669" }}>voisin2(poids)</span>
              {" · Une ligne par sommet · Vide = ∅"}
            </div>
            <div style={{ color: darkMode ? "#94a3b8" : "#4b5563", fontStyle: "italic", marginBottom: "6px" }}>
              {mode === "successors"
                ? "Chaque ligne : sommet → ses enfants (successeurs sortants)"
                : "Chaque ligne : sommet → ses parents (prédécesseurs entrants)"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>
              <div>
                <span style={{ color: accentColor }}>Ex : {rowHint.label}: {rowHint.neighbors}</span>
                <span style={{ color: muted, marginLeft: "8px" }}>→ {rowHint.meaning}</span>
              </div>
              <div style={{ color: darkMode ? "#475569" : "#9ca3af" }}>
                Poids : <span style={{ color: darkMode ? "#f59e0b" : "#b45309" }}>B(5)</span>
                {" ou "}
                <span style={{ color: darkMode ? "#f59e0b" : "#b45309" }}>B:5</span>
                {" · Sans poids = arête non pondérée"}
              </div>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(""); }}
            placeholder={placeholder}
            rows={8}
            style={{
              width: "100%", boxSizing: "border-box",
              background: inputBg, border: `1px solid ${error ? "#ef4444" : inputBorder}`,
              borderRadius: "10px", padding: "12px 14px",
              color: textColor, fontFamily: "JetBrains Mono, monospace", fontSize: "13px",
              lineHeight: "1.7", resize: "vertical", outline: "none",
            }}
          />

          {error && <div style={{ color: "#ef4444", fontSize: "12px", fontFamily: "Inter, sans-serif" }}>⚠ {error}</div>}

          {/* Buttons */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", background: "transparent", border: `1px solid ${border}`, color: muted, cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "13px" }}>
              Annuler
            </button>
            <button onClick={parse} style={{ padding: "9px 20px", borderRadius: "8px", background: darkMode ? "#8b0000" : "#1d4ed8", border: "none", color: "#fff", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "13px", fontWeight: "600" }}>
              Créer le graphe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ label, onClick, disabled, color, darkMode }) {
  const [hov, setHov] = useState(false);
  const baseColor = color || (darkMode ? "#f3f4f6" : "#111827");
  const hoverBg = darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "8px 12px", borderRadius: "8px",
        fontSize: "13px", fontFamily: "Inter, sans-serif",
        cursor: disabled ? "not-allowed" : "pointer",
        border: "none",
        background: hov && !disabled ? hoverBg : "transparent",
        color: disabled ? (darkMode ? "#4b5563" : "#9ca3af") : baseColor,
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.12s ease",
      }}
    >
      {label}
    </button>
  );
}

export default function GraphVisualizer() {
 const cyRef = useRef(null);
 const [elements, setElements] = useState([]);
 const elementsRef = useRef([]);
 const [history, setHistory] = useState([[]]);
 const [historyIdx, setHistoryIdx] = useState(0);
 const historyRef = useRef({ stack: [[]], idx: 0 });
 const [directed, setDirected] = useState(false);
 const [pendingSource, setPendingSource] = useState(null);
 const [selectedEdge, setSelectedEdge] = useState(null);
 const [showWeightModal, setShowWeightModal] = useState(false);
 const [selectedNode, setSelectedNode] = useState(null);
 const [showRenameModal, setShowRenameModal] = useState(false);
 const [showDefs, setShowDefs] = useState(false);
 const [showAbout, setShowAbout] = useState(false);
 const [showTemplates, setShowTemplates] = useState(false);
 const [showClosure, setShowClosure] = useState(false);
 const [showPrim, setShowPrim] = useState(false);
 const [primError, setPrimError] = useState(false);
 const [primStartNode, setPrimStartNode] = useState(null);
 const [primPickMode, setPrimPickMode] = useState(false);
 const [primStep, setPrimStep] = useState(null);
 const [showKruskal, setShowKruskal] = useState(false);
 const [kruskalStep, setKruskalStep] = useState(null);
 const [showKruskalUF, setShowKruskalUF] = useState(false);
 const [kruskalUFStep, setKruskalUFStep] = useState(null);
 const primPickRef = useRef(false);
 const [showRepr, setShowRepr] = useState(false);
 const [menuOpen, setMenuOpen] = useState(false);
 const [showHelp, setShowHelp] = useState(false);
 const [darkMode, setDarkMode] = useState(true);
 const [analyzeMode, setAnalyzeMode] = useState(false);
 const [sequence, setSequence] = useState([]);
 const [globalAnalysis, setGlobalAnalysis] = useState([]);
 const [seqAnalysis, setSeqAnalysis] = useState([]);
 // BFS
 const [showBFS, setShowBFS] = useState(false);
 const [bfsStartNode, setBfsStartNode] = useState(null);
 const [bfsPickMode, setBfsPickMode] = useState(false);
 const bfsPickRef = useRef(false);
 const [bfsStep, setBfsStep] = useState(null);
 // DFS
 const [showDFS, setShowDFS] = useState(false);
 const [dfsStartNode, setDfsStartNode] = useState(null);
 const [dfsPickMode, setDfsPickMode] = useState(false);
 const dfsPickRef = useRef(false);
 const [dfsStep, setDfsStep] = useState(null);
 const [showDictModal, setShowDictModal] = useState(false);
 const [panelHidden, setPanelHidden] = useState(false);
 const [showSidebar, setShowSidebar] = useState(true);
 const [showGrapheReduit, setShowGrapheReduit] = useState(false);
 const [showMiseEnNiveaux, setShowMiseEnNiveaux] = useState(false);
 const [showDijkstra, setShowDijkstra] = useState(false);
 const [dijkstraStartNode, setDijkstraStartNode] = useState(null);
 const [dijkstraPickMode, setDijkstraPickMode] = useState(false);
 const dijkstraPickRef = useRef(false);
 const [dijkstraStep, setDijkstraStep] = useState(null);
 const [showFord, setShowFord] = useState(false);
 const [fordStartNode, setFordStartNode] = useState(null);
 const [fordPickMode, setFordPickMode] = useState(false);
 const fordPickRef = useRef(false);
 const [fordStep, setFordStep] = useState(null);
 // BFS/DFS result modals (rendered at root level to avoid overflow clipping)
 const [bfsTreeData, setBfsTreeData] = useState(null);   // { pi, idToLabel, startId }
 const [dfsForestData, setDfsForestData] = useState(null); // { treeEdges, dates, elements, idToLabel }
 const [showSCCModal, setShowSCCModal] = useState(false);
 const [showTopoModal, setShowTopoModal] = useState(false);
 const [dfsTopoData, setDfsTopoData] = useState(null); // { elements, idToLabel, dates }
 const dfsElementsRef = useRef(null);

 const pendingSourceRef = useRef(null);
 const analyzeModeRef = useRef(false);
 const sequenceRef = useRef([]);
 const selectModeRef = useRef(false);
 const [selectMode, setSelectMode] = useState(false);
 const [selectionAnalysis, setSelectionAnalysis] = useState(null);

 useEffect(() => { pendingSourceRef.current = pendingSource; }, [pendingSource]);
 useEffect(() => { analyzeModeRef.current = analyzeMode; }, [analyzeMode]);
 useEffect(() => { selectModeRef.current = selectMode; }, [selectMode]);
 useEffect(() => { primPickRef.current = primPickMode; }, [primPickMode]);
 useEffect(() => { bfsPickRef.current = bfsPickMode; }, [bfsPickMode]);
 useEffect(() => { dfsPickRef.current = dfsPickMode; }, [dfsPickMode]);
 useEffect(() => { dijkstraPickRef.current = dijkstraPickMode; }, [dijkstraPickMode]);
 useEffect(() => { fordPickRef.current = fordPickMode; }, [fordPickMode]);
 useEffect(() => { sequenceRef.current = sequence; }, [sequence]);
 useEffect(() => { setGlobalAnalysis(analyzeGraph(elements, directed)); elementsRef.current = elements; }, [elements, directed]);
 useEffect(() => {
   if (showKruskal) closeKruskal();
   if (showKruskalUF) closeKruskalUF();
   if (showPrim) {
     setShowPrim(false);
     setPrimStep(null);
     if (cyRef.current) {
       cyRef.current.elements().removeClass("prim-visited prim-start prim-tree prim-candidate");
     }
   }
   if (showBFS) closeBFS();
   if (showDFS) closeDFS();
   if (showDijkstra) closeDijkstra();
   if (showFord) closeFord();
   // Clear result modals when graph changes
   setBfsTreeData(null);
   setDfsForestData(null);
   setShowSCCModal(false);
   setShowTopoModal(false);
   setDfsTopoData(null);
 }, [elements]);

 const loadTemplate = (template) => {
   nodeCounter = 0;
   const idMap = {};
   template.nodes.forEach((n) => { idMap[n.label] = n.id; });
   const newNodes = template.nodes.map((n) => ({
     data: { id: n.id, label: n.label },
     position: { x: n.x, y: n.y },
   }));
   const newEdges = template.edges.map((e, i) => {
     const id = `e_${e.s}_${e.t}_${i}`;
     return {
       data: { id, source: e.s, target: e.t, weight: e.w ?? null, weightLabel: e.w != null ? String(e.w) : "" },
     };
   });
   const allEls = [...newNodes, ...newEdges];
   // Reset all interaction state before loading to prevent stale refs causing crashes
   setPendingSource(null);
   pendingSourceRef.current = null;
   if (cyRef.current) {
     cyRef.current.elements().removeClass("highlighted multi-selected seq-highlighted prim-visited prim-start prim-tree prim-candidate kruskal-acm kruskal-current kruskal-rejected kruskal-connected");
   }
   setSelectMode(false);
   selectModeRef.current = false;
   setSelectionAnalysis(null);
   setAnalyzeMode(false);
   analyzeModeRef.current = false;
   setSequence([]);
   sequenceRef.current = [];
   setSeqAnalysis([]);
   setDirected(template.directed);
   setElem(() => allEls);
   // Update nodeCounter to max numeric id
   const numericIds = template.nodes.map((n) => parseInt(n.id.replace(/[^0-9]/g, ""), 10)).filter((n) => !isNaN(n));
   nodeCounter = numericIds.length > 0 ? Math.max(...numericIds) : template.nodes.length;
 };

 const loadFromDict = ({ nodes, edges, directed: dir }) => {
   nodeCounter = 0;
   const newNodes = nodes.map((n) => ({
     data: { id: n.id, label: n.label },
     position: { x: Math.round(n.x), y: Math.round(n.y) },
   }));
   const newEdges = edges.map((e, i) => {
     const w = (e.w !== null && e.w !== undefined && !isNaN(e.w)) ? e.w : null;
     return {
       data: { id: `e_${e.s}_${e.t}_${i}`, source: e.s, target: e.t, weight: w, weightLabel: w !== null ? String(w) : "" },
     };
   });
   setPendingSource(null); pendingSourceRef.current = null;
   if (cyRef.current) cyRef.current.elements().removeClass("highlighted multi-selected seq-highlighted prim-visited prim-start prim-tree prim-candidate kruskal-acm kruskal-current kruskal-rejected kruskal-connected");
   setSelectMode(false); selectModeRef.current = false; setSelectionAnalysis(null);
   setAnalyzeMode(false); analyzeModeRef.current = false;
   setSequence([]); sequenceRef.current = []; setSeqAnalysis([]);
   setDirected(dir);
   setElem(() => [...newNodes, ...newEdges]);
 };

 const pushHistory = (newEls) => {
   const { stack, idx } = historyRef.current;
   const newStack = [...stack.slice(0, idx + 1), newEls].slice(-50);
   const newIdx = newStack.length - 1;
   historyRef.current = { stack: newStack, idx: newIdx };
   setHistory(newStack);
   setHistoryIdx(newIdx);
 };

 const setElem = (updater) => {
   let pushed = false;
   setElements((prev) => {
     const next = typeof updater === "function" ? updater(prev) : updater;
     if (!pushed) {
       pushed = true;
       pushHistory(next);
     }
     return next;
   });
 };

 const undo = () => {
   const { stack, idx } = historyRef.current;
   if (idx <= 0) return;
   const newIdx = idx - 1;
   historyRef.current = { ...historyRef.current, idx: newIdx };
   setHistoryIdx(newIdx);
   setElements(stack[newIdx]);
 };

 const redo = () => {
   const { stack, idx } = historyRef.current;
   if (idx >= stack.length - 1) return;
   const newIdx = idx + 1;
   historyRef.current = { ...historyRef.current, idx: newIdx };
   setHistoryIdx(newIdx);
   setElements(stack[newIdx]);
 };

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
   const onKey = (e) => {
     if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
     if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
     if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
     if (e.key === "r" && !e.ctrlKey && !e.metaKey && pendingSource) {
       e.preventDefault();
       const cy = cyRef.current;
       if (!cy) return;
       const node = cy.getElementById(pendingSource);
       if (node && node.length > 0) { setSelectedNode(node); setShowRenameModal(true); }
     }
   };
   window.addEventListener("keydown", onKey);
   return () => window.removeEventListener("keydown", onKey);
 }, [pendingSource]);

 useEffect(() => {
 const trySetup = setInterval(() => {
 const cy = cyRef.current; if (!cy) return; clearInterval(trySetup);

 cy.on("tap", (e) => {
 if (e.target !== cy) return;
 // Si en mode sélection, clic canvas = désélectionner tout
 if (selectModeRef.current) {
   cy.nodes(".multi-selected").removeClass("multi-selected");
   cy.edges(".multi-selected").removeClass("multi-selected");
   setSelectionAnalysis(null);
   return;
 }
 const { x, y } = e.position; const id = newNodeId();
 setElem((prev) => [...prev, { data: { id, label: id }, position: { x, y } }]);
 });

 const safeFilter = (prev, fn) => Array.isArray(prev) ? prev.filter(el => el && el.data ? fn(el) : false) : [];

 cy.on("cxttap", (e) => {
   if (e.target !== cy) return;
   try {
     const ms = cy.nodes(".multi-selected");
     if (ms && ms.length > 0) {
       const ids = ms.map(n => n.id()).filter(Boolean);
       cy.nodes(".multi-selected").removeClass("multi-selected");
       cy.edges(".multi-selected").removeClass("multi-selected");
       cy.nodes(".highlighted").removeClass("highlighted");
       setPendingSource(null);
       setElem(prev => safeFilter(prev, el => el.data.source ? !ids.includes(el.data.source) && !ids.includes(el.data.target) : !ids.includes(el.data.id)));
     } else {
       cy.nodes(".highlighted").removeClass("highlighted");
       cy.nodes(".seq-highlighted").removeClass("seq-highlighted");
       cy.edges(".seq-highlighted").removeClass("seq-highlighted");
       setPendingSource(null);
       if (analyzeModeRef.current) { setSequence([]); setSeqAnalysis([]); }
     }
   } catch(err) { console.error("cxttap canvas:", err); }
 });

 cy.on("cxttap", "node", (e) => {
   try {
     const nodeId = e.target.id();
     const ms = cy.nodes(".multi-selected");
     cy.nodes(".highlighted").removeClass("highlighted");
     setPendingSource(null);
     if (ms && ms.length > 0) {
       const ids = ms.map(n => n.id()).filter(Boolean);
       cy.nodes(".multi-selected").removeClass("multi-selected");
       setElem(prev => safeFilter(prev, el => el.data.source ? !ids.includes(el.data.source) && !ids.includes(el.data.target) : !ids.includes(el.data.id)));
     } else {
       setElem(prev => safeFilter(prev, el => el.data.id !== nodeId && el.data.source !== nodeId && el.data.target !== nodeId));
     }
   } catch(err) { console.error("cxttap node:", err); }
 });

 cy.on("cxttap", "edge", (e) => {
   try {
     const edgeId = e.target.id();
     const msEdges = cy.edges(".multi-selected");
     const msNodes = cy.nodes(".multi-selected");
     if (msEdges.length > 0 || msNodes.length > 0) {
       // Supprimer tout le groupe sélectionné
       const edgeIds = new Set(msEdges.map((ed) => ed.id()));
       const nodeIds = new Set(msNodes.map((n) => n.id()));
       // Inclure l'arête cliquée si elle n'est pas déjà dans la sélection
       if (e.target.hasClass("multi-selected")) {
         edgeIds.add(edgeId);
       }
       cy.edges(".multi-selected").removeClass("multi-selected");
       cy.nodes(".multi-selected").removeClass("multi-selected");
       setSelectionAnalysis(null);
       setElem(prev => safeFilter(prev, el => {
         if (!el.data.source) return !nodeIds.has(el.data.id);
         return !edgeIds.has(el.data.id) && !nodeIds.has(el.data.source) && !nodeIds.has(el.data.target);
       }));
     } else {
       setElem(prev => safeFilter(prev, el => el.data.id !== edgeId));
     }
   } catch(err) { console.error("cxttap edge:", err); }
 });

 // Handler unifié tap node
 cy.on("tap", "node", (e) => {
   const nodeId = e.target.id();

   // MODE ANALYSE
   if (analyzeModeRef.current) {
     const seq = sequenceRef.current;
     if (seq.length % 2 !== 0) return;
     e.target.addClass("seq-highlighted");
     setSequence([...seq, nodeId]);
     return;
   }

   // MODE DIJKSTRA : choisir le sommet de départ
   if (dijkstraPickRef.current) {
     setDijkstraStartNode(nodeId);
     setDijkstraPickMode(false);
     dijkstraPickRef.current = false;
     setShowDijkstra(true);
     return;
   }

   // MODE FORD : choisir le sommet de départ
   if (fordPickRef.current) {
     setFordStartNode(nodeId);
     setFordPickMode(false);
     fordPickRef.current = false;
     setShowFord(true);
     return;
   }

   // MODE PRIM : choisir le sommet de départ
   if (primPickRef.current) {
     setPrimStartNode(nodeId);
     setPrimPickMode(false);
     primPickRef.current = false;
     setShowPrim(true);
     return;
   }

   // MODE BFS : choisir le sommet de départ
   if (bfsPickRef.current) {
     setBfsStartNode(nodeId);
     setBfsPickMode(false);
     bfsPickRef.current = false;
     setShowBFS(true);
     return;
   }

   // MODE DFS : choisir le sommet de départ
   if (dfsPickRef.current) {
     setDfsStartNode(nodeId);
     setDfsPickMode(false);
     dfsPickRef.current = false;
     setShowDFS(true);
     return;
   }

   if (primPickRef.current) {
     primPickRef.current = false;
     setPrimPickMode(false);
     const hasEdges = elementsRef.current.some((el) => !!el.data.source);
     if (!hasEdges) { setPrimError(true); setTimeout(() => setPrimError(false), 3000); return; }
     setPrimStartNode(nodeId);
     setShowPrim(true);
     return;
   }

   // MODE SELECTION : sélection multiple uniquement, aucune arête
   if (selectModeRef.current) {
     cy.nodes(".highlighted").removeClass("highlighted");
     setPendingSource(null);
     if (e.target.hasClass("multi-selected")) {
       e.target.removeClass("multi-selected");
     } else {
       e.target.addClass("multi-selected");
     }
     // Analyse du sous-graphe sélectionné (noeuds + aretes explicitement sélectionnées)
     const selNodes = cy.nodes(".multi-selected");
     const selEdges = cy.edges(".multi-selected");
     const selNodeIds = new Set(selNodes.map((n) => n.id()));
     const selEdgeIds = new Set(selEdges.map((ed) => ed.id()));
     if (selNodeIds.size >= 2) {
       const subElements = elementsRef.current.filter((el) => {
         if (!el.data.source) return selNodeIds.has(el.data.id);
         return selEdgeIds.has(el.data.id);
       });
       setSelectionAnalysis(analyzeGraph(subElements, directed));
     } else {
       setSelectionAnalysis(null);
     }
     return;
   }

   // Clic normal : désélectionner le groupe
   cy.nodes(":selected").unselect();

   const src = pendingSourceRef.current;
   if (!src) {
     setPendingSource(nodeId);
     cy.getElementById(nodeId).addClass("highlighted");
   } else if (src === nodeId) {
     const edgeId = newEdgeId(src, nodeId);
     setElem((prev) => [...prev, { data: { id: edgeId, source: src, target: nodeId, weight: null, weightLabel: "" } }]);
     cy.getElementById(src).removeClass("highlighted");
     setPendingSource(null);
   } else {
     const edgeId = newEdgeId(src, nodeId);
     setElem((prev) => [...prev, { data: { id: edgeId, source: src, target: nodeId, weight: null, weightLabel: "" } }]);
     cy.getElementById(src).removeClass("highlighted");
     setPendingSource(nodeId);
     cy.getElementById(nodeId).addClass("highlighted");
   }
 });


 // Group drag: when selectMode, move all multi-selected nodes together
 let dragStartPos = null;
 cy.on("tapstart", "node", (e) => {
   if (!selectModeRef.current) return;
   if (!e.target.hasClass("multi-selected")) return;
   dragStartPos = { ...e.target.position() };
 });
 cy.on("tapdragover", "node", (e) => {
   if (!selectModeRef.current) return;
   if (!e.target.hasClass("multi-selected")) return;
   if (!dragStartPos) return;
   const cur = e.target.position();
   const dx = cur.x - dragStartPos.x;
   const dy = cur.y - dragStartPos.y;
   if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
   cy.nodes(".multi-selected").forEach((n) => {
     if (n.id() !== e.target.id()) {
       n.position({ x: n.position().x + dx, y: n.position().y + dy });
     }
   });
   dragStartPos = { ...cur };
 });
 cy.on("tapend", "node", () => {
   dragStartPos = null;
 });

 cy.on("tap", "edge", (e) => {
 if (analyzeModeRef.current) {
   const edgeId = e.target.id(); const seq = sequenceRef.current;
   if (seq.length === 0 || seq.length % 2 === 0) return;
   const lastNode = seq[seq.length - 1]; const edge = e.target;
   if (edge.data("source") !== lastNode && edge.data("target") !== lastNode) return;
   e.target.addClass("seq-highlighted"); setSequence([...seq, edgeId]); return;
 }
 if (selectModeRef.current) {
   if (e.target.hasClass("multi-selected")) {
     e.target.removeClass("multi-selected");
   } else {
     e.target.addClass("multi-selected");
     // Auto-sélectionner les deux sommets de l'arête
     const srcId = e.target.data("source");
     const tgtId = e.target.data("target");
     cy.getElementById(srcId).addClass("multi-selected");
     cy.getElementById(tgtId).addClass("multi-selected");
   }
   // Recalculate subgraph analysis
   const selNodes = cy.nodes(".multi-selected");
   const selEdges = cy.edges(".multi-selected");
   const selNodeIds = new Set(selNodes.map((n) => n.id()));
   const selEdgeIds = new Set(selEdges.map((ed) => ed.id()));
   if (selNodeIds.size >= 2) {
     const subElements = elementsRef.current.filter((el) => {
       if (!el.data.source) return selNodeIds.has(el.data.id);
       return selEdgeIds.has(el.data.id);
     });
     setSelectionAnalysis(analyzeGraph(subElements, directed));
   } else {
     setSelectionAnalysis(null);
   }
   return;
 }
 if (!selectModeRef.current) { setSelectedEdge(e.target); setShowWeightModal(true); }
 });

 }, 100);
 return () => clearInterval(trySetup);
 }, []);

 useEffect(() => {
  try {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("prim-visited prim-start prim-tree prim-candidate prim-ignored");
    if (!showPrim || !primStep) return;
    if (!Array.isArray(primStep.inTree) || !Array.isArray(primStep.treeEdges) || !Array.isArray(primStep.candidates)) return;
    primStep.inTree.forEach((id) => {
      try {
        const node = cy.getElementById(String(id));
        if (node && node.length > 0) {
          if (String(id) === String(primStartNode)) node.addClass("prim-start");
          else node.addClass("prim-visited");
        }
      } catch(e) {}
    });
    primStep.treeEdges.forEach((id) => { try { const el = cy.getElementById(id); if (el && el.length > 0) el.addClass("prim-tree"); } catch(e) {} });
    primStep.candidates.forEach((id) => { try { const el = cy.getElementById(id); if (el && el.length > 0) el.addClass("prim-candidate"); } catch(e) {} });
  } catch(err) { console.error("Prim cy effect:", err); }
}, [primStep, showPrim, primStartNode]);

  useEffect(() => {
    try {
      const cy = cyRef.current;
      if (!cy) return;
      cy.edges().removeClass("kruskal-acm kruskal-current kruskal-rejected");
      cy.nodes().removeClass("kruskal-connected");
      if (!showKruskal || !kruskalStep) return;
      if (!Array.isArray(kruskalStep.acmEdges)) return;
      kruskalStep.acmEdges.forEach((id) => { try { const el = cy.getElementById(id); if (el.length) el.addClass("kruskal-acm"); } catch(e) {} });
      if (kruskalStep.currentEdge) { try { const el = cy.getElementById(kruskalStep.currentEdge); if (el.length) el.addClass("kruskal-current"); } catch(e) {} }
      if (Array.isArray(kruskalStep.rejectedEdges)) {
        kruskalStep.rejectedEdges.forEach((id) => { try { const el = cy.getElementById(id); if (el.length) el.addClass("kruskal-rejected"); } catch(e) {} });
      }
      // Color nodes that are part of ACM components
      const connectedNodes = new Set();
      kruskalStep.acmEdges.forEach((eid) => {
        const edge = frozenElements_kruskal_ref.current?.find((el) => el.data.id === eid);
        if (edge) { connectedNodes.add(edge.data.source); connectedNodes.add(edge.data.target); }
      });
      connectedNodes.forEach((nid) => { try { const el = cy.getElementById(nid); if (el.length) el.addClass("kruskal-connected"); } catch(e) {} });
    } catch(err) { console.error("Kruskal cy:", err); }
  }, [kruskalStep, showKruskal]);

  useEffect(() => {
    try {
      const cy = cyRef.current;
      if (!cy) return;
      if (!showKruskalUF) return;
      cy.edges().removeClass("kruskal-acm kruskal-current kruskal-rejected");
      cy.nodes().removeClass("kruskal-connected");
      if (!kruskalUFStep || !Array.isArray(kruskalUFStep.acmEdges)) return;
      kruskalUFStep.acmEdges.forEach((id) => { try { const el = cy.getElementById(id); if (el.length) el.addClass("kruskal-acm"); } catch(e) {} });
      if (kruskalUFStep.currentEdge) { try { const el = cy.getElementById(kruskalUFStep.currentEdge); if (el.length) el.addClass("kruskal-current"); } catch(e) {} }
      if (Array.isArray(kruskalUFStep.rejectedEdges)) kruskalUFStep.rejectedEdges.forEach((id) => { try { const el = cy.getElementById(id); if (el.length) el.addClass("kruskal-rejected"); } catch(e) {} });
      const connected = new Set();
      kruskalUFStep.acmEdges.forEach((eid) => {
        const edge = elements.find((el) => el.data.id === eid);
        if (edge) { connected.add(edge.data.source); connected.add(edge.data.target); }
      });
      connected.forEach((nid) => { try { const el = cy.getElementById(nid); if (el.length) el.addClass("kruskal-connected"); } catch(e) {} });
    } catch(err) {}
  }, [kruskalUFStep, showKruskalUF]);

  useEffect(() => {
    try {
      const cy = cyRef.current;
      if (!cy || !showDijkstra || !dijkstraStep || !dijkstraStep.cy) return;

      cy.nodes().removeClass("dijkstra-selected dijkstra-source dijkstra-pending dijkstra-path");
      cy.edges().removeClass("dijkstra-tree dijkstra-highlight dijkstra-path");

      const { cyNodes, cyEdges } = dijkstraStep.cy;
      const classMap = {
        source: "dijkstra-source",
        selected: "dijkstra-selected",
        pending: "dijkstra-pending",
        path: "dijkstra-path",
      };
      const edgeClassMap = {
        tree: "dijkstra-tree",
        highlight: "dijkstra-highlight",
        path: "dijkstra-path",
      };

      Object.entries(cyNodes || {}).forEach(([id, cls]) => {
        if (!cls) return;
        try { const el = cy.getElementById(id); if (el.length) el.addClass(classMap[cls]); } catch(e) {}
      });

      Object.entries(cyEdges || {}).forEach(([eid, cls]) => {
        if (!cls) return;
        try { const el = cy.getElementById(eid); if (el.length) el.addClass(edgeClassMap[cls]); } catch(e) {}
      });

    } catch(err) { console.error("Dijkstra cy:", err); }
  }, [dijkstraStep, showDijkstra]);

  useEffect(() => {
    try {
      const cy = cyRef.current;
      if (!cy || !showFord || !fordStep) return;
      cy.nodes().removeClass("ford-updated ford-source");
      try { const src = cy.getElementById(fordStartNode); if (src.length) src.addClass("ford-source"); } catch(e) {}
      if (fordStep.rows && fordStep.rows.length > 1) {
        const cur = fordStep.rows[fordStep.rows.length - 1];
        const prev = fordStep.rows[fordStep.rows.length - 2];
        if (cur && prev) {
          Object.keys(cur.lambda).forEach(id => {
            if (cur.lambda[id] !== prev.lambda[id]) {
              try { const el = cy.getElementById(id); if (el.length) el.addClass("ford-updated"); } catch(e) {}
            }
          });
        }
      }
    } catch(err) {}
  }, [fordStep, showFord]);


  const frozenElements_kruskal_ref = useRef(null);

  const closeKruskal = () => {
    if (cyRef.current) {
      cyRef.current.edges().removeClass("kruskal-acm kruskal-current kruskal-rejected");
      cyRef.current.nodes().removeClass("kruskal-connected");
    }
    setShowKruskal(false); setPanelHidden(false);
    setKruskalStep(null);
    frozenElements_kruskal_ref.current = null;
  };

  const closeKruskalUF = () => {
    if (cyRef.current) {
      cyRef.current.edges().removeClass("kruskal-acm kruskal-current kruskal-rejected");
      cyRef.current.nodes().removeClass("kruskal-connected");
    }
    setShowKruskalUF(false); setPanelHidden(false);
    setKruskalUFStep(null);
  };

  const closeDijkstra = () => {
    if (cyRef.current) {
      cyRef.current.nodes().removeClass("dijkstra-selected dijkstra-source dijkstra-pending dijkstra-path");
      cyRef.current.edges().removeClass("dijkstra-tree dijkstra-path");
    }
    setShowDijkstra(false); setPanelHidden(false); setDijkstraStep(null); setDijkstraStartNode(null);
    setDijkstraPickMode(false); dijkstraPickRef.current = false;
  };

  const closeFord = () => {
    if (cyRef.current) {
      cyRef.current.nodes().removeClass("ford-updated ford-source");
    }
    setShowFord(false); setPanelHidden(false); setFordStep(null); setFordStartNode(null);
    setFordPickMode(false); fordPickRef.current = false;
  };

  const closePrim = () => {
    if (cyRef.current) {
      cyRef.current.nodes().removeClass("prim-visited prim-start");
      cyRef.current.edges().removeClass("prim-tree prim-candidate");
    }
    setShowPrim(false); setPanelHidden(false); setPrimStep(null); setPrimStartNode(null);
    setPrimPickMode(false); primPickRef.current = false;
  };

  const closeBFS = () => {
    if (cyRef.current) {
      cyRef.current.nodes().removeClass("bfs-queue bfs-visited bfs-start");
      cyRef.current.edges().removeClass("bfs-tree");
    }
    setShowBFS(false); setPanelHidden(false); setBfsStep(null); setBfsStartNode(null);
    setBfsPickMode(false); bfsPickRef.current = false;
    setBfsTreeData(null);
  };

  const closeDFS = () => {
    if (cyRef.current) {
      cyRef.current.nodes().removeClass("dfs-stack dfs-visited dfs-done");
      cyRef.current.edges().removeClass("dfs-tree");
    }
    setShowDFS(false); setPanelHidden(false); setDfsStep(null); setDfsStartNode(null);
    setDfsPickMode(false); dfsPickRef.current = false;
    setDfsForestData(null); setShowSCCModal(false); setShowTopoModal(false); setDfsTopoData(null);
  };

  useEffect(() => {
    try {
      const cy = cyRef.current;
      if (!cy) return;
      cy.nodes().removeClass("bfs-queue bfs-visited bfs-start");
      cy.edges().removeClass("bfs-tree");
      if (!showBFS || !bfsStep) return;
      bfsStep.visited.forEach((id) => { try { const el = cy.getElementById(String(id)); if (el.length) el.addClass(id === bfsStep.justVisited ? "bfs-start" : "bfs-visited"); } catch(e) {} });
      bfsStep.queue.forEach((id) => { try { const el = cy.getElementById(String(id)); if (el.length && !el.hasClass("bfs-visited") && !el.hasClass("bfs-start")) el.addClass("bfs-queue"); } catch(e) {} });
      bfsStep.treeEdges.forEach((id) => { try { const el = cy.getElementById(id); if (el.length) el.addClass("bfs-tree"); } catch(e) {} });
    } catch(err) {}
  }, [bfsStep, showBFS]);

  useEffect(() => {
    try {
      const cy = cyRef.current;
      if (!cy) return;
      cy.nodes().removeClass("dfs-stack dfs-visited dfs-done");
      cy.edges().removeClass("dfs-tree");
      if (!showDFS || !dfsStep) return;
      const stackSet = new Set(dfsStep.stack);
      const visitedSet = new Set(dfsStep.visited);
      dfsStep.visited.forEach((id) => {
        try {
          const el = cy.getElementById(String(id));
          if (!el.length) return;
          const d = dfsStep.dates[id];
          if (d && d.post !== null) el.addClass("dfs-done");
          else if (stackSet.has(id)) el.addClass("dfs-stack");
          else el.addClass("dfs-visited");
        } catch(e) {}
      });
      dfsStep.stack.forEach((id) => {
        try { const el = cy.getElementById(String(id)); if (el.length && !el.hasClass("dfs-done") && !el.hasClass("dfs-visited")) el.addClass("dfs-stack"); } catch(e) {}
      });
      dfsStep.treeEdges.forEach((id) => { try { const el = cy.getElementById(id); if (el.length) el.addClass("dfs-tree"); } catch(e) {} });
    } catch(err) {}
  }, [dfsStep, showDFS]);

  const toggleAnalyzeMode = () => {
 const next = !analyzeModeRef.current;
 analyzeModeRef.current = next; // mise a jour immediate de la ref
 if (cyRef.current) {
 cyRef.current.nodes(".highlighted").removeClass("highlighted");
 cyRef.current.nodes(".seq-highlighted").removeClass("seq-highlighted");
 cyRef.current.edges(".seq-highlighted").removeClass("seq-highlighted");
 }
 setPendingSource(null);
 setSequence([]);
 setSeqAnalysis([]);
 setAnalyzeMode(next);
 };

 const clearSequence = () => {
 if (cyRef.current) { cyRef.current.nodes(".seq-highlighted").removeClass("seq-highlighted"); cyRef.current.edges(".seq-highlighted").removeClass("seq-highlighted"); }
 setSequence([]); setSeqAnalysis([]);
 };

 const resetGraph = () => {
    // RÉINITIALISATION DU COMPTEUR (Indispensable pour repartir à 1)
    nodeCounter = 0;
    historyRef.current = { stack: [[]], idx: 0 };
    setHistory([[]]);
    setHistoryIdx(0);

    // Nettoyage visuel de Cytoscape
    if (cyRef.current) {
      cyRef.current.elements().removeClass("highlighted prim-visited prim-start prim-tree prim-candidate multi-selected seq-highlighted");
    }

    // Remise à zéro des états React
    setElements([]);
    setShowPrim(false);
    setPrimStep(null);
    setPrimStartNode(null);
    setPrimPickMode(false);
    primPickRef.current = false;
    setPendingSource(null);
    setSelectMode(false);
    selectModeRef.current = false;
    setSequence([]);
    setSeqAnalysis([]);
    setAnalyzeMode(false);
    analyzeModeRef.current = false;
    setBfsPickMode(false); bfsPickRef.current = false;
    setShowBFS(false); setBfsStep(null); setBfsStartNode(null);
    setDfsPickMode(false); dfsPickRef.current = false;
    setShowDFS(false); setDfsStep(null); setDfsStartNode(null);
    setDijkstraPickMode(false); dijkstraPickRef.current = false;
    setShowDijkstra(false); setDijkstraStep(null); setDijkstraStartNode(null);
    setFordPickMode(false); fordPickRef.current = false;
    setShowFord(false); setFordStep(null); setFordStartNode(null);
  };

 const handleRenameConfirm = (val) => {
 const trimmed = val.trim(); if (!trimmed) { setShowRenameModal(false); return; }
 const nodeId = selectedNode?.id();
 setElem((prev) => prev.map((el) => el.data.id === nodeId ? { ...el, data: { ...el.data, label: trimmed } } : el));
 setShowRenameModal(false); setSelectedNode(null);
 };

 const runSeqAnalysis = () => setSeqAnalysis(analyzeSequence(sequence, elements, directed));

 const handleWeightConfirm = (val) => {
 const numVal = val === "" ? null : Number(val); const edgeId = selectedEdge?.id();
 setElem((prev) => prev.map((el) => el.data.id === edgeId ? { ...el, data: { ...el.data, weight: numVal, weightLabel: numVal !== null ? String(numVal) : "" } } : el));
 setShowWeightModal(false); setSelectedEdge(null);
 };

 const stats = computeStats(elements, directed);
const edgeWord = directed ? "arc" : "arête";

const hintText = dijkstraPickMode
    ? "Cliquer sur un sommet pour choisir la source de Dijkstra"
    : fordPickMode
    ? "Cliquer sur un sommet pour choisir la source de Bellman-Ford"
    : primPickMode
  ? "PRIM · Cliquer sur un sommet pour démarrer l'algorithme"
  : bfsPickMode
    ? "BFS · Cliquer sur un sommet de départ pour lancer le parcours en largeur"
    : dfsPickMode
      ? "DFS · Cliquer sur un sommet de départ pour lancer le parcours en profondeur"
      : analyzeMode
        ? sequence.length === 0
          ? "ANALYSE · Cliquer sur un sommet pour commencer la séquence"
          : sequence.length % 2 === 1
            ? `ANALYSE · Cliquer sur l'${directed ? "arc suivant" : "arête suivante"} pour continuer`
            : `ANALYSE · Cliquer sur le sommet suivant pour continuer · ${sequence.length} éléments`
        : selectMode
          ? "SÉLECTION · Cliquer sur les sommets et les arêtes pour les sélectionner · Clic droit = supprimer la sélection · Clic sur le canvas = tout désélectionner"
          : pendingSource
            ? `Sommet : ${elements.find(e => e.data.id === pendingSource)?.data.label ?? pendingSource} · Cliquer sur un sommet pour créer ${directed ? "un arc" : "une arête"} · Cliquer sur ${directed ? "un arc" : "une arête"} pour changer son poids  · R = renommer sommet · Clic droit sur sommet ou sur ${directed ? "arc" : "arête"} = supprimer · Clic droit sur canvas = annuler `
            : "Cliquer sur le canvas = créer un sommet · Cliquer sur un sommet = sélectionner · Clic droit = supprimer · Clic vide + Glisser = Déplacer · Molette = Zoomer";
 const T = darkMode ? {
    // --- MODE SOMBRE ---
    appBg: "#0d0605", 
    sidebarBg: "#050202", // Plus foncé que le fond
    toolbarBg: "#050202", // Plus foncé que le fond
    canvasBg: "#0d0605",
    border: "rgba(255,255,255,0.06)", 
    borderFaint: "rgba(255,255,255,0.03)",
    text: "#f3f4f6", 
    textMuted: "#6b7280", 
    textFaint: "#4b5563",
    statCard: "rgba(255,255,255,0.02)", 
    statCardBorder: "rgba(255,255,255,0.05)",
    badge: "rgba(255,255,255,0.07)", 
    badgeBorder: "rgba(255,255,255,0.1)", 
    badgeText: "#e5e7eb",
    dot: "rgba(255,255,255,0.04)", 
    emptyColor: "rgba(255,255,255,0.06)",
    helpBg: "#0d0605", 
    helpBorder: "rgba(255,255,255,0.1)",
    accentVal: "#8b0000",
    accentSub: "#8b0000",
    analysisOk: "#10b981", 
    analysisFail: "#ef4444", 
    analysisNeutral: "#6b7280",
    analysisText: "#d1d5db",
  } : {
    // --- MODE CLAIR ---
    appBg: "#cbbfa8",
    canvasBg: "#cbbfa8",
    sidebarBg: "#c5b9a5",
    toolbarBg: "rgba(203, 191, 168, 0.95)",
    border: "rgba(0, 0, 0, 0.25)",
    borderFaint: "rgba(0, 0, 0, 0.14)",
    text: "#2c2823",
    textMuted: "#5a544d",
    textFaint: "#7a7268",
    statCard: "rgba(255, 255, 255, 0.6)",
    statCardBorder: "rgba(0, 0, 0, 0.2)",
    badge: "rgba(0,0,0,0.06)",
    badgeBorder: "rgba(0,0,0,0.22)",
    badgeText: "#2c2823",
    dot: "rgba(0,0,0,0.04)",
    emptyColor: "rgba(0,0,0,0.14)",
    helpBg: "#ffffff",
    helpBorder: "rgba(0,0,0,0.22)",
    accentVal: "#1e3354",
    accentSub: "#1e3354",
    analysisText: "#2c2823",
    analysisOk: "#059669",
    analysisFail: "#dc2626",
    analysisNeutral: "#6b7280",
};

 const S = {
    app: { 
      display: "flex", 
      height: "100vh", 
      width: "100vw", 
      overflow: "hidden", 
      background: T.appBg, 
      color: T.text, 
      fontFamily: "Inter, -apple-system, sans-serif" 
    },
    sidebar: { 
      width: showSidebar ? "256px" : "0px",
      minWidth: showSidebar ? "256px" : "0px",
      flexShrink: 0, 
      display: "flex", 
      flexDirection: "column", 
      borderRight: showSidebar ? `1px solid ${T.border}` : "none",
      background: T.sidebarBg, 
      overflowY: showSidebar ? "auto" : "hidden",
      overflowX: "hidden",
      transition: "width 0.25s ease, min-width 0.25s ease",
      backdropFilter: "none",
      WebkitBackdropFilter: "none",
    },
    sidebarHeader: { 
      height: "54px",
      padding: "0 16px", 
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      borderBottom: `1px solid ${T.border}` 
    },
    sectionTitle: { 
      fontSize: "10px", 
      color: T.textMuted, 
      textTransform: "uppercase", 
      letterSpacing: "0.12em", 
      fontWeight: "600", 
      marginBottom: "10px" 
    },
    statCard: { 
      background: T.statCard, 
      border: `1px solid ${T.statCardBorder}`, 
      borderRadius: "10px", 
      padding: "10px 14px", 
      marginBottom: "8px" 
    },
    statLabel: { 
      fontSize: "10px", 
      color: T.textFaint, 
      marginBottom: "4px" 
    },
    statValue: { 
      fontSize: "26px", 
      fontWeight: "700", 
      color: T.accentVal, 
      fontFamily: "JetBrains Mono, monospace" 
    },
    degreeRow: { 
      display: "flex", 
      justifyContent: "space-between", 
      alignItems: "center", 
      padding: "7px 0", 
      borderBottom: `1px solid ${T.borderFaint}`, 
      fontSize: "12px" 
    },
    badge: { 
      background: T.badge, 
      border: `1px solid ${T.badgeBorder}`, 
      borderRadius: "50%", 
      width: "28px", 
      height: "28px", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      fontSize: "11px", 
      color: T.badgeText, 
      fontFamily: "JetBrains Mono, monospace", 
      fontWeight: "600" 
    },
    main: { 
      flex: 1, 
      display: "flex", 
      flexDirection: "column", 
      minWidth: 0,
      position: "relative" 
    },
    toolbar: { 
      height: "54px", 
      display: "flex", 
      alignItems: "center", 
      gap: "8px", 
      padding: "0 20px", 
      borderBottom: `1px solid ${T.border}`, 
      background: darkMode ? T.toolbarBg : "#c8bc9f",
      flexShrink: 0, 
      position: "relative",
      zIndex: 100,
    },
    canvas: { 
      flex: 1, 
      position: "relative", 
      background: T.canvasBg,
      overflow: "hidden",
      zIndex: 1 // Le canvas reste en dessous de la sidebar et de la toolbar
    },
  };

 return (
 <div style={S.app}>
 <div style={S.sidebar}>
 {showSidebar && <>
 <div style={S.sidebarHeader}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
   <div style={{ fontSize: "13px", fontWeight: "600", color: T.text }}>Visualiseur de Graphes</div>
   <button onClick={() => setShowSidebar(false)} title="Masquer le panneau" style={{ background: "transparent", border: "none", cursor: "pointer", color: T.textMuted, display: "flex", alignItems: "center", padding: "2px 4px", borderRadius: "4px" }}>
     ‹
   </button>
 </div>
 </div>
 <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${T.border}` }}>
 <div style={S.sectionTitle}>Statistiques</div>
 <div style={S.statCard}><div style={S.statLabel}>Ordre (sommets)</div><div style={S.statValue}>{stats.order}</div></div>
 <div style={S.statCard}><div style={S.statLabel}>{directed ? "Taille (arcs)" : "Taille (aretes)"}</div><div style={S.statValue}>{stats.size}</div></div>
 <div style={S.statCard}><div style={S.statLabel}>Type</div><div style={{ color: T.accentVal, fontWeight: "600", fontSize: "13px" }}>{directed ? "Orienté" : "Non-orienté"}</div></div>
 </div>
 {globalAnalysis.length > 0 && (
 <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.borderFaint}` }}>
 <div style={S.sectionTitle}>Analyse</div>
 {globalAnalysis.map((r, i) => (
 <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px", borderBottom: `1px solid ${T.borderFaint}` }}>
 <span style={{ color: T.analysisText }}>{r.label}</span>
 <span style={{ color: r.ok === true ? T.analysisOk : r.ok === false ? T.analysisFail : T.analysisNeutral, fontWeight: "600", fontSize: "11px" }}>
 {r.ok === true ? "oui" : r.ok === false ? "non" : r.info}
 {r.reason && <span style={{ color: T.textMuted, fontWeight: "normal" }}> ({r.reason})</span>}
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
 ? <div style={{ fontSize: "12px" }}><span style={{ color: "#10b981", fontFamily: "JetBrains Mono, monospace" }}>in:{deg.in}</span>{" / "}<span style={{ color: T.analysisFail, fontFamily: "JetBrains Mono, monospace" }}>out:{deg.out}</span></div>
 : <span style={{ color: T.accentVal, fontWeight: "700", fontFamily: "JetBrains Mono, monospace" }}>{deg.in + deg.out}</span>
 }
 </div>
 ))
 }
 </div>
 </>}
 </div>

 <div style={S.main}>
 <div style={S.toolbar}>
  {!showSidebar && (
    <button onClick={() => setShowSidebar(true)} title="Afficher le panneau"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "32px", width: "32px", borderRadius: "8px", fontSize: "16px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter, sans-serif", background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, marginRight: "8px", flexShrink: 0 }}>
      ›
    </button>
  )}
  <button
    onClick={() => setShowHelp(true)}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: "32px",
      padding: "0 14px",
      borderRadius: "9999px",
      fontSize: "14px",
      fontWeight: "600",
      cursor: "pointer",
      fontFamily: "Inter, sans-serif",
      background: "#1a1a1b",
      border: "1px solid #1a1a1b",
      color: "#ffffff",
      marginRight: "8px", // Espace avec le switch d'orientation
      transition: "all 0.2s ease",
    }}
  >
    ?
  </button>
 {/* Switch orienté/non-orienté */}
 <div
  onClick={() => setDirected((d) => !d)}
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    userSelect: "none",
    height: "32px", // Même hauteur que les autres
    padding: "0 12px 0 8px",
    borderRadius: "9999px",
    // Style sombre identique aux autres boutons
    border: "1px solid #1a1a1b",
    background: "#1a1a1b",
    transition: "all 0.2s ease",
  }}
>
  {/* Track du switch */}
  <div style={{
    position: "relative",
    width: "32px",
    height: "18px",
    borderRadius: "9999px",
    flexShrink: 0,
    background: directed ? "#3b82f6" : "#4b5563", // Bleu si ON, Gris si OFF
    transition: "all 0.2s ease",
  }}>
    {/* Pastille blanche qui glisse */}
    <div style={{
      position: "absolute",
      top: "2px",
      left: directed ? "16px" : "2px",
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      background: "#ffffff",
      transition: "left 0.2s ease",
    }} />
  </div>
  {/* Texte du switch */}
  <span style={{ 
    fontSize: "12px", 
    fontFamily: "Inter, sans-serif", 
    fontWeight: "500", 
    color: "#ffffff" // Texte toujours blanc
  }}>
    {directed ? "Orienté" : "Non-orienté"}
  </span>
</div>
 {/* Bouton mode sélection */}
<button
  onClick={() => {
    const next = !selectMode;
    setSelectMode(next);
    selectModeRef.current = next;
    if (!next && cyRef.current) { cyRef.current.nodes(".multi-selected").removeClass("multi-selected"); cyRef.current.edges(".multi-selected").removeClass("multi-selected"); }
    setSelectionAnalysis(null);
  }}
  style={{
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "32px",
    padding: "0 14px", // Le padding forcé ici
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
    transition: "all 0.2s ease",
    // Style sombre permanent avec bordure dynamique
    background: "#1a1a1b",
    border: selectMode ? "1px solid #f59e0b" : "1px solid #1a1a1b",
    color: selectMode ? "#fcd34d" : "#ffffff",
  }}
>
  {selectMode ? "✓ Sélection" : "Sélection"}
</button>

 {analyzeMode && (
  <button 
    style={{ 
      ...btn(false, true),
      // On force les couleurs du mode Light pour le mode Sombre aussi
      background: "#1a1a1b", 
      border: "1px solid #aa0d0d", 
      color: "#7b0f0f", 
      fontWeight: "600"
    }} 
    onClick={toggleAnalyzeMode}
  >
    Quitter analyse
  </button>
)}
 {analyzeMode && sequence.length >= 3 && (
  <button 
    style={{ 
      ...btn(true, false), 
      background: "#3c1d71", 
      borderColor: "#2b1155", 
      color: "#ffffff",
      boxShadow: "0 2px 4px rgba(124, 58, 237, 0.3)",
      fontWeight: "600"
    }} 
    onClick={runSeqAnalysis}
  >
    Lancer analyse
  </button>
)}
 {analyzeMode && sequence.length > 0 && (
  <button 
    style={{
      ...btn(false, true),
      // On force les couleurs vives pour les deux modes
      background: "#3c1d71", 
      borderColor: "#2b1155", 
      color: "#ffffff",
      boxShadow: "0 2px 4px rgba(124, 58, 237, 0.3)",
      fontWeight: "600"
    }} 
    onClick={clearSequence}
  >
    Effacer séquence
  </button>
)}
 <div style={{ flex: 1 }} />
<button
  onClick={() => setShowTemplates(true)}
  style={{
    height: "32px", 
    padding: "0 14px", 
    borderRadius: "9999px",
    fontSize: "12px",
    fontFamily: "Inter, sans-serif", 
    fontWeight: "500",
    display: "flex", 
    alignItems: "center", 
    gap: "6px",
    cursor: "pointer",
    transition: "background 0.2s ease, color 0.2s ease", // On retire 'all' pour éviter que la bordure 'saute'
    
    // ON FIXE LE STYLE POUR ÉVITER LE MOUVEMENT
    background: "#1a1a1b", 
    border: "1px solid #1a1a1b", // Bordure identique au fond pour être "invisible" mais présente
    color: "#ffffff",
    boxSizing: "border-box", // Important pour que la bordure soit comprise dans les 32px
  }}
>
  Templates
</button>
 {/* Theme toggle */}
<button
  onClick={() => setDarkMode(!darkMode)}
  style={{
    display: "inline-flex",
    alignItems: "center",
    height: "32px",
    padding: "0 14px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
    // Bordure identique aux autres boutons
    border: "1px solid #1a1a1b", 
    // Fond identique (noir pur ou anthracite très sombre)
    background: "#1a1a1b", 
    // Texte blanc pour le contraste
    color: "#ffffff",
    transition: "all 0.2s ease",
  }}
  title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
>
  {darkMode ? "Light" : "Dark"}
</button>

 <div style={{ position: "relative" }} data-menu>
<button
  onClick={() => setMenuOpen((o) => !o)}
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    height: "32px",
    padding: "0 14px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    background: "#1a1a1b", // On garde le noir pour le contraste
    border: "1px solid #1a1a1b",
    color: "#ffffff",
    transition: "all 0.2s ease",
  }}
>
  Outils {menuOpen ? "▲" : "▼"}
</button>
{menuOpen && (
  <div style={{
    position: "fixed", top: "62px", right: "80px", zIndex: 10000,
    background: darkMode ? "#1a1a1a" : "#ffffff",
    border: `1px solid ${darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.22)"}`,
    borderRadius: "14px", padding: "8px", minWidth: "240px",
    boxShadow: darkMode ? "0 16px 48px rgba(0,0,0,0.8)" : "0 8px 32px rgba(0,0,0,0.12)",
  }}>
    <div style={{ fontSize: "10px", color: darkMode ? "#6b7280" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px 4px", fontWeight: "700" }}>Representations</div>
    {[{ label: "Successeurs & Predecesseurs", tab: "successors" }, { label: "Matrice d'adjacence", tab: "adjacency" }, { label: "Matrice d'incidence", tab: "incidence" }].map((item) => (
      <MenuItem key={item.tab} label={item.label} darkMode={darkMode} onClick={() => { setShowRepr(item.tab); setMenuOpen(false); }} />
    ))}
    <div style={{ height: "1px", background: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", margin: "6px 0" }} />
    <div style={{ fontSize: "10px", color: darkMode ? "#6b7280" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px 4px", fontWeight: "700" }}>Analyse</div>
    <MenuItem label={analyzeMode ? "Quitter l'analyse" : "Analyser une sequence"} darkMode={darkMode} color={analyzeMode ? (darkMode ? "#a78bfa" : "#7c3aed") : undefined} onClick={() => { toggleAnalyzeMode(); setMenuOpen(false); }} />
    {directed && <MenuItem label="Fermeture transitive" darkMode={darkMode} onClick={() => { setShowClosure(true); setMenuOpen(false); }} />}
    {directed && <MenuItem label="Graphe réduit (CFC)" darkMode={darkMode} onClick={() => { setShowGrapheReduit(true); setMenuOpen(false); }} />}
    {directed && <MenuItem label="Mise en niveaux" darkMode={darkMode} onClick={() => { setShowMiseEnNiveaux(true); setMenuOpen(false); }} />}
    <div style={{ height: "1px", background: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", margin: "6px 0" }} />
    <div style={{ fontSize: "10px", color: darkMode ? "#6b7280" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px 4px", fontWeight: "700" }}>Parcours</div>
    <MenuItem label="Parcours en largeur (BFS)" darkMode={darkMode} onClick={() => { closePrim(); closeKruskal(); closeKruskalUF(); closeDFS(); setMenuOpen(false); setBfsPickMode(true); }} />
    <MenuItem label="Parcours en profondeur (DFS)" darkMode={darkMode} onClick={() => { closePrim(); closeKruskal(); closeKruskalUF(); closeBFS(); setMenuOpen(false); setDfsPickMode(true); }} />
    <div style={{ height: "1px", background: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", margin: "6px 0" }} />
    <div style={{ fontSize: "10px", color: darkMode ? "#6b7280" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px 4px", fontWeight: "700" }}>Arbres Couvrants (ACM)</div>
    <MenuItem label="Algorithme de Prim" darkMode={darkMode} disabled={directed} onClick={() => { if (!directed) { closeKruskal(); closeKruskalUF(); setMenuOpen(false); setPrimPickMode(true); } }} />
    <MenuItem label="Algorithme de Kruskal" darkMode={darkMode} disabled={directed} onClick={() => { if (!directed) { closePrim(); closeKruskalUF(); setMenuOpen(false); frozenElements_kruskal_ref.current = elements; setShowKruskal(true); } }} />
    <MenuItem label="Algorithme de Kruskal avec Union-Find" darkMode={darkMode} disabled={directed} onClick={() => { if (!directed) { closePrim(); closeKruskal(); setMenuOpen(false); setShowKruskalUF(true); } }} />
    <MenuItem label="Algorithme de Dijkstra" darkMode={darkMode} disabled={!directed} onClick={() => { if (directed) { closePrim(); closeKruskal(); closeKruskalUF(); closeFord(); setMenuOpen(false); setDijkstraPickMode(true); } }} />
    <MenuItem label="Algorithme de Bellman-Ford" darkMode={darkMode} disabled={!directed} onClick={() => { if (directed) { closePrim(); closeKruskal(); closeKruskalUF(); closeDijkstra(); setMenuOpen(false); setFordPickMode(true); } }} />
    <div style={{ height: "1px", background: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", margin: "6px 0" }} />
    <MenuItem label="Définitions" darkMode={darkMode} onClick={() => { setShowDefs(true); setMenuOpen(false); }} />
    <MenuItem label="Références & Contact" darkMode={darkMode} onClick={() => { setShowAbout(true); setMenuOpen(false); }} />
    <div style={{ height: "1px", background: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", margin: "6px 0" }} />
    <MenuItem label="Création depuis un dictionnaire" darkMode={darkMode} onClick={() => { setShowDictModal(true); setMenuOpen(false); }} />
  </div>
)}
 </div>
 {/* Undo / Redo */}
 {[
   { label: "↩", title: "Annuler (Ctrl+Z)", action: undo, disabled: historyIdx <= 0 },
   { label: "↪", title: "Rétablir (Ctrl+Y)", action: redo, disabled: historyIdx >= history.length - 1 },
 ].map(({ label, title, action, disabled }) => (
   <button key={title} onClick={action} disabled={disabled} title={title} style={{
     height: "32px", width: "32px", borderRadius: "8px", border: `1px solid ${T.border}`,
     background: "transparent", color: disabled ? T.textFaint : T.textMuted,
     cursor: disabled ? "default" : "pointer", fontSize: "16px",
     display: "flex", alignItems: "center", justifyContent: "center",
     opacity: disabled ? 0.35 : 1, transition: "opacity 0.15s ease",
   }}>{label}</button>
 ))}
 <button
  onClick={resetGraph}
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    height: "32px",
    padding: "0 14px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
    transition: "all 0.2s ease",
    background: "#1a1a1b", 
    border: "1px solid #aa0d0d", 
    color: "#7b0f0f", 
  }}
>
  ↺ Réinitialiser
</button>
 </div>

 <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"0 16px", height:"28px", background: darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.06)", borderBottom:`1px solid ${T.borderFaint}`, fontSize:"11px", color: (primPickMode||bfsPickMode||dfsPickMode||dijkstraPickMode||fordPickMode) ? (darkMode ? "#f59e0b" : "#b45309") : selectMode ? (darkMode ? "#f59e0b" : "#b45309") : analyzeMode ? (darkMode ? "#a78bfa" : "#7c3aed") : T.textMuted, flexShrink:0, overflow:"hidden" }}>
   <span style={{ width:"5px", height:"5px", borderRadius:"50%", background: (primPickMode||bfsPickMode||dfsPickMode||dijkstraPickMode||fordPickMode) ? (darkMode ? "#f59e0b" : "#b45309") : selectMode ? (darkMode ? "#f59e0b" : "#b45309") : analyzeMode ? (darkMode ? "#a78bfa" : "#7c3aed") : T.textFaint, flexShrink:0 }} />
   <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{hintText}</span>
 </div>

 <div style={S.canvas}>

  

{selectMode && selectionAnalysis && selectionAnalysis.length > 0 && (
   <div style={{ position: "absolute", top: "16px", left: "16px", zIndex: 11, background: "rgba(13,17,23,0.92)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "12px 16px", minWidth: "220px", maxWidth: "300px", backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
       <div style={{ fontSize: "10px", color: "#f59e0b", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.12em" }}>Somme des poids</div>
       {(() => {
         const cy = typeof cyRef !== "undefined" ? cyRef.current : null;
         const selEdges = cy ? cy.edges(".multi-selected") : [];
         const totalW = selEdges.length > 0 ? Array.from(selEdges).reduce((s, e) => s + (e.data("weight") ?? 0), 0) : null;
         return totalW !== null ? (
           <div style={{ fontSize: "11px", color: "#10b981", fontFamily: "JetBrains Mono, monospace", fontWeight: "700" }}>Σ = {totalW}</div>
         ) : null;
       })()}
     </div>
     {selectionAnalysis.filter((r) => ["Arbre","Foret","Graphe connexe","Graphe simple"].includes(r.label)).map((r, i) => (
       <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
         <span style={{ color: "#94a3b8" }}>{r.label}</span>
         <span style={{ color: r.ok === true ? "#10b981" : r.ok === false ? "#ef4444" : "#64748b", fontWeight: "600" }}>
           {r.ok === true ? "oui" : r.ok === false ? "non" : r.info}
           {r.reason && <span style={{ color: "#475569", fontWeight: "normal" }}> ({r.reason})</span>}
         </span>
       </div>
     ))}
   </div>
 )}

 {analyzeMode && (sequence.length > 0 || seqAnalysis.length > 0) && (
  <div style={{ 
    position: "absolute", 
    bottom: "20px", 
    left: "20px", 
    zIndex: 11, 
    // Utilisation des couleurs dynamiques du thème T
    background: darkMode ? "rgba(13,17,23,0.92)" : "rgba(255, 255, 255, 0.95)", 
    border: `1px solid ${T.border}`, 
    borderRadius: "12px", 
    padding: "14px 18px", 
    minWidth: "260px", 
    maxWidth: "380px", 
    backdropFilter: "blur(16px)", 
    boxShadow: darkMode ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,0,0.1)" 
  }}>
    <div style={{ 
      fontSize: "10px", 
      color: darkMode ? "#8b5cf6" : "#7c3aed", // Violet plus profond en mode clair
      fontWeight: "600", 
      marginBottom: "8px", 
      textTransform: "uppercase", 
      letterSpacing: "0.12em" 
    }}>
      Sequence
    </div>
    <div style={{ 
      fontSize: "12px", 
      color: T.text, // Adapté au thème
      marginBottom: "8px", 
      display: "flex", 
      flexWrap: "wrap", 
      gap: "4px", 
      alignItems: "center" 
    }}>
      {sequence.length === 0 ? "Aucun element" : sequence.map((item, i) => {
        const isNode = !item.startsWith("e_");
        const edge = !isNode && elements.find((el) => el.data.id === item);
        const sep = directed ? "→" : "—";
        const nodeLabel = isNode ? (elements.find((el) => el.data.id === item)?.data.label ?? item) : item;
        const edgeSrcLabel = edge ? (elements.find((el) => el.data.id === edge.data.source)?.data.label ?? edge.data.source) : "";
        const edgeTgtLabel = edge ? (elements.find((el) => el.data.id === edge.data.target)?.data.label ?? edge.data.target) : "";
        const label = isNode ? nodeLabel : (edge ? `${edgeSrcLabel}${sep}${edgeTgtLabel}` : item);
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            {i > 0 && <span style={{ color: T.textMuted, margin: "0 2px" }}>•</span>}
            <span style={{ 
              background: isNode ? (darkMode ? "rgba(168,85,247,0.2)" : "rgba(124,58,237,0.1)") : "rgba(100,116,139,0.1)", 
              border: isNode ? "1px solid #a855f7" : `1px solid ${T.textMuted}`, 
              borderRadius: "4px", 
              padding: "1px 6px", 
              color: isNode ? (darkMode ? "#d8b4fe" : "#6d28d9") : T.textMuted, 
              fontWeight: isNode ? "bold" : "normal", 
              fontSize: "12px" 
            }}>
              {label}
            </span>
          </span>
        );
      })}
    </div>
    
    {seqAnalysis.length > 0 && (
      <div style={{ borderTop: `1px solid ${T.borderFaint}`, paddingTop: "8px", display: "grid", gap: "4px" }}>
        {seqAnalysis.map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
            <span style={{ color: T.text }}>{r.label}</span>
            <span style={{ color: r.ok === true ? T.analysisOk : r.ok === false ? T.analysisFail : T.textMuted, fontWeight: "600" }}>
              {r.ok === true ? "oui" : r.ok === false ? "non" : r.info}
              {r.reason && <span style={{ color: T.textMuted, fontWeight: "normal", fontSize: "11px" }}> ({r.reason})</span>}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
)}

{showHelp && <HelpModal onClose={() => setShowHelp(false)} darkMode={darkMode} T={T} />}

 <CytoscapeComponent
 elements={[...elements]}
 stylesheet={buildStylesheet(directed, darkMode)}
 style={{ width: "100%", height: "100%", background: "transparent" }}
 cy={(cy) => { cyRef.current = cy; }}
 layout={{ name: "preset" }}
 userZoomingEnabled={true} userPanningEnabled={true} boxSelectionEnabled={false} autoungrabify={false} autounselectify={true}
 />
 </div>
 </div>

 {showDefs && <DefsPanel darkMode={darkMode} onClose={() => setShowDefs(false)} />}
 {showAbout && <AboutPanel darkMode={darkMode} onClose={() => setShowAbout(false)} />}
 {showTemplates && <TemplatesPanel darkMode={darkMode} onClose={() => setShowTemplates(false)} onLoad={loadTemplate} />}
 {primError && (
   <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", zIndex: 300, background: "rgba(239,68,68,0.95)", borderRadius: "10px", padding: "12px 20px", color: "white", fontSize: "13px", fontFamily: "Inter, sans-serif", fontWeight: "500", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
     Le graphe doit avoir des arêtes avec des poids pour lancer Prim.
   </div>
 )}
 {(() => {
   const algoActive = showPrim || showKruskal || showKruskalUF || showBFS || showDFS || showDijkstra || showFord;
   const algoName = showDijkstra ? "Dijkstra" : showFord ? "Bellman-Ford" : showBFS ? "BFS" : showDFS ? "DFS" : showPrim ? "Prim" : showKruskal ? "Kruskal" : showKruskalUF ? "Kruskal UF" : "";
   return (<>
     {/* Mini floating tab shown when panel is hidden */}
     {algoActive && panelHidden && (
       <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 300, display: "flex", alignItems: "center", gap: "10px", background: darkMode ? "rgba(10,10,10,0.95)" : "rgba(255,255,255,0.97)", border: `1px solid ${darkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.18)"}`, borderRadius: "9999px", padding: "8px 16px", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", backdropFilter: "blur(12px)" }}>
         <span style={{ fontSize: "11px", color: darkMode ? "#94a3b8" : "#6b7280", fontFamily: "Inter, sans-serif" }}>
           <span style={{ fontWeight: "700", color: darkMode ? "#f3f4f6" : "#111827" }}>{algoName}</span> en cours
         </span>
         <button onClick={() => setPanelHidden(false)}
           style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "9999px", background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: `1px solid ${darkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, color: darkMode ? "#e2e8f0" : "#374151", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "11px", fontWeight: "600" }}>
           <span style={{ fontSize: "13px" }}>👁</span> Afficher
         </button>
       </div>
     )}
     {/* Algo panels — hidden with visibility when panelHidden */}
     <div style={{ display: panelHidden ? "none" : "contents" }}>
       {showPrim && primStartNode && <PrimPanel elements={elements} startNodeId={primStartNode} onClose={closePrim} onHide={() => setPanelHidden(true)} onStep={(s) => setPrimStep(s)} darkMode={darkMode} />}
       {showKruskal && <KruskalVisPanel elements={elements} onClose={closeKruskal} onHide={() => setPanelHidden(true)} onStep={(s) => setKruskalStep(s)} darkMode={darkMode} />}
       {showKruskalUF && <KruskalPanel elements={elements} onClose={closeKruskalUF} onHide={() => setPanelHidden(true)} onStep={(s) => setKruskalUFStep(s)} darkMode={darkMode} />}
       {showBFS && bfsStartNode && <BFSPanel elements={elements} startNodeId={bfsStartNode} directed={directed} darkMode={darkMode} onClose={closeBFS} onHide={() => setPanelHidden(true)} onStep={(s) => setBfsStep(s)}
          onShowTree={(pi) => { const nodes = elements.filter(el => !el.data.source); const idToLabel = {}; nodes.forEach(n => { idToLabel[n.data.id] = n.data.label; }); setBfsTreeData({ pi, idToLabel, startId: bfsStartNode }); }} />}
       {showDFS && dfsStartNode && <DFSPanel elements={elements} startNodeId={dfsStartNode} directed={directed} darkMode={darkMode} onClose={closeDFS} onHide={() => setPanelHidden(true)} onStep={(s) => setDfsStep(s)}
          onShowForest={(treeEdges, dates) => { const nodes = elements.filter(el => !el.data.source); const idToLabel = {}; nodes.forEach(n => { idToLabel[n.data.id] = n.data.label; }); dfsElementsRef.current = elements; setDfsForestData({ treeEdges, dates, elements, idToLabel }); }}
          onShowSCC={() => { dfsElementsRef.current = elements; setShowSCCModal(true); }}
          onShowTopo={(dates) => { dfsElementsRef.current = elements; const m = {}; elements.filter(el => !el.data.source).forEach(n => { m[n.data.id] = n.data.label; }); setDfsTopoData({ elements, idToLabel: m, dates }); setShowTopoModal(true); }} />}
       {showDijkstra && dijkstraStartNode && <DijkstraPanel elements={elements} startNodeId={dijkstraStartNode} darkMode={darkMode} onClose={closeDijkstra} onHide={() => setPanelHidden(true)} onStep={s => setDijkstraStep(s)} />}
       {showFord && fordStartNode && <FordPanel elements={elements} startNodeId={fordStartNode} darkMode={darkMode} onClose={closeFord} onHide={() => setPanelHidden(true)} onStep={s => setFordStep(s)} />}
     </div>
   </>);
 })()}

 {showRepr && <RepresentationPanel elements={elements} directed={directed} darkMode={darkMode} onClose={() => setShowRepr(false)} initialTab={showRepr} />}
 {showClosure && directed && <ClosurePanel elements={elements} onClose={() => setShowClosure(false)} />}
 {showGrapheReduit && directed && <GrapheReduitPanel elements={elements} idToLabel={(() => { const m = {}; elements.filter(el => !el.data.source).forEach(n => { m[n.data.id] = n.data.label; }); return m; })()} darkMode={darkMode} onClose={() => setShowGrapheReduit(false)} />}
 {showMiseEnNiveaux && directed && <MiseEnNiveauxPanel elements={elements} idToLabel={(() => { const m = {}; elements.filter(el => !el.data.source).forEach(n => { m[n.data.id] = n.data.label; }); return m; })()} darkMode={darkMode} onClose={() => setShowMiseEnNiveaux(false)} />}
 {showDijkstra && dijkstraStartNode && false && null}
 {showFord && fordStartNode && false && null}
 {showDictModal && <DictImportModal darkMode={darkMode} onClose={() => setShowDictModal(false)} onLoad={loadFromDict} />}
 {bfsTreeData && <BFSTreeModal pi={bfsTreeData.pi} idToLabel={bfsTreeData.idToLabel} startId={bfsTreeData.startId} darkMode={darkMode} onClose={() => setBfsTreeData(null)} />}
 {dfsForestData && <DFSForestModal treeEdges={dfsForestData.treeEdges} dates={dfsForestData.dates} elements={dfsForestData.elements} idToLabel={dfsForestData.idToLabel} darkMode={darkMode} onClose={() => setDfsForestData(null)} />}
 {showSCCModal && dfsElementsRef.current && <SCCPanel elements={dfsElementsRef.current} idToLabel={(() => { const m = {}; dfsElementsRef.current.filter(el => !el.data.source).forEach(n => { m[n.data.id] = n.data.label; }); return m; })()} darkMode={darkMode} onClose={() => setShowSCCModal(false)} />}
 {showTopoModal && dfsTopoData && <TopoSortPanel elements={dfsTopoData.elements} idToLabel={dfsTopoData.idToLabel} dfsFinishDates={dfsTopoData.dates} darkMode={darkMode} onClose={() => { setShowTopoModal(false); setDfsTopoData(null); }} />}
 {showRenameModal && selectedNode && <RenameModal node={selectedNode} onConfirm={handleRenameConfirm} onCancel={() => { setShowRenameModal(false); setSelectedNode(null); }} />}
 {showWeightModal && selectedEdge && <WeightModal edge={selectedEdge} onConfirm={handleWeightConfirm} onCancel={() => { setShowWeightModal(false); setSelectedEdge(null); }} />}
 </div>
 );
}