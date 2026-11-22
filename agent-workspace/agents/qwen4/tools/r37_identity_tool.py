#!/usr/bin/env python3
"""R-37 球铰身份核对校验器：16 条规则 + 负例自检（stdlib only）。"""
import copy
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
FIXTURE = "docs/research/R-37-ball-joint-identity.fixture.json"
R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
SNAP = "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json"
C03 = "cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86/manifest.json"
C02 = "cad/experiments/wheel-end-datum-interface-v1/datums.json"

EXPECT = {"UPPER": ("PI-20-003-FL", "PART-20-003", "AI-20-002-FL", "FR-20-002-FL"),
          "LOWER": ("PI-20-010-FL", "PART-20-010", "AI-20-003-FL", "FR-20-003-FL")}


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
        "a": a,
        "snap": load(SNAP),
        "c03": load(C03),
        "c02": load(C02),
        "pi": {p["instanceId"]: p for p in a["partInstances"]},
        "ai": {x["instanceId"]: x for x in a["assemblyInstances"]},
        "fr": {x["frameId"]: x for x in a["mountFrames"]},
        "defs": {x["id"]: x for x in a["partDefinitions"]},
    }


def v01_refs(c, d, I):
    snap_ids = {p["partInstanceId"] for p in I["snap"]["tree"]["partInstances"]}
    for b in d["ballJoints"]:
        pid = b["candidatePartInstanceId"]
        if pid not in I["pi"]:
            c.bad("V01", "PI_NOT_IN_R16", pid)
        if pid not in snap_ids:
            c.bad("V01", "PI_NOT_IN_SNAPSHOT", pid)
        if b["partDefinitionId"] not in I["defs"]:
            c.bad("V01", "PART_NOT_IN_R16", b["partDefinitionId"])


def v02_chain(c, d, I):
    for b in d["ballJoints"]:
        p = I["pi"].get(b["candidatePartInstanceId"])
        if not p:
            continue
        chain = [(b["partDefinitionId"], p["definitionId"]),
                 (b["assemblyInstanceId"], p["assemblyInstanceId"]),
                 (b["mountFrameId"], p["mountFrameId"]),
                 (b["corner"], p["corner"]), (b["ordinal"], p["ordinal"])]
        for claimed, actual in chain:
            if claimed != actual:
                c.bad("V02", "IDENTITY_CHAIN_MISMATCH", f"{b['position']}: {claimed} != {actual}")
        if I["ai"][b["assemblyInstanceId"]]["assemblyId"] != b["assemblyDefinitionId"]:
            c.bad("V02", "ASSEMBLY_DEFINITION_MISMATCH", b["position"])


def v03_not_swapped(c, d, I):
    for b in d["ballJoints"]:
        want = EXPECT.get(b["position"])
        if not want:
            c.bad("V03", "POSITION_UNKNOWN", b["position"])
            continue
        if (b["candidatePartInstanceId"], b["partDefinitionId"],
                b["assemblyInstanceId"], b["mountFrameId"]) != want:
            c.bad("V03", "UPPER_LOWER_SWAPPED_OR_MISLINKED",
                  f"{b['position']} -> {b['candidatePartInstanceId']}")


def v04_corner_scope(c, d, I):
    cs = d["cornerScope"]
    if cs["corners"] != ["FL", "FR"] or cs["rearHasBallJoints"] is not False:
        c.bad("V04", "CORNER_SCOPE_WRONG", str(cs["corners"]))
    for b in d["ballJoints"]:
        if b["corner"] not in ("FL", "FR"):
            c.bad("V04", "WRONG_CORNER", b["candidatePartInstanceId"])
        if not b["candidatePartInstanceId"].endswith("-" + b["corner"]):
            c.bad("V04", "INSTANCE_CORNER_DISAGREES", b["candidatePartInstanceId"])
    for corner in ("RL", "RR"):
        for pos in EXPECT:
            if f"PI-20-003-{corner}" in I["pi"] or f"PI-20-010-{corner}" in I["pi"]:
                c.bad("V04", "REAR_BALL_JOINT_EXISTS", corner)


def v05_qty(c, d, I):
    for b in d["ballJoints"]:
        if b["qtyPerCorner"] != 1:
            c.bad("V05", "QTY_PER_CORNER_WRONG", f"{b['position']}={b['qtyPerCorner']}")
        if b["qtyVehicleTotalInherited"] != 2:
            c.bad("V05", "QTY_TOTAL_WRONG", f"{b['position']}={b['qtyVehicleTotalInherited']}")
        if b["qtyVehicleTotalInherited"] != b["qtyPerCorner"] * 2:
            c.bad("V05", "QTY_SEMANTICS_BROKEN", b["position"])
        if b["countedInBom"] is not True:
            c.bad("V05", "BOM_COUNT_LOST", b["position"])


def v06_family(c, d, I):
    ft = d["familyTrap"]
    live = sorted([k for k, v in I["defs"].items() if v.get("familyRef") == ft["familyRef"]])
    if ft["members"] != live:
        c.bad("V06", "FAMILY_MEMBERS_WRONG", f"{ft['members']} != {live}")
    if ft["dedupForbidden"] is not True:
        c.bad("V06", "FAMILY_DEDUP_ALLOWED", "必须禁止按 familyRef 合并")
    if len(ft["parentSystemNumbers"]) < 2:
        c.bad("V06", "FAMILY_SPAN_UNDERSTATED", "同族成员跨系统，合并会跨系统吞件")


def v07_protection(c, d, I):
    got = {p["partId"]: p for p in d["protectionParts"]}
    for pid, _, _ in (("PART-20-004", 0, 0), ("PART-20-005", 0, 0),
                      ("PART-20-011", 0, 0), ("PART-20-012", 0, 0)):
        if pid not in got:
            c.bad("V07", "PROTECTION_PART_MISSING", pid)
            continue
        live = sorted(p["instanceId"] for p in I["a"]["partInstances"] if p["definitionId"] == pid)
        if got[pid]["instanceIds"] != live:
            c.bad("V07", "PROTECTION_INSTANCES_WRONG", pid)
        if got[pid]["ownership"] != "SEPARATE_PART_OWNED_BY_SAME_ASSEMBLY":
            c.bad("V07", "PROTECTION_OWNERSHIP_MERGED", pid)


def v08_fastener(c, d, I):
    f = d["fastener"]
    if f["partId"] != "PART-20-017":
        c.bad("V08", "FASTENER_PART_WRONG", f["partId"])
    if f["parentAssemblyInstanceIds"] != ["AI-20-004-FL", "AI-20-004-FR"]:
        c.bad("V08", "FASTENER_PARENT_WRONG", str(f["parentAssemblyInstanceIds"]))
    if f["qtyPerCorner"] != 2 or f["qtyVehicleTotal"] != 4:
        c.bad("V08", "FASTENER_QTY_WRONG", f"{f['qtyPerCorner']}/{f['qtyVehicleTotal']}")
    if f["ownership"] != "SEPARATE_FASTENER_OWNED_BY_KNUCKLE_ASSEMBLY":
        c.bad("V08", "FASTENER_MERGED_INTO_BALL_JOINT", f["ownership"])


def v09_sample_not_instance(c, d, I):
    for pos in ("upper", "lower"):
        s = d["c03SampleMapping"][pos]
        if s["samplePartInstanceId"] is not None:
            c.bad("V09", "SAMPLE_CLAIMED_INSTANCE", pos)
        live = I["c03"]["studs"][pos]["partInstanceId"]
        if live is not None:
            c.bad("V09", "SOURCE_MANIFEST_UPGRADED", pos)
        if s["candidatePartInstanceId"] != d["ballJoints"][0 if pos == "upper" else 1]["candidatePartInstanceId"]:
            c.bad("V09", "SAMPLE_CANDIDATE_MISMATCH", pos)


def v10_no_geometry_upgrade(c, d, I):
    for b in d["ballJoints"]:
        if b["geometryBasis"] in ("SOURCED", "SOURCED_SECONDARY"):
            c.bad("V10", "GEOMETRY_UPGRADED", b["candidatePartInstanceId"])
        if b["snapshotGeometryStatus"] != "NO_GEOMETRY":
            c.bad("V10", "SNAPSHOT_GEOMETRY_MISREAD", b["candidatePartInstanceId"])
    if d["c03Validation"].get("sourceGrade") != "DEMO_ASSUMPTION":
        c.bad("V10", "VALIDATION_GRADE_UPGRADED", str(d["c03Validation"].get("sourceGrade")))


def v11_seat(c, d, I):
    seat = d["seatDatum"]
    if seat["ownerPartInstanceId"] != "PI-20-016-FL":
        c.bad("V11", "SEAT_OWNER_WRONG", seat["ownerPartInstanceId"])
    live = {x["datumId"]: x for x in I["c02"]["datums"]}
    for row in seat["datums"]:
        if row["datumId"] not in live:
            c.bad("V11", "SEAT_DATUM_NOT_IN_C02", row["datumId"])
        elif live[row["datumId"]]["partInstanceId"] != seat["ownerPartInstanceId"]:
            c.bad("V11", "SEAT_DATUM_OWNER_MISMATCH", row["datumId"])
    if seat["directionOpposing"] is not True:
        c.bad("V11", "SEAT_DIRECTIONS_NOT_OPPOSING", "上下球头应反向装入")


def v12_ball_centers(c, d, I):
    for pos, idx in (("upper", 0), ("lower", 1)):
        live = I["c03"]["studs"][pos]["ballCenter"]["workholdingYUpM"]
        if d["ballJoints"][idx]["c03"]["ballCenterWorkholdingYUpM"] != live:
            c.bad("V12", "BALL_CENTER_MISMATCH", pos)
        if len(live) != 3:
            c.bad("V12", "BALL_CENTER_SHAPE_WRONG", pos)


def v13_snapshot_r26(c, d, I):
    sp = d["snapshotPin"]
    head = subprocess.run(["git", "show", "HEAD:" + SNAP], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if head.returncode != 0:
        c.bad("V13", "HEAD_SNAPSHOT_UNREADABLE", "git show failed")
        return
    h = json.loads(head.stdout.decode("utf-8"))
    cur = sha256("agent-workspace/agents/qwen4/tasks/R-26.md")
    head_pin = next((x for x in h.get("inputs", []) if x.get("role") == "R26_DECISIONS"), None)
    is_stale = bool(head_pin and head_pin.get("sha256") != cur)
    if sp["committedBaseline"]["pinMatchesCurrent"] != (not is_stale):
        c.bad("V13", "STALENESS_FABRICATED", "已提交基线 pin 判断与真实不符")
    if is_stale and not sp["finding"]:
        c.bad("V13", "STALENESS_UNRECORDED", "快照 r26 过期必须记录")
    if is_stale and sp["committedBaseline"]["r26Block"].get("status") != "ready":
        c.bad("V13", "STALE_BLOCK_ALTERED", "不得改写已提交基线的 r26 状态")
    ob = sp.get("observedRebuild") or {}
    if ob.get("error") != "SNAP-E-R26":
        c.bad("V13", "REBUILD_ERROR_UNRECORDED", "重建会失败，必须记录 SNAP-E-R26")
    if not ob.get("regeneratedFiles"):
        c.bad("V13", "REBUILD_SIDE_EFFECTS_UNRECORDED", "run-checks 会写文件，必须列出")


def v14_world_frame(c, d, I):
    for b in d["ballJoints"]:
        live = I["fr"][b["mountFrameId"]]["worldFrame"]
        if b["frameWorldFrame"] != live:
            c.bad("V14", "FRAME_WORLD_MISMATCH", b["mountFrameId"])
        if b["frameWorldFrame"] != "UNFROZEN_PENDING_RP07":
            c.bad("V14", "WORLD_FRAME_CLAIMED_FROZEN", b["frameWorldFrame"])


def v15_rejections(c, d, I):
    ids = {r["id"] for r in d["rejectedClaims"]}
    must = {"REJ-37-01", "REJ-37-02", "REJ-37-03"}
    if not must <= ids:
        c.bad("V15", "REQUIRED_REJECTION_MISSING", str(sorted(must - ids)))
    text = json.dumps(d["rejectedClaims"], ensure_ascii=False)
    for kw in ("上下互换", "错误角位", "运动球心"):
        if kw not in text:
            c.bad("V15", "REJECTION_TOPIC_MISSING", kw)


def v16_inputs(c, d, I):
    for x in d["inputs"]:
        if x.get("readOnly") is not True:
            c.bad("V16", "INPUT_NOT_READONLY", x["path"])
        if not os.path.exists(os.path.join(ROOT, x["path"])):
            c.bad("V16", "INPUT_PATH_MISSING", x["path"])
            continue
        actual = sha256(x["path"])
        if x["hashPolicy"] == "REQUIRED" and x.get("sha256") != actual:
            c.bad("V16", "INPUT_HASH_MISMATCH", x["path"])


RULES = [
    ("V01", v01_refs), ("V02", v02_chain), ("V03", v03_not_swapped),
    ("V04", v04_corner_scope), ("V05", v05_qty), ("V06", v06_family),
    ("V07", v07_protection), ("V08", v08_fastener), ("V09", v09_sample_not_instance),
    ("V10", v10_no_geometry_upgrade), ("V11", v11_seat), ("V12", v12_ball_centers),
    ("V13", v13_snapshot_r26), ("V14", v14_world_frame), ("V15", v15_rejections),
    ("V16", v16_inputs),
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

    def bj(m, pos):
        return next(x for x in m["ballJoints"] if x["position"] == pos)

    def _swap_upper_lower(m):
        """真正的上下互换：位置标签不变，但身份链整体对调。"""
        a, b = m["ballJoints"][0], m["ballJoints"][1]
        for k in ("candidatePartInstanceId", "partDefinitionId", "partDefinitionName",
                  "assemblyInstanceId", "assemblyDefinitionId", "mountFrameId"):
            a[k], b[k] = b[k], a[k]

    # V01
    add("V01", "candidate PI does not exist", lambda m: bj(m, "UPPER").__setitem__(
        "candidatePartInstanceId", "PI-20-003-RR"))
    # V02
    add("V02", "mount frame detached from R-16", lambda m: bj(m, "UPPER").__setitem__(
        "mountFrameId", "FR-20-004-FL"))
    # V03
    add("V03", "upper and lower swapped", _swap_upper_lower)
    # V04
    add("V04", "wrong corner in instance id", lambda m: bj(m, "UPPER").__setitem__(
        "candidatePartInstanceId", "PI-20-003-FR"))
    add("V04", "rear axle claimed to have ball joints", lambda m: m["cornerScope"].__setitem__(
        "rearHasBallJoints", True))
    # V05
    add("V05", "per-corner qty inflated to 2", lambda m: bj(m, "LOWER").__setitem__(
        "qtyPerCorner", 2))
    add("V05", "vehicle total inflated to 4", lambda m: bj(m, "UPPER").__setitem__(
        "qtyVehicleTotalInherited", 4))
    # V06
    add("V06", "family member silently dropped", lambda m: m["familyTrap"].__setitem__(
        "members", m["familyTrap"]["members"][:-1]))
    add("V06", "family dedup allowed", lambda m: m["familyTrap"].__setitem__(
        "dedupForbidden", False))
    # V07
    add("V07", "protection part instances dropped", lambda m: m["protectionParts"][0].__setitem__(
        "instanceIds", []))
    add("V07", "protection part merged into ball joint", lambda m: m["protectionParts"][1].__setitem__(
        "ownership", "MERGED_INTO_BALL_JOINT"))
    # V08
    add("V08", "fastener reparented to ball joint assembly", lambda m: m["fastener"].__setitem__(
        "parentAssemblyInstanceIds", ["AI-20-002-FL", "AI-20-003-FL"]))
    add("V08", "fastener qty merged into ball joint", lambda m: m["fastener"].__setitem__(
        "qtyPerCorner", 1))
    # V09
    add("V09", "demo sample claimed as a physical instance", lambda m: m["c03SampleMapping"]["upper"].__setitem__(
        "samplePartInstanceId", "PI-20-003-FL"))
    # V10
    add("V10", "geometry basis upgraded to sourced", lambda m: bj(m, "UPPER").__setitem__(
        "geometryBasis", "SOURCED"))
    # V11
    add("V11", "seat datum reowned to ball joint", lambda m: m["seatDatum"].__setitem__(
        "ownerPartInstanceId", "PI-20-003-FL"))
    add("V11", "seat directions claimed same", lambda m: m["seatDatum"].__setitem__(
        "directionOpposing", False))
    # V12
    add("V12", "ball centre numerically altered", lambda m: bj(m, "LOWER")["c03"].__setitem__(
        "ballCenterWorkholdingYUpM", [0.0, 0.0, 0.0]))
    # V13
    add("V13", "committed staleness fabricated as current", lambda m: m["snapshotPin"]["committedBaseline"].__setitem__(
        "pinMatchesCurrent", True))
    add("V13", "rebuild error silently dropped", lambda m: m["snapshotPin"]["observedRebuild"].__setitem__(
        "error", None))
    add("V13", "rebuild side effects silently dropped", lambda m: m["snapshotPin"]["observedRebuild"].__setitem__(
        "regeneratedFiles", []))
    # V14
    add("V14", "world frame claimed frozen", lambda m: bj(m, "UPPER").__setitem__(
        "frameWorldFrame", "FROZEN_RP07"))
    # V15
    add("V15", "required rejection case removed", lambda m: m.__setitem__(
        "rejectedClaims", [r for r in m["rejectedClaims"] if r["id"] != "REJ-37-03"]))
    # V16
    add("V16", "input hash falsified", lambda m: m["inputs"][0].__setitem__("sha256", "0" * 64))
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
        print("R-37 IDENTITY VALIDATION: %s" % ("PASS" if ok else "FAIL"))
        for v in c.violations[:30]:
            print("  [%s] %s: %s" % (v["rule"], v["code"], v["message"]))
        if out_path:
            with open(os.path.join(ROOT, out_path), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"taskId": "R-37", "mode": "validate", "verdict": "PASS" if ok else "FAIL",
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
        print("R-37 SELFTEST: %s — %d caught / %d missed / %d total"
              % ("PASS" if not missed else "FAIL", caught, len(missed), total))
        for r, n, hit in missed:
            print("  MISSED [%s] %s (got: %s)" % (r, n, hit))
        covered = {r for r, _, _ in mutations(d, I)}
        print("  rule coverage: %d/%d" % (len(covered), len(RULES)))
        if out_path:
            with open(os.path.join(ROOT, out_path), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"taskId": "R-37", "mode": "selftest",
                           "verdict": "PASS" if not missed else "FAIL",
                           "caught": caught, "missed": len(missed), "total": total,
                           "missedCases": [{"rule": r, "name": n, "hit": h} for r, n, h in missed],
                           "ruleCoverage": "%d/%d" % (len(covered), len(RULES))},
                          fh, ensure_ascii=False, indent=2)
            print("  written:", out_path)
        return 0 if not missed else 1

    print("usage: r37_identity_tool.py [validate|selftest] [--out <path>]")
    return 2


if __name__ == "__main__":
    sys.exit(main())
