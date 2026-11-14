#!/usr/bin/env python3
"""RP-01 product-tree validator / renderer / negative-control self-test.

Stdlib only. Run with the project venv:
  ./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py validate
  ./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py selftest
  ./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py render

Writes only inside the project (F:). Negative controls mutate in-memory copies,
so no scratch files are created.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
EVID = ROOT / "docs" / "planning" / "evidence"
REPORT = ROOT / "docs" / "planning" / "reports" / "RP-01-vehicle-product-tree.md"

TREE_FILES = [
    "RP-01-tree-core.json",
    "RP-01-tree-chassis.json",
    "RP-01-tree-powertrain.json",
    "RP-01-tree-body-systems.json",
]
FUNC_FILE = "RP-01-function-tree.json"
SRC_FILE = "RP-01-sources.json"

BEGIN = "<!-- RP01:PBS-TREE:BEGIN -->"
END = "<!-- RP01:PBS-TREE:END -->"

KIND_PREFIX = {
    "vehicle": "VEH-",
    "system": "SYS-",
    "subsystem": "SUB-",
    "assembly": "ASSY-",
    "part": "PART-",
    "family": "FAM-",
    "datum": "DAT-",
    "ref": "REF-",
}
BODY = {"BOF", "UNI", "ANY"}
POWER = {"ICE", "BEV", "HEV", "ANY"}
OPTIONALITY = {"required", "optional", "alternative", "catalog"}
EVIDENCE = {"EVIDENCE", "ASSUMPTION", "OPEN", "OUT_OF_SCOPE"}
GEOM = {"SOURCED", "NEEDS_MEASUREMENT", "DEMO_ASSUMPTION", "DEFERRED", "NOT_APPLICABLE"}
LEVEL = {"VISUAL", "GEOMETRY", "KINEMATIC", "DYNAMIC", "NONE"}
PART_CLASS = {
    "bearing", "seal", "fastener", "spring", "damper", "linkage", "housing",
    "rotating", "sliding", "electronic", "fluid", "trim", "glass", "structure",
    "friction", "energy", "sensor", "actuator", "belt", "gear", "other",
}
FORBIDDEN_NUM = re.compile(r"^(mass|massKg|inertia|tolerance|torqueNm|preloadN|rateN)", re.I)


class Ctx:
    def __init__(self):
        self.fail: list[tuple[str, str]] = []
        self.info: dict = {}

    def bad(self, rule: str, msg: str):
        self.fail.append((rule, msg))

    def has(self, rule: str) -> bool:
        return any(r == rule for r, _ in self.fail)


def load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_all():
    """Return (trees, funcs, sources, parse_errors)."""
    trees, funcs, sources, errs = [], None, None, []
    for name in TREE_FILES:
        p = EVID / name
        if not p.exists():
            errs.append(f"missing tree file: {name}")
            continue
        try:
            trees.append(load_json(p))
        except Exception as exc:  # noqa: BLE001
            errs.append(f"{name}: {exc}")
    for name, slot in ((FUNC_FILE, "func"), (SRC_FILE, "src")):
        p = EVID / name
        if not p.exists():
            errs.append(f"missing file: {name}")
            continue
        try:
            data = load_json(p)
            if slot == "func":
                funcs = data
            else:
                sources = data
        except Exception as exc:  # noqa: BLE001
            errs.append(f"{name}: {exc}")
    return trees, funcs, sources, errs


def merge(trees):
    nodes, configs, groups, nonphys, arch = [], [], [], [], []
    for t in trees:
        nodes.extend(t.get("nodes", []))
        configs.extend(t.get("configurations", []))
        groups.extend(t.get("choiceGroups", []))
        nonphys.extend(t.get("nonPhysicalViews", []))
        arch.extend(t.get("architectures", []))
    return nodes, configs, groups, nonphys, arch


def by_id(nodes):
    return {n["id"]: n for n in nodes if "id" in n}


def children_map(nodes):
    kids: dict[str, list] = {}
    for n in nodes:
        kids.setdefault(n.get("parent"), []).append(n)
    return kids


def canonical_system(nid, idx):
    """Walk parents until a SYS- node; return its id or None."""
    seen = set()
    cur = idx.get(nid)
    while cur is not None and cur["id"] not in seen:
        seen.add(cur["id"])
        if cur.get("kind") == "system":
            return cur["id"]
        cur = idx.get(cur.get("parent"))
    return None


def depth_of(nid, idx):
    d, seen = 0, set()
    cur = idx.get(nid)
    while cur is not None and cur.get("parent") and cur["id"] not in seen:
        seen.add(cur["id"])
        d += 1
        cur = idx.get(cur["parent"])
    return d


def subtree(nid, kids):
    out, stack = [], list(kids.get(nid, []))
    while stack:
        n = stack.pop()
        out.append(n)
        stack.extend(kids.get(n["id"], []))
    return out


# --------------------------------------------------------------------------- #
# rules
# --------------------------------------------------------------------------- #
def r02_fields(c, nodes):
    base = {"id", "parent", "kind", "name"}
    for n in nodes:
        miss = base - set(n)
        if miss:
            c.bad("R02", f"{n.get('id','?')}: missing fields {sorted(miss)}")
            continue
        if n["kind"] in ("part", "assembly", "subsystem", "family", "datum"):
            for f in ("body", "power", "optionality", "evidence"):
                if f not in n:
                    c.bad("R02", f"{n['id']}: missing field '{f}'")
        if n["kind"] == "part" and "geomBasis" not in n:
            c.bad("R02", f"{n['id']}: part without geomBasis")
        if n["kind"] == "ref" and "refId" not in n:
            c.bad("R02", f"{n['id']}: ref without refId")


def r03_unique(c, nodes):
    seen = {}
    for n in nodes:
        nid = n.get("id")
        if nid in seen:
            c.bad("R03", f"duplicate id {nid}")
        seen[nid] = n


def r04_prefix(c, nodes):
    for n in nodes:
        want = KIND_PREFIX.get(n.get("kind"))
        if want and not str(n.get("id", "")).startswith(want):
            c.bad("R04", f"{n.get('id')}: kind={n.get('kind')} expects prefix {want}")


def r05_parents(c, nodes, idx, kids):
    roots = [n for n in nodes if n.get("parent") is None]
    if len(roots) != 1:
        c.bad("R05", f"expected exactly 1 root, found {len(roots)}: {[r.get('id') for r in roots]}")
    elif roots[0].get("kind") != "vehicle":
        c.bad("R05", f"root {roots[0]['id']} is not kind=vehicle")
    for n in nodes:
        p = n.get("parent")
        if p is not None and p not in idx:
            c.bad("R05", f"{n.get('id')}: dangling parent {p}")
    for n in nodes:
        if n.get("kind") in ("part", "datum") and kids.get(n["id"]):
            c.bad("R05", f"{n['id']}: kind={n['kind']} must be a leaf, has children")


def r06_cycles(c, nodes, idx):
    for n in nodes:
        seen, cur = set(), n
        while cur is not None:
            if cur["id"] in seen:
                c.bad("R06", f"cycle at {n['id']}")
                break
            seen.add(cur["id"])
            cur = idx.get(cur.get("parent"))


def r07_system_segment(c, nodes, idx):
    for n in nodes:
        nid, kind = n.get("id", ""), n.get("kind")
        if kind not in ("subsystem", "assembly", "part", "family", "datum"):
            continue
        m = re.match(r"^(?:SUB|ASSY|PART|FAM|DAT)-(\d+)-", nid)
        if not m:
            c.bad("R07", f"{nid}: malformed id, expected <PREFIX>-<sys>-<seq>")
            continue
        seg = "SYS-" + m.group(1)
        if seg not in idx:
            c.bad("R07", f"{nid}: system segment {seg} does not exist")
            continue
        real = canonical_system(nid, idx)
        if real != seg:
            c.bad("R07", f"{nid}: id says {seg} but parent chain leads to {real}")


def r08_refs(c, nodes, idx, kids):
    for n in nodes:
        if n.get("kind") != "ref":
            continue
        tgt = idx.get(n.get("refId"))
        if tgt is None:
            c.bad("R08", f"{n['id']}: refId {n.get('refId')} not found")
        elif tgt.get("kind") == "ref":
            c.bad("R08", f"{n['id']}: ref points at another ref ({tgt['id']})")
        if kids.get(n["id"]):
            c.bad("R08", f"{n['id']}: ref node must be a leaf")


def r09_dup_identity(c, nodes):
    seen = {}
    for n in nodes:
        if n.get("kind") == "ref" or not n.get("nameEn"):
            continue
        key = (canonical_system(n["id"], by_id(nodes)) or "?", n["nameEn"].strip().lower())
        if key in seen:
            c.bad("R09", f"{n['id']} duplicates physical identity of {seen[key]} ({n['nameEn']})")
        seen[key] = n["id"]


def r10_no_fabrication(c, nodes):
    def walk(obj, path, nid):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if FORBIDDEN_NUM.match(str(k)) and isinstance(v, (int, float)):
                    c.bad("R10", f"{nid}: fabricated numeric '{path}{k}={v}'")
                walk(v, f"{path}{k}.", nid)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, f"{path}{i}.", nid)
    for n in nodes:
        walk(n, "", n.get("id", "?"))


def r11_enums(c, nodes):
    for n in nodes:
        nid = n.get("id", "?")
        for field, allowed in (("body", BODY), ("power", POWER)):
            v = n.get(field)
            if v is None:
                continue
            if not isinstance(v, list) or not v:
                c.bad("R11", f"{nid}: {field} must be a non-empty list")
                continue
            if not set(v) <= allowed:
                c.bad("R11", f"{nid}: {field} has invalid value {v}")
            if "ANY" in v and len(v) > 1:
                c.bad("R11", f"{nid}: {field} mixes ANY with specific values {v}")
        for field, allowed in (("optionality", OPTIONALITY), ("evidence", EVIDENCE),
                               ("geomBasis", GEOM), ("targetLevel", LEVEL),
                               ("partClass", PART_CLASS)):
            v = n.get(field)
            if v is not None and v not in allowed:
                c.bad("R11", f"{nid}: {field}={v!r} not in allowed set")


def r12_evidence_sources(c, nodes, sources):
    reg = {s["id"]: s for s in (sources or {}).get("sources", [])}
    for s in reg.values():
        kind = s.get("kind", "external")
        for f in ("id", "kind", "title", "publisher", "accessed", "supports"):
            if not s.get(f):
                c.bad("R12", f"source {s.get('id','?')}: missing '{f}'")
        if kind == "external":
            if not str(s.get("url", "")).startswith("http"):
                c.bad("R12", f"source {s.get('id')}: external source needs an http(s) url")
        elif kind in ("project-internal", "local-measurement"):
            p = s.get("path")
            if not p:
                c.bad("R12", f"source {s.get('id')}: {kind} needs a project-relative path")
            elif not (ROOT / p).exists():
                c.bad("R12", f"source {s.get('id')}: path does not exist: {p}")
            if kind == "local-measurement" and not s.get("locator"):
                c.bad("R12", f"source {s.get('id')}: local-measurement needs file:line locator")
        else:
            c.bad("R12", f"source {s.get('id')}: unknown kind {kind}")
        if s.get("status") in ("SNIPPET_ONLY", "UNVERIFIED") and s.get("usedForClaim"):
            c.bad("R12", f"source {s['id']}: unverified source used to support a claim")
        if not s.get("doesNotSupport"):
            c.bad("R12", f"source {s.get('id')}: missing doesNotSupport scope limit")
    for n in nodes:
        if n.get("evidence") == "EVIDENCE":
            ids = n.get("sources") or []
            if not ids:
                c.bad("R12", f"{n['id']}: evidence=EVIDENCE without sources")
        for sid in n.get("sources") or []:
            if sid not in reg:
                c.bad("R12", f"{n['id']}: unknown source {sid}")


def r13_config_consistency(c, nodes, configs, groups, idx):
    if not configs:
        c.bad("R13", "no configurations declared")
    for cfg in configs:
        for f in ("id", "body", "power", "name"):
            if not cfg.get(f):
                c.bad("R13", f"config {cfg.get('id','?')}: missing '{f}'")
        if cfg.get("body") not in BODY - {"ANY"}:
            c.bad("R13", f"config {cfg.get('id')}: body must be a concrete architecture")
        if cfg.get("power") not in POWER - {"ANY"}:
            c.bad("R13", f"config {cfg.get('id')}: power must be a concrete powertrain")
    for n in nodes:
        if n.get("kind") == "ref":
            continue
        if n.get("optionality") == "alternative" and not n.get("choiceGroup"):
            c.bad("R13", f"{n['id']}: alternative without choiceGroup")
    gidx = {g["id"]: g for g in groups}
    for n in nodes:
        cg = n.get("choiceGroup")
        if cg and cg not in gidx:
            c.bad("R13", f"{n['id']}: unknown choiceGroup {cg}")
    for cfg in configs:
        for g in groups:
            if not g.get("required"):
                continue
            members = [n for n in nodes if n.get("choiceGroup") == g["id"] and n.get("kind") != "ref"]
            ok = [n for n in members
                  if (cfg["body"] in n.get("body", []) or "ANY" in n.get("body", []))
                  and (cfg["power"] in n.get("power", []) or "ANY" in n.get("power", []))]
            chosen = [n for n in ok if n["id"] in (cfg.get("selections") or [])]
            if len(chosen) != 1:
                c.bad("R14", f"config {cfg['id']}: required group {g['id']} selects {len(chosen)} members (need exactly 1)")
    c.info["configurations"] = [cfg.get("id") for cfg in configs]


def _class_count(sub, cls):
    return sum(1 for n in sub if n.get("partClass") == cls and n.get("kind") == "part")


def r15_r16_deep_dive(c, nodes, idx, kids):
    targets = [
        ("R15", "wheel-end", ["ASSY-30-001"], {"bearing", "seal", "fastener"}),
        ("R16", "engine", ["ASSY-50-001"], {"bearing", "seal", "fastener", "linkage"}),
    ]
    for rule, label, roots, need in targets:
        found = [r for r in roots if r in idx]
        if not found:
            c.bad(rule, f"{label}: anchor assembly {roots} not found")
            continue
        for rid in found:
            sub = subtree(rid, kids)
            maxd = max((depth_of(n["id"], idx) - depth_of(rid, idx) for n in sub), default=0)
            if maxd < 3:
                c.bad(rule, f"{label} {rid}: only {maxd} levels below assembly, need >=3")
            missing = [cls for cls in need if _class_count(sub, cls) == 0]
            if missing:
                c.bad(rule, f"{label} {rid}: no part with partClass in {missing}")
            c.info[f"{label}_depth_below_assembly"] = maxd
            c.info[f"{label}_node_count"] = len(sub) + 1


def r17_r18_function_separation(c, nodes, funcs, idx):
    fnodes = (funcs or {}).get("nodes", [])
    fidx = {n["id"]: n for n in fnodes}
    for n in fnodes:
        if not n["id"].startswith("FUNC-"):
            c.bad("R17", f"function node {n['id']} must use FUNC- prefix")
        if n.get("parent") and n["parent"] in idx:
            c.bad("R17", f"function node {n['id']} has a product-tree parent {n['parent']}")
    for n in nodes:
        if str(n.get("id", "")).startswith("FUNC-"):
            c.bad("R17", f"product tree contains function node {n['id']}")
        for f in n.get("functionRefs") or []:
            if f not in fidx:
                c.bad("R17", f"{n['id']}: functionRefs {f} not found")
    for n in fnodes:
        cov = n.get("coverage", "REALIZED")
        if cov not in ("REALIZED", "PARTIAL", "GAP"):
            c.bad("R18", f"{n['id']}: invalid coverage {cov}")
        if cov == "GAP":
            if not n.get("gapNote"):
                c.bad("R23", f"function {n['id']}: coverage=GAP without gapNote")
            continue
        if n.get("kind") == "function" and n.get("leaf"):
            refs = n.get("realizedBy") or []
            if not refs:
                c.bad("R18", f"leaf function {n['id']} has no realizedBy hardware")
            for r in refs:
                if r not in idx:
                    c.bad("R18", f"{n['id']}: realizedBy {r} not in product tree")
    c.info["function_nodes"] = len(fnodes)
    c.info["function_coverage"] = {}
    for n in fnodes:
        k = n.get("coverage", "REALIZED")
        c.info["function_coverage"][k] = c.info["function_coverage"].get(k, 0) + 1


def r20_deferred_reason(c, nodes):
    for n in nodes:
        if n.get("geomBasis") == "DEFERRED" or n.get("evidence") == "OUT_OF_SCOPE":
            if not n.get("deferReason"):
                c.bad("R20", f"{n['id']}: deferred/out-of-scope without deferReason")
        if n.get("demoSimplification") and not n.get("deferReason"):
            c.bad("R20", f"{n['id']}: demoSimplification without deferReason")


def r21_geom_note(c, nodes):
    for n in nodes:
        if n.get("kind") != "part":
            continue
        if n.get("geomBasis") in ("NEEDS_MEASUREMENT", "DEMO_ASSUMPTION") and not n.get("geomNote"):
            c.bad("R21", f"{n['id']}: geomBasis={n['geomBasis']} without geomNote")


def r22_family(c, nodes, idx):
    for n in nodes:
        fr = n.get("familyRef")
        if not fr:
            continue
        t = idx.get(fr)
        if t is None:
            c.bad("R22", f"{n['id']}: familyRef {fr} not found")
        elif t.get("kind") != "family":
            c.bad("R22", f"{n['id']}: familyRef {fr} is not kind=family")
        elif canonical_system(fr, idx) != "SYS-130":
            c.bad("R22", f"{n['id']}: familyRef {fr} does not live in SYS-130")


def r24_audit_consistency(c, nodes, funcs, sources, idx, cfg_ids, audit, extra_ids=()):
    if audit is None:
        p = EVID / "RP-01-coverage-audit.json"
        if not p.exists():
            c.bad("R24", "coverage audit file missing")
            return
        try:
            audit = load_json(p)
        except Exception as exc:  # noqa: BLE001
            c.bad("R24", f"coverage audit unparseable: {exc}")
            return
    items = audit.get("items", [])
    if not items:
        c.bad("R24", "coverage audit has no items")
    fidx = {n["id"] for n in (funcs or {}).get("nodes", [])}
    sreg = {s["id"] for s in (sources or {}).get("sources", [])}
    counts = {}
    for it in items:
        iid = it.get("id", "?")
        for f in ("id", "topic", "planRef", "planVerdict", "evidence", "why"):
            if not it.get(f):
                c.bad("R24", f"audit {iid}: missing '{f}'")
        v = it.get("planVerdict")
        if v not in ("COVERED", "MENTIONED", "MISSING", "UNKNOWN"):
            c.bad("R24", f"audit {iid}: invalid planVerdict {v}")
        counts[v] = counts.get(v, 0) + 1
        for ref in it.get("treeNodes") or []:
            if ref.startswith(("CFG-", "CG-")):
                if ref not in cfg_ids:
                    c.bad("R24", f"audit {iid}: config/group {ref} not declared")
            elif ref not in idx and ref not in fidx and ref not in extra_ids:
                c.bad("R24", f"audit {iid}: treeNodes {ref} not found in any tree")
        for e in it.get("evidence") or []:
            if e not in sreg:
                c.bad("R24", f"audit {iid}: evidence {e} not in source register")
    declared = (audit.get("summary") or {}).get("planVerdictCounts") or {}
    for k in ("COVERED", "MENTIONED", "MISSING", "UNKNOWN"):
        if declared.get(k, 0) != counts.get(k, 0):
            c.bad("R24", f"summary.planVerdictCounts.{k}={declared.get(k,0)} but actual={counts.get(k,0)}")
    reg = ROOT / "docs" / "planning" / "GAP_REGISTER.md"
    if reg.exists():
        text = reg.read_text(encoding="utf-8")
        for g in audit.get("gapRegisterReview", []):
            if g.get("gapId") and g["gapId"] not in text:
                c.bad("R24", f"gapRegisterReview {g['gapId']} not present in GAP_REGISTER.md")
            if g.get("rp01Judgement") not in ("CONFIRMED_GAP", "CONFIRMED_GAP_PARTIALLY_CLOSED",
                                              "ALREADY_COVERED", "NOT_REQUIRED", "NEEDS_DECISION"):
                c.bad("R24", f"gapRegisterReview {g.get('gapId')}: invalid rp01Judgement")
    c.info["audit_items"] = len(items)
    c.info["audit_verdicts_actual"] = counts
    slist = (sources or {}).get("sources", [])
    c.info["source_count"] = len(slist)
    bykind: dict[str, int] = {}
    usable = 0
    for s in slist:
        k = s.get("kind", "?")
        bykind[k] = bykind.get(k, 0) + 1
        if s.get("usedForClaim") and s.get("status") not in ("SNIPPET_ONLY", "UNVERIFIED"):
            usable += 1
    c.info["sources_by_kind"] = bykind
    c.info["sources_usable_for_claims"] = usable


def run_rules(trees, funcs, sources, audit=None):
    c = Ctx()
    nodes, configs, groups, nonphys, arch = merge(trees)
    idx, kids = by_id(nodes), children_map(nodes)
    cfg_ids = {x["id"] for x in configs} | {g["id"] for g in groups}
    r02_fields(c, nodes)
    r03_unique(c, nodes)
    r04_prefix(c, nodes)
    r05_parents(c, nodes, idx, kids)
    r06_cycles(c, nodes, idx)
    r07_system_segment(c, nodes, idx)
    r08_refs(c, nodes, idx, kids)
    r09_dup_identity(c, nodes)
    r10_no_fabrication(c, nodes)
    r11_enums(c, nodes)
    r12_evidence_sources(c, nodes, sources)
    r13_config_consistency(c, nodes, configs, groups, idx)
    r15_r16_deep_dive(c, nodes, idx, kids)
    r17_r18_function_separation(c, nodes, funcs, idx)
    r20_deferred_reason(c, nodes)
    r21_geom_note(c, nodes)
    r22_family(c, nodes, idx)
    r24_audit_consistency(c, nodes, funcs, sources, idx, cfg_ids, audit,
                          extra_ids={v["id"] for v in nonphys})
    c.info["node_count"] = len(nodes)
    c.info["physical_nodes"] = sum(1 for n in nodes if n.get("kind") != "ref")
    c.info["ref_nodes"] = sum(1 for n in nodes if n.get("kind") == "ref")
    c.info["max_depth"] = max((depth_of(n["id"], idx) for n in nodes), default=0)
    c.info["systems"] = sorted(n["id"] for n in nodes if n.get("kind") == "system")
    c.info["non_physical_views"] = [v.get("id") for v in nonphys]
    per_sys = {}
    for n in nodes:
        if n.get("kind") == "ref":
            continue
        s = canonical_system(n["id"], idx) or "ROOT"
        per_sys[s] = per_sys.get(s, 0) + 1
    c.info["nodes_per_system"] = dict(sorted(per_sys.items()))
    c.info["evidence_mix"] = {}
    for n in nodes:
        e = n.get("evidence", "UNSET")
        c.info["evidence_mix"][e] = c.info["evidence_mix"].get(e, 0) + 1
    return c, nodes, idx, kids


def r19_render_consistency(c, nodes, idx, kids, text=None):
    if text is None:
        if not REPORT.exists():
            c.bad("R19", f"report not found: {REPORT}")
            return
        text = REPORT.read_text(encoding="utf-8")
    if BEGIN not in text or END not in text:
        c.bad("R19", "report is missing PBS-TREE markers")
        return
    seg = text.split(BEGIN, 1)[1].split(END, 1)[0]
    md_ids = set(re.findall(r"`((?:VEH|SYS|SUB|ASSY|PART|FAM|DAT|REF)-[0-9A-Za-z\-]+)`", seg))
    js_ids = {n["id"] for n in nodes}
    only_md, only_js = md_ids - js_ids, js_ids - md_ids
    if only_md:
        c.bad("R19", f"ids only in Markdown: {sorted(only_md)[:12]}")
    if only_js:
        c.bad("R19", f"ids only in JSON: {sorted(only_js)[:12]}")
    c.info["markdown_ids"] = len(md_ids)


def render(nodes, idx, kids) -> str:
    root = next(n for n in nodes if n.get("parent") is None)
    lines: list[str] = []

    def badges(n):
        b = []
        if n.get("kind") == "ref":
            return f" 引用→ `{n['refId']}`"
        if n.get("optionality"):
            b.append({"required": "必选", "optional": "可选", "alternative": "择一", "catalog": "目录"}[n["optionality"]])
        if n.get("body") and n["body"] != ["ANY"]:
            b.append("/".join(n["body"]))
        if n.get("power") and n["power"] != ["ANY"]:
            b.append("/".join(n["power"]))
        if n.get("evidence") and n["evidence"] != "EVIDENCE":
            b.append(n["evidence"])
        if n.get("geomBasis") in ("NEEDS_MEASUREMENT", "DEMO_ASSUMPTION", "DEFERRED"):
            b.append({"NEEDS_MEASUREMENT": "待几何依据", "DEMO_ASSUMPTION": "演示假设", "DEFERRED": "暂缓"}[n["geomBasis"]])
        if n.get("choiceGroup"):
            b.append("组:" + n["choiceGroup"])
        return ("〔" + "｜".join(b) + "〕") if b else ""

    def walk(n, d):
        lines.append("  " * d + f"- `{n['id']}` {n['name']}{badges(n)}")
        for k in sorted(kids.get(n["id"], []), key=lambda x: x["id"]):
            walk(k, d + 1)

    walk(root, 0)
    return "\n".join(lines)


def do_render(write: bool):
    trees, funcs, sources, errs = load_all()
    if errs:
        print("LOAD ERRORS:", errs)
        return 2
    nodes, *_ = merge(trees)
    idx, kids = by_id(nodes), children_map(nodes)
    body = render(nodes, idx, kids)
    if not write:
        print(body)
        return 0
    text = REPORT.read_text(encoding="utf-8")
    if BEGIN not in text or END not in text:
        print("report markers missing; refusing to write")
        return 2
    pre, rest = text.split(BEGIN, 1)
    _, post = rest.split(END, 1)
    REPORT.write_text(pre + BEGIN + "\n" + body + "\n" + END + post, encoding="utf-8")
    print(f"rendered {len(nodes)} nodes into {REPORT.relative_to(ROOT)}")
    return 0


def do_validate(out: str | None):
    trees, funcs, sources, errs = load_all()
    c = Ctx()
    for e in errs:
        c.bad("R01", e)
    nodes, idx, kids = [], {}, {}
    if trees:
        c2, nodes, idx, kids = run_rules(trees, funcs, sources)
        c.fail.extend(c2.fail)
        c.info.update(c2.info)
        r19_render_consistency(c, nodes, idx, kids)
    ok = not c.fail
    print("=" * 72)
    print("RP-01 PRODUCT TREE VALIDATION:", "PASS" if ok else "FAIL")
    print("=" * 72)
    for k, v in c.info.items():
        print(f"  {k}: {v}")
    if c.fail:
        print(f"\n{len(c.fail)} rule violation(s):")
        for r, m in c.fail[:80]:
            print(f"  [{r}] {m}")
        if len(c.fail) > 80:
            print(f"  ... {len(c.fail)-80} more")
    result = {
        "artifact": "RP-01-validation-result",
        "tool": "agent-workspace/agents/qwen4/tools/rp01_tree_tool.py",
        "command": ".venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py validate --out docs/planning/evidence/RP-01-validation-result.json",
        "overall": "PASS" if ok else "FAIL",
        "violationCount": len(c.fail),
        "violations": [{"rule": r, "message": m} for r, m in c.fail],
        "metrics": c.info,
    }
    if out:
        p = ROOT / out
        p.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {out}")
    return 0 if ok else 1


# --------------------------------------------------------------------------- #
# negative controls: each mutation MUST be caught by the named rule
# --------------------------------------------------------------------------- #
def mutations():
    def dup_id(trees, *_):
        n = trees[1]["nodes"]
        n.append(copy.deepcopy(n[5]))

    def dangling(trees, *_):
        trees[1]["nodes"][6]["parent"] = "ASSY-99-999"

    def cycle(trees, *_):
        ns = trees[1]["nodes"]
        a = next(n for n in ns if n["kind"] == "subsystem")
        b = next(n for n in ns if n["kind"] == "assembly" and n["parent"] == a["id"])
        a["parent"] = b["id"]

    def bad_prefix(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part")
        n["id"] = "BOLT-" + n["id"].split("-", 1)[1]

    def wrong_segment(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part" and x["id"].startswith("PART-30"))
        n["parent"] = next(x["id"] for x in trees[2]["nodes"] if x["kind"] == "subsystem")

    def fake_mass(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part")
        n["massKg"] = 3.42

    def fake_tolerance(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part")
        n.setdefault("fits", {})["toleranceH7"] = 0.021

    def bad_enum(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part")
        n["body"] = ["BOF", "ANY"]

    def evidence_no_src(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part" and x.get("evidence") == "EVIDENCE")
        n["sources"] = []

    def unknown_src(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part")
        n["sources"] = ["S999"]

    def ref_dangling(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "ref")
        n["refId"] = "PART-00-000"

    def ref_with_child(trees, *_):
        ns = trees[1]["nodes"]
        r = next(x for x in ns if x["kind"] == "ref")
        ns.append({"id": "PART-30-999", "parent": r["id"], "kind": "part", "name": "非法子节点",
                   "body": ["ANY"], "power": ["ANY"], "optionality": "required",
                   "evidence": "ASSUMPTION", "geomBasis": "DEMO_ASSUMPTION", "geomNote": "反例"})

    def dup_identity(trees, *_):
        ns = trees[1]["nodes"]
        p = next(x for x in ns if x["kind"] == "part" and x.get("nameEn"))
        q = copy.deepcopy(p)
        q["id"] = "PART-30-998"
        ns.append(q)

    def deferred_no_reason(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part")
        n["geomBasis"] = "DEFERRED"
        n.pop("deferReason", None)

    def geom_no_note(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part")
        n["geomBasis"] = "NEEDS_MEASUREMENT"
        n.pop("geomNote", None)

    def bad_family(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x.get("familyRef"))
        n["familyRef"] = "PART-30-001"

    def config_two_choices(trees, *_):
        cfg = trees[0]["configurations"][0]
        g = next(x for x in trees[0]["choiceGroups"] if x.get("required"))
        members = [n["id"] for t in trees for n in t.get("nodes", []) if n.get("choiceGroup") == g["id"]]
        cfg["selections"] = list(dict.fromkeys(list(cfg.get("selections", [])) + members))[:2]

    def func_in_product(trees, *_):
        trees[1]["nodes"].append({"id": "FUNC-BRK-99", "parent": "SYS-40", "kind": "subsystem",
                                  "name": "把功能当零件", "body": ["ANY"], "power": ["ANY"],
                                  "optionality": "required", "evidence": "ASSUMPTION"})

    def leaf_func_no_hw(_trees, funcs, _sources, _audit):
        n = next(x for x in funcs["nodes"] if x.get("leaf"))
        n["realizedBy"] = []

    def func_bad_ref(_trees, funcs, _sources, _audit):
        n = next(x for x in funcs["nodes"] if x.get("leaf"))
        n["realizedBy"] = ["PART-00-000"]

    def func_gap_no_note(_trees, funcs, _sources, _audit):
        n = next(x for x in funcs["nodes"] if x.get("coverage") == "GAP")
        n.pop("gapNote", None)

    def audit_count_wrong(_trees, _funcs, _sources, audit):
        audit["summary"]["planVerdictCounts"]["MENTIONED"] += 1

    def audit_dangling_node(_trees, _funcs, _sources, audit):
        audit["items"][0]["treeNodes"] = ["PART-00-000"]

    def audit_unknown_evidence(_trees, _funcs, _sources, audit):
        audit["items"][0]["evidence"] = ["M999"]

    def audit_fake_gap(_trees, _funcs, _sources, audit):
        audit["gapRegisterReview"][0]["gapId"] = "GAP-999"

    def shallow_wheel(trees, *_):
        ns = trees[1]["nodes"]
        keep = [n for n in ns if not (n["id"].startswith("PART-30") and n.get("partClass") == "seal")]
        trees[1]["nodes"] = keep

    def shallow_engine(trees, *_):
        ns = trees[2]["nodes"]
        trees[2]["nodes"] = [n for n in ns
                             if not (n["id"].startswith("PART-50") and n.get("partClass") == "linkage")]

    def missing_field(trees, *_):
        n = next(x for x in trees[1]["nodes"] if x["kind"] == "part")
        n.pop("geomBasis", None)

    def config_missing_name(trees, *_):
        trees[0]["configurations"][0].pop("name", None)

    def alternative_no_group(trees, *_):
        n = next(x for t in trees for x in t["nodes"]
                 if x.get("optionality") == "alternative" and x.get("kind") != "ref")
        n.pop("choiceGroup", None)

    return [
        ("R03", "duplicate node id", dup_id),
        ("R05", "dangling parent reference", dangling),
        ("R06", "parent cycle", cycle),
        ("R04", "id prefix does not match kind", bad_prefix),
        ("R07", "id system segment contradicts parent chain", wrong_segment),
        ("R10", "fabricated mass value", fake_mass),
        ("R10", "fabricated tolerance value", fake_tolerance),
        ("R11", "ANY mixed with concrete architecture", bad_enum),
        ("R12", "EVIDENCE without any source", evidence_no_src),
        ("R12", "citation of unknown source id", unknown_src),
        ("R08", "cross-system ref points nowhere", ref_dangling),
        ("R08", "ref node used as a physical parent", ref_with_child),
        ("R09", "same physical identity declared twice", dup_identity),
        ("R20", "deferred part without reason", deferred_no_reason),
        ("R21", "part needing geometry without note", geom_no_note),
        ("R22", "familyRef points at a non-family node", bad_family),
        ("R14", "config selects two alternatives in one required group", config_two_choices),
        ("R17", "function node smuggled into product tree", func_in_product),
        ("R18", "leaf function with no hardware", leaf_func_no_hw),
        ("R18", "leaf function citing nonexistent hardware", func_bad_ref),
        ("R23", "GAP function without a gap note", func_gap_no_note),
        ("R15", "wheel-end deep dive loses its seal class", shallow_wheel),
        ("R16", "engine deep dive loses its linkage class", shallow_engine),
        ("R02", "part missing required field", missing_field),
        ("R13", "config missing a required field", config_missing_name),
        ("R13", "alternative node without a choice group", alternative_no_group),
        ("R24", "audit summary count does not match items", audit_count_wrong),
        ("R24", "audit cites a nonexistent tree node", audit_dangling_node),
        ("R24", "audit cites an unknown evidence id", audit_unknown_evidence),
        ("R24", "audit reviews a GAP id absent from the register", audit_fake_gap),
    ]


def do_selftest(out: str | None = None):
    trees0, funcs0, sources0, errs = load_all()
    if errs:
        print("LOAD ERRORS:", errs)
        return 2
    ap = EVID / "RP-01-coverage-audit.json"
    audit0 = load_json(ap) if ap.exists() else None
    base, *_ = run_rules(trees0, funcs0, sources0, audit0)
    nodes0, *_ = merge(trees0)
    print("baseline (unmutated) violations:", len(base.fail))
    for r, m in base.fail[:20]:
        print(f"   [{r}] {m}")
    print("-" * 72)
    passed = failed = 0
    rows = []
    for rule, label, fn in mutations():
        trees, funcs, sources = copy.deepcopy(trees0), copy.deepcopy(funcs0), copy.deepcopy(sources0)
        audit = copy.deepcopy(audit0)
        try:
            fn(trees, funcs, sources, audit)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR  {rule:5s} {label}: mutation could not be applied: {exc}")
            failed += 1
            rows.append({"rule": rule, "mutation": label, "result": "MUTATION_ERROR", "detail": str(exc)})
            continue
        c, *_ = run_rules(trees, funcs, sources, audit)
        hit = c.has(rule)
        new = [x for x in c.fail if x not in base.fail]
        if hit:
            passed += 1
            print(f"  CAUGHT {rule:5s} {label}  (+{len(new)} violations)")
            rows.append({"rule": rule, "mutation": label, "result": "CAUGHT",
                         "sample": next(m for r, m in c.fail if r == rule)})
        else:
            failed += 1
            print(f"  MISSED {rule:5s} {label}  <-- validator is blind to this error")
            rows.append({"rule": rule, "mutation": label, "result": "MISSED",
                         "violations": [r for r, _ in c.fail][:10]})
    print("-" * 72)
    # R19 needs the rendered report, so it is tested separately with a drifted copy.
    r19_result = "SKIPPED_NO_REPORT"
    if REPORT.exists():
        text = REPORT.read_text(encoding="utf-8")
        if BEGIN in text and END in text:
            pre, rest = text.split(BEGIN, 1)
            seg, post = rest.split(END, 1)
            ids = re.findall(r"`((?:VEH|SYS|SUB|ASSY|PART|FAM|DAT|REF)-[0-9A-Za-z\-]+)`", seg)
            if ids:
                drifted = seg.replace(f"`{ids[len(ids)//2]}`", "`PART-00-999`", 1)
                c19 = Ctx()
                r19_render_consistency(c19, nodes0, by_id(nodes0), children_map(nodes0),
                                       text=pre + BEGIN + drifted + END + post)
                if c19.has("R19"):
                    passed += 1
                    r19_result = "CAUGHT"
                    print(f"  CAUGHT R19   Markdown tree drifted from JSON (id replaced)")
                    rows.append({"rule": "R19", "mutation": "Markdown tree drifted from JSON",
                                 "result": "CAUGHT", "sample": c19.fail[0][1]})
                else:
                    failed += 1
                    r19_result = "MISSED"
                    print("  MISSED R19   Markdown drift not detected")
                    rows.append({"rule": "R19", "mutation": "Markdown tree drifted from JSON",
                                 "result": "MISSED"})
    total = len(mutations()) + (1 if r19_result != "SKIPPED_NO_REPORT" else 0)
    # R01 lives in the loader, so it is tested by making one real evidence file
    # unreadable in memory only — no scratch file is written anywhere.
    real_load = load_json

    def broken_load(path):
        if path.name == TREE_FILES[0]:
            raise ValueError("simulated malformed JSON")
        return real_load(path)

    globals()["load_json"] = broken_load
    try:
        _, _, _, errs1 = load_all()
    finally:
        globals()["load_json"] = real_load
    c01 = Ctx()
    for e in errs1:
        c01.bad("R01", e)
    if errs1 and c01.has("R01"):
        passed += 1
        total += 1
        print("  CAUGHT R01   malformed evidence file reported by the loader")
        rows.append({"rule": "R01", "mutation": "malformed evidence file (in-memory loader patch)",
                     "result": "CAUGHT", "sample": c01.fail[0][1]})
    else:
        failed += 1
        total += 1
        print("  MISSED R01   loader did not report a malformed file")
        rows.append({"rule": "R01", "mutation": "malformed evidence file", "result": "MISSED"})
    covered = sorted({r for r, _, _ in mutations()} | {"R19", "R01"})
    uncovered = [f"R{i:02d}" for i in range(1, 25) if f"R{i:02d}" not in covered]
    print("-" * 72)
    print(f"NEGATIVE CONTROLS: {passed} caught / {failed} missed / {total} total")
    print(f"RULES WITH A NEGATIVE CONTROL: {len(covered)}/24"
          + (f"  (none for: {', '.join(uncovered)})" if uncovered else ""))
    ok = failed == 0 and not base.fail
    print("SELFTEST:", "PASS" if ok else "FAIL")
    if out:
        result = {
            "artifact": "RP-01-selftest-result",
            "tool": "agent-workspace/agents/qwen4/tools/rp01_tree_tool.py",
            "command": ".venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py selftest --out docs/planning/evidence/RP-01-selftest-result.json",
            "overall": "PASS" if ok else "FAIL",
            "baselineViolations": len(base.fail),
            "caught": passed,
            "missed": failed,
            "total": total,
            "rulesCovered": covered,
            "rulesWithoutNegativeControl": uncovered,
            "controls": rows,
        }
        p = ROOT / out
        p.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {out}")
    return 0 if ok else 1


def do_geomneeds():
    trees, funcs, sources, errs = load_all()
    if errs:
        print("LOAD ERRORS:", errs)
        return 2
    nodes, *_ = merge(trees)
    idx = by_id(nodes)
    groups: dict[str, list] = {}
    counts: dict[str, int] = {}
    for n in nodes:
        if n.get("kind") != "part":
            continue
        g = n.get("geomBasis", "UNSET")
        counts[g] = counts.get(g, 0) + 1
        if g not in ("NEEDS_MEASUREMENT", "DEMO_ASSUMPTION", "DEFERRED"):
            continue
        sysid = canonical_system(n["id"], idx) or "ROOT"
        groups.setdefault(sysid, []).append({
            "id": n["id"], "name": n["name"], "geomBasis": g,
            "geomNote": n.get("geomNote", ""), "deferReason": n.get("deferReason"),
            "evidence": n.get("evidence"), "sources": n.get("sources", []),
            "foundBy": n.get("foundBy"),
        })
    priority = ["SYS-30", "SYS-20", "SYS-40", "SYS-50", "SYS-60"]
    out = {
        "artifact": "RP-01-geometry-needs",
        "generatedBy": "agent-workspace/agents/qwen4/tools/rp01_tree_tool.py geomneeds",
        "date": "2026-11-14",
        "purpose": "从产品树自动导出的几何依据缺口清单，供 RP-04 / G-PL4 样板任务直接消费。不手填，避免与树漂移。",
        "countsByGeomBasis": dict(sorted(counts.items())),
        "totalParts": sum(counts.values()),
        "prioritySystems": priority,
        "bySystem": {k: groups[k] for k in sorted(groups, key=lambda s: (priority.index(s) if s in priority else 99, s))},
    }
    p = EVID / "RP-01-geometry-needs.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("geomBasis counts:", out["countsByGeomBasis"], "total parts:", out["totalParts"])
    for s in priority:
        print(f"  {s}: {len(groups.get(s, []))} parts lacking geometry basis")
    print("wrote docs/planning/evidence/RP-01-geometry-needs.json")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["validate", "selftest", "render", "geomneeds"])
    ap.add_argument("--out", help="write result JSON to this project-relative path (validate / selftest)")
    ap.add_argument("--write", action="store_true", help="render: write into the report markers")
    a = ap.parse_args()
    if a.cmd == "validate":
        sys.exit(do_validate(a.out))
    if a.cmd == "selftest":
        sys.exit(do_selftest(a.out))
    if a.cmd == "geomneeds":
        sys.exit(do_geomneeds())
    sys.exit(do_render(a.write))


if __name__ == "__main__":
    main()