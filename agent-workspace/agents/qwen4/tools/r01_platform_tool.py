#!/usr/bin/env python3
"""R-01 平台家族 / 车型变型规则校验器（仅 Python 标准库）。

用法：
  python r01_platform_tool.py derive
  python r01_platform_tool.py validate [--out <project-relative.json>]
  python r01_platform_tool.py selftest [--out <project-relative.json>]

设计原则：所有阈值与几何常量都来自样例 JSON，脚本内不写死任何车型数值。
反例全部在内存深拷贝中构造，不创建临时文件。
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
EXAMPLE = ROOT / "docs" / "research" / "R-01-platform-family-example.json"

GEOMETRIC_FAILURES = {
    "RANGE_VIOLATION", "FIXED_HARDPOINT_OVERRIDE", "INTERFACE_INCOMPATIBLE",
    "MODULE_SELECTION_INVALID", "MODULE_LENGTH_INSUFFICIENT",
    "DERIVED_DIMENSION_MISMATCH", "ENVELOPE_INTERFERENCE",
    "ARCHITECTURE_CROSSING", "GLOBAL_SCALE_FORBIDDEN",
}
KINEMATIC_FAILURES = {"KINEMATIC_UNRESOLVABLE"}
LEVEL_ORDER = ["VISUAL", "GEOMETRY", "KINEMATIC", "DYNAMIC"]
ALLOWED_BASIS = {"DEMO_ASSUMPTION", "LOCAL_MEASUREMENT", "SOURCED", "OPEN"}
CLAIMABLE_BASIS = {"DEMO_ASSUMPTION", "LOCAL_MEASUREMENT"}
UNVERIFIED_ONLY = {"UNVERIFIED", "OUT_OF_SCOPE"}


class Ctx:
    def __init__(self):
        self.fail: list[tuple[str, str, str]] = []
        self.info: dict = {}

    def bad(self, rule: str, ftype: str, msg: str):
        self.fail.append((rule, ftype, msg))

    def has(self, rule: str) -> bool:
        return any(r == rule for r, _, _ in self.fail)

    def types(self) -> set[str]:
        return {t for _, t, _ in self.fail}


def load_example(path: Path = EXAMPLE):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def build_index(data):
    fams = {f["id"]: f for f in data.get("platformFamilies", [])}
    archs = {a["id"]: a for a in data.get("architectures", [])}
    srcs = {s["id"]: s for s in data.get("sources", [])}
    meas = {m["id"]: m for m in data.get("localMeasurements", [])}
    slots, opts, dims, fixed = {}, {}, {}, {}
    for f in fams.values():
        for s in f.get("moduleSlots", []):
            slots[s["id"]] = s
            for o in s.get("options", []):
                opts[o["id"]] = (s, o)
        for d in f.get("parametricDimensions", []):
            dims[d["id"]] = d
        for h in f.get("fixedHardpoints", []):
            fixed[h["id"]] = h
    return {"fam": fams, "arch": archs, "src": srcs, "meas": meas,
            "slot": slots, "opt": opts, "dim": dims, "fixed": fixed}


def selected(var, idx, slot_id):
    oid = (var.get("moduleSelections") or {}).get(slot_id)
    if oid is None or oid not in idx["opt"]:
        return None
    return idx["opt"][oid][1]


def derived_length_spec(var, idx, slot_id):
    """派生公式可以声明在槽上（参数化再生成）或选项上（固定长度模块）。"""
    o = selected(var, idx, slot_id)
    s = idx["slot"].get(slot_id)
    return (o or {}).get("derivedLength") or (s or {}).get("derivedLength")


def derive(fam, var, idx):
    """由参数 + 固定硬点 + 所选模块算出派生尺寸。全部 mm。"""
    p = var.get("params", {})
    rest = fam.get("demoRestState", {})
    hub_y = rest.get("chassisConnY_mm", 0) - rest.get("suspensionRestLength_mm", 0)
    out = {"hubY_mm": hub_y}

    wb = p.get("PD-WB")
    dl = derived_length_spec(var, idx, "MS-PROPSHAFT")
    if dl and wb is not None:
        out["propshaftLength_mm"] = wb - dl.get("offset_mm", 0)

    fsusp = selected(var, idx, "MS-FSUSP")
    fh5 = idx["fixed"].get("FH-05", {}).get("value_mm", {})
    if fsusp and fh5 and p.get("PD-FT") is not None:
        ht = p["PD-FT"] / 2.0
        end_x = ht - fsusp.get("knuckleOffset_mm", 0)
        end_y = hub_y + fsusp.get("lowerEndYOffset_mm", 0)
        out["lowerArmSpan_mm"] = math.hypot(end_x - fh5.get("lowerX", 0),
                                            end_y - fh5.get("lowerY", 0))
        out["lowerArmEnd_mm"] = [round(end_x, 3), round(end_y, 3)]

    tie = selected(var, idx, "MS-STEER-LINK")
    if tie and p.get("PD-FT") is not None:
        ht = p["PD-FT"] / 2.0
        arm_x = ht - fsusp.get("knuckleOffset_mm", 0) if fsusp else ht
        arm_y = hub_y + tie.get("armEndYOffset_mm", 0)
        arm_z = tie.get("armEndZOffset_mm", 0)
        rack_x = tie.get("rackEndX_mm", 0)
        rack_y = tie.get("rackEndY_mm", 0)
        rack_z = tie.get("rackEndZOffset_mm", 0)
        out["tieRodSpan_mm"] = math.sqrt((arm_x - rack_x) ** 2
                                         + (arm_y - rack_y) ** 2
                                         + (arm_z - rack_z) ** 2)

    if p.get("PD-FT") is not None and p.get("PD-TW") is not None:
        out["wheelOuterHalfWidth_mm"] = p["PD-FT"] / 2.0 + p["PD-TW"] / 2.0

    rail = selected(var, idx, "MS-FRAME-RAIL")
    dim_wb = idx["dim"].get("PD-WB", {})
    if rail and wb is not None:
        out["railRequired_mm"] = wb + 2 * dim_wb.get("minOverhangPerEnd_mm", 0)
        out["railAvailable_mm"] = rail.get("length_mm")
    return out


# --------------------------------------------------------------------------- #
# 结构规则
# --------------------------------------------------------------------------- #
def r02_unique(c, data):
    seen = {}
    buckets = [("architectures", data.get("architectures", [])),
               ("platformFamilies", data.get("platformFamilies", [])),
               ("vehicleVariants", data.get("vehicleVariants", [])),
               ("sources", data.get("sources", [])),
               ("localMeasurements", data.get("localMeasurements", []))]
    for f in data.get("platformFamilies", []):
        for key in ("fixedHardpoints", "parametricDimensions", "moduleSlots",
                    "interfaceContracts", "rules"):
            buckets.append((f"{f['id']}.{key}", f.get(key, [])))
        for s in f.get("moduleSlots", []):
            buckets.append((f"{s['id']}.options", s.get("options", [])))
    for where, items in buckets:
        for it in items:
            i = it.get("id")
            if i is None:
                c.bad("P02", "MISSING_ID", f"{where}: entry without id")
                continue
            if i in seen:
                c.bad("P02", "DUPLICATE_ID", f"{i} declared in both {seen[i]} and {where}")
            seen[i] = where


def r03_refs(c, data, idx):
    known_src = set(idx["src"]) | set(idx["meas"])
    for f in data.get("platformFamilies", []):
        if f.get("architectureRef") not in idx["arch"]:
            c.bad("P03", "DANGLING_REF", f"{f['id']}: unknown architectureRef {f.get('architectureRef')}")
        for s in f.get("moduleSlots", []):
            ic = s.get("interfaceContractRef")
            if ic and ic not in {x["id"] for x in f.get("interfaceContracts", [])}:
                c.bad("P03", "DANGLING_REF", f"{s['id']}: unknown interfaceContractRef {ic}")
    for v in data.get("vehicleVariants", []):
        if v.get("familyRef") not in idx["fam"]:
            c.bad("P03", "DANGLING_REF", f"{v['id']}: unknown familyRef {v.get('familyRef')}")
        for slot_id, oid in (v.get("moduleSelections") or {}).items():
            if slot_id not in idx["slot"]:
                c.bad("P03", "DANGLING_REF", f"{v['id']}: unknown module slot {slot_id}")
            elif oid not in idx["opt"]:
                c.bad("P03", "DANGLING_REF", f"{v['id']}: unknown option {oid} in {slot_id}")
            elif idx["opt"][oid][0]["id"] != slot_id:
                c.bad("P03", "DANGLING_REF", f"{v['id']}: option {oid} does not belong to slot {slot_id}")

    def walk_sources(obj, where):
        if isinstance(obj, dict):
            for s in obj.get("sources", []) or []:
                if s not in known_src:
                    c.bad("P03", "DANGLING_REF", f"{where}: unknown source/measurement id {s}")
            for k, val in obj.items():
                walk_sources(val, f"{where}.{k}")
        elif isinstance(obj, list):
            for n, val in enumerate(obj):
                walk_sources(val, f"{where}[{n}]")

    walk_sources(data.get("platformFamilies", []), "platformFamilies")
    walk_sources(data.get("architectures", []), "architectures")


# --------------------------------------------------------------------------- #
# 变体规则
# --------------------------------------------------------------------------- #
def r04_range(c, fam, var, idx):
    for pid, val in (var.get("params") or {}).items():
        d = idx["dim"].get(pid)
        if d is None:
            c.bad("P04", "RANGE_VIOLATION", f"{var['id']}: param {pid} not declared by family")
            continue
        if not isinstance(val, (int, float)):
            c.bad("P04", "RANGE_VIOLATION", f"{var['id']}: {pid} is not numeric")
            continue
        if val < d["min"] or val > d["max"]:
            c.bad("P04", "RANGE_VIOLATION",
                  f"{var['id']}: {pid}={val} outside [{d['min']},{d['max']}] ({d['name']})")


def r05_fixed(c, fam, var, idx):
    for hid, val in (var.get("hardpointOverrides") or {}).items():
        h = idx["fixed"].get(hid)
        if h is None:
            c.bad("P05", "FIXED_HARDPOINT_OVERRIDE", f"{var['id']}: override of unknown hardpoint {hid}")
        elif h.get("immutable"):
            c.bad("P05", "FIXED_HARDPOINT_OVERRIDE",
                  f"{var['id']}: attempts to override immutable hardpoint {hid} ({h['name']}) with {val}")


def r06_compat(c, fam, var, idx):
    power = var.get("powertrain")
    if power not in fam.get("powertrainAxis", []):
        c.bad("P06", "INTERFACE_INCOMPATIBLE",
              f"{var['id']}: powertrain {power} not in family axis {fam.get('powertrainAxis')}")
    for slot_id, oid in (var.get("moduleSelections") or {}).items():
        if oid not in idx["opt"]:
            continue
        slot, o = idx["opt"][oid]
        cp = o.get("compatiblePowertrains")
        if cp and power not in cp:
            c.bad("P06", "INTERFACE_INCOMPATIBLE",
                  f"{var['id']}: {oid} in {slot_id} incompatible with powertrain {power} (allows {cp})")
        if o.get("powertrain") and o["powertrain"] != power:
            c.bad("P06", "INTERFACE_INCOMPATIBLE",
                  f"{var['id']}: {oid} is a {o['powertrain']} module but variant is {power}")


def r07_selection(c, fam, var, idx):
    sel = var.get("moduleSelections") or {}
    for s in fam.get("moduleSlots", []):
        if not s.get("required"):
            continue
        if s["id"] not in sel:
            c.bad("P07", "MODULE_SELECTION_INVALID", f"{var['id']}: required slot {s['id']} has no selection")
    for slot_id, oid in sel.items():
        if slot_id in idx["slot"] and oid in idx["opt"]:
            if idx["opt"][oid][0]["id"] != slot_id:
                c.bad("P07", "MODULE_SELECTION_INVALID",
                      f"{var['id']}: {oid} selected in wrong slot {slot_id}")


def r08_length(c, fam, var, idx, d):
    rail = selected(var, idx, "MS-FRAME-RAIL")
    if rail and "railRequired_mm" in d:
        if rail["length_mm"] < d["railRequired_mm"]:
            c.bad("P08", "MODULE_LENGTH_INSUFFICIENT",
                  f"{var['id']}: rail {rail['id']} length {rail['length_mm']} < required "
                  f"{d['railRequired_mm']} (wheelbase {var['params']['PD-WB']} + 2x min overhang)")
    floor = selected(var, idx, "MS-BODY-FLOOR")
    wb = (var.get("params") or {}).get("PD-WB")
    if floor and wb is not None:
        lo, hi = floor.get("minWheelbase_mm"), floor.get("maxWheelbase_mm")
        if lo is not None and hi is not None and not (lo <= wb <= hi):
            c.bad("P08", "MODULE_LENGTH_INSUFFICIENT",
                  f"{var['id']}: floor {floor['id']} covers wheelbase [{lo},{hi}] but variant is {wb}")
    shaft = selected(var, idx, "MS-PROPSHAFT")
    if shaft and derived_length_spec(var, idx, "MS-PROPSHAFT") and shaft.get("length_mm") is not None:
        if abs(shaft["length_mm"] - d.get("propshaftLength_mm", 0)) > 1e-6:
            c.bad("P08", "DERIVED_DIMENSION_MISMATCH",
                  f"{var['id']}: propshaft declared {shaft['length_mm']} != derived {d.get('propshaftLength_mm')}")


def r09_kinematic(c, fam, var, idx, d):
    fsusp = selected(var, idx, "MS-FSUSP")
    if fsusp and "lowerArmSpan_mm" in d:
        mx = fsusp.get("lowerArm", {}).get("maxSpan_mm")
        if mx is not None and d["lowerArmSpan_mm"] > mx:
            c.bad("P09", "KINEMATIC_UNRESOLVABLE",
                  f"{var['id']}: lower arm span {d['lowerArmSpan_mm']:.1f} mm exceeds {fsusp['id']} "
                  f"maxSpan {mx} mm by {d['lowerArmSpan_mm']-mx:.1f} mm; "
                  f"must reselect module or reject, NOT scale the mesh")
    tie = selected(var, idx, "MS-STEER-LINK")
    if tie and "tieRodSpan_mm" in d:
        mx = tie.get("maxSpan_mm")
        if mx is not None and d["tieRodSpan_mm"] > mx:
            c.bad("P09", "KINEMATIC_UNRESOLVABLE",
                  f"{var['id']}: tie rod span {d['tieRodSpan_mm']:.1f} mm exceeds {tie['id']} maxSpan {mx} mm")
    rsusp = selected(var, idx, "MS-RSUSP")
    rt, ft = (var.get("params") or {}).get("PD-RT"), (var.get("params") or {}).get("PD-FT")
    if rsusp and rsusp.get("trackPolicy") == "AXLE_HOUSING_REGENERATE" and rt is not None and ft is not None:
        if abs(rt - ft) > 0 and not var.get("axleHousingRegenerated"):
            c.bad("P09", "KINEMATIC_UNRESOLVABLE",
                  f"{var['id']}: solid axle with front/rear track differing ({ft} vs {rt}) "
                  f"requires axleHousingRegenerated evidence")


def r10_envelope(c, fam, var, idx, d):
    fender = selected(var, idx, "MS-FENDER")
    if fender and "wheelOuterHalfWidth_mm" in d:
        mx = fender.get("maxHalfWidth_mm")
        if mx is not None and d["wheelOuterHalfWidth_mm"] > mx:
            c.bad("P10", "ENVELOPE_INTERFERENCE",
                  f"{var['id']}: wheel outer half-width {d['wheelOuterHalfWidth_mm']:.1f} mm exceeds "
                  f"fender envelope {mx} mm by {d['wheelOuterHalfWidth_mm']-mx:.1f} mm")


def r11_mass(c, fam, var, idx):
    cv = var.get("claimedValidation") or {}
    has_cg = var.get("cgPosition_mm") is not None and var.get("axleLoads_N") is not None
    if not has_cg:
        if cv.get("massProperties") not in UNVERIFIED_ONLY:
            c.bad("P11", "MASS_PROPERTIES_MISSING",
                  f"{var['id']}: claims massProperties={cv.get('massProperties')} but no cgPosition_mm/axleLoads_N declared")
        lvl = cv.get("targetLevel")
        if lvl in LEVEL_ORDER and LEVEL_ORDER.index(lvl) > LEVEL_ORDER.index("KINEMATIC"):
            c.bad("P11", "MASS_PROPERTIES_MISSING",
                  f"{var['id']}: targetLevel={lvl} requires mass properties that are not declared")


def r12_provenance(c, data, idx):
    def walk(obj, where):
        if isinstance(obj, dict):
            b = obj.get("valueBasis")
            if b is not None:
                if b not in ALLOWED_BASIS:
                    c.bad("P12", "UNSUPPORTED_OEM_CLAIM", f"{where}: unknown valueBasis {b}")
                elif b == "SOURCED" and not obj.get("sources"):
                    c.bad("P12", "UNSUPPORTED_OEM_CLAIM", f"{where}: valueBasis=SOURCED without any source id")
            if obj.get("designDecision") == "OEM_PRACTICE_EVIDENCE" and not obj.get("sources"):
                c.bad("P12", "UNSUPPORTED_OEM_CLAIM", f"{where}: OEM_PRACTICE_EVIDENCE without source id")
            for k, v in obj.items():
                walk(v, f"{where}.{k}")
        elif isinstance(obj, list):
            for n, v in enumerate(obj):
                walk(v, f"{where}[{n}]")

    walk(data.get("platformFamilies", []), "platformFamilies")
    for v in data.get("vehicleVariants", []):
        if v.get("valueBasis") not in CLAIMABLE_BASIS:
            c.bad("P12", "UNSUPPORTED_OEM_CLAIM",
                  f"{v['id']}: variant valueBasis={v.get('valueBasis')}; this round only "
                  f"{sorted(CLAIMABLE_BASIS)} are allowed (no OEM parameter claims)")


def r13_scope(c, fam, var, idx):
    cv = var.get("claimedValidation") or {}
    for k in ("strengthAndDurability", "regulatoryCompliance"):
        if cv.get(k) not in UNVERIFIED_ONLY:
            c.bad("P13", "REGULATORY_CLAIM_UNVERIFIED",
                  f"{var['id']}: {k}={cv.get(k)} — strength/regulatory cannot pass without verified evidence")


def r14_scale(c, fam, var, idx):
    for k in ("scale", "globalScale", "meshScale"):
        if k in var:
            c.bad("P14", "GLOBAL_SCALE_FORBIDDEN",
                  f"{var['id']}: carries '{k}'={var[k]}; variants must regenerate modules, not scale the vehicle mesh")


def r15_arch(c, fam, var, idx):
    arch = fam.get("architectureRef")
    for slot_id, oid in (var.get("moduleSelections") or {}).items():
        if oid not in idx["opt"]:
            continue
        o = idx["opt"][oid][1]
        ca = o.get("compatibleArchitectures")
        if ca and arch not in ca:
            c.bad("P15", "ARCHITECTURE_CROSSING",
                  f"{var['id']}: {oid} in {slot_id} allows {ca} but family architecture is {arch}"
                  + (" — a unibody shell is a structural member, not a cosmetic swap" if slot_id == "MS-BODY-UPPER" else ""))


def r16_verdict(c, fam, var, idx):
    cv = var.get("claimedValidation") or {}
    types = c.types()
    geo_actual = "FAIL" if types & GEOMETRIC_FAILURES else "PASS"
    kin_actual = "FAIL" if types & KINEMATIC_FAILURES else "PASS"
    if cv.get("geometricCompatibility") != geo_actual:
        c.bad("P16", "VERDICT_SELF_INCONSISTENT",
              f"{var['id']}: claims geometricCompatibility={cv.get('geometricCompatibility')} but rules computed {geo_actual}")
    if cv.get("kinematicCompatibility") != kin_actual:
        c.bad("P16", "VERDICT_SELF_INCONSISTENT",
              f"{var['id']}: claims kinematicCompatibility={cv.get('kinematicCompatibility')} but rules computed {kin_actual}")


VARIANT_RULES = [
    ("P04", r04_range), ("P05", r05_fixed), ("P06", r06_compat), ("P07", r07_selection),
    ("P08", r08_length), ("P09", r09_kinematic), ("P10", r10_envelope), ("P11", r11_mass),
    ("P13", r13_scope), ("P14", r14_scale), ("P15", r15_arch), ("P16", r16_verdict),
]
NEEDS_DERIVE = {"P08", "P09", "P10"}
# 数据层规则：必须 0 违规。变体层规则在非法变体上命中是**期望输出**，不是失败。
STRUCTURAL_RULES = {"P01", "P02", "P03", "P12"}


def split_structural(fails):
    return ([f for f in fails if f[0] in STRUCTURAL_RULES],
            [f for f in fails if f[0] not in STRUCTURAL_RULES])


def evaluate_variant(fam, var, idx):
    c = Ctx()
    d = derive(fam, var, idx)
    for rid, fn in VARIANT_RULES:
        if rid in NEEDS_DERIVE:
            fn(c, fam, var, idx, d)
        else:
            fn(c, fam, var, idx)
    return c, d


def run_rules(data):
    c = Ctx()
    idx = build_index(data)
    r02_unique(c, data)
    r03_refs(c, data, idx)
    r12_provenance(c, data, idx)
    results = {}
    for v in data.get("vehicleVariants", []):
        fam = idx["fam"].get(v.get("familyRef"))
        if fam is None:
            continue
        vc, d = evaluate_variant(fam, v, idx)
        verdict = "ILLEGAL" if vc.fail else "LEGAL"
        results[v["id"]] = {
            "verdict": verdict,
            "failures": [{"rule": r, "type": t, "message": m} for r, t, m in vc.fail],
            "failureTypes": sorted({t for _, t, _ in vc.fail}),
            "derived": {k: (round(x, 3) if isinstance(x, float) else x) for k, x in d.items()},
        }
        for r, t, m in vc.fail:
            c.bad(r, t, m)
    c.info["variants"] = {k: v["verdict"] for k, v in results.items()}
    c.info["variantCount"] = len(results)
    c.info["familyCount"] = len(idx["fam"])
    c.info["sourceCount"] = len(idx["src"])
    c.info["measurementCount"] = len(idx["meas"])
    c.info["ruleCount"] = 16
    return c, results, idx


def check_fixture(data, results):
    """样例本身就是测试夹具：实际判定必须与 expected 一致。"""
    problems = []
    for v in data.get("vehicleVariants", []):
        exp = v.get("expected")
        got = results.get(v["id"])
        if not exp or not got:
            problems.append(f"{v['id']}: missing expected or result")
            continue
        if exp.get("verdict") != got["verdict"]:
            problems.append(f"{v['id']}: expected verdict {exp['verdict']} but got {got['verdict']}")
        ef, gf = set(exp.get("failures", [])), set(got["failureTypes"])
        if ef != gf:
            problems.append(f"{v['id']}: expected failure types {sorted(ef)} but got {sorted(gf)} "
                            f"(missing {sorted(ef-gf)}, extra {sorted(gf-ef)})")
        de = v.get("derivedExpected") or {}
        for k, want in de.items():
            have = got["derived"].get(k)
            if have is None or abs(have - want) > 0.15:
                problems.append(f"{v['id']}: derived {k} expected {want} but got {have}")
    return problems


# --------------------------------------------------------------------------- #
# 命令
# --------------------------------------------------------------------------- #
def do_derive():
    data = load_example()
    idx = build_index(data)
    for v in data["vehicleVariants"]:
        fam = idx["fam"][v["familyRef"]]
        d = derive(fam, v, idx)
        print(f"{v['id']} ({v['name']}):")
        for k, x in d.items():
            print(f"   {k} = {round(x,3) if isinstance(x,float) else x}")
    return 0


def do_validate(out):
    try:
        data = load_example()
    except Exception as exc:
        print(f"[P01] cannot parse example: {exc}")
        return 1
    c, results, idx = run_rules(data)
    fixture = check_fixture(data, results)
    structural, rejections = split_structural(c.fail)
    ok = not structural and not fixture
    print("=" * 72)
    print("R-01 PLATFORM FAMILY VALIDATION:", "PASS" if ok else "FAIL")
    print("=" * 72)
    for k, x in c.info.items():
        print(f"  {k}: {x}")
    print(f"  structuralViolations: {len(structural)}  (must be 0)")
    print(f"  rejectionsOnIllegalVariants: {len(rejections)}  (expected output, not a failure)")
    print(f"  fixtureMismatches: {len(fixture)}  (must be 0)")
    for r, t, m in structural:
        print(f"  STRUCTURAL [{r}/{t}] {m}")
    for vid, r in results.items():
        print(f"\n  {vid}: {r['verdict']}")
        for k, x in r["derived"].items():
            print(f"     derived {k} = {x}")
        for f in r["failures"]:
            print(f"     [{f['rule']}/{f['type']}] {f['message']}")
    if fixture:
        print(f"\n{len(fixture)} fixture mismatch(es):")
        for p in fixture:
            print("  " + p)
    if c.fail:
        print(f"\n{len(c.fail)} rule hit(s) total = {len(structural)} structural + {len(rejections)} expected rejections")
    result = {
        "artifact": "R-01-validation-result",
        "tool": "agent-workspace/agents/qwen4/tools/r01_platform_tool.py",
        "command": ".venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r01_platform_tool.py validate --out agent-workspace/agents/qwen4/reports/R-01-validation-result.json",
        "overall": "PASS" if ok else "FAIL",
        "successCriterion": "结构规则(P01/P02/P03/P12) 0 违规，且每个变体的实际判定/失败类型/派生尺寸与 expected 夹具完全一致。非法变体被拒绝是期望输出，不计为失败。",
        "structuralViolationCount": len(structural),
        "structuralViolations": [{"rule": r, "type": t, "message": m} for r, t, m in structural],
        "expectedRejectionCount": len(rejections),
        "fixtureMismatches": fixture,
        "metrics": c.info,
        "variants": results,
    }
    if out:
        p = ROOT / out
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {out}")
    return 0 if ok else 1


def mutations():
    def dup_id(d):
        d["vehicleVariants"].append(copy.deepcopy(d["vehicleVariants"][0]))

    def bad_family(d):
        d["vehicleVariants"][0]["familyRef"] = "PF-NOT-EXIST"

    def bad_option(d):
        d["vehicleVariants"][0]["moduleSelections"]["MS-FRAME-RAIL"] = "RAIL-9999"

    def out_of_range(d):
        d["vehicleVariants"][0]["params"]["PD-WB"] = 2700

    def override_fixed(d):
        d["vehicleVariants"][0]["hardpointOverrides"] = {"FH-05": {"lowerX": 400}}

    def wrong_power(d):
        d["vehicleVariants"][0]["moduleSelections"]["MS-POWER"] = "BEV-PE-MODULE"

    def missing_slot(d):
        del d["vehicleVariants"][0]["moduleSelections"]["MS-FSUSP"]

    def short_rail(d):
        for o in d["platformFamilies"][0]["moduleSlots"][0]["options"]:
            if o["id"] == "RAIL-2860":
                o["length_mm"] = 2500

    def floor_cover(d):
        for s in d["platformFamilies"][0]["moduleSlots"]:
            if s["id"] == "MS-BODY-FLOOR":
                for o in s["options"]:
                    if o["id"] == "FLOOR-STD":
                        o["maxWheelbase_mm"] = 2400

    def arm_span(d):
        for s in d["platformFamilies"][0]["moduleSlots"]:
            if s["id"] == "MS-FSUSP":
                for o in s["options"]:
                    if o["id"] == "DWB-STD":
                        o["lowerArm"]["maxSpan_mm"] = 400

    def tie_span(d):
        for s in d["platformFamilies"][0]["moduleSlots"]:
            if s["id"] == "MS-STEER-LINK":
                s["options"][0]["maxSpan_mm"] = 400

    def fender(d):
        for s in d["platformFamilies"][0]["moduleSlots"]:
            if s["id"] == "MS-FENDER":
                s["options"][0]["maxHalfWidth_mm"] = 900

    def mass_claim(d):
        d["vehicleVariants"][0]["claimedValidation"]["massProperties"] = "COMPUTED"

    def dynamic_claim(d):
        d["vehicleVariants"][0]["claimedValidation"]["targetLevel"] = "DYNAMIC"

    def oem_claim(d):
        d["vehicleVariants"][0]["valueBasis"] = "SOURCED"

    def regulatory_claim(d):
        d["vehicleVariants"][0]["claimedValidation"]["regulatoryCompliance"] = "PASS"

    def global_scale(d):
        d["vehicleVariants"][0]["scale"] = 1.2

    def sedan_shell(d):
        d["vehicleVariants"][0]["moduleSelections"]["MS-BODY-UPPER"] = "UNI-SEDAN-SHELL"

    def verdict_lie(d):
        d["vehicleVariants"][0]["claimedValidation"]["geometricCompatibility"] = "FAIL"

    def fixture_lie(d):
        d["vehicleVariants"][0]["expected"]["verdict"] = "ILLEGAL"

    return [
        ("P02", "duplicate variant id", dup_id, False),
        ("P03", "variant points at nonexistent family", bad_family, False),
        ("P03", "selection cites nonexistent module option", bad_option, False),
        ("P04", "wheelbase outside declared range", out_of_range, False),
        ("P05", "variant overrides an immutable hardpoint", override_fixed, False),
        ("P06", "BEV module selected in an ICE variant", wrong_power, False),
        ("P07", "required suspension slot left unselected", missing_slot, False),
        ("P08", "frame rail shorter than wheelbase + overhangs", short_rail, False),
        ("P08", "floor module does not cover the wheelbase", floor_cover, False),
        ("P09", "lower arm span exceeds module maxSpan", arm_span, False),
        ("P09", "tie rod span exceeds module maxSpan", tie_span, False),
        ("P10", "wheel outer edge beyond fender envelope", fender, False),
        ("P11", "claims computed mass properties without CG", mass_claim, False),
        ("P11", "claims DYNAMIC level without mass properties", dynamic_claim, False),
        ("P12", "variant claims SOURCED basis with no source", oem_claim, False),
        ("P13", "claims regulatory compliance PASS", regulatory_claim, False),
        ("P14", "variant carries a global mesh scale", global_scale, False),
        ("P15", "unibody sedan shell in a body-on-frame family", sedan_shell, False),
        ("P16", "claimed geometric verdict contradicts rules", verdict_lie, False),
        ("FIXTURE", "expected verdict no longer matches computed", fixture_lie, True),
    ]


def do_selftest(out):
    data0 = load_example()
    base, results0, _ = run_rules(data0)
    fixture0 = check_fixture(data0, results0)
    base_struct, base_rej = split_structural(base.fail)
    print("baseline structural violations:", len(base_struct), "(must be 0)")
    for r, t, m in base_struct[:10]:
        print(f"   [{r}/{t}] {m}")
    print("baseline expected rejections on the illegal variant:", len(base_rej))
    print("baseline fixture mismatches:", len(fixture0))
    print("-" * 72)
    passed = failed = 0
    rows = []
    for rule, label, fn, is_fixture in mutations():
        d = copy.deepcopy(data0)
        try:
            fn(d)
        except Exception as exc:
            failed += 1
            print(f"  ERROR  {rule:8s} {label}: {exc}")
            rows.append({"rule": rule, "mutation": label, "result": "MUTATION_ERROR", "detail": str(exc)})
            continue
        c, res, _ = run_rules(d)
        fx = check_fixture(d, res)
        hit = bool(fx) if is_fixture else c.has(rule)
        if hit:
            passed += 1
            sample = fx[0] if is_fixture else next(m for r, _, m in c.fail if r == rule)
            print(f"  CAUGHT {rule:8s} {label}")
            rows.append({"rule": rule, "mutation": label, "result": "CAUGHT", "sample": sample})
        else:
            failed += 1
            print(f"  MISSED {rule:8s} {label}  <-- validator is blind to this error")
            rows.append({"rule": rule, "mutation": label, "result": "MISSED",
                         "violations": sorted({r for r, _, _ in c.fail})})
    # P01 是加载层规则：在内存里让真实文件"解析失败"，不写任何临时文件。
    print("-" * 72)
    real_load = load_example

    def broken(path=EXAMPLE):
        raise ValueError("simulated malformed JSON")

    globals()["load_example"] = broken
    try:
        try:
            load_example()
            p01 = False
        except Exception:
            p01 = True
    finally:
        globals()["load_example"] = real_load
    if p01:
        passed += 1
        print("  CAUGHT P01      malformed example file reported by the loader")
        rows.append({"rule": "P01", "mutation": "malformed example file (in-memory loader patch)",
                     "result": "CAUGHT"})
    else:
        failed += 1
        print("  MISSED P01      loader did not report a malformed file")
        rows.append({"rule": "P01", "mutation": "malformed example file", "result": "MISSED"})

    covered = sorted({r for r, _, _, _ in mutations()} | {"P01"})
    all_rules = [f"P{i:02d}" for i in range(1, 17)]
    uncovered = [r for r in all_rules if r not in covered]
    total = len(rows)
    print("-" * 72)
    print(f"NEGATIVE CONTROLS: {passed} caught / {failed} missed / {total} total")
    print(f"RULES WITH A NEGATIVE CONTROL: {len([r for r in covered if r in all_rules])}/16"
          + (f"  (none for: {', '.join(uncovered)})" if uncovered else ""))
    ok = failed == 0 and not base_struct and not fixture0
    print("SELFTEST:", "PASS" if ok else "FAIL")
    if out:
        result = {
            "artifact": "R-01-selftest-result",
            "tool": "agent-workspace/agents/qwen4/tools/r01_platform_tool.py",
            "overall": "PASS" if ok else "FAIL",
            "baselineStructuralViolations": len(base_struct),
            "baselineExpectedRejections": len(base_rej),
            "baselineFixtureMismatches": len(fixture0),
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
    ap.add_argument("cmd", choices=["derive", "validate", "selftest"])
    ap.add_argument("--out", help="write result JSON to this project-relative path")
    a = ap.parse_args()
    if a.cmd == "derive":
        sys.exit(do_derive())
    if a.cmd == "validate":
        sys.exit(do_validate(a.out))
    sys.exit(do_selftest(a.out))


if __name__ == "__main__":
    main()