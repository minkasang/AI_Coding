#!/usr/bin/env python3
"""R-42 转向外端身份与接入条件核对（stdlib only，输入只读）。

核对：转向节一体转向臂（特征，非零件）、外拉杆端 PART-20-075（REQUIRED_BUT_DEFERRED）、
内拉杆/锁紧螺母/防尘罩/卡簧、以及 C-05 外球心（参考点，非实例）。
核心发现：R-16 强制「零件角位 == 父总成实例角位」，而转向器总成只有 VEH 级实例，
因此每角两件的转向拉杆类零件无法挂载——这才是 DEFERRED 的真实结构原因，不是缺几何。
"""
import hashlib
import json
import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "docs", "research", "R-42-steering-end-identity.fixture.json")

R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
SNAP = "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json"
C05 = "cad/experiments/wheel-end-steering-datum-v1/out/c05-ee1e461fecf00faa8151/manifest.json"
C05V = "cad/experiments/wheel-end-steering-datum-v1/out/c05-ee1e461fecf00faa8151/validation.json"

INPUTS = [(R16, "REQUIRED"), (SNAP, "ADVISORY"), (C05, "REQUIRED"), (C05V, "REQUIRED")]

STEERING_PARTS = ["PART-20-074", "PART-20-075", "PART-20-076", "PART-20-077", "PART-20-078"]
CORNERS = ("FL", "FR")


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
    r = subprocess.run(["git", "show", "HEAD:" + rel], cwd=ROOT,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return json.loads(r.stdout.decode("utf-8")) if r.returncode == 0 else None


def build():
    a = load(R16)
    snap = load(SNAP)
    mf = load(C05)
    va = load(C05V)

    defs = {d["id"]: d for d in a["partDefinitions"]}
    ai = {x["instanceId"]: x for x in a["assemblyInstances"]}
    asm_defs = {x["id"]: x for x in a["assemblies"]}
    pi = a["partInstances"]

    inputs = [{"path": p, "readOnly": True, "hashPolicy": hp, "sha256": sha256(p)} for p, hp in INPUTS]

    # ---- 转向臂：不是独立零件，是转向节本体特征 ----
    kn = defs["PART-20-016"]
    steering_arm = {
        "isSeparatePart": False,
        "ownerPartDefinitionId": "PART-20-016",
        "ownerPartInstanceId": "PI-20-016-FL",
        "ownerName": kn["name"],
        "evidence": kn["geomNote"],
        "r16FeatureList": ["上下球铰孔", "轴承座孔/安装面", "卡钳安装耳", "拉杆臂", "主销轴线"],
        "c03Seat": "PI-20-016-FL/upperBallJointSeat 与 /lowerBallJointSeat（球铰用）",
        "c05": {
            "artifactId": mf["assets"]["derivedKnuckle"]["artifactId"],
            "role": mf["assets"]["derivedKnuckle"]["role"],
            "partInstanceId": mf["assets"]["derivedKnuckle"]["partInstanceId"],
            "referencePartInstanceId": mf["assets"]["derivedKnuckle"]["referencePartInstanceId"],
            "seatFrameId": mf["seat"]["frameId"],
            "seatFeature": mf["seat"]["feature"],
            "insertionDirectionRoot": mf["seat"]["insertionDirectionRoot"],
        },
        "note": "C-05 的转向臂是实验转向节衍生件上的特征；R-16 也把拉杆臂列为本体特征。"
                "两侧一致：**不得新建一个『转向臂』零件或 PI**。",
    }

    # ---- 外/内拉杆与随附件 ----
    def part_row(pid):
        d = defs[pid]
        inst = [p for p in pi if p["definitionId"] == pid]
        return {
            "partId": pid, "name": d["name"], "parentDefinitionId": d["parentId"],
            "parentName": asm_defs.get(d["parentId"], {}).get("name"),
            "instancePolicy": d["instancePolicy"], "optionality": d["optionality"],
            "qtyVehicleTotal": d["qtyVehicleTotal"], "qtyBasis": d["qtyBasis"],
            "familyRef": d["familyRef"], "evidenceInherited": d["evidenceInherited"],
            "identityBasis": d["valueBasis"], "sources": d["sources"],
            "geometryBasis": d["geometryBasis"], "geometryStatus": d["geometryStatus"],
            "geomNote": d["geomNote"],
            "handednessKind": d["handednessPolicy"]["kind"],
            "requiresDistinctMountFrame": d["handednessPolicy"]["requiresDistinctMountFrame"],
            "instanceCount": len(inst), "instanceIds": sorted(p["instanceId"] for p in inst),
        }

    outer = part_row("PART-20-075")
    inner = part_row("PART-20-074")
    companions = [part_row(p) for p in ("PART-20-076", "PART-20-077", "PART-20-078")]

    parent_ai = [x for x in a["assemblyInstances"] if x["assemblyId"] == "ASSY-20-014"]
    outer.update({
        "parentAssemblyInstanceIds": [x["instanceId"] for x in parent_ai],
        "parentAssemblyInstanceCorners": [x["corner"] for x in parent_ai],
        "requiredCornerScope": list(CORNERS),
        "requiredInstanceCountForScope": 2,
        "statusToken": "REQUIRED_BUT_DEFERRED",
        "c05": {
            "artifactId": mf["assets"]["outerBallStud"]["artifactId"],
            "role": mf["assets"]["outerBallStud"]["role"],
            "partInstanceId": mf["assets"]["outerBallStud"]["partInstanceId"],
            "outerBallCenterWorkholdingYUpM": mf["outerBallCenter"]["workholdingYUpM"],
            "ballCenterRole": mf["outerBallCenter"]["role"],
            "fitType": mf["fit"]["type"],
            "stemEngagementMm": mf["fit"]["stemEngagementMm"],
            "motionIdentityStatus": mf["motionInput"]["outerTieRodEndIdentity"]["status"],
            "motionIdentityInstanceCount": mf["motionInput"]["outerTieRodEndIdentity"]["snapshotInstanceCount"],
        },
    })

    # ---- 族陷阱 ----
    fam = outer["familyRef"]
    family_trap = {
        "familyRef": fam,
        "members": sorted(k for k, v in defs.items() if v.get("familyRef") == fam),
        "roles": {k: defs[k]["name"] for k in defs if defs[k].get("familyRef") == fam},
        "dedupForbidden": True,
        "why": "内拉杆（轴向接头）与外拉杆端共用同一 familyRef，但 R-16 geomNote 明确"
               "『与内拉杆不是同一零件』；按 familyRef 合并会把转向器的两端接头吞成一个。",
    }
    companion_families = {c["partId"]: c["familyRef"] for c in companions}

    # ---- 结构阻断：R-16 的角位继承规则 ----
    combo = {}
    for p in pi:
        key = (ai[p["assemblyInstanceId"]]["corner"], p["corner"])
        combo["%s->%s" % key] = combo.get("%s->%s" % key, 0) + 1
    diagonal_only = all(k.split("->")[0] == k.split("->")[1] for k in combo)
    per_corner_children = [p for p in STEERING_PARTS
                           if defs[p]["qtyVehicleTotal"] == 2 and defs[p]["instancePolicy"] == "DEFERRED"]
    veh_level_instantiated = [p for p in STEERING_PARTS if defs[p]["instancePolicy"] == "INSTANTIATED"]

    structural = {
        "id": "SB-42-01",
        "ruleObserved": "R-16 的 278 个零件实例中，零件角位与父总成实例角位完全一致（只有对角组合）",
        "cornerCombos": combo,
        "diagonalOnly": diagonal_only,
        "conflict": "转向器总成 ASSY-20-014 只有 %d 个实例 %s（角位 %s），"
                    "而拉杆类零件需要 FL/FR 两角各一件；按现有规则无法挂载。"
                    % (len(parent_ai), [x["instanceId"] for x in parent_ai],
                       [x["corner"] for x in parent_ai]),
        "affectedPerCornerParts": per_corner_children,
        "affectedPartNames": {p: defs[p]["name"] for p in per_corner_children},
        "notAffectedVehLevelParts": veh_level_instantiated,
        "counterexampleGeometryIsNotTheBlocker": {
            "partId": "PART-20-001", "name": defs["PART-20-001"]["name"],
            "instancePolicy": defs["PART-20-001"]["instancePolicy"],
            "handednessKind": defs["PART-20-001"]["handednessPolicy"]["kind"],
            "geometryStatusOfInstances": sorted({p["geometryStatus"] for p in pi
                                                 if p["definitionId"] == "PART-20-001"}),
            "instanceIds": sorted(p["instanceId"] for p in pi if p["definitionId"] == "PART-20-001"),
            "why": "同样的 MIRROR_REGENERATE + GEOMETRY_PENDING 零件已经有两个实例。"
                   "所以『没有镜像几何』不是不能实例化的原因。",
        },
        "decisionOptions": [
            {"id": "OPT-42-A", "option": "把转向器总成拆成每角总成实例（如 AI-20-014-FL/FR）",
             "impact": "拉杆类零件可挂载；需要重定义总成实例与 Frame"},
            {"id": "OPT-42-B", "option": "放宽 R-16 规则，允许零件角位细于父总成实例",
             "impact": "改动实例化规则，影响全部 278 实例的校验"},
        ],
        "decisionOwner": "总控 / RP-07",
        "executorCannotDecide": True,
    }

    # ---- 进入正式实例链的门槛 ----
    gate = [
        {"id": "G1", "item": "变型条件", "requirement": "无未裁决 variantFlag",
         "actual": defs["PART-20-075"].get("variantFlag"), "satisfied": defs["PART-20-075"].get("variantFlag") is None},
        {"id": "G2", "item": "父总成实例存在", "requirement": "ASSY-20-014 有实例",
         "actual": [x["instanceId"] for x in parent_ai], "satisfied": bool(parent_ai)},
        {"id": "G3", "item": "角位与父级相容", "requirement": "零件 FL/FR 能挂到父总成实例",
         "actual": "父实例只有 %s" % [x["corner"] for x in parent_ai], "satisfied": False},
        {"id": "G4", "item": "左右件独立 Frame", "requirement": "每侧一个安装 Frame",
         "actual": "无实例即无 Frame", "satisfied": False},
        {"id": "G5", "item": "几何来源", "requirement": "可保持 GEOMETRY_PENDING，不阻断实例化",
         "actual": defs["PART-20-075"]["geometryStatus"], "satisfied": True},
        {"id": "G6", "item": "身份证据", "requirement": "EVIDENCE 且带 sources",
         "actual": {"evidenceInherited": defs["PART-20-075"]["evidenceInherited"],
                    "sources": defs["PART-20-075"]["sources"]}, "satisfied": True},
        {"id": "G7", "item": "不与同族/随附件合并", "requirement": "FAM-130-015 两成员独立、076/077/078 独立",
         "actual": family_trap["members"], "satisfied": True},
    ]
    entry_gate = {
        "partId": "PART-20-075",
        "currentStatus": outer["statusToken"],
        "currentInstanceCount": outer["instanceCount"],
        "checks": gate,
        "blockingChecks": [g["id"] for g in gate if not g["satisfied"]],
        "allSatisfied": all(g["satisfied"] for g in gate),
        "entryRule": "G3 的角位-父级结构与 G4 的每侧 Frame 落实后，才可建立 PI-20-075-FL / PI-20-075-FR；"
                     "几何可保持 GEOMETRY_PENDING，不需要先有 CAD。",
        "wrongReason": "把 DEFERRED 解释成『缺几何』是错的——同样的 GEOMETRY_PENDING 零件已有 278 个实例。",
        "whoDecides": "G3 属装配层级裁决（总控/RP-07）；执行模型不得自行开实例。",
    }

    # ---- 运动与外球心 ----
    motion = {
        "outerBallCenterWorkholdingYUpM": mf["outerBallCenter"]["workholdingYUpM"],
        "ballCenterRole": mf["outerBallCenter"]["role"],
        "ballCenterIsPhysicalInstance": False,
        "workholdingFrameId": mf["frames"]["workholding"]["frameId"],
        "playbackAllowed": mf["motionInput"]["playbackAllowed"],
        "existingR28Registration": mf["motionInput"]["existingR28Registration"],
        "innerTieRodInterface": mf["motionInput"]["innerTieRodInterface"],
        "tieRodLengthMm": mf["motionInput"]["tieRodLengthMm"],
        "vehicleFromWorkholding": mf["motionInput"]["vehicleFromWorkholding"],
        "outerTieRodEndIdentity": mf["motionInput"]["outerTieRodEndIdentity"],
        "note": "外球心只是几何参考点；内端接口、拉杆长度、整车放置都为空，本轮不授权播放。",
    }

    validation = {
        "status": va["status"], "sourceGrade": mf["sourceGrade"],
        "independentStepSolids": va["independentStepSolids"],
        "derivedKnuckleStaticPairs": va["derivedKnuckleStaticPairs"],
        "derivedKnuckleMaximumOverlapMm3": va["derivedKnuckleMaximumOverlapMm3"],
        "outerStudStopContactAreaMm2": va["outerStudInsertionAndSeat"]["stopContactAreaMm2"],
        "outerStudOverlapWithOriginalKnuckleMm3": va["outerStudOverlapWithOriginalKnuckleMm3"],
        "note": "只证明实验衍生件几何自洽，不证明它就是真实车型的转向节或拉杆端。",
    }

    # ---- 快照只读与状态 ----
    cur = sha256("agent-workspace/agents/qwen4/tasks/R-26.md")
    head = load_committed(SNAP)
    head_pin = next((x for x in (head or {}).get("inputs", []) if x.get("role") == "R26_DECISIONS"), None)
    snapshot_state = {
        "snapshotId": snap["snapshotId"], "revision": snap["revision"], "status": snap["status"],
        "readOnlyInput": True,
        "r26Block": snap.get("r26"),
        "committedR26Pin": head_pin,
        "committedPinMatchesCurrentR26": bool(head_pin and head_pin.get("sha256") == cur),
        "note": "R-42 只读取快照，不重建、不写入；ID+修订相同不代表内容相同（见 C-04 消息：同 ID 同修订曾出现新哈希）。",
    }

    confirmations = [
        {"claim": "转向臂不是独立零件", "value": "PART-20-016 本体特征", "evidence": "R-16 geomNote + C-05 seat.feature=INTEGRAL_ARM_TAPER_LARGE_END"},
        {"claim": "外拉杆端定义", "value": "PART-20-075", "evidence": "R-16 partDefinitions"},
        {"claim": "外拉杆端父级", "value": "ASSY-20-014 转向操纵与齿轮齿条转向器", "evidence": "R-16 assemblies"},
        {"claim": "转向器总成实例", "value": "AI-20-014-VEH（角位 VEH）", "evidence": "R-16 assemblyInstances"},
        {"claim": "外拉杆端数量", "value": "整车 2 件、当前 0 实例", "evidence": "R-16 qtyVehicleTotal=2 + 无 partInstances"},
        {"claim": "外拉杆端身份证据", "value": "EVIDENCE / S01,S02 / SOURCED_SECONDARY", "evidence": "R-16 def 字段"},
        {"claim": "内外拉杆同族不同件", "value": "FAM-130-015 = PART-20-074 + PART-20-075", "evidence": "R-16 familyRef"},
        {"claim": "C-05 两件均非实例", "value": "partInstanceId=null", "evidence": "C-05 manifest assets.*"},
    ]
    unknowns = [
        {"item": "外拉杆锥柄尺寸与锥角", "status": "UNKNOWN", "why": "R-16 geomNote：锥柄尺寸无来源；C-05 为 DEMO_ASSUMPTION"},
        {"item": "内端接口与拉杆长度", "status": "UNKNOWN", "why": "C-05 motionInput.innerTieRodInterface / tieRodLengthMm 均为 null"},
        {"item": "整车放置", "status": "UNKNOWN", "why": "C-05 motionInput.vehicleFromWorkholding 为 null"},
        {"item": "左右件镜像几何", "status": "UNKNOWN", "why": "MIRROR_REGENERATE，尚无左右实体"},
        {"item": "运动配准", "status": "BLOCKED", "why": "existingR28Registration=REGISTRATION_BLOCKED，playbackAllowed=false"},
        {"item": "角位-父级结构方案", "status": "BLOCKED", "why": "SB-42-01 待总控/RP-07 裁决"},
        {"item": "变型同一性", "status": "BLOCKED", "why": "R-26 CF-09 仍未对齐"},
    ]
    rejected = [
        {"id": "REJ-42-01", "claim": "为『转向臂』新建一个零件或 PI", "reason": "拉杆臂是 PI-20-016-FL 的本体特征"},
        {"id": "REJ-42-02", "claim": "把 C-05 实验衍生件当成规范 PI 或新零件", "reason": "asset partInstanceId=null，role=EXPERIMENTAL_DERIVATIVE"},
        {"id": "REJ-42-03", "claim": "把外球心当成新增实体实例", "reason": "球心是 REFERENCE_POINT，不是零件"},
        {"id": "REJ-42-04", "claim": "把外拉杆端绑到 RL/RR 或 4 角", "reason": "整车 2 件，仅前轴 FL/FR"},
        {"id": "REJ-42-05", "claim": "按 FAM-130-015 把内外拉杆合并成一个零件", "reason": "同族不同件，geomNote 明确"},
        {"id": "REJ-42-06", "claim": "把锁紧螺母/防尘罩/卡簧并进外拉杆端", "reason": "076/077/078 各自独立零件与族"},
        {"id": "REJ-42-07", "claim": "为了有实例而把 PART-20-075 挂到 AI-20-014-VEH", "reason": "违反零件角位==父实例角位；须先裁决 SB-42-01"},
    ]

    return {
        "schemaVersion": "1.0", "artifact": "R-42 steering end identity and entry conditions",
        "owner": "qwen4", "taskId": "R-42", "date": "2026-11-22", "status": "submitted",
        "purpose": "为 C-05 与同源夹具核对转向节一体臂、外拉杆端、内端接口与运动球心各自的身份与归属，"
                   "并说明 PART-20-075 何时允许进入正式实例链。",
        "inputs": inputs,
        "snapshotState": snapshot_state,
        "steeringArm": steering_arm,
        "outerTieRod": outer,
        "innerTieRod": inner,
        "companions": companions,
        "companionFamilies": companion_families,
        "familyTrap": family_trap,
        "structuralBlocker": structural,
        "entryGate": entry_gate,
        "motion": motion,
        "c05Validation": validation,
        "confirmations": confirmations,
        "unknowns": unknowns,
        "rejectedClaims": rejected,
        "invariants": {
            "sourceFilesModified": False,
            "newPhysicalInstancesCreated": 0,
            "steeringArmCreatedAsPart": False,
            "ballCenterTreatedAsInstance": False,
            "familyDeduped": False,
            "playbackAuthorised": False,
            "snapshotRebuilt": False,
        },
        "summary": {
            "confirmations": len(confirmations),
            "unknowns": len(unknowns),
            "rejectedClaims": len(rejected),
            "gateBlocking": len(entry_gate["blockingChecks"]),
            "structuralDiagonalOnly": diagonal_only,
            "affectedPerCornerParts": len(per_corner_children),
        },
    }


def main():
    out = build()
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    s = out["summary"]
    print("R-42 fixture written:", os.path.relpath(OUT, ROOT))
    print("  confirmations=%d unknowns=%d rejected=%d gateBlocking=%d affectedPerCornerParts=%d"
          % (s["confirmations"], s["unknowns"], s["rejectedClaims"], s["gateBlocking"],
             s["affectedPerCornerParts"]))
    print("  diagonal-only corner rule =", s["structuralDiagonalOnly"])


if __name__ == "__main__":
    main()
