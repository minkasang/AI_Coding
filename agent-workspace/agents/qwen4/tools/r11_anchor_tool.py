#!/usr/bin/env python3
"""R-11 几何锚证据校验器（stdlib only）。

成功判据 = 0 条结构违规 + 汇总计数自洽 + 反例全部被对应规则捕获。
不是"跑通就算可信"：本工具只校验证据纪律，不证明任何真实工程可靠性。
"""
import argparse
import copy
import glob
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
EVID = os.path.join(ROOT, "docs", "research", "R-11-geometry-evidence.example.json")
R06 = os.path.join(ROOT, "docs", "research", "R-06-minimal-assembly-bom.json")

VALUE_GRADES = {"SOURCED", "SOURCED_SECONDARY"}
PRIMARY_KINDS = {"MANUFACTURER_OFFICIAL_HTML", "PROJECT_CODE_READONLY"}
SECONDARY_KINDS = {"AGGREGATOR_HTML", "DISTRIBUTOR_HTML"}
NO_TEXT_RETRIEVAL = {
    "SNIPPET_ONLY", "PDF_BINARY_UNPARSEABLE", "HTTP_403", "HTTP_429", "FETCH_FAILED",
}
# 壳页面确实抓到了正文，只是不含产品数据：可以引用壳页原文证明它是壳，但不得据此主张任何尺寸。
NO_DATA_RETRIEVAL = NO_TEXT_RETRIEVAL | {"JS_SHELL_NO_DATA", "SEARCH_SHELL_NO_DATA"}
INCH_TO_MM = 25.4


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


class Check:
    def __init__(self):
        self.violations = []

    def bad(self, rule, code, msg):
        self.violations.append({"rule": rule, "code": code, "msg": msg})

    def by_rule(self):
        out = {}
        for v in self.violations:
            out.setdefault(v["rule"], []).append(v)
        return out


def index(d):
    return {
        "src": {s["id"]: s for s in d.get("sources", [])},
        "verdict": {v["r06ParamId"]: v for v in d.get("parameterVerdicts", [])},
        "conflict": {c["id"]: c for c in d.get("conflicts", [])},
        "spec": {s["id"]: s for s in d.get("referenceSpecimens", [])},
    }


def a01_traceability(c, d, idx):
    for sp in d.get("referenceSpecimens", []):
        for p in sp.get("parameters", []):
            if p.get("grade") in VALUE_GRADES:
                sid = p.get("sourceId")
                if sid not in idx["src"]:
                    c.bad("A01", "SOURCE_ID_NOT_FOUND",
                          f"{sp['id']}.{p['id']}: sourceId {sid} not in sources")
                elif not idx["src"][sid].get("locator"):
                    c.bad("A01", "SOURCE_LOCATOR_MISSING",
                          f"{sp['id']}.{p['id']}: source {sid} has no locator")
    for s in d.get("sources", []):
        if s.get("usedForClaim") and not s.get("supports"):
            c.bad("A01", "CLAIM_WITHOUT_SUPPORTS", f"{s['id']}: usedForClaim but no supports text")


def a02_kind_ceiling(c, d, idx):
    for s in d.get("sources", []):
        kind, ret, grade = s.get("kind"), s.get("retrieval"), s.get("grade")
        if grade == "SOURCED":
            if kind not in PRIMARY_KINDS:
                c.bad("A02", "SECONDARY_SOURCE_PROMOTED_TO_SOURCED",
                      f"{s['id']}: grade=SOURCED but kind={kind}; only {sorted(PRIMARY_KINDS)} may be SOURCED")
            if ret != "FETCHED_THIS_ROUND":
                c.bad("A02", "SOURCED_WITHOUT_ACTUAL_FETCH",
                      f"{s['id']}: grade=SOURCED but retrieval={ret}")
        if kind in SECONDARY_KINDS and grade == "SOURCED":
            c.bad("A02", "AGGREGATOR_CEILING_EXCEEDED", f"{s['id']}: aggregator cannot exceed SOURCED_SECONDARY")
        if kind == "FORUM" and grade in VALUE_GRADES:
            c.bad("A02", "FORUM_USED_AS_FACT", f"{s['id']}: forum grade={grade}")
    for sp in d.get("referenceSpecimens", []):
        for p in sp.get("parameters", []):
            if p.get("grade") == "SOURCED":
                s = idx["src"].get(p.get("sourceId"))
                if s and s.get("kind") not in PRIMARY_KINDS:
                    c.bad("A02", "PARAM_SOURCED_FROM_SECONDARY",
                          f"{sp['id']}.{p['id']}: SOURCED from {s['kind']}")


def a03_no_demo_upgrade(c, d, idx):
    claimed = 0
    for v in d.get("parameterVerdicts", []):
        dg = v.get("demoSampleGrade")
        if dg in VALUE_GRADES:
            claimed += 1
            if not v.get("demoApplicability"):
                c.bad("A03", "DEMO_UPGRADE_WITHOUT_APPLICABILITY",
                      f"{v['r06ParamId']}: demoSampleGrade={dg} but no demoApplicability declared")
        verdict = v.get("r11Verdict", "")
        if "REMAINS_UNKNOWN" in verdict and dg in VALUE_GRADES:
            c.bad("A03", "VERDICT_CONTRADICTS_DEMO_GRADE",
                  f"{v['r06ParamId']}: verdict={verdict} but demoSampleGrade={dg}")
    declared = d.get("summary", {}).get("r06ParamsUpgradedForDemo")
    if declared is not None and declared != claimed:
        c.bad("A03", "DEMO_UPGRADE_COUNT_MISMATCH",
              f"summary says {declared} demo upgrades, actual {claimed}")


def a04_units(c, d, idx):
    for sp in d.get("referenceSpecimens", []):
        for p in sp.get("parameters", []):
            nu = p.get("nativeUnit")
            if nu == "in":
                if p.get("conversionFactor") != INCH_TO_MM:
                    c.bad("A04", "INCH_FACTOR_MISSING_OR_WRONG",
                          f"{sp['id']}.{p['id']}: nativeUnit=in but conversionFactor={p.get('conversionFactor')}")
                raw, mm = p.get("raw"), p.get("value_mm")
                if not isinstance(raw, (int, float)) or not isinstance(mm, (int, float)):
                    c.bad("A04", "INCH_VALUE_NOT_NUMERIC", f"{sp['id']}.{p['id']}: raw/value_mm not numeric")
                elif abs(mm - raw * INCH_TO_MM) > 1e-6:
                    c.bad("A04", "INCH_CONVERSION_WRONG",
                          f"{sp['id']}.{p['id']}: {raw} in != {mm} mm (expected {raw * INCH_TO_MM:.6f})")
            if nu == "mm" and p.get("value_mm") is not None and p.get("raw") is not None:
                if isinstance(p["raw"], (int, float)) and abs(p["raw"] - p["value_mm"]) > 1e-9:
                    c.bad("A04", "MM_VALUE_ALTERED",
                          f"{sp['id']}.{p['id']}: nativeUnit=mm but raw {p['raw']} != value_mm {p['value_mm']}")


def a05_specimen_boundary(c, d, idx):
    for sp in d.get("referenceSpecimens", []):
        if sp.get("isDemoSamplePart") is not False:
            c.bad("A05", "SPECIMEN_CLAIMED_AS_DEMO_PART",
                  f"{sp['id']}: isDemoSamplePart must be explicitly false")
        if not sp.get("isDemoSamplePartReason"):
            c.bad("A05", "SPECIMEN_BOUNDARY_UNEXPLAINED", f"{sp['id']}: no isDemoSamplePartReason")
        if not sp.get("adoptionRequires"):
            c.bad("A05", "SPECIMEN_ADOPTION_DECISION_MISSING", f"{sp['id']}: no adoptionRequires")
        if sp.get("allowedModelingLevel") not in {"FID-V", "NONE"}:
            c.bad("A05", "SPECIMEN_LEVEL_TOO_HIGH",
                  f"{sp['id']}: allowedModelingLevel={sp.get('allowedModelingLevel')}; reference specimens may not exceed FID-V")
        if not sp.get("vehicleApplication"):
            c.bad("A05", "SPECIMEN_VEHICLE_APPLICATION_MISSING", f"{sp['id']}: no vehicleApplication")


def a06_generation_condition(c, d, idx):
    for sp in d.get("referenceSpecimens", []):
        va = sp.get("vehicleApplication") or {}
        if va.get("generationResolved") is False:
            if sp.get("allowedModelingLevel") not in {"FID-V", "NONE"}:
                c.bad("A06", "UNRESOLVED_GENERATION_USED_ABOVE_VISUAL",
                      f"{sp['id']}: generation unresolved but level={sp.get('allowedModelingLevel')}")
            if not va.get("generationNote"):
                c.bad("A06", "UNRESOLVED_GENERATION_UNEXPLAINED", f"{sp['id']}: no generationNote")
    for v in d.get("parameterVerdicts", []):
        if v.get("realVehicleGrade") == "SOURCED" and not v.get("realVehicleGeneration"):
            c.bad("A06", "VEHICLE_VALUE_SOURCED_WITHOUT_GENERATION",
                  f"{v['r06ParamId']}: realVehicleGrade=SOURCED but no generation condition")


def a07_must_remain_unknown(c, d, idx):
    for cf in d.get("conflicts", []):
        for pid in cf.get("mustRemainUnknown", []) or []:
            v = idx["verdict"].get(pid)
            if v is None:
                c.bad("A07", "GUARDED_PARAM_HAS_NO_VERDICT", f"{cf['id']}: {pid} has no parameterVerdict")
                continue
            if v.get("demoSampleGrade") in VALUE_GRADES:
                c.bad("A07", "MUST_REMAIN_UNKNOWN_FILLED",
                      f"{cf['id']}: {pid} must remain UNKNOWN but demoSampleGrade={v.get('demoSampleGrade')}")
            if "REMAINS_UNKNOWN" not in v.get("r11Verdict", ""):
                c.bad("A07", "MUST_REMAIN_UNKNOWN_VERDICT_MISSING",
                      f"{cf['id']}: {pid} verdict={v.get('r11Verdict')}")
    for sp in d.get("referenceSpecimens", []):
        for p in sp.get("parameters", []):
            if p.get("mustNotDerive") and p.get("value_mm") is not None:
                c.bad("A07", "MUST_NOT_DERIVE_HAS_VALUE", f"{sp['id']}.{p['id']}: mustNotDerive but value_mm set")


def a08_no_data_no_claim(c, d, idx):
    for s in d.get("sources", []):
        if s.get("retrieval") in NO_DATA_RETRIEVAL:
            for field, want in (("usedForClaim", False), ("usedForGeometry", False), ("grade", "UNKNOWN")):
                if s.get(field) != want:
                    c.bad("A08", "NO_DATA_SOURCE_USED_AS_FACT",
                          f"{s['id']}: retrieval={s['retrieval']} but {field}={s.get(field)} (must be {want})")
            if s.get("verbatim") and s.get("retrieval") in NO_TEXT_RETRIEVAL:
                c.bad("A08", "NO_DATA_SOURCE_HAS_VERBATIM",
                      f"{s['id']}: retrieval={s['retrieval']} has no page text but verbatim quotes present")


def a09_non_additive(c, d, idx):
    for sp in d.get("referenceSpecimens", []):
        ps = {p["id"]: p for p in sp.get("parameters", [])}
        for p in sp.get("parameters", []):
            if p.get("mustNotDerive"):
                if p.get("grade") != "UNKNOWN" or p.get("value_mm") is not None:
                    c.bad("A09", "DERIVED_TOTAL_FABRICATED",
                          f"{sp['id']}.{p['id']}: mustNotDerive but grade={p.get('grade')} value={p.get('value_mm')}")
                if not p.get("mustNotDeriveReason"):
                    c.bad("A09", "NON_DERIVABLE_UNEXPLAINED", f"{sp['id']}.{p['id']}: no mustNotDeriveReason")
    cf = idx["conflict"].get("CC-07")
    if cf:
        a = cf.get("arithmetic") or {}
        try:
            s = a["threadLength_mm"] + a["shoulderLength_mm"]
            if abs(s - a["sum_thread_plus_shoulder_mm"]) > 1e-6:
                c.bad("A09", "CONFLICT_ARITHMETIC_WRONG", "CC-07: sum does not match declared")
            if abs((s - a["underHeadLength_mm"]) - a["discrepancy_mm"]) > 1e-6:
                c.bad("A09", "CONFLICT_DISCREPANCY_WRONG", "CC-07: discrepancy does not match")
        except KeyError:
            c.bad("A09", "CONFLICT_ARITHMETIC_INCOMPLETE", "CC-07: arithmetic fields missing")


def a10_r06_untouched(c, d, idx):
    if not os.path.exists(R06):
        c.bad("A10", "R06_FILE_MISSING", f"cannot verify R-06 unchanged: {R06} absent")
        return
    r = load_json(R06)
    ifs = r.get("interfaces", [])
    blocked = sum(1 for i in ifs if i.get("blockedDownstream"))
    crit = [p for p in r.get("parameterRequirements", []) if p.get("critical")]
    unk = sum(1 for p in crit if p.get("grade") == "UNKNOWN")
    if blocked != len(ifs):
        c.bad("A10", "R06_INTERFACE_UNBLOCKED", f"R-06 now {blocked}/{len(ifs)} blocked; R-11 must not unblock any")
    if unk != 17:
        c.bad("A10", "R06_CRITICAL_UNKNOWN_CHANGED", f"R-06 critical UNKNOWN is {unk}, expected 17")
    mv = d.get("modelingLevelVerdict", {}).get("r06Interfaces", {})
    if mv.get("stillBlocked") != blocked or mv.get("total") != len(ifs):
        c.bad("A10", "R06_INTERFACE_COUNT_MISREPORTED",
              f"R-11 claims {mv.get('stillBlocked')}/{mv.get('total')}, R-06 actual {blocked}/{len(ifs)}")
    if d.get("modelingLevelVerdict", {}).get("r06BomModified") is not False:
        c.bad("A10", "R06_MODIFIED_FLAG_WRONG", "r06BomModified must be false")
    if d.get("summary", {}).get("r06InterfacesUnblocked") != 0:
        c.bad("A10", "R06_UNBLOCK_CLAIMED", "summary.r06InterfacesUnblocked must be 0")


def a11_license(c, d, idx):
    for s in d.get("sources", []):
        if s.get("usedForGeometry"):
            lic = s.get("license")
            if not lic or lic == "UNKNOWN":
                c.bad("A11", "GEOMETRY_WITHOUT_LICENSE", f"{s['id']}: usedForGeometry but license={lic}")
        blob = json.dumps(s, ensure_ascii=False)
        if "OEM_SPEC" in blob and not s.get("drawingNumber"):
            c.bad("A11", "OEM_SPEC_WITHOUT_DRAWING_NUMBER", f"{s['id']}: claims OEM_SPEC without drawingNumber")
    for sp in d.get("referenceSpecimens", []):
        if sp.get("allowedModelingLevel") not in {"FID-V", "NONE"} and not sp.get("drawingNumber"):
            c.bad("A11", "ABOVE_VISUAL_WITHOUT_DRAWING", f"{sp['id']}: above FID-V without drawingNumber")


def a12_self_consistency(c, d, idx):
    s, mv = d.get("summary", {}), d.get("modelingLevelVerdict", {})
    srcs = d.get("sources", [])
    actual = {
        "sourcesTotal": len(srcs),
        "sourcesFetchedThisRound": sum(1 for x in srcs if x["retrieval"] == "FETCHED_THIS_ROUND"),
        "sourcesManufacturerOfficialHtmlFetched": sum(
            1 for x in srcs if x["kind"] == "MANUFACTURER_OFFICIAL_HTML" and x["retrieval"] == "FETCHED_THIS_ROUND"),
        "sourcesUnreachableOrNoData": sum(1 for x in srcs if x["retrieval"] in NO_DATA_RETRIEVAL),
        "sourcesReusedNotRefetched": sum(1 for x in srcs if x["retrieval"] == "REUSED_NOT_REFETCHED"),
        "referenceSpecimens": len(d.get("referenceSpecimens", [])),
        "r06ParamsReviewed": len(d.get("parameterVerdicts", [])),
        "conflictsNew": sum(1 for x in d.get("conflicts", []) if x.get("origin") == "R-11 新发现"),
        "codeFindings": len(d.get("codeFindings", [])),
        "decisionsRequested": len(d.get("decisionsRequested", [])),
        "nextSourceDirections": len(d.get("nextSourceDirections", [])),
    }
    for k, v in actual.items():
        if k in s and s[k] != v:
            c.bad("A12", "SUMMARY_COUNT_MISMATCH", f"summary.{k}={s[k]} but actual={v}")
    sps = d.get("referenceSpecimens", [])
    if sps:
        ps = sps[0].get("parameters", [])
        for key, gr in (("specimenParametersSourced", "SOURCED"), ("specimenParametersUnknown", "UNKNOWN")):
            n = sum(1 for p in ps if p.get("grade") == gr)
            if key in s and s[key] != n:
                c.bad("A12", "SPECIMEN_COUNT_MISMATCH", f"summary.{key}={s[key]} but actual={n}")
    unknown_critical = any(
        idx["verdict"].get(p, {}).get("r11Verdict", "").startswith("REMAINS_UNKNOWN")
        for p in ("PR-15", "PR-16"))
    if unknown_critical and mv.get("fitLevel", {}).get("allowed") is not False:
        c.bad("A12", "FIT_LEVEL_CLAIMED_WITH_UNKNOWN_FITS", "PR-15/PR-16 unknown but fitLevel.allowed != false")
    if mv.get("fitLevel", {}).get("allowed") is False and s.get("fitLevelReached") is not False:
        c.bad("A12", "FIT_LEVEL_SUMMARY_CONTRADICTION", "fitLevel blocked but summary.fitLevelReached != false")
    for dec in d.get("decisionsRequested", []):
        if not dec.get("notMyCall") and dec.get("to") == "gpt-6":
            c.bad("A12", "DECISION_NOT_MARKED_AS_COMMANDERS", f"{dec['id']}: decision to gpt-6 must set notMyCall")


RULES = [
    ("A01", a01_traceability), ("A02", a02_kind_ceiling), ("A03", a03_no_demo_upgrade),
    ("A04", a04_units), ("A05", a05_specimen_boundary), ("A06", a06_generation_condition),
    ("A07", a07_must_remain_unknown), ("A08", a08_no_data_no_claim), ("A09", a09_non_additive),
    ("A10", a10_r06_untouched), ("A11", a11_license), ("A12", a12_self_consistency),
]


def run(d):
    c = Check()
    idx = index(d)
    for _, fn in RULES:
        fn(c, d, idx)
    return c


def mutations(d):
    """每个反例必须命中其命名规则；命不中即自测失败。"""
    out = []

    def add(rule, name, fn):
        m = copy.deepcopy(d)
        fn(m)
        out.append((rule, name, m))

    add("A01", "sourced param points at nonexistent source",
        lambda m: m["referenceSpecimens"][0]["parameters"][0].__setitem__("sourceId", "T99"))
    add("A01", "claimed source has no locator",
        lambda m: next(s for s in m["sources"] if s["id"] == "T03").__setitem__("locator", None))
    add("A02", "aggregator promoted to SOURCED",
        lambda m: next(s for s in m["sources"] if s["id"] == "T05").__setitem__("grade", "SOURCED"))
    add("A02", "SOURCED without actual fetch",
        lambda m: next(s for s in m["sources"] if s["id"] == "T03").__setitem__("retrieval", "SNIPPET_ONLY"))
    add("A02", "forum used as fact",
        lambda m: next(s for s in m["sources"] if s["id"] == "T12").__setitem__("grade", "SOURCED_SECONDARY"))
    add("A03", "demo sample silently upgraded",
        lambda m: m["parameterVerdicts"][0].__setitem__("demoSampleGrade", "SOURCED"))
    add("A03", "demo upgrade count misreported",
        lambda m: m["summary"].__setitem__("r06ParamsUpgradedForDemo", 3))
    add("A04", "inch value read as mm (25.4x error)",
        lambda m: next(p for p in m["referenceSpecimens"][0]["parameters"] if p["id"] == "SP-07").__setitem__("value_mm", 0.565))
    add("A04", "inch conversion factor dropped",
        lambda m: next(p for p in m["referenceSpecimens"][0]["parameters"] if p["id"] == "SP-04").__setitem__("conversionFactor", 1))
    add("A04", "mm source value altered",
        lambda m: next(p for p in m["referenceSpecimens"][0]["parameters"] if p["id"] == "SP-08").__setitem__("value_mm", 19.0))
    add("A05", "reference specimen claimed as demo part",
        lambda m: m["referenceSpecimens"][0].__setitem__("isDemoSamplePart", True))
    add("A05", "specimen promoted above FID-V",
        lambda m: m["referenceSpecimens"][0].__setitem__("allowedModelingLevel", "FID-F"))
    add("A05", "adoption decision removed",
        lambda m: m["referenceSpecimens"][0].__setitem__("adoptionRequires", None))
    add("A06", "unresolved generation used for fit level",
        lambda m: (m["referenceSpecimens"][0].__setitem__("allowedModelingLevel", "FID-F"),
                   m["referenceSpecimens"][0]["vehicleApplication"].__setitem__("generationResolved", False)))
    add("A06", "vehicle value SOURCED without generation",
        lambda m: (m["parameterVerdicts"][0].__setitem__("realVehicleGrade", "SOURCED"),
                   m["parameterVerdicts"][0].pop("realVehicleGeneration", None)))
    add("A07", "mustRemainUnknown param filled",
        lambda m: next(v for v in m["parameterVerdicts"] if v["r06ParamId"] == "PR-15").__setitem__("demoSampleGrade", "SOURCED"))
    add("A07", "guarded param verdict deleted",
        lambda m: m.__setitem__("parameterVerdicts", [v for v in m["parameterVerdicts"] if v["r06ParamId"] != "PR-14"]))
    add("A08", "unparseable PDF used as fact",
        lambda m: next(s for s in m["sources"] if s["id"] == "T07").__setitem__("usedForClaim", True))
    add("A08", "unparseable PDF given fabricated verbatim",
        lambda m: next(s for s in m["sources"] if s["id"] == "T07").__setitem__("verbatim", ["42x80x42 mm"]))
    add("A08", "JS shell used as fact",
        lambda m: next(s for s in m["sources"] if s["id"] == "T08").__setitem__("usedForClaim", True))
    add("A08", "403 page graded as secondary evidence",
        lambda m: next(s for s in m["sources"] if s["id"] == "T10").__setitem__("grade", "SOURCED_SECONDARY"))
    add("A09", "total length fabricated by addition",
        lambda m: next(p for p in m["referenceSpecimens"][0]["parameters"] if p["id"] == "SP-13").__setitem__("value_mm", 46.6598))
    add("A09", "conflict discrepancy arithmetic falsified",
        lambda m: next(x for x in m["conflicts"] if x["id"] == "CC-07")["arithmetic"].__setitem__("discrepancy_mm", 0.0))
    add("A10", "R-06 interface unblock claimed",
        lambda m: m["modelingLevelVerdict"]["r06Interfaces"].__setitem__("stillBlocked", 11))
    add("A10", "R-06 modification flag flipped",
        lambda m: m["modelingLevelVerdict"].__setitem__("r06BomModified", True))
    add("A11", "geometry used without license",
        lambda m: next(s for s in m["sources"] if s["id"] == "T03").__setitem__("license", "UNKNOWN"))
    add("A11", "OEM_SPEC claimed without drawing number",
        lambda m: next(s for s in m["sources"] if s["id"] == "T03").__setitem__("provenance", "OEM_SPEC"))
    add("A12", "summary source count falsified",
        lambda m: m["summary"].__setitem__("sourcesTotal", 99))
    add("A12", "fit level claimed while fits unknown",
        lambda m: m["modelingLevelVerdict"]["fitLevel"].__setitem__("allowed", True))
    add("A12", "commander decision marked as own call",
        lambda m: m["decisionsRequested"][0].__setitem__("notMyCall", False))
    return out


def cmd_summary(d):
    c = run(d)
    print("R-11 GEOMETRY ANCHOR SUMMARY")
    for k, v in d.get("summary", {}).items():
        print(f"  {k}: {v}")
    print(f"  structuralViolations: {len(c.violations)}")
    return 0


def cmd_validate(d, out):
    c = run(d)
    ok = not c.violations
    print("R-11 GEOMETRY ANCHOR VALIDATION:", "PASS" if ok else "FAIL")
    for v in c.violations:
        print(f"  [{v['rule']}] {v['code']}: {v['msg']}")
    res = {"taskId": "R-11", "verdict": "PASS" if ok else "FAIL",
           "violationCount": len(c.violations), "violations": c.violations,
           "rulesChecked": [r for r, _ in RULES], "summary": d.get("summary", {})}
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, indent=2)
        print("  written:", out)
    return 0 if ok else 1


def cmd_selftest(d, out):
    caught, missed, details = 0, 0, []
    for rule, name, m in mutations(d):
        c = run(m)
        hit = rule in c.by_rule()
        details.append({"rule": rule, "mutation": name, "caught": hit,
                        "codes": [v["code"] for v in c.by_rule().get(rule, [])]})
        if hit:
            caught += 1
        else:
            missed += 1
            print(f"  MISSED [{rule}] {name}")
    total = caught + missed
    covered = sorted({r for r, _, _ in mutations(d)})
    allrules = [r for r, _ in RULES]
    uncovered = [r for r in allrules if r not in covered]
    ok = missed == 0 and not uncovered
    print(f"R-11 SELFTEST: {'PASS' if ok else 'FAIL'} — {caught} caught / {missed} missed / {total} total")
    print(f"  rule coverage: {len(covered)}/{len(allrules)}" + (f" uncovered={uncovered}" if uncovered else ""))
    res = {"taskId": "R-11", "verdict": "PASS" if ok else "FAIL", "caught": caught, "missed": missed,
           "total": total, "rulesCovered": covered, "rulesUncovered": uncovered, "cases": details}
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, indent=2)
        print("  written:", out)
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["summary", "validate", "selftest"])
    ap.add_argument("--out")
    a = ap.parse_args()
    d = load_json(EVID)
    if a.command == "summary":
        return cmd_summary(d)
    if a.command == "validate":
        return cmd_validate(d, a.out)
    return cmd_selftest(d, a.out)


if __name__ == "__main__":
    sys.exit(main())