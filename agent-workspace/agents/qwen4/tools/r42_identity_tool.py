#!/usr/bin/env python3
"""R-42 转向外端身份校验器：16 条规则 + 负例自检（stdlib only）。"""
import copy
import hashlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
FIXTURE = "docs/research/R-42-steering-end-identity.fixture.json"
R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
SNAP = "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json"
C05 = "cad/experiments/wheel-end-steering-datum-v1/out/c05-ee1e461fecf00faa8151/manifest.json"
STEERING_PARTS = ("PART-20-074", "PART-20-075", "PART-20-076", "PART-20-077", "PART-20-078")


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def sha256(rel):
    h = hashlib.sha256()
    with open(os.path.join(ROOT, rel), "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Check:
    def __init__(self):
        self.violations = []

    def bad(self, rule, code, message):
        self.violations.append({"rule": rule, "code": code, "message": message})


def ctx(d):
    a = load(R16)
    return {
        "a": a, "snap": load(SNAP), "c05": load(C05),
        "defs": {x["id"]: x for x in a["partDefinitions"]},
        "ai": {x["instanceId"]: x for x in a["assemblyInstances"]},
        "pi": a["partInstances"],
    }


def y01_refs(c, d, I):
    for pid in ("PART-20-075", "PART-20-074", "PART-20-016"):
        if pid not in I["defs"]:
            c.bad("Y01", "PART_NOT_IN_R16", pid)
    if d["outerTieRod"]["parentDefinitionId"] not in {x["id"] for x in I["a"]["assemblies"]}:
        c.bad("Y01", "PARENT_ASSEMBLY_NOT_IN_R16", d["outerTieRod"]["parentDefinitionId"])
    for aid in d["outerTieRod"]["parentAssemblyInstanceIds"]:
        if aid not in I["ai"]:
            c.bad("Y01", "PARENT_INSTANCE_NOT_IN_R16", aid)


def y02_arm_not_part(c, d, I):
    if d["steeringArm"]["isSeparatePart"] is not False:
        c.bad("Y02", "STEERING_ARM_MADE_A_PART", "拉杆臂是转向节本体特征")
    live_owner = I["defs"].get(d["steeringArm"]["ownerPartDefinitionId"])
    if not live_owner or live_owner["parentId"] != "ASSY-20-004":
        c.bad("Y02", "ARM_OWNER_WRONG", d["steeringArm"]["ownerPartDefinitionId"])
    if "拉杆臂" not in (live_owner.get("geomNote") or ""):
        c.bad("Y02", "ARM_FEATURE_EVIDENCE_MISSING", "R-16 geomNote 未提拉杆臂")
    for k, v in I["defs"].items():
        if "转向臂" in (v.get("name") or "") or "转向节臂" in (v.get("name") or ""):
            c.bad("Y02", "SEPARATE_STEERING_ARM_DEF_EXISTS", k)


def y03_outer(c, d, I):
    o, live = d["outerTieRod"], I["defs"]["PART-20-075"]
    pairs = [("parentDefinitionId", live["parentId"]), ("qtyVehicleTotal", live["qtyVehicleTotal"]),
             ("evidenceInherited", live["evidenceInherited"]), ("sources", live["sources"]),
             ("familyRef", live["familyRef"]), ("instancePolicy", live["instancePolicy"]),
             ("handednessKind", live["handednessPolicy"]["kind"])]
    for k, actual in pairs:
        if o[k] != actual:
            c.bad("Y03", "OUTER_TIE_ROD_MISMATCH", f"{k}: {o[k]} != {actual}")
    if o["statusToken"] != "REQUIRED_BUT_DEFERRED":
        c.bad("Y03", "STATUS_TOKEN_WRONG", o["statusToken"])


def y04_zero_instances(c, d, I):
    for pid in STEERING_PARTS:
        live = [p for p in I["pi"] if p["definitionId"] == pid]
        if live:
            c.bad("Y04", "UNEXPECTED_INSTANCE", f"{pid}: {len(live)}")
    if d["outerTieRod"]["instanceCount"] != 0:
        c.bad("Y04", "INSTANCE_COUNT_CLAIMED", str(d["outerTieRod"]["instanceCount"]))
    if d["entryGate"]["currentInstanceCount"] != 0:
        c.bad("Y04", "GATE_INSTANCE_COUNT_CLAIMED", str(d["entryGate"]["currentInstanceCount"]))


def y05_family(c, d, I):
    ft = d["familyTrap"]
    live = sorted(k for k, v in I["defs"].items() if v.get("familyRef") == ft["familyRef"])
    if ft["members"] != live:
        c.bad("Y05", "FAMILY_MEMBERS_WRONG", f"{ft['members']} != {live}")
    if ft["dedupForbidden"] is not True:
        c.bad("Y05", "FAMILY_DEDUP_ALLOWED", "必须禁止按 familyRef 合并")
    if "PART-20-075" not in ft["members"] or "PART-20-074" not in ft["members"]:
        c.bad("Y05", "INNER_OUTER_NOT_BOTH_LISTED", str(ft["members"]))


def y06_companions(c, d, I):
    got = {x["partId"] for x in d["companions"]}
    if got != {"PART-20-076", "PART-20-077", "PART-20-078"}:
        c.bad("Y06", "COMPANION_SET_WRONG", str(sorted(got)))
    fams = [x["familyRef"] for x in d["companions"]]
    if len(set(fams)) != len(fams):
        c.bad("Y06", "COMPANIONS_SHARE_FAMILY", str(fams))
    for x in d["companions"]:
        if x["partId"] == "PART-20-075":
            c.bad("Y06", "OUTER_TIE_ROD_MERGED_INTO_COMPANIONS", x["partId"])


def y07_structural(c, d, I):
    sb = d["structuralBlocker"]
    combo = {}
    for p in I["pi"]:
        key = "%s->%s" % (I["ai"][p["assemblyInstanceId"]]["corner"], p["corner"])
        combo[key] = combo.get(key, 0) + 1
    if sb["cornerCombos"] != combo:
        c.bad("Y07", "CORNER_COMBOS_WRONG", "与 R-16 实际不一致")
    live_diag = all(k.split("->")[0] == k.split("->")[1] for k in combo)
    if sb["diagonalOnly"] != live_diag:
        c.bad("Y07", "DIAGONAL_CLAIM_WRONG", str(sb["diagonalOnly"]))
    if not sb["decisionOptions"] or not sb["decisionOwner"]:
        c.bad("Y07", "STRUCTURAL_BLOCKER_INCOMPLETE", "必须给选项与责任方")
    if sb["executorCannotDecide"] is not True:
        c.bad("Y07", "BLOCKER_CLAIMED_EXECUTOR_DECIDABLE", "执行侧不得自行裁决装配层级")


def y08_geometry_not_blocker(c, d, I):
    ce = d["structuralBlocker"].get("counterexampleGeometryIsNotTheBlocker") or {}
    if not ce.get("partId"):
        c.bad("Y08", "COUNTEREXAMPLE_MISSING", "必须给出『几何不是阻断原因』的反例")
        return
    live = [p for p in I["pi"] if p["definitionId"] == ce["partId"]]
    if not live:
        c.bad("Y08", "COUNTEREXAMPLE_HAS_NO_INSTANCE", ce["partId"])
    if ce["handednessKind"] != I["defs"][ce["partId"]]["handednessPolicy"]["kind"]:
        c.bad("Y08", "COUNTEREXAMPLE_HANDEDNESS_WRONG", ce["handednessKind"])
    if "GEOMETRY_PENDING" not in {p["geometryStatus"] for p in live}:
        c.bad("Y08", "COUNTEREXAMPLE_GEOMETRY_READY", "反例零件应有待建几何实例")
    if not ce["why"]:
        c.bad("Y08", "COUNTEREXAMPLE_REASON_MISSING", ce["partId"])


def y09_gate(c, d, I):
    g = d["entryGate"]
    ids = [x["id"] for x in g["checks"]]
    if len(ids) != len(set(ids)):
        c.bad("Y09", "GATE_ID_DUPLICATE", "duplicate")
    blocking = [x["id"] for x in g["checks"] if not x["satisfied"]]
    if g["blockingChecks"] != blocking:
        c.bad("Y09", "BLOCKING_LIST_MISMATCH", f"{g['blockingChecks']} != {blocking}")
    if g["allSatisfied"] != (not blocking):
        c.bad("Y09", "GATE_ALL_SATISFIED_WRONG", "聚合判断与逐项不一致")
    if g["allSatisfied"] and not g["blockingChecks"]:
        c.bad("Y09", "GATE_OPEN_WITHOUT_INSTANCES", "门槛已满足却没有实例，需解释")
    if "GEOMETRY_PENDING" not in g["entryRule"]:
        c.bad("Y09", "ENTRY_RULE_HIDES_GEOMETRY_RULE", "必须说明几何可保持待建")


def y10_c05_assets(c, d, I):
    for key in ("derivedKnuckle", "outerBallStud"):
        live = I["c05"]["assets"][key]["partInstanceId"]
        if live is not None:
            c.bad("Y10", "C05_ASSET_IS_INSTANCE", key)
        claimed = d["steeringArm"]["c05"]["partInstanceId"] if key == "derivedKnuckle" \
            else d["outerTieRod"]["c05"]["partInstanceId"]
        if claimed is not None:
            c.bad("Y10", "C05_ASSET_CLAIMED_PI", key)
    if d["steeringArm"]["c05"]["role"] != "EXPERIMENTAL_DERIVATIVE":
        c.bad("Y10", "DERIVED_KNUCKLE_ROLE_WRONG", d["steeringArm"]["c05"]["role"])
    if d["outerTieRod"]["c05"]["role"] != "BALL_STUD_ONLY":
        c.bad("Y10", "STUD_ROLE_WRONG", d["outerTieRod"]["c05"]["role"])


def y11_ball_center(c, d, I):
    live = I["c05"]["outerBallCenter"]["workholdingYUpM"]
    if d["motion"]["outerBallCenterWorkholdingYUpM"] != live:
        c.bad("Y11", "OUTER_BALL_CENTER_MISMATCH", str(d["motion"]["outerBallCenterWorkholdingYUpM"]))
    if d["outerTieRod"]["c05"]["outerBallCenterWorkholdingYUpM"] != live:
        c.bad("Y11", "OUTER_TIE_ROD_BALL_CENTER_MISMATCH", "duplicated field disagrees")
    if d["motion"]["ballCenterIsPhysicalInstance"] is not False:
        c.bad("Y11", "BALL_CENTER_TREATED_AS_INSTANCE", "球心只是参考点")


def y12_motion_nulls(c, d, I):
    m = d["motion"]
    if m["playbackAllowed"] is not False:
        c.bad("Y12", "PLAYBACK_AUTHORISED", "本轮不得授权播放")
    if m["existingR28Registration"] != "REGISTRATION_BLOCKED":
        c.bad("Y12", "REGISTRATION_CLAIMED_OK", str(m["existingR28Registration"]))
    for k in ("innerTieRodInterface", "tieRodLengthMm", "vehicleFromWorkholding"):
        if m[k] is not None:
            c.bad("Y12", "UNCLOSED_FIELD_FILLED", k)
    if m["outerTieRodEndIdentity"]["snapshotInstanceCount"] != 0:
        c.bad("Y12", "MOTION_IDENTITY_INSTANCE_CLAIMED", "外拉杆端零实例")


def y13_snapshot(c, d, I):
    st = d["snapshotState"]
    if st["readOnlyInput"] is not True:
        c.bad("Y13", "SNAPSHOT_NOT_READONLY", "快照必须只读")
    if st["snapshotId"] != I["snap"]["snapshotId"] or st["revision"] != I["snap"]["revision"]:
        c.bad("Y13", "SNAPSHOT_ID_REVISION_WRONG", f"{st['snapshotId']}/{st['revision']}")
    if st["r26Block"]["status"] != "ready":
        c.bad("Y13", "R26_BLOCK_ALTERED", "不得改写快照 r26 块")
    if st["committedPinMatchesCurrentR26"] is not False:
        c.bad("Y13", "STALE_R26_CLAIMED_MATCHING", "已提交 pin 与当前 R-26 不符")
    if d["invariants"]["snapshotRebuilt"] is not False:
        c.bad("Y13", "SNAPSHOT_CLAIMED_REBUILT", "R-42 不得重建快照")


def y14_rejections(c, d, I):
    ids = {r["id"] for r in d["rejectedClaims"]}
    must = {"REJ-42-01", "REJ-42-02", "REJ-42-03", "REJ-42-04", "REJ-42-05"}
    if not must <= ids:
        c.bad("Y14", "REQUIRED_REJECTION_MISSING", str(sorted(must - ids)))
    text = json.dumps(d["rejectedClaims"], ensure_ascii=False)
    for kw in ("转向臂", "球心", "RL/RR", "FAM-130-015"):
        if kw not in text:
            c.bad("Y14", "REJECTION_TOPIC_MISSING", kw)


def y15_inputs(c, d, I):
    for x in d["inputs"]:
        if x.get("readOnly") is not True:
            c.bad("Y15", "INPUT_NOT_READONLY", x["path"])
        if not os.path.exists(os.path.join(ROOT, x["path"])):
            c.bad("Y15", "INPUT_PATH_MISSING", x["path"])
            continue
        if x["hashPolicy"] == "REQUIRED" and x.get("sha256") != sha256(x["path"]):
            c.bad("Y15", "INPUT_HASH_MISMATCH", x["path"])


def y16_invariants(c, d, I):
    inv = d["invariants"]
    for k in ("sourceFilesModified", "steeringArmCreatedAsPart", "ballCenterTreatedAsInstance",
              "familyDeduped", "playbackAuthorised", "snapshotRebuilt"):
        if inv.get(k) is not False:
            c.bad("Y16", "INVARIANT_FALSE_BROKEN", k)
    for k in ("newPhysicalInstancesCreated",):
        if inv.get(k) != 0:
            c.bad("Y16", "INVARIANT_ZERO_BROKEN", k)


RULES = [
    ("Y01", y01_refs), ("Y02", y02_arm_not_part), ("Y03", y03_outer), ("Y04", y04_zero_instances),
    ("Y05", y05_family), ("Y06", y06_companions), ("Y07", y07_structural),
    ("Y08", y08_geometry_not_blocker), ("Y09", y09_gate), ("Y10", y10_c05_assets),
    ("Y11", y11_ball_center), ("Y12", y12_motion_nulls), ("Y13", y13_snapshot),
    ("Y14", y14_rejections), ("Y15", y15_inputs), ("Y16", y16_invariants),
]


def run(d):
    c = Check()
    I = ctx(d)
    for _, fn in RULES:
        fn(c, d, I)
    return c, I


def mutations(d, I):
    out = []

    def add(rule, name, fn):
        m = copy.deepcopy(d)
        fn(m)
        out.append((rule, name, m))

    add("Y01", "parent assembly id does not exist", lambda m: m["outerTieRod"].__setitem__(
        "parentDefinitionId", "ASSY-20-999"))
    add("Y02", "steering arm promoted to separate part", lambda m: m["steeringArm"].__setitem__(
        "isSeparatePart", True))
    add("Y02", "arm owner repointed to another part", lambda m: m["steeringArm"].__setitem__(
        "ownerPartDefinitionId", "PART-20-075"))
    add("Y03", "outer tie rod qty altered", lambda m: m["outerTieRod"].__setitem__(
        "qtyVehicleTotal", 4))
    add("Y03", "status token upgraded to instantiated", lambda m: m["outerTieRod"].__setitem__(
        "statusToken", "INSTANTIATED"))
    add("Y04", "instance count claimed non-zero", lambda m: m["outerTieRod"].__setitem__(
        "instanceCount", 2))
    add("Y05", "inner tie rod dropped from family", lambda m: m["familyTrap"].__setitem__(
        "members", ["PART-20-075"]))
    add("Y06", "companion part removed", lambda m: m["companions"].pop())
    add("Y07", "corner combos falsified", lambda m: m["structuralBlocker"].__setitem__(
        "cornerCombos", {"FL->FL": 1}))
    add("Y07", "diagonal claim inverted", lambda m: m["structuralBlocker"].__setitem__(
        "diagonalOnly", False))
    add("Y07", "executor claims it can decide hierarchy", lambda m: m["structuralBlocker"].__setitem__(
        "executorCannotDecide", False))
    add("Y08", "geometry counterexample removed", lambda m: m["structuralBlocker"].__setitem__(
        "counterexampleGeometryIsNotTheBlocker", {}))
    add("Y09", "blocking list hidden", lambda m: m["entryGate"].__setitem__("blockingChecks", []))
    add("Y09", "gate claims all satisfied while blocked", lambda m: m["entryGate"].__setitem__(
        "allSatisfied", True))
    add("Y10", "experimental knuckle claimed as PI", lambda m: m["steeringArm"]["c05"].__setitem__(
        "partInstanceId", "PI-20-016-FL"))
    add("Y10", "stud role escalated", lambda m: m["outerTieRod"]["c05"].__setitem__(
        "role", "COMPLETE_PART"))
    add("Y11", "outer ball centre numerically altered", lambda m: m["motion"].__setitem__(
        "outerBallCenterWorkholdingYUpM", [0.0, 0.0, 0.0]))
    add("Y12", "playback authorised", lambda m: m["motion"].__setitem__("playbackAllowed", True))
    add("Y12", "tie rod length fabricated", lambda m: m["motion"].__setitem__("tieRodLengthMm", 300.0))
    add("Y13", "r26 block rewritten as approved", lambda m: m["snapshotState"]["r26Block"].__setitem__(
        "status", "approved"))
    add("Y13", "snapshot claimed rebuilt", lambda m: m["invariants"].__setitem__("snapshotRebuilt", True))
    add("Y14", "motion-point rejection removed", lambda m: m.__setitem__(
        "rejectedClaims", [r for r in m["rejectedClaims"] if r["id"] != "REJ-42-03"]))
    add("Y15", "input hash falsified", lambda m: m["inputs"][0].__setitem__("sha256", "0" * 64))
    add("Y16", "steering arm created as part invariant broken", lambda m: m["invariants"].__setitem__(
        "steeringArmCreatedAsPart", True))
    return out


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "validate"
    out_path = None
    if "--out" in sys.argv:
        out_path = sys.argv[sys.argv.index("--out") + 1]
    d = load(FIXTURE)

    if mode == "validate":
        c, _ = run(d)
        ok = not c.violations
        print("R-42 STEERING IDENTITY VALIDATION: %s" % ("PASS" if ok else "FAIL"))
        for v in c.violations[:30]:
            print("  [%s] %s: %s" % (v["rule"], v["code"], v["message"]))
        if out_path:
            with open(os.path.join(ROOT, out_path), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"taskId": "R-42", "mode": "validate", "verdict": "PASS" if ok else "FAIL",
                           "violationCount": len(c.violations), "violations": c.violations},
                          fh, ensure_ascii=False, indent=2)
            print("  written:", out_path)
        return 0 if ok else 1

    if mode == "selftest":
        I = ctx(d)
        caught, missed = 0, []
        for rule, name, m in mutations(d, I):
            c, _ = run(m)
            hit = {v["rule"] for v in c.violations}
            if rule in hit:
                caught += 1
            else:
                missed.append((rule, name, sorted(hit)))
        total = caught + len(missed)
        print("R-42 SELFTEST: %s — %d caught / %d missed / %d total"
              % ("PASS" if not missed else "FAIL", caught, len(missed), total))
        for r, n, hit in missed:
            print("  MISSED [%s] %s (got: %s)" % (r, n, hit))
        covered = {r for r, _, _ in mutations(d, I)}
        print("  rule coverage: %d/%d" % (len(covered), len(RULES)))
        if out_path:
            with open(os.path.join(ROOT, out_path), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"taskId": "R-42", "mode": "selftest",
                           "verdict": "PASS" if not missed else "FAIL",
                           "caught": caught, "missed": len(missed), "total": total,
                           "missedCases": [{"rule": r, "name": n, "hit": h} for r, n, h in missed],
                           "ruleCoverage": "%d/%d" % (len(covered), len(RULES))},
                          fh, ensure_ascii=False, indent=2)
            print("  written:", out_path)
        return 0 if not missed else 1

    print("usage: r42_identity_tool.py [validate|selftest] [--out <path>]")
    return 2


if __name__ == "__main__":
    sys.exit(main())
