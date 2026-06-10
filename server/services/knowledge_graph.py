"""
Personal Wealth Knowledge Graph — in-memory property graph with reasoning queries.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from services.wealth_engine import _f


class KnowledgeGraph:
    def __init__(self) -> None:
        self.nodes: Dict[str, Dict[str, Any]] = {}
        self.edges: List[Dict[str, Any]] = []

    def upsert_node(self, node_id: str, node_type: str, label: str, properties: Optional[Dict[str, Any]] = None, source: str = "engine") -> None:
        self.nodes[node_id] = {
            "id": node_id,
            "type": node_type,
            "label": label,
            "properties": properties or {},
            "source": source,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    def add_edge(self, src: str, dst: str, edge_type: str, weight: float = 1.0, properties: Optional[Dict[str, Any]] = None) -> None:
        self.edges = [e for e in self.edges if not (e["src"] == src and e["dst"] == dst and e["type"] == edge_type)]
        self.edges.append({
            "src": src,
            "dst": dst,
            "type": edge_type,
            "weight": weight,
            "properties": properties or {},
        })

    def sync_from_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        user_id = payload.get("user_id", "default")
        metrics = payload.get("wealth_metrics", {})
        inputs = payload.get("inputs", {})
        recs = payload.get("recommendations", {}).get("recommendations", [])
        simulation = payload.get("simulation", {}).get("scenarios", [])
        startups = payload.get("startup_opportunities", {}).get("ideas", [])
        skills = payload.get("career_profile", {}).get("skills", [])

        self.upsert_node(f"user:{user_id}", "User", "User", {"risk_tolerance": payload.get("risk_tolerance")})
        self.upsert_node("goal:10000000", "Goal", "₹1Cr", {"target_inr": 10_000_000})
        self.upsert_node("goal:50000000", "Goal", "₹5Cr", {"target_inr": 50_000_000})
        self.upsert_node("goal:100000000", "Goal", "₹10Cr", {"target_inr": 100_000_000})
        self.add_edge(f"user:{user_id}", "goal:100000000", "TARGETS", 1.0)

        for field, ntype in [
            ("emergency_fund_inr", "Asset"),
            ("equity_investments_inr", "Investment"),
            ("mutual_funds_inr", "Investment"),
        ]:
            val = _f(inputs.get(field) or inputs.get(field.replace("_inr", "")))
            if val > 0:
                nid = f"{ntype.lower()}:{field}"
                self.upsert_node(nid, ntype, field, {"value_inr": val})
                self.add_edge(f"user:{user_id}", nid, "OWNS", val)
                self.add_edge(nid, "goal:100000000", "COMPOUNDS", 0.1)

        for s in skills:
            name = s.get("name", "skill")
            sid = f"skill:{name.lower().replace(' ', '_')}"
            self.upsert_node(sid, "Skill", name, s)
            self.add_edge(f"user:{user_id}", sid, "HAS_SKILL", _f(s.get("proficiency", 3)))

        self.edges = [e for e in self.edges if e["type"] != "ACCELERATES" or not e["dst"].startswith("goal:")]

        for r in recs:
            aid = f"action:{r['action_id']}"
            self.upsert_node(aid, "Action", r["action_label"], r)
            h60 = r.get("horizons", {}).get("60", {})
            self.add_edge(
                aid,
                "goal:100000000",
                "ACCELERATES",
                _f(r.get("composite_score")),
                {
                    "delta_nw_inr": _f(h60.get("expected_nw_delta_inr")),
                    "p_success": _f(r.get("confidence_pct")) / 100,
                },
            )

        for sc in simulation[:3]:
            sid = f"scenario:{sc['id']}"
            self.upsert_node(sid, "Scenario", sc.get("name", sc["id"]), sc)
            cp60 = sc.get("bands", {}).get("base", {}).get("checkpoints", {}).get("60", {})
            self.add_edge(sid, "goal:100000000", "ACCELERATES", _f(sc.get("path_score")), {"net_worth_60": cp60.get("net_worth_inr")})

        for idea in startups[:3]:
            iid = f"startup_idea:{idea['id']}"
            self.upsert_node(iid, "StartupIdea", idea["title"], idea)
            for s in skills[:2]:
                sk = f"skill:{s.get('name', '').lower().replace(' ', '_')}"
                if sk in self.nodes:
                    self.add_edge(sk, iid, "ENABLES", _f(idea.get("skill_fit")))

        return self.snapshot()

    def snapshot(self) -> Dict[str, Any]:
        return {
            "nodes": list(self.nodes.values()),
            "edges": self.edges,
            "node_count": len(self.nodes),
            "edge_count": len(self.edges),
        }

    def query_fastest_to_goal(self, goal_target_inr: float = 100_000_000, horizon_months: int = 60) -> Dict[str, Any]:
        goal_id = f"goal:{int(goal_target_inr)}"
        if goal_id not in self.nodes:
            goal_id = "goal:100000000"

        actions: List[Dict[str, Any]] = []
        for e in self.edges:
            if e["type"] == "ACCELERATES" and e["dst"] == goal_id and e["src"].startswith("action:"):
                node = self.nodes.get(e["src"], {})
                props = e.get("properties", {})
                score = (
                    0.45 * min(_f(props.get("delta_nw_inr")) / 5_000_000, 1)
                    + 0.35 * _f(props.get("p_success"))
                    + 0.20 * _f(e.get("weight")) / 100
                )
                actions.append({
                    "id": e["src"],
                    "label": node.get("label", e["src"]),
                    "score": round(score * 100, 1),
                    "delta_nw_inr": props.get("delta_nw_inr"),
                    "p_success": props.get("p_success"),
                    "node": node,
                })

        actions.sort(key=lambda x: x["score"], reverse=True)
        top = actions[0] if actions else None
        progress = 0.0
        nw = 0.0
        for n in self.nodes.values():
            if n["type"] in ("Asset", "Investment"):
                nw += _f(n.get("properties", {}).get("value_inr"))

        if goal_target_inr > 0:
            progress = min(100, nw / goal_target_inr * 100)

        return {
            "query": "fastest_to_goal",
            "goal": {"id": goal_id, "label": self.nodes.get(goal_id, {}).get("label", "Goal"), "current_progress_pct": round(progress, 1)},
            "answer": {
                "top_action": top,
                "ranked_actions": actions,
                "reasoning_paths": [
                    {
                        "summary": f"{top['label']} is the top-ranked action toward {self.nodes.get(goal_id, {}).get('label', 'goal')}." if top else "No actions materialized.",
                        "nodes": [f"user:default", top["id"] if top else None, goal_id],
                        "edges": ["TARGETS", "ACCELERATES"],
                    }
                ] if top else [],
                "gaps": [],
                "blockers": [],
            },
            "horizon_months": horizon_months,
            "disclaimer": "Graph reasoning uses engine projections; not advice.",
        }


# Module-level singleton for stateless v1 (per-request rebuild from payload)
_graph = KnowledgeGraph()


def sync_graph(payload: Dict[str, Any]) -> Dict[str, Any]:
    global _graph
    _graph = KnowledgeGraph()
    return _graph.sync_from_payload(payload)


def query_graph(template: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    params = params or {}
    if template == "fastest_to_goal":
        return _graph.query_fastest_to_goal(
            _f(params.get("goal_target_inr"), 100_000_000),
            int(params.get("horizon_months", 60)),
        )
    return {"error": f"Unknown template: {template}"}


def get_snapshot() -> Dict[str, Any]:
    return _graph.snapshot()
