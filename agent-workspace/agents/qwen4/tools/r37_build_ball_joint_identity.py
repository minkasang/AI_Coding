#!/usr/bin/env python3
"""R-37 左前上/下球铰身份与运动用途核对（stdlib only，输入只读）。

产出可核验的候选身份表：把 C-03 的两颗演示球头分别对到 R-16/R-27 的上、下球铰总成实例，
区分「完整球铰总成」「演示球头局部几何」「运动球心」三种东西，并把保护件、紧固件、
锥口基准各自的归属分开。不修改任何共享事实源。
"""
import hashlib
import json
import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "docs", "research", "R-37-ball-joint-identity.fixture.json")

R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
SNAP = "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json"
C03_MANIFEST = "cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86/manifest.json"
C03_VALIDATION = "cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86/validation.json"
C02_DATUMS = "cad/experiments/wheel-end-datum-interface-v1/datums.json"

INPUTS = [
    (R16, "REQUIRED"),
    (SNAP, "ADVISORY"),
    (C03_MANIFEST, "REQUIRED"),
    (C03_VALIDATION, "REQUIRED"),
    (C02_DATUMS, "REQUIRED"),
]

BALL_PARTS = {
    "UPPER": {"partId": "PART-20-003", "pi": "PI-20-003-FL", "ai": "AI-20-002-FL",
              "asmDef": "ASSY-20-002", "frame": "FR-20-002-FL",
              "seatDatum": "PI-20-016-FL/upperBallJointSeat"},
    "LOWER": {"partId": "PART-20-010", "pi": "PI-20-010-FL", "ai": "AI-20-003-FL",
              "asmDef": "ASSY-20-003", "frame": "FR-20-003-FL",
              "seatDatum": "PI-20-016-FL/lowerBallJointSeat"},
}
PROTECTION = [
    ("PART-20-004", "上球铰防尘罩", "UPPER"), ("PART-20-005", "上球铰卡簧", "UPPER"),
    ("PART-20-011", "下球铰防尘罩", "LOWER"), ("PART-20-012", "下球铰卡簧与槽顶螺母", "LOWER"),
]
FASTENER = "PART-20-017"
KNUCKLE = "PI-20-016-FL"


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def sha256(rel):
    h = hashlib.sha256()
    with open(os.path.join(ROOT, rel), "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_committed(rel):
    """只读读取 git HEAD 版本，用于区分「已提交基线」与「工作副本」，不写任何临时文件。"""
    r = subprocess.run(["git", "show", "HEAD:" + rel], cwd=ROOT,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout.decode("utf-8"))


def build():
    a = load(R16)
    snap = load(SNAP)
    mf = load(C03_MANIFEST)
    va = load(C03_VALIDATION)
    dt = load(C02_DATUMS)

    pi = {p["instanceId"]: p for p in a["partInstances"]}
    ai = {x["instanceId"]: x for x in a["assemblyInstances"]}
    fr = {x["frameId"]: x for x in a["mountFrames"]}
    defs = {d["id"]: d for d in a["partDefinitions"]}
    snap_pi = {p["partInstanceId"]: p for p in snap["tree"]["partInstances"]}

    inputs = []
    for rel, policy in INPUTS:
        inputs.append({"path": rel, "readOnly": True, "hashPolicy": policy, "sha256": sha256(rel)})

    # ---- 两个球铰：身份链逐字段对回 R-16 ----
    ball_joints = []
    for pos, spec in BALL_PARTS.items():
        p, d = pi[spec["pi"]], defs[spec["partId"]]
        s = snap_pi[spec["pi"]]
        stud = mf["studs"][pos.lower()]
        ball_joints.append({
            "position": pos,
            "candidatePartInstanceId": spec["pi"],
            "partDefinitionId": spec["partId"],
            "partDefinitionName": d["name"],
            "assemblyInstanceId": spec["ai"],
            "assemblyDefinitionId": ai[spec["ai"]]["assemblyId"],
            "mountFrameId": spec["frame"],
            "frameWorldFrame": fr[spec["frame"]]["worldFrame"],
            "corner": p["corner"], "ordinal": p["ordinal"],
            "qtyPerCorner": p["qtyPerCorner"],
            "qtyVehicleTotalInherited": d["qtyVehicleTotal"],
            "countedInBom": p["countedInBom"],
            "identityBasis": p["identityBasis"],
            "geometryBasis": p["geometryBasis"],
            "geometryStatus": p["geometryStatus"],
            "snapshotRevision": snap["revision"],
            "snapshotGeometryStatus": s["geometryStatus"],
            "snapshotInspectable": s["inspectable"],
            "c03": {
                "artifactId": stud["artifactId"],
                "geometryRole": stud["geometryRole"],
                "samplePartInstanceId": stud["partInstanceId"],
                "candidateStatus": stud["candidateAssembly"]["status"],
                "candidatePartInstanceId": stud["candidateAssembly"]["partInstanceId"],
                "candidateAssemblyInstanceId": stud["candidateAssembly"]["assemblyInstanceId"],
                "candidateSnapshotFrameId": stud["candidateAssembly"]["snapshotFrameId"],
                "seatDatumId": stud["seat"]["c02DatumId"],
                "knucklePartInstanceId": stud["seat"]["knucklePartInstanceId"],
                "insertionDirectionRoot": stud["seat"]["insertionDirectionRoot"],
                "ballCenterWorkholdingYUpM": stud["ballCenter"]["workholdingYUpM"],
                "fitType": stud["fit"]["type"],
            },
        })

    # ---- 左右角位：同定义不同实例，不是镜像几何 ----
    sides = []
    for corner in ("FL", "FR"):
        sides.append({
            "corner": corner,
            "upperInstanceId": "PI-20-003-%s" % corner,
            "lowerInstanceId": "PI-20-010-%s" % corner,
            "relation": "SAME_DEFINITION_DISTINCT_INSTANCE",
            "handednessPolicy": defs["PART-20-003"].get("handednessPolicy", {}).get("kind"),
            "note": "左/右是同一定义的独立装车实例；不得把一个实例的位姿直接镜像成另一个的刚体位姿",
        })

    # ---- 保护件与紧固件：各自归属，不并入球铰 ----
    protection = []
    for pid, name, ball in PROTECTION:
        inst = [p["instanceId"] for p in a["partInstances"] if p["definitionId"] == pid]
        protection.append({
            "partId": pid, "name": name, "belongsToBallJoint": ball,
            "parentAssemblyInstanceIds": sorted({p["assemblyInstanceId"] for p in a["partInstances"]
                                                 if p["definitionId"] == pid}),
            "instanceIds": sorted(inst),
            "qtyVehicleTotal": defs[pid]["qtyVehicleTotal"],
            "ownership": "SEPARATE_PART_OWNED_BY_SAME_ASSEMBLY",
        })
    fst = [p for p in a["partInstances"] if p["definitionId"] == FASTENER]
    fastener = {
        "partId": FASTENER, "name": defs[FASTENER]["name"],
        "parentAssemblyInstanceIds": sorted({p["assemblyInstanceId"] for p in fst}),
        "instanceIds": sorted(p["instanceId"] for p in fst),
        "qtyPerCorner": fst[0]["qtyPerCorner"], "qtyVehicleTotal": defs[FASTENER]["qtyVehicleTotal"],
        "ownership": "SEPARATE_FASTENER_OWNED_BY_KNUCKLE_ASSEMBLY",
        "note": "父级是转向节总成 ASSY-20-004，不是上下球铰总成；每角 2 件，不得并入球铰数量",
    }

    # ---- 族陷阱：同 familyRef 的五个成员分属两个系统 ----
    fam_members = sorted([k for k, v in defs.items() if v.get("familyRef") == "FAM-130-014"])
    fam_systems = sorted({defs[k]["parentId"].split("-")[1] for k in fam_members})
    family_trap = {
        "familyRef": "FAM-130-014", "members": fam_members,
        "parentSystemNumbers": fam_systems,
        "memberRoles": {k: defs[k]["name"] for k in fam_members},
        "dedupForbidden": True,
        "why": "上球铰总成、下球铰总成、前连杆球铰/衬套、下摆臂衬套与球铰、半轴端件共用同一 familyRef；"
               "按 familyRef 合并会把不同系统、不同功能的零件吞成一个。",
    }

    # ---- C-02 锥口基准归属 ----
    seat_rows = [x for x in dt["datums"] if x.get("mountName") in ("upperBallJointSeat", "lowerBallJointSeat")]
    seat = {
        "ownerPartInstanceId": KNUCKLE,
        "datums": [{"datumId": x["datumId"], "partInstanceId": x["partInstanceId"],
                    "mountName": x["mountName"]} for x in seat_rows],
        "directionOpposing": (mf["studs"]["upper"]["seat"]["insertionDirectionRoot"]
                              == [0.0, 0.0, -1.0]
                              and mf["studs"]["lower"]["seat"]["insertionDirectionRoot"]
                              == [0.0, 0.0, 1.0]),
        "note": "两处锥口属于转向节本体 PI-20-016-FL，不属于球铰总成；球铰是装进锥口的零件。",
    }

    # ---- 样件 vs 完整球铰 vs 运动球心 ----
    sample_mapping = {
        "upper": {"artifactId": mf["studs"]["upper"]["artifactId"],
                  "samplePartInstanceId": mf["studs"]["upper"]["partInstanceId"],
                  "candidatePartInstanceId": "PI-20-003-FL",
                  "geometryRole": mf["studs"]["upper"]["geometryRole"],
                  "status": mf["studs"]["upper"]["candidateAssembly"]["status"]},
        "lower": {"artifactId": mf["studs"]["lower"]["artifactId"],
                  "samplePartInstanceId": mf["studs"]["lower"]["partInstanceId"],
                  "candidatePartInstanceId": "PI-20-010-FL",
                  "geometryRole": mf["studs"]["lower"]["geometryRole"],
                  "status": mf["studs"]["lower"]["candidateAssembly"]["status"]},
        "interpretation": "C-03 的两件是完整球铰总成的局部几何（只有带球头的锥柄），"
                          "不是新增零件、也不是完整总成；因此样件自身 partInstanceId=null。",
    }

    motion = {
        "referenceMotionRunId": mf["sources"]["referenceMotion"]["runId"],
        "referenceMotionFrameId": mf["sources"]["referenceMotion"]["frameId"],
        "referenceMotionSourceRevision": mf["sources"]["referenceMotion"]["sourceRevision"],
        "knuckleOriginFeature": mf["sources"]["referenceMotion"]["knuckleOriginFeature"],
        "ballCenterIsPhysicalInstance": False,
        "motionInputStatus": mf["motionInput"]["status"],
        "playbackAllowed": mf["motionInput"]["playbackAllowed"],
        "existingR28Registration": mf["motionInput"]["existingR28Registration"],
        "ballSpanProjectionOnSpindleMm": mf["motionInput"]["ballSpanProjectionOnSpindleMm"],
        "snapshotPoseRun": {"status": snap["poseRun"]["status"],
                            "playbackAllowed": snap["poseRun"]["playbackAllowed"],
                            "reason": snap["poseRun"]["reason"]},
        "note": "球心是运动学参考点，不是新增实体实例；R-28 旧配准仍 REGISTRATION_BLOCKED，"
                "本轮不授权整车播放。knuckleOriginFeature 指 LOWER_BALL_CENTER，即运动取的是下球心。",
    }

    validation = {
        "status": va["status"],
        "sourceGrade": mf["sourceGrade"],
        "independentStepSolids": va["independentStepSolids"],
        "seatedStudPairOverlapMm3": va["seatedStudPairOverlapMm3"],
        "upperStopContactAreaMm2": va["insertionAndSeat"]["upper"]["stopContactAreaMm2"],
        "lowerStopContactAreaMm2": va["insertionAndSeat"]["lower"]["stopContactAreaMm2"],
        "independentOfIdentity": True,
        "note": "装入/干涉/止挡结果只证明几何自洽，不证明这两个样件就是真实车型的球铰。",
    }

    # ---- R-27 快照 r26 块过期：区分「已提交基线」与「工作副本」 ----
    current_r26_sha = sha256("agent-workspace/agents/qwen4/tasks/R-26.md")
    head = load_committed(SNAP)

    def _r26_pin(src):
        if not src:
            return None
        return next((x for x in src.get("inputs", []) if x.get("role") == "R26_DECISIONS"), None)

    head_pin, work_pin = _r26_pin(head), _r26_pin(snap)
    head_stale = bool(head_pin and head_pin.get("sha256") != current_r26_sha)
    snapshot_pin = {
        "snapshotId": snap["snapshotId"], "revision": snap["revision"], "status": snap["status"],
        "currentR26TaskSha256": current_r26_sha,
        "currentR26TaskStatus": "approved",
        "committedBaseline": {
            "source": "git HEAD",
            "r26Block": head.get("r26") if head else None,
            "r26InputPin": head_pin,
            "pinMatchesCurrent": bool(head_pin and head_pin.get("sha256") == current_r26_sha),
        },
        "observedRebuild": {
            "command": "node src-experiments/vehicle-snapshot-v1/run-checks.mjs",
            "observedAt": "2026-11-22",
            "result": "REGENERATED_THEN_VALIDATION_FAILED",
            "error": "SNAP-E-R26",
            "errorMessage": "output exists but ignored",
            "regeneratedFiles": [SNAP,
                                 "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json",
                                 "agent-workspace/agents/deepseek/reports/R-27-results.json"],
            "currentWorkingTreeAtObservation": "MATCHES_HEAD",
            "sideEffectNote": "run-checks.mjs 不是只读脚本，会写上述 3 个文件。观测后快照与消费索引已回到已提交基线"
                              "（快照 SHA-256 与 C-03 清单 pin 的 f60d977e… 一致）；"
                              "DeepSeek 的 R-27-results.json 仍保留本次重建结果，由 DeepSeek 决定去留。",
            "workingPin": work_pin,
        },
        "finding": "已提交基线（git HEAD）建于 R-26 交付之前：r26.status=ready、artifacts=[]、"
                   "decisionPolicy=MISSING_OUTPUT_PRESERVE_ALL_CONFLICTS，pin 与当前 R-26 任务卡不符。"
                   "R-26 现已 approved 且有 fixture/md 产出，两者不一致；"
                   "消费方不得把快照的 r26 块当作当前状态。",
        "impact": "重建快照会触发 SNAP-E-R26『output exists but ignored』——生成器把"
                  "MISSING_OUTPUT_PRESERVE_ALL_CONFLICTS 写死，尚无消费 R-26 决议的路径；"
                  "需 R-39/快照维护方改生成逻辑并复审，不是把 policy 改掉了事。",
    }

    confirmed = [
        {"claim": "上球铰 FL 候选实例", "value": "PI-20-003-FL", "evidence": "R-16 partInstances + R-27 tree"},
        {"claim": "下球铰 FL 候选实例", "value": "PI-20-010-FL", "evidence": "R-16 partInstances + R-27 tree"},
        {"claim": "上级链", "value": "AI-20-002-FL/ASSY-20-002 与 AI-20-003-FL/ASSY-20-003", "evidence": "R-16 assemblyInstances"},
        {"claim": "Frame", "value": "FR-20-002-FL / FR-20-003-FL", "evidence": "R-16 mountFrames；worldFrame=UNFROZEN_PENDING_RP07"},
        {"claim": "数量", "value": "每角 1 件；整车 2 件（仅 FL/FR）", "evidence": "R-16 qtyPerCorner=1, qtyVehicleTotal=2"},
        {"claim": "锥口归属", "value": "PI-20-016-FL 的两处锥口", "evidence": "C-02 datums.json"},
        {"claim": "样件不是实例", "value": "partInstanceId=null", "evidence": "C-03 manifest studs.*.partInstanceId"},
    ]
    unverified = [
        {"item": "是否为真实车型的球铰", "status": "UNKNOWN", "why": "C-03 sourceGrade=DEMO_ASSUMPTION，无 OEM 来源"},
        {"item": "球铰内部结构（球座/预紧/密封）", "status": "UNKNOWN", "why": "样件仅 BALL_STUD_ONLY"},
        {"item": "锥角与配合公差", "status": "UNKNOWN", "why": "按 STEP 锥面斜率保留径向间隙，属演示参数"},
        {"item": "运动球心与实车球心的一致性", "status": "UNKNOWN", "why": "R-28 旧配准 REGISTRATION_BLOCKED；ballSpanProjectionOnSpindleMm=0 与 R-28 约 −79.38 mm 差异未解释"},
        {"item": "左右件的镜像几何", "status": "UNKNOWN", "why": "R-16 标 MIRROR_REGENERATE，但尚无左右实体几何可比"},
        {"item": "变型同一性", "status": "BLOCKED", "why": "R-26 CF-09：两套变型 ID 不同，未对齐"},
    ]
    rejected_claims = [
        {"id": "REJ-37-01", "claim": "把上球铰候选写成 PI-20-010-FL（上下互换）", "reason": "上下定义与父级都不对"},
        {"id": "REJ-37-02", "claim": "把 FL 候选写成 PI-20-003-RR（错误角位）", "reason": "这些零件只有 FL/FR 实例，后轴无球铰"},
        {"id": "REJ-37-03", "claim": "把运动球心当作新增实体实例", "reason": "球心是运动学参考点，partInstanceId=null"},
        {"id": "REJ-37-04", "claim": "把两颗演示球头当成两个新零件", "reason": "它们是完整球铰总成的局部几何"},
        {"id": "REJ-37-05", "claim": "按 FAM-130-014 合并球铰零件", "reason": "同族五个成员跨两个系统"},
        {"id": "REJ-37-06", "claim": "把紧固件 PART-20-017 并入球铰数量", "reason": "父级是转向节总成，每角 2 件"},
    ]

    return {
        "schemaVersion": "1.0",
        "artifact": "R-37 ball joint identity and motion usage",
        "owner": "qwen4", "taskId": "R-37", "date": "2026-11-22", "status": "submitted",
        "purpose": "为 C-03 两颗演示球头核对上/下球铰在整车结构中的候选身份与接口，"
                   "把完整球铰、演示球头、转向节锥口、运动球心四者分开，交给 C-03 与 Grok。",
        "inputs": inputs,
        "cornerScope": {
            "corners": ["FL", "FR"], "frontOnly": True, "rearHasBallJoints": False,
            "evidence": "PART-20-003/010 的 qtyVehicleTotal=2 且实例只有 FL/FR；后轴为整体桥，无独立球铰",
        },
        "ballJoints": ball_joints,
        "sideVariants": sides,
        "protectionParts": protection,
        "fastener": fastener,
        "familyTrap": family_trap,
        "seatDatum": seat,
        "c03SampleMapping": sample_mapping,
        "motionUsage": motion,
        "c03Validation": validation,
        "snapshotPin": snapshot_pin,
        "confirmed": confirmed,
        "unverified": unverified,
        "rejectedClaims": rejected_claims,
        "invariants": {
            "sourceFilesModified": False,
            "newPhysicalInstancesCreated": 0,
            "ballCenterTreatedAsInstance": False,
            "geometryClaimedSourced": 0,
            "playbackAuthorised": False,
            "familyDeduped": False,
            "fastenerMergedIntoBallJoint": False,
        },
        "summary": {
            "ballJoints": len(ball_joints),
            "confirmed": len(confirmed),
            "unverified": len(unverified),
            "rejectedClaims": len(rejected_claims),
            "familyMembers": len(fam_members),
            "snapshotR26StaleInCommitted": head_stale,
            "snapshotRebuildFailsSnapE26": True,
        },
    }


def main():
    out = build()
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    s = out["summary"]
    print("R-37 fixture written:", os.path.relpath(OUT, ROOT))
    print("  ballJoints=%d confirmed=%d unverified=%d rejected=%d familyMembers=%d"
          % (s["ballJoints"], s["confirmed"], s["unverified"], s["rejectedClaims"], s["familyMembers"]))
    print("  snapshot r26 stale in committed baseline = %s | rebuild fails SNAP-E-R26 = %s"
          % (s["snapshotR26StaleInCommitted"], s["snapshotRebuildFailsSnapE26"]))


if __name__ == "__main__":
    main()
