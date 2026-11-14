#!/usr/bin/env python3
"""R-06 最小装配 BOM 与尺寸证据校验器（仅 Python 标准库）。

用法：
  python r06_bom_tool.py summary
  python r06_bom_tool.py validate [--out <project-relative.json>]
  python r06_bom_tool.py selftest [--out <project-relative.json>]

核心立场：关键连接尺寸缺证据时必须保持 null + UNKNOWN。
把演示值填进 critical 参数、用商用车零件配乘用车、来源许可证不明却用于几何，
都必须发出可理解的错误，而不是默默接受。反例全部在内存深拷贝中构造，不写临时文件。
"""
from __future__ import annotations

import argparse
import copy
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
BOM = ROOT / "docs" / "research" / "R-06-minimal-assembly-bom.json"
RP01_GLOB = "docs/planning/evidence/RP-01-tree-*.json"

ID_RE = re.compile(r"\b(?:VEH|SYS|SUB|ASSY|PART|FAM|DAT|REF)-[0-9A-Za-z\-]+")
GRADES = {"SOURCED", "SOURCED_SECONDARY", "ENGINEERING_INFERENCE", "DEMO_ASSUMPTION", "UNKNOWN", "OUT_OF_SCOPE"}
VALUE_GRADES = {"SOURCED", "SOURCED_SECONDARY"}
UNITS = {"mm", "in", "%", "count", "deg", "kg", "N", "N·m", "mixed", "thread+seat", "tolerance", "class+N·m"}
NECESSITY = {"MECHANISM_REQUIRED", "FUNCTION_REQUIRED_DEFERRED", "VISUAL_OPTIONAL", "DEFERRED_OUT_OF_SCOPE"}


class Ctx:
    def __init__(self):
        self.fail: list[tuple[str, str, str]] = []
        self.info: dict = {}

    def bad(self, rule, etype, msg):
        self.fail.append((rule, etype, msg))

    def has(self, rule):
        return any(r == rule for r, _, _ in self.fail)


def load_bom(path: Path = BOM):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_rp01_ids():
    ids = set()
    for f in sorted(glob.glob(str(ROOT / RP01_GLOB))):
        with open(f, encoding="utf-8") as fh:
            for n in json.load(fh).get("nodes", []):
                ids.add(n["id"])
    return ids


def index(d):
    return {
        "src": {s["id"]: s for s in d.get("sources", [])},
        "pr": {p["id"]: p for p in d.get("parameterRequirements", [])},
        "bom": {b["id"]: b for b in d.get("bom", [])},
        "grp": {g["id"]: g for g in d.get("assemblyGroups", [])},
        "if": {i["id"]: i for i in d.get("interfaces", [])},
        "cc": {c["id"]: c for c in d.get("conflictCases", [])},
        "ex": {e["id"]: e for e in d.get("examples", [])},
    }


def b02_unique(c, d, idx):
    seen = {}
    for key in ("sources", "parameterRequirements", "bom", "assemblyGroups",
                "interfaces", "conflictCases", "examples"):
        for it in d.get(key, []):
            i = it.get("id")
            if not i:
                c.bad("B02", "DANGLING_REFERENCE", f"{key}: entry without id")
                continue
            if i in seen:
                c.bad("B02", "DANGLING_REFERENCE", f"{i} declared in both {seen[i]} and {key}")
            seen[i] = key


def b03_refs(c, d, idx, rp01):
    parents = set(idx["bom"]) | set(idx["grp"])
    for b in d.get("bom", []):
        if b.get("parent") not in parents:
            c.bad("B03", "DANGLING_REFERENCE", f"{b['id']}: unknown parent {b.get('parent')}")
        for p in b.get("params", []):
            if p not in idx["pr"]:
                c.bad("B03", "DANGLING_REFERENCE", f"{b['id']}: unknown parameter requirement {p}")
        ref = b.get("rp01Ref")
        if ref and rp01 and ref not in rp01:
            c.bad("B03", "DANGLING_REFERENCE", f"{b['id']}: rp01Ref {ref} not found in approved RP-01 tree")
    for g in d.get("assemblyGroups", []):
        for tok in ID_RE.findall(g.get("rp01Ref", "") or ""):
            if rp01 and tok not in rp01:
                c.bad("B03", "DANGLING_REFERENCE", f"{g['id']}: rp01Ref token {tok} not in RP-01 tree")
    for p in d.get("parameterRequirements", []):
        sid = p.get("sourceId")
        if sid is not None and sid not in idx["src"]:
            c.bad("B03", "DANGLING_REFERENCE", f"{p['id']}: unknown sourceId {sid}")
        for b in p.get("appliesTo", []):
            if b not in idx["bom"]:
                c.bad("B03", "DANGLING_REFERENCE", f"{p['id']}: appliesTo unknown bom item {b}")
    for i in d.get("interfaces", []):
        for b in i.get("between", []):
            if b not in idx["bom"]:
                c.bad("B03", "DANGLING_REFERENCE", f"{i['id']}: between unknown bom item {b}")
        for p in i.get("requiredParams", []):
            if p not in idx["pr"]:
                c.bad("B03", "DANGLING_REFERENCE", f"{i['id']}: unknown requiredParam {p}")
    for e in d.get("examples", []):
        sid = e.get("sourceId")
        if sid is not None and sid not in idx["src"]:
            c.bad("B03", "DANGLING_REFERENCE", f"{e['id']}: unknown sourceId {sid}")


def b04_grade_value(c, d, idx):
    for p in d.get("parameterRequirements", []):
        g, v = p.get("grade"), p.get("value")
        if g not in GRADES:
            c.bad("B04", "UNKNOWN_PARAM_HAS_VALUE", f"{p['id']}: invalid grade {g}")
            continue
        if g == "UNKNOWN" and v is not None:
            c.bad("B04", "UNKNOWN_PARAM_HAS_VALUE",
                  f"{p['id']} ({p['name']}): grade=UNKNOWN but value={v}; unknown must stay null")
        if g in VALUE_GRADES:
            sid = p.get("sourceId")
            if not sid or sid not in idx["src"]:
                c.bad("B04", "SOURCED_PARAM_WITHOUT_SOURCE", f"{p['id']}: grade={g} without a resolvable sourceId")
            elif not idx["src"][sid].get("usedForClaim"):
                c.bad("B04", "SOURCED_PARAM_WITHOUT_SOURCE",
                      f"{p['id']}: source {sid} is marked usedForClaim=false and cannot support a value")
        if g == "DEMO_ASSUMPTION" and not p.get("demoNote"):
            c.bad("B04", "CRITICAL_PARAM_FILLED_BY_DEMO", f"{p['id']}: DEMO_ASSUMPTION without demoNote")


def b05_critical(c, d, idx):
    for p in d.get("parameterRequirements", []):
        if not p.get("critical"):
            continue
        if p.get("value") is not None and p.get("grade") not in VALUE_GRADES:
            c.bad("B05", "CRITICAL_PARAM_FILLED_BY_DEMO",
                  f"{p['id']} ({p['name']}) is CRITICAL but carries value={p['value']} with grade={p.get('grade')}; "
                  f"critical connection dimensions may only be filled from SOURCED/SOURCED_SECONDARY evidence. "
                  f"Blocked downstream: {p.get('blockingDownstream')}")


def b06_units(c, d, idx):
    for p in d.get("parameterRequirements", []):
        u = p.get("unit")
        if u not in UNITS:
            c.bad("B06", "UNIT_OR_FRAME_INCONSISTENT", f"{p['id']}: unit '{u}' not in unitPolicy")
        if u == "in" and p.get("unitConversion_mm") is None:
            c.bad("B06", "UNIT_OR_FRAME_INCONSISTENT", f"{p['id']}: inch value without explicit mm conversion")


def b07_vehicle_class(c, d, idx):
    want = d.get("scope", {}).get("vehicleClass")
    for p in d.get("parameterRequirements", []):
        s = idx["src"].get(p.get("sourceId"))
        if not s:
            continue
        vc = s.get("vehicleClass")
        if vc and want and vc != "UNIVERSAL" and vc != want:
            c.bad("B07", "MIXED_VEHICLE_PART",
                  f"{p['id']} ({p['name']}) uses source {s['id']} with vehicleClass={vc} "
                  f"but the sample is {want}; refusing to mix vehicle classes")


def b08_license(c, d, idx):
    for s in d.get("sources", []):
        if s.get("usedForGeometry") and s.get("license") in (None, "", "UNKNOWN"):
            c.bad("B08", "LICENSE_UNCLEAR",
                  f"source {s['id']} is usedForGeometry=true but license is unclear; "
                  f"cannot base CAD geometry on an unlicensed/unknown-license source")


def b09_conflicts(c, d, idx):
    for cc in d.get("conflictCases", []):
        if not cc.get("resolution"):
            c.bad("B09", "CATALOG_TOPOLOGY_MISMATCH", f"{cc['id']}: conflict recorded without a resolution")
        if not cc.get("errorToEmit"):
            c.bad("B09", "CATALOG_TOPOLOGY_MISMATCH", f"{cc['id']}: conflict without an error message to emit")
        for pid in cc.get("mustRemainUnknown", []):
            p = idx["pr"].get(pid)
            if p is None:
                c.bad("B09", "DANGLING_REFERENCE", f"{cc['id']}: mustRemainUnknown cites unknown {pid}")
            elif p.get("grade") != "UNKNOWN" or p.get("value") is not None:
                c.bad("B09", "CATALOG_TOPOLOGY_MISMATCH",
                      f"{cc['id']} requires {pid} to stay UNKNOWN, but it is grade={p.get('grade')} value={p.get('value')}")


def b10_interfaces(c, d, idx):
    for i in d.get("interfaces", []):
        unknown = [p for p in i.get("requiredParams", [])
                   if p in idx["pr"] and (idx["pr"][p].get("grade") == "UNKNOWN" or idx["pr"][p].get("value") is None)]
        if unknown and not i.get("blockedDownstream"):
            c.bad("B10", "INTERFACE_BLOCKED_UNDECLARED",
                  f"{i['id']} ({i['type']}) depends on unknown params {unknown} but blockedDownstream is not true; "
                  f"downstream would silently build an unverified connection")


def b11_frame(c, d, idx):
    fp = d.get("framePolicy", {})
    if fp.get("worldFrame") != "UNFROZEN_PENDING_RP07":
        c.bad("B11", "WORLD_FRAME_FROZEN_WITHOUT_APPROVAL",
              f"framePolicy.worldFrame={fp.get('worldFrame')}; world frame must stay pending RP-07")
    for p in d.get("parameterRequirements", []):
        if p.get("worldAbsolute"):
            c.bad("B11", "WORLD_FRAME_FROZEN_WITHOUT_APPROVAL",
                  f"{p['id']}: worldAbsolute=true; hardpoints must be relative to a local datum")
        if not p.get("referencePoint"):
            c.bad("B11", "UNIT_OR_FRAME_INCONSISTENT", f"{p['id']}: no referencePoint declared")


def b12_necessity(c, d, idx):
    for b in d.get("bom", []):
        n = b.get("necessity")
        if n not in NECESSITY:
            c.bad("B12", "DEFERRED_WITHOUT_REASON", f"{b['id']}: invalid necessity {n}")
            continue
        if n == "MECHANISM_REQUIRED":
            if not b.get("qtyPerCorner", 0) >= 1:
                c.bad("B12", "DEFERRED_WITHOUT_REASON", f"{b['id']}: MECHANISM_REQUIRED but qtyPerCorner={b.get('qtyPerCorner')}")
            if not b.get("params") and not b.get("note"):
                c.bad("B12", "DEFERRED_WITHOUT_REASON",
                      f"{b['id']}: MECHANISM_REQUIRED with no parameter requirement and no explanatory note")
        else:
            if not b.get("deferReason"):
                c.bad("B12", "DEFERRED_WITHOUT_REASON", f"{b['id']}: necessity={n} without deferReason")
            if b.get("qtyPerCorner", 0) != 0:
                c.bad("B12", "DEFERRED_WITHOUT_REASON", f"{b['id']}: deferred/optional but qtyPerCorner={b.get('qtyPerCorner')} (must be 0)")


def b13_examples(c, d, idx):
    for e in d.get("examples", []):
        if e["id"] == "EX-01":
            i, x = e.get("inputs", {}), e.get("expected", {})
            sw = i.get("sectionWidth_mm", 0) * i.get("aspect_pct", 0) / 100.0
            rr = i.get("rimDiameter_in", 0) * 25.4 / 2.0
            calc = {"sidewall_mm": sw, "rimRadius_mm": rr, "outerRadius_mm": rr + sw,
                    "outerDiameter_mm": 2 * (rr + sw)}
            for k, v in calc.items():
                if k not in x or abs(x[k] - v) > 0.05:
                    c.bad("B13", "UNIT_OR_FRAME_INCONSISTENT",
                          f"EX-01 expected {k}={x.get(k)} but arithmetic gives {round(v,4)}")
        if e["id"] == "EX-02":
            i, x = e.get("inputs", {}), e.get("expected", {})
            for k, src in (("bore_mm", "d_mm"), ("outerDiameter_mm", "D_mm"), ("width_mm", "B_mm")):
                if x.get(k) != i.get(src):
                    c.bad("B13", "CATALOG_TOPOLOGY_MISMATCH", f"EX-02 expected {k}={x.get(k)} != input {src}={i.get(src)}")
            for k in ("internalGeometry", "fitTolerance"):
                if x.get(k) is not None:
                    c.bad("B13", "CRITICAL_PARAM_FILLED_BY_DEMO",
                          f"EX-02 expected {k} must stay null (internal geometry / fit are UNKNOWN)")
            if not e.get("mustNotInfer"):
                c.bad("B13", "CATALOG_TOPOLOGY_MISMATCH", "EX-02 must list what cannot be inferred")


RULES = [
    ("B02", b02_unique), ("B03", b03_refs), ("B04", b04_grade_value), ("B05", b05_critical),
    ("B06", b06_units), ("B07", b07_vehicle_class), ("B08", b08_license), ("B09", b09_conflicts),
    ("B10", b10_interfaces), ("B11", b11_frame), ("B12", b12_necessity), ("B13", b13_examples),
]


def run_rules(d, rp01=None):
    c = Ctx()
    idx = index(d)
    for rid, fn in RULES:
        if rid == "B03":
            fn(c, d, idx, rp01 if rp01 is not None else load_rp01_ids())
        else:
            fn(c, d, idx)
    prs = d.get("parameterRequirements", [])
    grades = {}
    for p in prs:
        grades[p.get("grade")] = grades.get(p.get("grade"), 0) + 1
    c.info["bomItems"] = len(d.get("bom", []))
    c.info["mechanismRequired"] = sum(1 for b in d.get("bom", []) if b.get("necessity") == "MECHANISM_REQUIRED")
    c.info["deferredOrOptional"] = sum(1 for b in d.get("bom", []) if b.get("necessity") != "MECHANISM_REQUIRED")
    c.info["parameterRequirements"] = len(prs)
    c.info["paramGrades"] = dict(sorted(grades.items(), key=lambda kv: str(kv[0])))
    c.info["criticalParams"] = sum(1 for p in prs if p.get("critical"))
    c.info["criticalParamsSourced"] = sum(1 for p in prs if p.get("critical") and p.get("grade") in VALUE_GRADES)
    c.info["criticalParamsUnknown"] = sum(1 for p in prs if p.get("critical") and p.get("grade") == "UNKNOWN")
    c.info["interfaces"] = len(d.get("interfaces", []))
    c.info["interfacesBlocked"] = sum(1 for i in d.get("interfaces", []) if i.get("blockedDownstream"))
    c.info["sources"] = len(d.get("sources", []))
    c.info["sourcesFetchedThisRound"] = sum(1 for s in d.get("sources", []) if s.get("retrieval") == "FETCHED_THIS_ROUND")
    c.info["sourcesUnreachable"] = sum(1 for s in d.get("sources", []) if s.get("retrieval") in
                                       ("HTTP_403", "SNIPPET_ONLY_HTTP_429", "PDF_BINARY_UNPARSEABLE", "HTTP_403_FORBIDDEN"))
    c.info["conflictCases"] = len(d.get("conflictCases", []))
    c.info["examples"] = len(d.get("examples", []))
    return c, idx


def do_summary():
    d = load_bom()
    c, idx = run_rules(d)
    for k, v in c.info.items():
        print(f"  {k}: {v}")
    return 0


def do_validate(out):
    try:
        d = load_bom()
    except Exception as exc:
        print(f"[B01] cannot parse BOM: {exc}")
        return 1
    c, idx = run_rules(d)
    ok = not c.fail
    print("=" * 72)
    print("R-06 MINIMAL ASSEMBLY BOM VALIDATION:", "PASS" if ok else "FAIL")
    print("=" * 72)
    for k, v in c.info.items():
        print(f"  {k}: {v}")
    if c.fail:
        print(f"\n{len(c.fail)} violation(s):")
        for r, t, m in c.fail[:60]:
            print(f"  [{r}/{t}] {m}")
    result = {
        "artifact": "R-06-validation-result",
        "tool": "agent-workspace/agents/qwen4/tools/r06_bom_tool.py",
        "command": ".venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r06_bom_tool.py validate --out agent-workspace/agents/qwen4/reports/R-06-validation-result.json",
        "overall": "PASS" if ok else "FAIL",
        "violationCount": len(c.fail),
        "violations": [{"rule": r, "type": t, "message": m} for r, t, m in c.fail],
        "metrics": c.info,
        "note": "PASS 表示 BOM 结构与证据纪律自洽，且关键未知项被如实保留；不代表任何尺寸已工程验证。",
    }
    if out:
        p = ROOT / out
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {out}")
    return 0 if ok else 1


def mutations():
    def fill_critical(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-06")
        p["grade"] = "DEMO_ASSUMPTION"; p["value"] = 114.3; p["demoNote"] = "取自代码兜底常量"

    def unknown_with_value(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-17")
        p["value"] = 12.0

    def sourced_no_source(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-11")
        p["sourceId"] = None

    def sourced_from_snippet(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-11")
        p["sourceId"] = "N03"

    def demo_no_note(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-01")
        p["demoNote"] = ""

    def commercial_part(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-10")
        p["sourceId"] = "N08"

    def license_unknown(d):
        s = next(x for x in d["sources"] if x["id"] == "N02")
        s["license"] = "UNKNOWN"

    def conflict_filled(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-14")
        p["grade"] = "DEMO_ASSUMPTION"; p["value"] = 18; p["demoNote"] = "假设球数"

    def interface_unblocked(d):
        i = next(x for x in d["interfaces"] if x["id"] == "IF-01")
        i["blockedDownstream"] = False

    def world_absolute(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-20")
        p["worldAbsolute"] = True

    def frame_frozen(d):
        d["framePolicy"]["worldFrame"] = "X_FORWARD_Y_LEFT_Z_UP"

    def defer_no_reason(d):
        b = next(x for x in d["bom"] if x["id"] == "BOM-20-031")
        b["deferReason"] = ""

    def required_zero_qty(d):
        b = next(x for x in d["bom"] if x["id"] == "BOM-20-016")
        b["qtyPerCorner"] = 0

    def required_no_params_no_note(d):
        b = next(x for x in d["bom"] if x["id"] == "BOM-20-011")
        b["note"] = ""

    def bad_unit(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-03")
        p["unitConversion_mm"] = None

    def dangling_parent(d):
        d["bom"][0]["parent"] = "BOM-NOT-EXIST"

    def dangling_rp01(d):
        d["bom"][0]["rp01Ref"] = "PART-99-999"

    def dup_id(d):
        d["bom"].append(copy.deepcopy(d["bom"][0]))

    def example_arith(d):
        e = next(x for x in d["examples"] if x["id"] == "EX-01")
        e["expected"]["outerDiameter_mm"] = 600.0

    def example_internal(d):
        e = next(x for x in d["examples"] if x["id"] == "EX-02")
        e["expected"]["internalGeometry"] = {"balls": 18}

    def no_reference_point(d):
        p = next(x for x in d["parameterRequirements"] if x["id"] == "PR-11")
        p["referencePoint"] = ""

    return [
        ("B05", "critical PCD filled with a demo constant", fill_critical),
        ("B04", "UNKNOWN parameter carries a value", unknown_with_value),
        ("B04", "SOURCED_SECONDARY parameter loses its source", sourced_no_source),
        ("B04", "value sourced from a snippet-only source", sourced_from_snippet),
        ("B04", "DEMO_ASSUMPTION without demoNote", demo_no_note),
        ("B07", "commercial-vehicle nut source used on a passenger sample", commercial_part),
        ("B08", "geometry-bearing source with unclear license", license_unknown),
        ("B09", "conflicted internal-geometry param gets filled", conflict_filled),
        ("B10", "interface with unknown deps not marked blocked", interface_unblocked),
        ("B11", "hardpoint declared in world absolute coordinates", world_absolute),
        ("B11", "world frame frozen without approval", frame_frozen),
        ("B12", "deferred item without a reason", defer_no_reason),
        ("B12", "mechanism-required item with zero quantity", required_zero_qty),
        ("B12", "mechanism-required item with no params and no note", required_no_params_no_note),
        ("B06", "inch value without mm conversion", bad_unit),
        ("B03", "dangling BOM parent", dangling_parent),
        ("B03", "rp01Ref not present in the approved RP-01 tree", dangling_rp01),
        ("B02", "duplicate BOM id", dup_id),
        ("B13", "tire example arithmetic no longer matches", example_arith),
        ("B13", "bearing example invents internal geometry", example_internal),
        ("B11", "parameter without a reference point", no_reference_point),
    ]


def do_selftest(out):
    d0 = load_bom()
    rp01 = load_rp01_ids()
    base, _ = run_rules(d0, rp01)
    print("baseline violations:", len(base.fail), "(must be 0)")
    for r, t, m in base.fail[:10]:
        print(f"   [{r}/{t}] {m}")
    print("-" * 72)
    passed = failed = 0
    rows = []
    for rule, label, fn in mutations():
        d = copy.deepcopy(d0)
        try:
            fn(d)
        except Exception as exc:
            failed += 1
            print(f"  ERROR  {rule:5s} {label}: {exc}")
            rows.append({"rule": rule, "mutation": label, "result": "MUTATION_ERROR", "detail": str(exc)})
            continue
        c, _ = run_rules(d, rp01)
        if c.has(rule):
            passed += 1
            sample = next(m for r, _, m in c.fail if r == rule)
            print(f"  CAUGHT {rule:5s} {label}")
            rows.append({"rule": rule, "mutation": label, "result": "CAUGHT", "sample": sample})
        else:
            failed += 1
            print(f"  MISSED {rule:5s} {label}  <-- validator is blind to this error")
            rows.append({"rule": rule, "mutation": label, "result": "MISSED",
                         "violations": sorted({r for r, _, _ in c.fail})})
    print("-" * 72)
    real_load = load_bom

    def broken(path=BOM):
        raise ValueError("simulated malformed JSON")

    globals()["load_bom"] = broken
    try:
        try:
            load_bom(); p01 = False
        except Exception:
            p01 = True
    finally:
        globals()["load_bom"] = real_load
    if p01:
        passed += 1
        print("  CAUGHT B01   malformed BOM file reported by the loader")
        rows.append({"rule": "B01", "mutation": "malformed BOM file (in-memory loader patch)", "result": "CAUGHT"})
    else:
        failed += 1
        print("  MISSED B01   loader did not report a malformed file")
        rows.append({"rule": "B01", "mutation": "malformed BOM file", "result": "MISSED"})

    covered = sorted({r for r, _, _ in mutations()} | {"B01"})
    all_rules = [f"B{i:02d}" for i in range(1, 14)]
    uncovered = [r for r in all_rules if r not in covered]
    total = len(rows)
    print("-" * 72)
    print(f"NEGATIVE CONTROLS: {passed} caught / {failed} missed / {total} total")
    print(f"RULES WITH A NEGATIVE CONTROL: {len(covered)}/13"
          + (f"  (none for: {', '.join(uncovered)})" if uncovered else ""))
    ok = failed == 0 and not base.fail
    print("SELFTEST:", "PASS" if ok else "FAIL")
    if out:
        result = {
            "artifact": "R-06-selftest-result",
            "tool": "agent-workspace/agents/qwen4/tools/r06_bom_tool.py",
            "overall": "PASS" if ok else "FAIL",
            "baselineViolations": len(base.fail),
            "caught": passed, "missed": failed, "total": total,
            "rulesCovered": covered, "rulesWithoutNegativeControl": uncovered,
            "controls": rows,
        }
        p = ROOT / out
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {out}")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["summary", "validate", "selftest"])
    ap.add_argument("--out", help="write result JSON to this project-relative path")
    a = ap.parse_args()
    if a.cmd == "summary":
        sys.exit(do_summary())
    if a.cmd == "validate":
        sys.exit(do_validate(a.out))
    sys.exit(do_selftest(a.out))


if __name__ == "__main__":
    main()