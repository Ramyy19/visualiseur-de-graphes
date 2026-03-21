import { useState, useRef, useEffect } from "react";
import CytoscapeComponent from "react-cytoscapejs";

let nodeCounter = 0;
const newNodeId = () => `v${++nodeCounter}`;
const newEdgeId = (s, t) => `e_${s}_${t}_${Date.now()}`;

function computeStats(elements, directed) {
  const nodes = elements.filter((el) => !el.data.source);
  const edges = elements.filter((el) => !!el.data.source);
  const degreeMap = {};
  nodes.forEach((n) => {
    degreeMap[n.data.id] = { in: 0, out: 0, label: n.data.label };
  });
  edges.forEach((e) => {
    const { source, target } = e.data;
    if (degreeMap[source]) degreeMap[source].out += 1;
    if (degreeMap[target]) degreeMap[target].in += 1;
  });
  return { order: nodes.length, size: edges.length, degrees: degreeMap };
}

function buildStylesheet(directed) {
  return [
    {
      selector: "node",
      style: {
        "background-color": "#ffffff", "border-width": 2, "border-color": "#555555",
        color: "#111111", label: "data(label)", "text-valign": "center", "text-halign": "center",
        "font-size": "13px", "font-weight": "bold", width: 44, height: 44,
      },
    },
    {
      selector: "node.highlighted",
      style: { "background-color": "#d0d0d0", "border-color": "#888888", "border-width": 3 },
    },
    {
      selector: "edge",
      style: {
        width: 2, "line-color": "#64748b", "target-arrow-color": "#64748b",
        "target-arrow-shape": directed ? "triangle" : "none", "curve-style": "bezier",
        label: "data(weightLabel)", color: "#94a3b8", "font-size": "11px",
        "text-background-color": "#1a1a1a", "text-background-opacity": 1, "text-background-padding": "3px",
      },
    },
    { selector: "edge:selected", style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 3 } },
  ];
}

const DEFINITIONS = [
  { term: "Graphe simple", def: "Un graphe où il existe au plus une arête entre deux sommets, et pas de boucle (arête d'un sommet vers lui-même).", example: "Ex : un réseau routier où deux villes sont reliées par une seule route." },
  { term: "Multigraphe", def: "Un graphe où plusieurs arêtes peuvent relier les mêmes deux sommets (arêtes parallèles).", example: "Ex : deux villes reliées par une autoroute ET une route nationale." },
  { term: "Hypergraphe", def: "Une généralisation du graphe où une arête (appelée hyperarête) peut relier plus de deux sommets à la fois.", example: "Ex : une hyperarête {A, B, C} relie trois sommets simultanément." },
  { term: "Graphe complet", def: "Un graphe simple où chaque paire de sommets est reliée par exactement une arête. Un graphe à n sommets a n(n-1)/2 arêtes.", example: "Ex : K4 a 4 sommets et 6 arêtes — chaque sommet est connecté à tous les autres." },
  { term: "Graphe partiel", def: "Un graphe obtenu à partir d'un graphe G en supprimant certaines arêtes (on garde tous les sommets).", example: "Ex : retirer quelques routes d'une carte sans retirer de villes." },
  { term: "Sous-graphe", def: "Un graphe obtenu à partir de G en supprimant certains sommets et toutes les arêtes qui leur sont incidentes.", example: "Ex : zoomer sur une région de la carte en retirant les villes hors de cette région." },
  { term: "Chemin", def: "Une suite de sommets où chaque sommet consécutif est relié par une arête. Les sommets et arêtes peuvent se répéter.", example: "Ex : A → B → C → B est un chemin valide." },
  { term: "Chemin simple", def: "Un chemin où chaque arête est empruntée au plus une fois (les arêtes ne se répètent pas, mais les sommets peuvent).", example: "Ex : A → B → C → D où aucune arête n'est utilisée deux fois." },
  { term: "Chemin élémentaire", def: "Un chemin où chaque sommet est visité au plus une fois. Tout chemin élémentaire est aussi simple.", example: "Ex : A → B → C → D sans repasser par aucun sommet." },
  { term: "Circuit", def: "Un chemin qui commence et se termine au même sommet. Les répétitions de sommets et d'arêtes sont autorisées.", example: "Ex : A → B → C → A est un circuit." },
  { term: "Circuit élémentaire", def: "Un circuit où chaque sommet (sauf le premier/dernier) est visité exactement une fois.", example: "Ex : A → B → C → A sans repasser par B ou C." },
];

function DefsPanel({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: "#1a1a1a", border: "1px solid #3a3a3a", borderRadius: "12px", width: "min(720px, 95vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "16px", color: "#ffffff" }}>Definitions</div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>Concepts fondamentaux de la theorie des graphes</div>
          </div>
          <button onClick={onClose} style={{ background: "#2a2a2a", border: "1px solid #3a3a3a", borderRadius: "6px", color: "#94a3b8", cursor: "pointer", padding: "6px 10px", fontSize: "14px" }}>x</button>
        </div>
        <div style={{ overflowY: "auto", padding: "16px 20px", display: "grid", gap: "10px" }}>
          {DEFINITIONS.map((d) => (
            <div key={d.term} style={{ background: "#222222", border: "1px solid #333333", borderRadius: "8px", padding: "12px 16px", borderLeft: "3px solid #38bdf8" }}>
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

function WeightModal({ edge, onConfirm, onCancel }) {
  const [val, setVal] = useState(edge?.data("weight") ?? "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "12px", padding: "24px", width: "280px" }}>
        <div style={{ fontWeight: "bold", marginBottom: "4px", color: "white" }}>Poids</div>
        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "16px" }}>{edge?.data("source")} to {edge?.data("target")}</div>
        <input
          autoFocus type="number"
          style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: "6px", padding: "8px 12px", color: "white", fontFamily: "monospace", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box", outline: "none" }}
          value={val} placeholder="Ex: 5"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConfirm(val)}
        />
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => onConfirm(val)} style={{ flex: 1, padding: "8px", background: "#0ea5e9", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontWeight: "bold" }}>OK</button>
          <button onClick={onCancel} style={{ flex: 1, padding: "8px", background: "#334155", border: "none", borderRadius: "6px", color: "white", cursor: "pointer" }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function btn(active, danger) {
  return {
    display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px",
    borderRadius: "8px", fontSize: "13px", fontWeight: "500", cursor: "pointer",
    border: active ? (danger ? "1px solid #f87171" : "1px solid #38bdf8") : "1px solid #3a3a3a",
    background: active ? (danger ? "rgba(239,68,68,0.15)" : "rgba(56,189,248,0.15)") : "#2a2a2a",
    color: active ? (danger ? "#fca5a5" : "#7dd3fc") : "#94a3b8",
  };
}

export default function GraphVisualizer() {
  const cyRef = useRef(null);
  const [elements, setElements] = useState([]);
  const [directed, setDirected] = useState(false);
  const [pendingSource, setPendingSource] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showDefs, setShowDefs] = useState(false);

  const pendingSourceRef = useRef(null);
  useEffect(() => { pendingSourceRef.current = pendingSource; }, [pendingSource]);

  // Echap pour annuler la selection
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (cyRef.current) cyRef.current.nodes(".highlighted").removeClass("highlighted");
        setPendingSource(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cable les evenements Cytoscape une seule fois
  useEffect(() => {
    const trySetup = setInterval(() => {
      const cy = cyRef.current;
      if (!cy) return;
      clearInterval(trySetup);

      // Clic gauche canvas vide → nouveau sommet
      cy.on("tap", (e) => {
        if (e.target !== cy) return;
        const { x, y } = e.position;
        const id = newNodeId();
        setElements((prev) => [...prev, { data: { id, label: id }, position: { x, y } }]);
      });

      // Clic droit sommet → supprimer
      cy.on("cxttap", "node", (e) => {
        const nodeId = e.target.id();
        cy.nodes(".highlighted").removeClass("highlighted");
        setPendingSource(null);
        setElements((prev) => prev.filter(
          (el) => el.data.id !== nodeId && el.data.source !== nodeId && el.data.target !== nodeId
        ));
      });

      // Clic droit arete/arc → supprimer
      cy.on("cxttap", "edge", (e) => {
        const edgeId = e.target.id();
        setElements((prev) => prev.filter((el) => el.data.id !== edgeId));
      });

      // Clic gauche sommet → selectionner source / creer arete / enchainer
      cy.on("tap", "node", (e) => {
        const nodeId = e.target.id();
        const src = pendingSourceRef.current;

        if (!src) {
          // Aucune source : selectionner ce sommet
          setPendingSource(nodeId);
          cy.getElementById(nodeId).addClass("highlighted");
        } else if (src === nodeId) {
          // Re-clic sur la source : deselectioner
          cy.getElementById(nodeId).removeClass("highlighted");
          setPendingSource(null);
        } else {
          // Clic sur une cible : creer l arete/arc
          const edgeId = newEdgeId(src, nodeId);
          setElements((prev) => [...prev, { data: { id: edgeId, source: src, target: nodeId, weight: null, weightLabel: "" } }]);
          cy.getElementById(src).removeClass("highlighted");
          // Ce sommet devient la nouvelle source pour enchainer
          setPendingSource(nodeId);
          cy.getElementById(nodeId).addClass("highlighted");
        }
      });

      // Clic gauche arete/arc → modifier le poids
      cy.on("tap", "edge", (e) => {
        setSelectedEdge(e.target);
        setShowWeightModal(true);
      });

    }, 100);
    return () => clearInterval(trySetup);
  }, []);

  // Recalcule nodeCounter apres suppression partielle
  useEffect(() => {
    const ids = elements
      .filter((el) => !el.data.source)
      .map((el) => parseInt(el.data.id.replace("v", ""), 10))
      .filter((n) => !isNaN(n));
    nodeCounter = ids.length > 0 ? Math.max(...ids) : 0;
  }, [elements]);

  const resetGraph = () => {
    if (cyRef.current) cyRef.current.nodes(".highlighted").removeClass("highlighted");
    setElements([]);
    setPendingSource(null);
    nodeCounter = 0;
  };

  const handleWeightConfirm = (val) => {
    const numVal = val === "" ? null : Number(val);
    const edgeId = selectedEdge?.id();
    setElements((prev) => prev.map((el) =>
      el.data.id === edgeId
        ? { ...el, data: { ...el.data, weight: numVal, weightLabel: numVal !== null ? String(numVal) : "" } }
        : el
    ));
    setShowWeightModal(false);
    setSelectedEdge(null);
  };

  const stats = computeStats(elements, directed);
  const edgeWord = directed ? "arc" : "arete";
  const hintText = pendingSource
    ? `Source : ${pendingSource} — clique sur un autre sommet pour creer un ${edgeWord} | Echap pour annuler`
    : `Clic gauche sur le canvas = nouveau sommet  |  Clic gauche sommet = creer un ${edgeWord}  |  Clic droit = supprimer`;

  const S = {
    app: { display: "flex", height: "100vh", width: "100vw", background: "#1a1a1a", color: "#e2e8f0", fontFamily: "monospace", overflow: "hidden" },
    sidebar: { width: "240px", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #2a2a2a", background: "#141414", overflowY: "auto" },
    sidebarHeader: { padding: "16px", borderBottom: "1px solid #2a2a2a", fontSize: "14px", fontWeight: "bold", color: "#38bdf8" },
    sidebarSection: { padding: "12px 16px", borderBottom: "1px solid #2a2a2a" },
    sectionTitle: { fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" },
    statCard: { background: "#2a2a2a", border: "1px solid #3a3a3a", borderRadius: "8px", padding: "10px 14px", marginBottom: "8px" },
    statLabel: { fontSize: "10px", color: "#64748b", marginBottom: "4px" },
    statValue: { fontSize: "28px", fontWeight: "bold", color: "#38bdf8" },
    degreeRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2a2a", fontSize: "13px" },
    badge: { background: "#2a2a2a", border: "1px solid #1e40af", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "#38bdf8" },
    main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
    toolbar: { height: "52px", display: "flex", alignItems: "center", gap: "8px", padding: "0 16px", borderBottom: "1px solid #2a2a2a", background: "#141414", flexShrink: 0 },
    hintBar: { height: "32px", display: "flex", alignItems: "center", padding: "0 16px", background: "#111111", borderBottom: "1px solid #222222", fontSize: "12px", color: "#64748b", flexShrink: 0 },
    canvas: { flex: 1, position: "relative", background: "#1a1a1a" },
    emptyMsg: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#2a2a2a", pointerEvents: "none", fontSize: "14px" },
  };

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={S.sidebarHeader}>GraphViz MVP</div>
        <div style={S.sidebarSection}>
          <div style={S.sectionTitle}>Statistiques</div>
          <div style={S.statCard}>
            <div style={S.statLabel}>Ordre (sommets)</div>
            <div style={S.statValue}>{stats.order}</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statLabel}>Taille ({directed ? "arcs" : "aretes"})</div>
            <div style={S.statValue}>{stats.size}</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statLabel}>Type</div>
            <div style={{ color: "#38bdf8", fontWeight: "bold" }}>{directed ? "Oriente (Digraphe)" : "Non-oriente"}</div>
          </div>
        </div>
        <div style={{ padding: "12px 16px" }}>
          <div style={S.sectionTitle}>
            Degres {directed && <span style={{ color: "#475569" }}>(in / out)</span>}
          </div>
          {stats.order === 0
            ? <div style={{ color: "#475569", fontSize: "12px", fontStyle: "italic" }}>Aucun sommet</div>
            : Object.entries(stats.degrees).map(([id, deg]) => (
              <div key={id} style={S.degreeRow}>
                <div style={S.badge}>{deg.label}</div>
                {directed
                  ? <div style={{ fontSize: "12px" }}>
                      <span style={{ color: "#34d399" }}>in:{deg.in}</span>
                      {" / "}
                      <span style={{ color: "#f87171" }}>out:{deg.out}</span>
                    </div>
                  : <span style={{ color: "#38bdf8", fontWeight: "bold" }}>{deg.in + deg.out}</span>
                }
              </div>
            ))
          }
        </div>
      </div>

      <div style={S.main}>
        <div style={S.toolbar}>
          <button style={btn(directed, false)} onClick={() => setDirected((d) => !d)}>
            {directed ? "Oriente" : "Non-oriente"}
          </button>
          <div style={{ flex: 1 }} />
          <button style={btn(false, false)} onClick={() => setShowDefs(true)}>Definitions</button>
          <button style={btn(false, true)} onClick={resetGraph}>Reset</button>
        </div>

        <div style={S.hintBar}>{hintText}</div>

        <div style={S.canvas}>
          {elements.length === 0 && (
            <div style={S.emptyMsg}>
              <div style={{ fontSize: "40px", marginBottom: "8px" }}>o</div>
              <div>Clique sur le canvas pour ajouter un sommet</div>
            </div>
          )}
          <CytoscapeComponent
            elements={[...elements]}
            stylesheet={buildStylesheet(directed)}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            cy={(cy) => { cyRef.current = cy; }}
            layout={{ name: "preset" }}
            userZoomingEnabled={true}
            userPanningEnabled={true}
            boxSelectionEnabled={false}
          />
        </div>
      </div>

      {showDefs && <DefsPanel onClose={() => setShowDefs(false)} />}

      {showWeightModal && selectedEdge && (
        <WeightModal
          edge={selectedEdge}
          onConfirm={handleWeightConfirm}
          onCancel={() => { setShowWeightModal(false); setSelectedEdge(null); }}
        />
      )}
    </div>
  );
}
