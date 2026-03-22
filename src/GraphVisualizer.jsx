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
  const border = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
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
 <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
 <div style={{ background: darkMode ? "#0d1117" : "#ffffff", border: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, borderRadius: "16px", width: "min(720px, 95vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
 <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
 <div style={{ fontWeight: "600", fontSize: "15px", color: darkMode ? "#f1f5f9" : "#111827", fontFamily: "Inter, sans-serif" }}>Definitions</div>
 <button onClick={onClose} style={{ background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, borderRadius: "6px", color: "#94a3b8", cursor: "pointer", padding: "6px 10px" }}>✕</button>
 </div>
 <div style={{ overflowY: "auto", padding: "16px 20px", display: "grid", gap: "10px" }}>
 {DEFINITIONS.map((d) => (
 <div key={d.term} style={{ background: darkMode ? "rgba(255,255,255,0.02)" : "#f9fafb", border: `1px solid ${darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`, borderRadius: "10px", padding: "12px 16px", borderLeft: "3px solid #3b82f6" }}>
 <div style={{ fontWeight: "700", color: darkMode ? "#f1f5f9" : "#111827", marginBottom: "4px", fontSize: "14px" }}>{d.term}</div>
 <div style={{ color: darkMode ? "#cbd5e1" : "#374151", fontSize: "13px", lineHeight: "1.5", marginBottom: "6px" }}>{d.def}</div>
 <div style={{ color: darkMode ? "#64748b" : "#9ca3af", fontSize: "12px", fontStyle: "italic" }}>{d.example}</div>
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
 const tabStyle = (active) => ({ padding: "6px 14px", borderRadius: "9999px", fontSize: "12px", fontWeight: "500", cursor: "pointer", fontFamily: "Inter, sans-serif", border: "none", background: active ? "rgba(59,130,246,0.15)" : "transparent", color: active ? "#93c5fd" : "#64748b" });
 const cellStyle = (header) => ({ padding: "7px 12px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: header ? "#94a3b8" : "#e2e8f0", fontWeight: header ? "600" : "400", background: header ? "rgba(255,255,255,0.04)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.05)", textAlign: "center", whiteSpace: "nowrap" });
 const tabs = [{ key: "successors", label: "Successeurs" }, { key: "predecessors", label: "Predecesseurs" }, { key: "adjacency", label: "Matrice adjacence" }, { key: "incidence", label: "Matrice incidence" }];
 return (
 <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
 <div style={{ background: darkMode ? "#0d1117" : "#ffffff", border: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, borderRadius: "16px", width: "min(700px, 96vw)", maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
 <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
 <div style={{ fontWeight: "600", fontSize: "15px", color: darkMode ? "#f1f5f9" : "#111827", fontFamily: "Inter, sans-serif" }}>Representations du graphe</div>
 <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#94a3b8", cursor: "pointer", padding: "6px 10px" }}>x</button>
 </div>
 <div style={{ display: "flex", gap: "4px", padding: "12px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" }}>
 {tabs.map((t) => <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
 </div>
 <div style={{ overflowY: "auto", overflowX: "auto", padding: "18px 22px" }}>
 {(tab === "successors" || tab === "predecessors") && (() => {
 const data = tab === "successors" ? succ : pred;
 const gamma = tab === "successors" ? "+" : "-";
 const entries = Object.entries(data);
 const thStyle = { padding: "10px 18px", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: "13px", fontWeight: "600", textAlign: "center", fontFamily: "JetBrains Mono, monospace", background: "rgba(255,255,255,0.04)", whiteSpace: "nowrap" };
 const tdNodeStyle = { padding: "10px 18px", border: "1px solid rgba(255,255,255,0.08)", color: "#3b82f6", fontWeight: "700", fontSize: "14px", textAlign: "center", fontFamily: "JetBrains Mono, monospace", background: "rgba(59,130,246,0.05)" };
 const tdValStyle = { padding: "10px 18px", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0", fontSize: "13px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" };
 return (
 <div style={{ overflowX: "auto" }}>
 <table style={{ borderCollapse: "collapse", fontFamily: "JetBrains Mono, monospace" }}>
 <tbody>
 <tr>
 <th style={{ ...thStyle, borderRight: "2px solid rgba(255,255,255,0.15)" }}>
 x<sub>i</sub>
 </th>
 {entries.map(([node]) => (
 <td key={node} style={tdNodeStyle}>{node}</td>
 ))}
 </tr>
 <tr>
 <th style={{ ...thStyle, borderRight: "2px solid rgba(255,255,255,0.15)" }}>
 {"Γ"}<sup style={{ fontSize: "10px" }}>{gamma}</sup>(x<sub>i</sub>)
 </th>
 {entries.map(([node, neighbors]) => (
 <td key={node} style={tdValStyle}>
 {neighbors.length === 0
 ? <span style={{ color: "#475569" }}>&#8709;</span>
 : "{" + neighbors.join(", ") + "}"}
 </td>
 ))}
 </tr>
 </tbody>
 </table>
 </div>
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
 <tbody>{incNodes.map((row) => (<tr key={row}><td style={{ ...cellStyle(true), color: "#3b82f6" }}>{row}</td>{incEdges.map((col) => { const val = incMatrix[row][col]; return <td key={col} style={{ ...cellStyle(false), color: val === 1 ? "#10b981" : val === -1 ? "#ef4444" : "#334155" }}>{val}</td>; })}</tr>))}</tbody>
 </table>
 {directed && <div style={{ fontSize: "11px", color: "#475569", marginTop: "10px" }}>1 = depart, -1 = arrivee</div>}
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

function PrimPanel({ elements, startNodeId, onClose, onStep }) {
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
      <button onClick={onClose} style={{ padding: "7px 20px", background: "#3b82f6", border: "none", borderRadius: "8px", color: "white", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Fermer</button>
    </div>
  );

  const step = steps[idx];
  const done = idx === steps.length - 1;
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };

  return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(10,10,10,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", width: "min(760px, 93vw)", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", backdropFilter: "blur(12px)" }}>

      <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#3b82f6", transition: "width 0.3s" }} />
      </div>

      <div style={{ padding: "12px 16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: "600", fontSize: "13px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Prim — Étape {idx + 1}/{steps.length}</span>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px", padding: "0 4px" }}>✕</button>
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
  const nodeIds = nodes.map((n) => n.data.id);

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

function KruskalVisPanel({ elements, onClose, onStep }) {
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
      <button onClick={onClose} style={{ padding: "7px 18px", background: "#3b82f6", border: "none", borderRadius: "8px", color: "white", cursor: "pointer" }}>Fermer</button>
    </div>
  );

  const step = steps[idx];
  const done = step.done || idx === steps.length - 1;
  const btnBase = { padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "12px", border: "none" };
  const allSortedEdges = frozenElements.filter((el) => !!el.data.source && el.data.source !== el.data.target).sort((a, b) => (a.data.weight ?? 0) - (b.data.weight ?? 0));

  return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(10,10,10,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", width: "min(760px, 93vw)", boxShadow: "0 8px 40px rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}>
      <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#f59e0b", transition: "width 0.3s" }} />
      </div>
      <div style={{ padding: "12px 16px", display: "flex", gap: "14px", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: "600", fontSize: "13px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Kruskal — Étape {idx + 1}/{steps.length}</span>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px" }}>✕</button>
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

function KruskalPanel({ elements, onClose, onStep }) {
  const [idx, setIdx] = useState(0);
  const frozenElements = useMemo(() => elements, []);
  const steps = useMemo(() => {
    try { return computeKruskalSteps(frozenElements); } catch(e) { console.error(e); return []; }
  }, []);

  const nodes = frozenElements.filter((el) => !el.data.source);
  const idToLabel = {};
  nodes.forEach((n) => { idToLabel[n.data.id] = n.data.label; });
  const nodeLabels = nodes.map((n) => n.data.label).sort();

  useEffect(() => {
    if (steps[idx] && onStep) onStep(steps[idx]);
  }, [idx]);

  if (steps.length === 0) return (
    <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "20px 24px", maxWidth: "400px", textAlign: "center" }}>
      <div style={{ color: "#f1f5f9", fontWeight: "600", marginBottom: "6px", fontFamily: "Inter, sans-serif" }}>Impossible de lancer Kruskal</div>
      <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "16px" }}>Graphe non-orienté pondéré requis.</div>
      <button onClick={onClose} style={{ padding: "7px 18px", background: "#3b82f6", border: "none", borderRadius: "8px", color: "white", cursor: "pointer" }}>Fermer</button>
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

      <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (steps.length > 1 ? idx / (steps.length - 1) * 100 : 0) + "%", background: done ? "#10b981" : "#f59e0b", transition: "width 0.3s" }} />
      </div>

      <div style={{ padding: "10px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: "700", fontSize: "13px", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>Kruskal + Union-Find — Étape {idx + 1}/{steps.length}</span>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px" }}>✕</button>
      </div>
      <div style={{ padding: "0 16px 8px", fontSize: "12px", fontFamily: "Inter, sans-serif", color: step.accepted === true ? "#10b981" : step.accepted === false ? "#ef4444" : "#94a3b8" }}>
        {step.message}
      </div>

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
            {step.tableRows.length === 0 ? (
              <tr><td colSpan={6 + nodeLabels.length} style={TD({ color: "#4b5563", fontStyle: "italic", textAlign: "left", paddingLeft: "16px" })}>En attente...</td></tr>
            ) : step.tableRows.map((row, i) => {
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


function ClosurePanel({ elements, onClose }) {
 const { steps, uPlus } = computeTransitiveClosure(elements);
 const sup = (n) => { const map = { 1: "", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" }; return n in map ? map[n] : `^${n}`; };
 const fmt = (pairs) => "{" + pairs.map(([s, t]) => `(${s},${t})`).join(", ") + "}";
 return (
 <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
 <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", width: "min(600px, 95vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
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
      // Un noir très léger pour assombrir un peu, mais laisser passer les couleurs
      background: "rgba(0,0,0,0.4)", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      zIndex: 2000, // Doit être au-dessus de tout
      
      // L'EFFET DE FLOU :
      backdropFilter: "blur(8px)", 
      WebkitBackdropFilter: "blur(8px)", // Pour la compatibilité Safari
      
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
  {
    id: "kruskal_cours",
    name: "Graphe 1",
    description: "7 sommets A-G, non-orienté pondéré",
    directed: false,
    nodes: [
      { id: "A", label: "A", x: 120, y: 80 },
      { id: "B", label: "B", x: 310, y: 80 },
      { id: "C", label: "C", x: 500, y: 80 },
      { id: "D", label: "D", x: 120, y: 240 },
      { id: "E", label: "E", x: 460, y: 240 },
      { id: "F", label: "F", x: 280, y: 360 },
      { id: "G", label: "G", x: 520, y: 380 },
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
    name: "Graphe 2",
    description: "10 sommets, non-orienté pondéré",
    directed: false,
    nodes: [
      { id: "1",  label: "1",  x: 95,  y: 325 },
      { id: "2",  label: "2",  x: 210, y: 165 },
      { id: "3",  label: "3",  x: 190, y: 325 },
      { id: "4",  label: "4",  x: 320, y: 620 },
      { id: "5",  label: "5",  x: 270, y: 245 },
      { id: "6",  label: "6",  x: 435, y: 65  },
      { id: "7",  label: "7",  x: 480, y: 355 },
      { id: "8",  label: "8",  x: 585, y: 150 },
      { id: "9",  label: "9",  x: 605, y: 45  },
      { id: "10", label: "10", x: 775, y: 175 },
    ],
    edges: [
      { s: "8",  t: "9",  w: 1  },
      { s: "3",  t: "5",  w: 2  },
      { s: "5",  t: "2",  w: 2  },
      { s: "3",  t: "1",  w: 3  },
      { s: "10", t: "8",  w: 3  },
      { s: "2",  t: "3",  w: 4  },
      { s: "6",  t: "9",  w: 4  },
      { s: "9",  t: "10", w: 4  },
      { s: "6",  t: "8",  w: 5  },
      { s: "1",  t: "2",  w: 6  },
      { s: "6",  t: "7",  w: 7  },
      { s: "5",  t: "7",  w: 8  },
      { s: "4",  t: "7",  w: 8  },
      { s: "1",  t: "4",  w: 9  },
      { s: "4",  t: "3",  w: 9  },
      { s: "7",  t: "3",  w: 9  },
      { s: "2",  t: "6",  w: 9  },
      { s: "8",  t: "7",  w: 9  },
      { s: "6",  t: "5",  w: 9  },
      { s: "10", t: "4",  w: 18 },
    ],
  },
];

function TemplatesPanel({ onClose, onLoad, darkMode }) {
  const [hovered, setHovered] = useState(null);
  const bg = darkMode ? "#111111" : "#ffffff";
  const border = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text = darkMode ? "#f3f4f6" : "#111827";
  const muted = darkMode ? "#6b7280" : "#9ca3af";
  const cardBg = darkMode ? "rgba(255,255,255,0.04)" : "#f9fafb";
  const cardBorder = darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const cardHover = darkMode ? "rgba(255,255,255,0.08)" : "#f0f4ff";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: "16px", width: "min(680px, 95vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "15px", color: text, fontFamily: "Inter, sans-serif" }}>Templates de graphes</div>
            <div style={{ fontSize: "12px", color: muted, marginTop: "2px" }}>Charger un graphe</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: "8px", color: muted, cursor: "pointer", padding: "6px 10px", fontSize: "14px" }}>✕</button>
        </div>

        {/* Grid */}
        <div style={{ overflowY: "auto", padding: "18px 22px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              onMouseEnter={() => setHovered(t.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => { onLoad(t); onClose(); }}
              style={{
                background: hovered === t.id ? cardHover : cardBg,
                border: `1px solid ${hovered === t.id ? (darkMode ? "rgba(59,130,246,0.4)" : "rgba(59,130,246,0.3)") : cardBorder}`,
                borderRadius: "12px", padding: "16px", cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: hovered === t.id ? "0 4px 16px rgba(59,130,246,0.1)" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div style={{ fontWeight: "600", fontSize: "14px", color: text, fontFamily: "Inter, sans-serif" }}>{t.name}</div>
                <span style={{ fontSize: "10px", fontWeight: "600", padding: "2px 8px", borderRadius: "9999px", background: t.directed ? "rgba(139,92,246,0.12)" : "rgba(16,185,129,0.1)", color: t.directed ? "#a78bfa" : "#10b981", border: `1px solid ${t.directed ? "rgba(139,92,246,0.2)" : "rgba(16,185,129,0.2)"}` }}>
                  {t.directed ? "Orienté" : "Non-orienté"}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: muted, marginBottom: "10px" }}>{t.description}</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: muted, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", padding: "2px 8px", borderRadius: "6px" }}>
                  {t.nodes.length} sommets
                </span>
                <span style={{ fontSize: "11px", color: muted, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", padding: "2px 8px", borderRadius: "6px" }}>
                  {t.edges.length} arêtes
                </span>
                {t.edges.some((e) => e.w) && (
                  <span style={{ fontSize: "11px", color: "#f59e0b", background: "rgba(245,158,11,0.08)", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(245,158,11,0.15)" }}>
                    pondéré
                  </span>
                )}
              </div>
            </div>
          ))}
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
   setDirected(template.directed);
   setElem(() => allEls);
   // Update nodeCounter to max numeric id
   const numericIds = template.nodes.map((n) => parseInt(n.id.replace(/[^0-9]/g, ""), 10)).filter((n) => !isNaN(n));
   nodeCounter = numericIds.length > 0 ? Math.max(...numericIds) : template.nodes.length;
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

   // MODE PRIM : choisir le sommet de départ
   if (primPickRef.current) {
     setPrimStartNode(nodeId);
     setPrimPickMode(false);
     primPickRef.current = false;
     setShowPrim(true);
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

  const frozenElements_kruskal_ref = useRef(null);

  const closeKruskal = () => {
    if (cyRef.current) {
      cyRef.current.edges().removeClass("kruskal-acm kruskal-current kruskal-rejected");
      cyRef.current.nodes().removeClass("kruskal-connected");
    }
    setShowKruskal(false);
    setKruskalStep(null);
    frozenElements_kruskal_ref.current = null;
  };

  const closeKruskalUF = () => {
    if (cyRef.current) {
      cyRef.current.edges().removeClass("kruskal-acm kruskal-current kruskal-rejected");
      cyRef.current.nodes().removeClass("kruskal-connected");
    }
    setShowKruskalUF(false);
    setKruskalUFStep(null);
  };

  const closePrim = () => {
    if (cyRef.current) {
      cyRef.current.nodes().removeClass("prim-visited prim-start");
      cyRef.current.edges().removeClass("prim-tree prim-candidate");
    }
    setShowPrim(false); setPrimStep(null); setPrimStartNode(null);
    setPrimPickMode(false); primPickRef.current = false;
  };

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

const hintText = primPickMode
  ? "PRIM · Cliquer sur un sommet pour démarrer l'algorithme"
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
    appBg: "#cbbfa8",      // Fond plus sombre pour mieux voir le graphe
  canvasBg: "#cbbfa8",
  sidebarBg: "#c5b9a5", 
  toolbarBg: "rgba(203, 191, 168, 0.95)",
  border: "rgba(0, 0, 0, 0.15)", borderFaint: "rgba(0, 0, 0, 0.08)",
  text: "#2c2823", textMuted: "#5a544d",
  statCard: "rgba(255, 255, 255, 0.6)", statCardBorder: "rgba(0, 0, 0, 0.1)",
  accentVal: "#1e3354", accentSub: "#1e3354",
  analysisText: "#2c2823",
  analysisOk: "#10b981", analysisFail: "#ef4444", analysisNeutral: "#6b7280", // On garde tes couleurs originales
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
      width: "256px", 
      flexShrink: 0, 
      display: "flex", 
      flexDirection: "column", 
      borderRight: `1px solid ${T.border}`, 
      background: T.sidebarBg, 
      overflowY: "auto",
      // Effet vitrine (flou) uniquement en mode clair
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
      background: T.toolbarBg, 
      flexShrink: 0, 
      position: "relative", 
      zIndex: 100,
      // Effet vitrine (flou) uniquement en mode clair
      backdropFilter: darkMode ? "none" : "blur(12px)",
      WebkitBackdropFilter: darkMode ? "none" : "blur(12px)"
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
 <div style={S.sidebarHeader}>
 <div style={{ fontSize: "13px", fontWeight: "600", color: T.text }}>Visualiseur de Graphes</div>
 </div>
 <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${T.border}` }}>
 <div style={S.sectionTitle}>Statistiques</div>
 <div style={S.statCard}><div style={S.statLabel}>Ordre (sommets)</div><div style={S.statValue}>{stats.order}</div></div>
 <div style={S.statCard}><div style={S.statLabel}>{directed ? "Taille (arcs)" : "Taille (aretes)"}</div><div style={S.statValue}>{stats.size}</div></div>
 <div style={S.statCard}><div style={S.statLabel}>Type</div><div style={{ color: T.accentVal, fontWeight: "600", fontSize: "13px" }}>{directed ? "Orienté" : "Non-orienté"}</div></div>
 </div>
 {globalAnalysis.length > 0 && (
 <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
 <div style={S.sectionTitle}>Analyse</div>
 {globalAnalysis.map((r, i) => (
 <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
 <span style={{ color: T.analysisText }}>{r.label}</span>
 <span style={{ color: r.ok === true ? T.analysisOk : r.ok === false ? T.analysisFail : T.analysisNeutral, fontWeight: "600", fontSize: "11px" }}>
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
 ? <div style={{ fontSize: "12px" }}><span style={{ color: "#10b981", fontFamily: "JetBrains Mono, monospace" }}>in:{deg.in}</span>{" / "}<span style={{ color: T.analysisFail, fontFamily: "JetBrains Mono, monospace" }}>out:{deg.out}</span></div>
 : <span style={{ color: T.accentVal, fontWeight: "700", fontFamily: "JetBrains Mono, monospace" }}>{deg.in + deg.out}</span>
 }
 </div>
 ))
 }
 </div>
 </div>

 <div style={S.main}>
 <div style={S.toolbar}>
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
      // On force les couleurs du mode Light
      background: "#592aa9", 
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
      background: "#1a1a1b", 
      borderColor: "#f59e0b", 
      color: "#fcd34d",
      fontWeight: "600",
      // On ajoute un petit effet d'ombre pour le faire ressortir sur le beige
      boxShadow: "0 2px 4px rgba(239, 68, 68, 0.2)"
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
    position: "fixed", top: "62px", right: "80px", zIndex: 99999,
    background: darkMode ? "#1a1a1a" : "#ffffff",
    border: `1px solid ${darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
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
    <div style={{ height: "1px", background: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", margin: "6px 0" }} />
    <div style={{ fontSize: "10px", color: darkMode ? "#6b7280" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px 4px", fontWeight: "700" }}>Arbres Couvrants (ACM)</div>
    <MenuItem label="Algorithme de Prim" darkMode={darkMode} disabled={directed} onClick={() => { if (!directed) { closeKruskal(); closeKruskalUF(); setMenuOpen(false); setPrimPickMode(true); } }} />
    <MenuItem label="Algorithme de Kruskal" darkMode={darkMode} disabled={directed} onClick={() => { if (!directed) { closePrim(); closeKruskalUF(); setMenuOpen(false); frozenElements_kruskal_ref.current = elements; setShowKruskal(true); } }} />
    <MenuItem label="Algorithme de Kruskal avec Union-Find" darkMode={darkMode} disabled={directed} onClick={() => { if (!directed) { closePrim(); closeKruskal(); setMenuOpen(false); setShowKruskalUF(true); } }} />
    <div style={{ height: "1px", background: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", margin: "6px 0" }} />
    <MenuItem label="Definitions" darkMode={darkMode} onClick={() => { setShowDefs(true); setMenuOpen(false); }} />
    <MenuItem label="Références & Contact" darkMode={darkMode} onClick={() => { setShowAbout(true); setMenuOpen(false); }} />
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

 <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"0 16px", height:"28px", background: darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)", borderBottom:`1px solid ${T.borderFaint}`, fontSize:"11px", color: primPickMode || selectMode ? "#f59e0b" : analyzeMode ? "#a78bfa" : T.textMuted, flexShrink:0, overflow:"hidden" }}>
   <span style={{ width:"5px", height:"5px", borderRadius:"50%", background: primPickMode || selectMode ? "#f59e0b" : analyzeMode ? "#a78bfa" : T.textFaint, flexShrink:0 }} />
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
         return totalW !== null && totalW > 0 ? (
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
 {showPrim && primStartNode && <PrimPanel elements={elements} startNodeId={primStartNode} onClose={closePrim} onStep={(s) => setPrimStep(s)} />}
 {showKruskal && <KruskalVisPanel elements={elements} onClose={closeKruskal} onStep={(s) => setKruskalStep(s)} />}
 {showKruskalUF && <KruskalPanel elements={elements} onClose={closeKruskalUF} onStep={(s) => setKruskalUFStep(s)} />}

 {showRepr && <RepresentationPanel elements={elements} directed={directed} darkMode={darkMode} onClose={() => setShowRepr(false)} initialTab={showRepr} />}
 {showClosure && directed && <ClosurePanel elements={elements} onClose={() => setShowClosure(false)} />}
 {showRenameModal && selectedNode && <RenameModal node={selectedNode} onConfirm={handleRenameConfirm} onCancel={() => { setShowRenameModal(false); setSelectedNode(null); }} />}
 {showWeightModal && selectedEdge && <WeightModal edge={selectedEdge} onConfirm={handleWeightConfirm} onCancel={() => { setShowWeightModal(false); setSelectedEdge(null); }} />}
 </div>
 );
}