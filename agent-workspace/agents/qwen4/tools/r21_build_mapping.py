#!/usr/bin/env python3
"""R-21 整车树 ↔ 领域模型实例 ID 对照表生成器（stdlib only，全部输入只读）。

原则：保留差异，不为强行统一而丢弃真实节点、不把空几何贴成实体、不静默消掉数量冲突。
规范权威 = RP-01（已验收）；R-16 = 详细树；R-17 = 可执行领域夹具；R-18 = 候选位姿（非规范身份）。
"""
import json
import os
import re
import glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "docs", "research", "R-21-vehicle-tree-mapping.fixture.json")

R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
R17V = "src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json"
R17F = "src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json"
R18 = "src-experiments/mechanism-vertical-slice-v1/R-18-results.json"

CORNERS = ["FL", "FR", "RL", "RR"]


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def load_rp01():
    n = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "docs", "planning", "evidence", "RP-01-tree-*.json"))):
        for x in load(os.path.relpath(f, ROOT))["nodes"]:
            n[x["id"]] = x
    return n


def corner_of(iid):
    m = re.search(r"-(FL|FR|RL|RR)(?:-(\d+))?$", iid)
    if m:
        return m.group(1), int(m.group(2)) if m.group(2) else None
    for c in CORNERS:
        if iid.endswith("-" + c):
            return c, None
    return None, None


EVIDENCE_MAP = {
    "EVIDENCE": "SOURCED_SECONDARY",
    "ASSUMPTION": "ASSUMPTION",
    "OPEN": "UNKNOWN",
}
GEOM_MAP = {
    "SOURCED": "SOURCED",
    "NEEDS_MEASUREMENT": "UNKNOWN",
    "DEMO_ASSUMPTION": "DEMO_ASSUMPTION",
    "DEFERRED": "UNKNOWN",
    "NOT_APPLICABLE": "OUT_OF_SCOPE",
}
CG_VALUE_MAP = {"GEN1": "ASSY-30-002", "GEN3": "ASSY-30-003"}


def build():
    rp = load_rp01()
    a = load(R16)
    v = load(R17V)
    f = load(R17F)
    m18 = load(R18)

    conflicts, preserved = [], []

    def conflict(cid, kind, title, detail, resolution, severity="P1", **kw):
        c = {"id": cid, "kind": kind, "title": title, "detail": detail,
             "resolution": resolution, "severity": severity, "status": "OPEN"}
        c.update(kw)
        conflicts.append(c)
        return c

    # ---------- 输入与权威 ----------
    inputs = [
        {"path": R16, "role": "R16_DETAILED_TREE", "readOnly": True,
         "counts": {"systems": len(a["systems"]), "partDefinitions": len(a["partDefinitions"]),
                    "partInstances": len(a["partInstances"]), "assemblyInstances": len(a["assemblyInstances"]),
                    "mountFrames": len(a["mountFrames"])}},
        {"path": R17V, "role": "R17_DOMAIN_VEHICLE", "readOnly": True,
         "counts": {"systems": len(v["systems"]), "partDefinitions": len(v["partDefinitions"]),
                    "partInstances": len(v["partInstances"]), "assemblies": len(v["assemblies"]),
                    "frames": len(v["frames"])}},
        {"path": R17F, "role": "R17_DOMAIN_FL_SLICE", "readOnly": True,
         "counts": {"partInstances": len(f["partInstances"]), "assemblies": len(f["assemblies"]),
                    "frames": len(f["frames"])}},
        {"path": R18, "role": "R18_CANDIDATE_POSES", "readOnly": True,
         "instanceIdStatus": m18.get("instanceIdStatus"), "provenance": m18.get("provenance"),
         "valueBasis": m18.get("valueBasis")},
        {"path": "docs/planning/evidence/RP-01-tree-*.json", "role": "CANONICAL_AUTHORITY", "readOnly": True,
         "counts": {"nodes": len(rp)}},
    ]

    # ---------- 字段映射 ----------
    field_mapping = {
        "projectId": {"r16": None, "r17": "projectId", "r18": None,
                      "valueDomain": "R17=PROJECT-CARLAB-DEMO；R-16 无 Project 层",
                      "transform": "R16_LAYER_ABSENT", "status": "R17_ONLY_GAP",
                      "note": "R-16 顶层直接是 variant，没有 Project 容器；不得据此声称两者属同一项目声明。见 CF-09"},
        "vehicleVariantId": {"r16": "variant.id", "r17": "variant.variantId", "r18": None,
                             "valueDomain": "R16=VAR-R16-BOF-ICE（basedOn CFG-BOF-ICE）；R17=VV-A-SWB-STD（platformFamilyRef PF-DEMO-BOF-01）",
                             "transform": "DIFFERENT_DECLARATIONS_NOT_ALIGNED", "status": "NEEDS_ADJUDICATION",
                             "note": "两侧声明的是不同变型 ID，代际同为 GEN1 但变型身份未对齐；跨夹具 join 实例前必须先声明变型关系。见 CF-09"},
        "systemId": {"r16": "systems[].id", "r17": "systems[].systemId", "r18": None,
                     "valueDomain": "SYS-*（沿用 RP-01）", "transform": "IDENTICAL",
                     "status": "ALIGNED", "note": "值域一致；R-17 只有 10 个，R-16 有 13 个"},
        "assemblyDefinitionId": {"r16": "assemblies[].id", "r17": "assemblyDefinitions[].assemblyId", "r18": None,
                                 "valueDomain": "ASSY-*", "transform": "IDENTICAL_VALUES_BUT_SEMANTIC_DRIFT",
                                 "status": "NEEDS_ADJUDICATION",
                                 "note": "值相同但 7/12 名称不同，其中 6 个是把 RP-01 具体总成 broadening 成占位名；见 CF-01"},
        "assemblyInstanceId": {"r16": "assemblyInstances[].instanceId", "r17": "assemblies[].assemblyId", "r18": None,
                               "valueDomain": "R16=AI-<sys>-<seq>-<corner>；R17=ASM-<ROLE>-<corner>",
                               "transform": "VIA_DEFINITION_AND_CORNER", "status": "MAPPABLE_PARTIAL",
                               "note": "R-17 用同一字段名 assemblyId 同时承载定义与实例两个命名空间；见 CF-02"},
        "partDefinitionId": {"r16": "partDefinitions[].id", "r17": "partDefinitions[].partId", "r18": None,
                             "valueDomain": "PART-*", "transform": "IDENTICAL", "status": "ALIGNED",
                             "note": "值域一致；4/11 名称漂移，见 CF-03"},
        "partInstanceId": {"r16": "partInstances[].instanceId", "r17": "partInstances[].instanceId",
                           "r18": "designSample.instances[].instanceId",
                           "valueDomain": "R16=PI-<sys>-<seq>-<corner>[-<ord>]；R17=INST-<ROLE>-<corner>[-<n>]；R18=INST-SLA-<ROLE>-<corner>",
                           "transform": "VIA_PART_AND_CORNER_AND_ORDINAL", "status": "MAPPABLE_PARTIAL",
                           "note": "R-18 的 INST-SLA-* 自标 CANDIDATE_NOT_FROZEN / FICTIONAL_FIXTURE，按角色映射，不当规范身份"},
        "mountFrameId": {"r16": "mountFrames[].frameId", "r17": "frames[].frameId", "r18": "designSample.frameId",
                         "valueDomain": "R16=FR-<sys>-<seq>-<corner>（总成实例级）；R17=FR-<ROLE>-<corner>（含零件实例级）",
                         "transform": "VIA_ASSEMBLY_INSTANCE", "status": "GRANULARITY_MISMATCH",
                         "note": "R-16 每总成实例一个 Frame；R-17 每零件实例也有 Frame。粒度不同，不强行合并；见 CF-05"},
    }

    enum_mapping = {
        "evidenceInherited": {"r17Domain": ["EVIDENCE", "ASSUMPTION", "OPEN"],
                              "r16Domain": ["SOURCED_SECONDARY", "ASSUMPTION", "UNKNOWN"],
                              "map": EVIDENCE_MAP,
                              "caveat": "R-16 规定 EVIDENCE 必须带 sources 才给 SOURCED_SECONDARY，否则 UNKNOWN；R-17 未做此区分",
                              "status": "MAPPABLE_WITH_CONDITION"},
        "geometryBasis": {"r17Domain": ["NEEDS_MEASUREMENT", "DEMO_ASSUMPTION"],
                          "r16Domain": ["UNKNOWN", "DEMO_ASSUMPTION", "SOURCED", "OUT_OF_SCOPE"],
                          "map": GEOM_MAP, "status": "MAPPABLE",
                          "caveat": "R-17 保留 RP-01 原始枚举，R-16 已映射为统一可信度枚举；两者不得混用同一字段名而不转换"},
        "choiceGroupValue": {"r17Domain": ["GEN1", "GEN3"], "r16Domain": ["ASSY-30-002", "ASSY-30-003"],
                             "map": CG_VALUE_MAP, "status": "MAPPABLE",
                             "caveat": "R-17 moduleSelections/applicableWhen 用代际标签，R-16 用总成 ID；需显式转换"},
        "fidelityTarget": {"r17Domain": ["FID-V", "FID-G"], "r16Domain": [], "map": {},
                           "status": "R17_ONLY_GAP",
                           "caveat": "R-16 无 fidelityTarget 字段。FID-G 是目标不是达成；R-16 全部 GEOMETRY_PENDING，不得读作已达成几何级"},
        "unknowns": {"r17Domain": "U-* 本地未知登记", "r16Domain": "modelBlocked[].r06ParamIds (PR-*)",
                     "map": {}, "status": "TWO_REGISTRIES_NEED_CROSSWALK",
                     "caveat": "两套未知编号未对齐；本轮不合并，只并列保留"},
    }

    # ---------- 系统映射 ----------
    r17sys = {s["systemId"]: s for s in v["systems"]}
    system_mapping = []
    for s in a["systems"]:
        t = r17sys.get(s["id"])
        system_mapping.append({
            "r16SystemId": s["id"], "r16Name": s["name"],
            "r17SystemId": t["systemId"] if t else None,
            "r17Name": t["name"] if t else None,
            "status": "MAPPED" if t else "R16_ONLY_UNMAPPED",
            "nameDrift": bool(t and t["name"] != s["name"]),
        })
    r16sys = {s["id"] for s in a["systems"]}
    for sid, s in r17sys.items():
        if sid not in r16sys:
            system_mapping.append({"r16SystemId": None, "r16Name": None, "r17SystemId": sid,
                                   "r17Name": s["name"], "status": "R17_ONLY_UNMAPPED", "nameDrift": False})

    # ---------- 总成定义映射 ----------
    r16asm = {x["id"]: x for x in a["assemblies"]}
    asmdef_mapping = []
    for ad in v["assemblyDefinitions"]:
        aid = ad["assemblyId"]
        canon = rp.get(aid)
        r16n = r16asm.get(aid)
        drift_name = bool(canon and canon["name"] != ad["name"])
        # 语义漂移：R-17 名含「占位」而 RP-01 是具体总成
        semantic = bool(canon and "占位" in ad["name"] and "占位" not in canon["name"])
        asmdef_mapping.append({
            "assemblyId": aid, "r17Name": ad["name"],
            "rp01Name": canon["name"] if canon else None,
            "r16Name": r16n["name"] if r16n else None,
            "existsInRP01": canon is not None,
            "existsInR16": r16n is not None,
            "nameDrift": drift_name, "semanticBroadening": semantic,
            "r17SystemId": ad["systemId"],
            "status": "MAPPED_WITH_DRIFT" if (canon and drift_name) else ("MAPPED" if canon else "R17_ONLY_UNMAPPED"),
        })
    n_sem = sum(1 for x in asmdef_mapping if x["semanticBroadening"])
    if n_sem:
        conflict("CF-01", "SAME_ID_DIFFERENT_SEMANTICS",
                 f"{n_sem} 个占位总成复用 RP-01 真实 ID 但语义被放宽",
                 [{"assemblyId": x["assemblyId"], "rp01Name": x["rp01Name"], "r17Name": x["r17Name"]}
                  for x in asmdef_mapping if x["semanticBroadening"]],
                 "保留双方名称并列，标 semanticBroadening=true。**禁止按 assemblyId 直接 join 后当作同一实体**；"
                 "占位是 R-17 演示夹具的合法简化，但不得回写为 RP-01 的规范名。需总控裁决是否给占位另立 ID 前缀。",
                 severity="P0", affectedCount=n_sem)

    # ---------- 总成实例映射 ----------
    r16ai = {}
    for x in a["assemblyInstances"]:
        r16ai.setdefault((x["assemblyId"], x["corner"]), x)
    asminst_mapping = []
    for src, tag in ((v, "VEHICLE"), (f, "FL_SLICE")):
        for asm in src["assemblies"]:
            corner, _ = corner_of(asm["assemblyId"])
            if corner is None:
                corner = "VEH"
            key = (asm["definitionRef"], corner)
            t = r16ai.get(key)
            asminst_mapping.append({
                "fixture": tag, "r17AssemblyInstanceId": asm["assemblyId"],
                "definitionRef": asm["definitionRef"], "corner": corner,
                "r17ParentAssemblyId": asm.get("parentAssemblyId"),
                "r17FrameId": asm.get("frameId"),
                "r16AssemblyInstanceId": t["instanceId"] if t else None,
                "r16MountFrameId": t["mountFrameId"] if t else None,
                "status": "MAPPED" if t else "R17_ONLY_UNMAPPED",
                "unmappedReason": None if t else "R-16 未实例化该总成（不在 PLAN 内）或角位不匹配",
            })
    # 去重（FL_SLICE 与 VEHICLE 有重复实例）
    seen, uniq = set(), []
    for x in asminst_mapping:
        k = x["r17AssemblyInstanceId"]
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    asminst_mapping = uniq

    # ---------- 零件定义映射 ----------
    r16def = {x["id"]: x for x in a["partDefinitions"]}
    pdef_mapping = []
    allpdefs = {}
    for src, tag in ((v, "VEHICLE"), (f, "FL_SLICE")):
        for p in src["partDefinitions"]:
            allpdefs.setdefault(p["partId"], (p, tag))
    for pid, (p, tag) in sorted(allpdefs.items()):
        canon, r16d = rp.get(pid), r16def.get(pid)
        nd = bool(canon and canon["name"] != p["name"])
        fd = bool(canon and (canon.get("familyRef") or None) != (p.get("familyRef") or None))
        pdef_mapping.append({
            "partId": pid, "fixture": tag, "r17Name": p["name"],
            "rp01Name": canon["name"] if canon else None,
            "r16Name": r16d["name"] if r16d else None,
            "existsInRP01": canon is not None, "existsInR16": r16d is not None,
            "nameDrift": nd, "familyRefDrift": fd,
            "r17FamilyRef": p.get("familyRef"), "rp01FamilyRef": canon.get("familyRef") if canon else None,
            "r17EvidenceInherited": p.get("evidenceInherited"),
            "r16ValueBasis": r16d["valueBasis"] if r16d else None,
            "evidenceMapAgrees": bool(r16d and EVIDENCE_MAP.get(p.get("evidenceInherited")) == r16d["valueBasis"]),
            "r17GeometryBasis": p.get("geometryBasis"),
            "r16GeometryBasis": r16d["geometryBasis"] if r16d else None,
            "geometryMapAgrees": bool(r16d and GEOM_MAP.get(p.get("geometryBasis")) == r16d["geometryBasis"]),
            "r17FidelityTarget": p.get("fidelityTarget"),
            "r17ApplicableWhen": p.get("applicableWhen"),
            "r16InstancePolicy": r16d["instancePolicy"] if r16d else None,
            "status": "MAPPED" if (canon and r16d) else ("R17_ONLY_UNMAPPED" if not r16d else "RP01_MISSING"),
        })
    ndrift = [x for x in pdef_mapping if x["nameDrift"]]
    if ndrift:
        conflict("CF-03", "PART_NAME_DRIFT", f"{len(ndrift)} 个零件定义名称与 RP-01 不一致",
                 [{"partId": x["partId"], "rp01Name": x["rp01Name"], "r17Name": x["r17Name"]} for x in ndrift],
                 "以 RP-01 名为规范，R-17 名并列保留为 alias。不得因名称不同就判为不同零件，也不得用 R-17 名覆盖规范名。",
                 severity="P2", affectedCount=len(ndrift))
    ev_dis = [x for x in pdef_mapping if x["existsInR16"] and not x["evidenceMapAgrees"]]
    if ev_dis:
        TR = ["SOURCED", "SOURCED_SECONDARY", "ENGINEERING_INFERENCE",
              "DEMO_ASSUMPTION", "ASSUMPTION", "UNKNOWN", "OUT_OF_SCOPE"]
        detail = []
        for x in ev_dis:
            mp = EVIDENCE_MAP.get(x["r17EvidenceInherited"])
            direction = ("R17_DOWNGRADE" if TR.index(mp) > TR.index(x["r16ValueBasis"])
                         else "R17_UPGRADE")
            canon = rp.get(x["partId"], {})
            detail.append({"partId": x["partId"], "rp01Evidence": canon.get("evidence"),
                           "rp01Sources": canon.get("sources"),
                           "r17": x["r17EvidenceInherited"], "mapped": mp,
                           "r16": x["r16ValueBasis"], "direction": direction})
        n_up = sum(1 for x in detail if x["direction"] == "R17_UPGRADE")
        conflict("CF-04", "EVIDENCE_ENUM_MISMATCH",
                 f"{len(ev_dis)} 个零件的 evidenceInherited 与 RP-01 规范等级不一致"
                 f"（R-17 降级 {len(detail) - n_up} 项 / 升级 {n_up} 项）",
                 detail,
                 "RP-01 是规范权威：这些零件 evidence=EVIDENCE 且带 sources，R-16 忠实映射为 SOURCED_SECONDARY。"
                 "R-17 标 ASSUMPTION 属**保守降级**，不违反『不得升级』纪律，但与规范权威不一致。"
                 "保留双方值并列，需总控裁决：要么 R-17 补 sources 后升回 SOURCED_SECONDARY，"
                 "要么总控确认降级理由并回写 RP-01。**本轮不自行改任何一方，也不取两者平均。**"
                 "若出现 R17_UPGRADE 方向则必须拒绝，因为那会把未核实数据升格。",
                 severity="P1", affectedCount=len(ev_dis),
                 upgradeCount=n_up, downgradeCount=len(detail) - n_up)

    # ---------- 零件实例映射 ----------
    r16pi = {}
    for p in a["partInstances"]:
        r16pi.setdefault((p["definitionId"], p["corner"], p["ordinal"]), p)
    r16pi_by_def_corner = {}
    for p in a["partInstances"]:
        r16pi_by_def_corner.setdefault((p["definitionId"], p["corner"]), []).append(p)

    pin_mapping, seen_pi = [], set()
    for src, tag in ((v, "VEHICLE"), (f, "FL_SLICE")):
        for p in src["partInstances"]:
            iid = p["instanceId"]
            if iid in seen_pi:
                continue
            seen_pi.add(iid)
            corner, ordinal = corner_of(iid)
            pid = p["partId"]
            cand = r16pi_by_def_corner.get((pid, corner), [])
            t = None
            if ordinal is not None and len(cand) >= ordinal:
                t = sorted(cand, key=lambda x: x["ordinal"])[ordinal - 1]
            elif len(cand) == 1:
                t = cand[0]
            # 父级对照：R-17 的 assemblyId → definitionRef → RP-01 父总成
            r17asm = next((x for x in src["assemblies"] if x["assemblyId"] == p["assemblyId"]), None)
            r17parentdef = r17asm["definitionRef"] if r17asm else None
            rp01parent = rp.get(pid, {}).get("parent")
            r16parentdef = None
            if t:
                ai = next((x for x in a["assemblyInstances"] if x["instanceId"] == t["assemblyInstanceId"]), None)
                r16parentdef = ai["assemblyId"] if ai else None
            parent_match = (r17parentdef == rp01parent)
            d16 = r16def.get(pid, {})
            policy16, vflag16 = d16.get("instancePolicy"), d16.get("variantFlag")
            if t:
                unmapped_reason = None
            elif policy16 == "DEFERRED" and vflag16:
                unmapped_reason = (f"R-16 instancePolicy=DEFERRED：变型条件 {vflag16} 未裁决，"
                                   "本变型是否含该零件尚未确定（不在 PLAN/DIST 内）")
            elif policy16 == "DEFERRED":
                unmapped_reason = ("R-16 instancePolicy=DEFERRED：几何/来源未闭合而暂缓实例化，"
                                   "不代表该零件在本变型不存在（不在 PLAN/DIST 内）")
            else:
                unmapped_reason = "R-16 未实例化该零件定义（不在 PLAN/DIST 内）"
            pin_mapping.append({
                "fixture": tag, "r17InstanceId": iid, "partId": pid,
                "corner": corner, "ordinal": ordinal,
                "r17AssemblyId": p["assemblyId"], "r17ParentDefinitionRef": r17parentdef,
                "r17FrameId": p["frameId"], "r17QuantityPerAssembly": p.get("quantity", {}).get("perAssembly"),
                "r17EvidenceInherited": p.get("evidenceInherited"),
                "r16InstanceId": t["instanceId"] if t else None,
                "r16AssemblyInstanceId": t["assemblyInstanceId"] if t else None,
                "r16ParentDefinitionId": r16parentdef,
                "r16MountFrameId": t["mountFrameId"] if t else None,
                "r16QtyPerCorner": t["qtyPerCorner"] if t else None,
                "r16IdentityBasis": t["identityBasis"] if t else None,
                "r16ValueBasis": t["valueBasis"] if t else None,
                "r16GeometryStatus": t["geometryStatus"] if t else None,
                "rp01ParentAssemblyId": rp01parent,
                "parentLevelMatch": parent_match,
                "r16InstancePolicy": policy16,
                "r16VariantFlag": vflag16,
                "r16Optionality": d16.get("optionality"),
                "status": "MAPPED" if t else "R17_ONLY_UNMAPPED",
                "unmappedReason": unmapped_reason,
            })
    plevel = [x for x in pin_mapping if x["status"] == "MAPPED" and not x["parentLevelMatch"]]
    # 未映射实例也要检父级漂移，否则会漏掉 R-16 未实例化但 R-17 改了父级的零件
    plevel_unmapped = [x for x in pin_mapping
                       if x["status"] != "MAPPED" and x["rp01ParentAssemblyId"]
                       and x["r17ParentDefinitionRef"] != x["rp01ParentAssemblyId"]]
    if plevel or plevel_unmapped:
        conflict("CF-06", "PARENT_LEVEL_FLATTENING",
                 f"{len(plevel)} 个已映射 + {len(plevel_unmapped)} 个未映射实例的父总成层级与 RP-01 不一致",
                 [{"r17InstanceId": x["r17InstanceId"], "partId": x["partId"],
                   "rp01Parent": x["rp01ParentAssemblyId"], "r17Parent": x["r17ParentDefinitionRef"],
                   "r16Parent": x["r16ParentDefinitionId"], "mapped": x["status"] == "MAPPED"}
                  for x in plevel + plevel_unmapped],
                 "R-17 为演示夹具把轮辋/转向节直接挂到轮端或悬架总成，跳过了车轮总成/转向节总成；"
                 "卡钳支架则从盘式制动器模块移到卡钳总成。**保留差异，不强行改父级**；"
                 "按父装配计算 qty 时必须声明用哪一侧层级，否则同一零件会算出不同数量。需总控裁决规范层级。",
                 severity="P0", affectedCount=len(plevel) + len(plevel_unmapped))

    # ---------- Frame 映射 ----------
    r16fr = {x["frameId"]: x for x in a["mountFrames"]}
    ai_to_r16fr = {x["instanceId"]: x["mountFrameId"] for x in a["assemblyInstances"]}
    frame_mapping, seen_fr = [], set()
    for src, tag in ((v, "VEHICLE"), (f, "FL_SLICE")):
        for fr in src["frames"]:
            fid = fr["frameId"]
            if fid in seen_fr:
                continue
            seen_fr.add(fid)
            corner, _ = corner_of(fid)
            # 通过所属总成实例找 R-16 Frame
            owner = next((x for x in src["assemblies"] if x.get("frameId") == fid), None)
            r16fid = None
            if owner:
                key = (owner["definitionRef"], corner or "VEH")
                t = r16ai.get(key)
                r16fid = t["mountFrameId"] if t else None
            has_numeric = isinstance(fr.get("origin"), list) and any(x != 0 for x in fr["origin"])
            frame_mapping.append({
                "fixture": tag, "r17FrameId": fid, "corner": corner,
                "parentFrameId": fr.get("parentFrameId"), "space": fr.get("space"),
                "units": fr.get("units"), "origin": fr.get("origin"),
                "mirror": fr.get("mirror"),
                "hasNonZeroNumericOrigin": has_numeric,
                "r17ValueBasis": fr.get("valueBasis"),
                "r16FrameId": r16fid,
                "r16WorldFrame": r16fr[r16fid]["worldFrame"] if r16fid in r16fr else None,
                "status": "MAPPED_ASSEMBLY_LEVEL" if r16fid else "R17_ONLY_UNMAPPED",
                "granularity": "PART_INSTANCE_LEVEL" if any(
                    p["frameId"] == fid for p in src["partInstances"]) else "ASSEMBLY_OR_VEHICLE_LEVEL",
            })
    numeric_ungraded = [x for x in frame_mapping if x["hasNonZeroNumericOrigin"] and not x["r17ValueBasis"]]
    if numeric_ungraded:
        conflict("CF-07", "NUMERIC_FRAME_ORIGIN_WITHOUT_BASIS",
                 f"{len(numeric_ungraded)} 个 R-17 Frame 带非零数值原点但没有 valueBasis 字段",
                 [{"r17FrameId": x["r17FrameId"], "origin": x["origin"], "space": x["space"]}
                  for x in numeric_ungraded][:8],
                 "这些原点与既有演示代码的 halfTrack 0.84 / halfWB 1.23 同源，属 DEMO 值。"
                 "R-16 禁止世界绝对坐标且 worldFrame 未冻结；R-17 用 VEHICLE_LOCAL 空间是合法的，"
                 "但**数值原点必须标 DEMO_ASSUMPTION**，否则会被下游当已核实安装位置。建议 R-17 补 valueBasis 字段。",
                 severity="P0", affectedCount=len(numeric_ungraded))
    # R-17 实例化了变型条件未裁决的零件：存在性本身是假设，不是已核实事实
    variant_conditional = [x for x in pin_mapping
                           if x["status"] != "MAPPED" and x.get("r16VariantFlag")
                           and x.get("r16InstancePolicy") == "DEFERRED"]
    if variant_conditional:
        conflict("CF-08", "VARIANT_CONDITIONAL_PART_INSTANTIATED",
                 f"{len(variant_conditional)} 个 R-17 实例对应的零件在 R-16 因变型条件未裁决而 DEFERRED",
                 [{"r17InstanceId": x["r17InstanceId"], "partId": x["partId"],
                   "r16InstancePolicy": x["r16InstancePolicy"],
                   "r16VariantFlag": x["r16VariantFlag"],
                   "r16Optionality": x["r16Optionality"],
                   "rp01GeomNote": r16def.get(x["partId"], {}).get("geomNote")}
                  for x in variant_conditional],
                 "PART-40-048 卡钳支架的 variantFlag=caliperFixedOrFloating 未裁决："
                 "浮动式必有支架，固定式常直接螺接转向节。R-16 因此 DEFERRED，"
                 "R-17 的 INST-CALIPER-BRACKET-FL 隐含选择了浮动式但未声明该假设。"
                 "**保留 UNMAPPED，不得据此声称本变型必有支架**；需总控先裁决卡钳型式再决定实例去留。",
                 severity="P1", affectedCount=len(variant_conditional))
    # ---------- Project / VehicleVariant 层对齐 ----------
    r16var, r17var = a.get("variant", {}), v.get("variant", {})
    r16cg, r17cg = r16var.get("choiceGroups", {}), r17var.get("moduleSelections", {})
    r17hub = r17cg.get("CG-HUB")
    variant_alignment = {
        "r16ProjectId": None,
        "r17ProjectId": v.get("projectId"),
        "r17ProjectName": v.get("name"),
        "r17Revision": v.get("revision"),
        "r16VariantId": r16var.get("id"),
        "r16VariantBasedOn": r16var.get("basedOn"),
        "r16VariantStatus": r16var.get("status"),
        "r16BodyStructure": r16var.get("bodyStructure"),
        "r16Powertrain": r16var.get("powertrain"),
        "r17VariantId": r17var.get("variantId"),
        "r17PlatformFamilyRef": r17var.get("platformFamilyRef"),
        "r17Generation": r17var.get("generation"),
        "r17VariantEvidenceInherited": r17var.get("evidenceInherited"),
        "r17Parameters": r17var.get("parameters"),
        "generationAgrees": CG_VALUE_MAP.get(r17hub) == r16cg.get("CG-HUB"),
        "r16ChoiceGroupCount": len(r16cg),
        "r17ChoiceGroupCount": len(r17cg),
        "r17UnsetChoiceGroups": sorted(set(r16cg) - set(r17cg)),
        "variantIdsEqual": r16var.get("id") == r17var.get("variantId"),
        "alignmentStatus": "NOT_DECLARED",
    }
    mapped_pi_count = sum(1 for x in pin_mapping if x["status"] == "MAPPED")
    if not variant_alignment["variantIdsEqual"]:
        conflict("CF-09", "VARIANT_IDENTITY_NOT_ALIGNED",
                 "两侧夹具声明的是不同整车变型，且 R-16 没有 Project 层",
                 {"r16VariantId": r16var.get("id"), "r16BasedOn": r16var.get("basedOn"),
                  "r17VariantId": r17var.get("variantId"),
                  "r17PlatformFamilyRef": r17var.get("platformFamilyRef"),
                  "r17ProjectId": v.get("projectId"), "r16ProjectId": None,
                  "generationAgrees": variant_alignment["generationAgrees"],
                  "r16ChoiceGroups": sorted(r16cg), "r17ChoiceGroups": sorted(r17cg),
                  "implicitlyAssumingSameVariantInstances": mapped_pi_count},
                 f"R-16 声明 {r16var.get('id')}（basedOn {r16var.get('basedOn')}，"
                 f"{r16var.get('status')}），R-17 声明 {r17var.get('variantId')}"
                 f"（platformFamilyRef {r17var.get('platformFamilyRef')}）。"
                 f"代际一致（{variant_alignment['generationAgrees']}），但**变型 ID 不相等且未声明对齐关系**；"
                 f"R-16 还缺 Project 层，R-17 只设了 {len(r17cg)}/{len(r16cg)} 个选择组。"
                 f"本对照表的 {mapped_pi_count} 个已映射实例都隐含假设两侧是同一变型。"
                 "**不得默认相等**：需总控裁决变型对齐关系，或双方显式声明映射；"
                 "在此之前跨夹具 join 只能视为候选对应，不是同一装车实例。",
                 severity="P0", affectedCount=mapped_pi_count)
    mirrored_frames = [x for x in frame_mapping if x.get("mirror")]
    if mirrored_frames:
        preserved.append({
            "id": "PD-01", "topic": "镜像表达方式",
            "r16": "handednessPolicy + mirrorPolicy=REGENERATE_MIRRORED_GEOMETRY，禁止任何 scale 字段",
            "r17": "Frame 级 mirror={axis,handednessFlip,mirrorOfFrameId}，位置取负",
            "reconciliation": "两者兼容：Frame 级 handednessFlip 是坐标变换，不是网格缩放。"
                              "**但下游不得把 handednessFlip 实现为全局负 mesh scale**（R-16 V11 禁止）。",
            "status": "COMPATIBLE_WITH_CONDITION",
        })

    # ---------- R-18 角色映射（非规范身份）----------
    ROLE_TO_PART = {
        "HUB": "PART-30-006", "UPPER-ARM": "PART-20-001", "LOWER-ARM": "PART-20-008",
        "UPRIGHT": "PART-20-016", "TIEROD": "PART-20-075",
    }
    r18ids = sorted(set(re.findall(r"INST-SLA-[A-Z0-9\-]+", json.dumps(m18, ensure_ascii=False))))
    role_mapping = []
    for iid in r18ids:
        corner, _ = corner_of(iid)
        role = iid[len("INST-SLA-"):]
        if corner:
            role = role[:-(len(corner) + 1)]
        pid = ROLE_TO_PART.get(role)
        cand = r16pi_by_def_corner.get((pid, corner), []) if pid else []
        d16 = r16def.get(pid, {}) if pid else {}
        deferred_required = (d16.get("instancePolicy") == "DEFERRED"
                             and d16.get("optionality") == "required")
        role_mapping.append({
            "r18InstanceId": iid, "role": role, "corner": corner,
            "mappedPartDefinitionId": pid,
            "r16InstanceId": cand[0]["instanceId"] if cand else None,
            "r16InstancePolicy": d16.get("instancePolicy"),
            "r16Optionality": d16.get("optionality"),
            "r16HandednessKind": (d16.get("handednessPolicy") or {}).get("kind"),
            "r16QtyVehicleTotal": d16.get("qtyVehicleTotal"),
            "bindingStatus": ("BOUND_TO_INSTANCE" if cand else
                              "DEFERRED_NO_INSTANCE" if d16.get("instancePolicy") == "DEFERRED"
                              else "NO_INSTANCE"),
            "mappingKind": "ROLE_BASED_NOT_IDENTITY",
            "canonicalIdentity": False,
            "r18ValueBasis": m18.get("valueBasis"),
            "r18Provenance": m18.get("provenance"),
            "r18InstanceIdStatus": m18.get("instanceIdStatus"),
            "note": "R-18 自标 CANDIDATE_NOT_FROZEN / FICTIONAL_FIXTURE；按角色对应到规范定义，"
                    "**不得把 INST-SLA-* 当规范零件身份**，也不得据此补轮端力。"
                    + ("该定义在 R-16 为 DEFERRED 但 optionality=required：零件在本变型必需，"
                       "只是几何/来源未闭合，**不是可选件也不是不存在**；下游不得因缺实例而省略它。"
                       if deferred_required else ""),
        })

    # ---------- qty 对照 ----------
    r17bom = {}
    for src in (v, f):
        for b in src["bomLines"]:
            r17bom.setdefault((b["partRef"], b["assemblyId"]), b)
    r17qf = {q["partId"]: q for q in v.get("quantityFacts", [])}
    r16qc = {q["definitionId"]: q for q in a.get("qtyConflicts", [])}
    qty_rows = []
    for pid in sorted({x["partId"] for x in pin_mapping}):
        r16rows = [p for p in a["partInstances"] if p["definitionId"] == pid]
        if not r16rows:
            continue
        r0 = r16rows[0]
        bom = next((b for (pr, _), b in r17bom.items() if pr == pid), None)
        qf = r17qf.get(pid)
        inst_count_r17 = sum(1 for x in pin_mapping if x["partId"] == pid)
        qty_rows.append({
            "partId": pid,
            "r16QtyPerCorner": r0["qtyPerCorner"],
            "r16Distribution": r0["distribution"],
            "r16Divisor": r0["distributionDivisor"],
            "r16QtyVehicleTotalInherited": r0["qtyVehicleTotalInherited"],
            "r16QtyVariantMismatch": r0["qtyVariantMismatch"],
            "r16ConflictRecorded": pid in r16qc,
            "r17BomQtyPerAssembly": bom["qtyPerAssembly"] if bom else None,
            "r17BomInstanceCount": len(bom["instanceIds"]) if bom else None,
            "r17QuantityFact": qf,
            "r17InstanceCountInFixtures": inst_count_r17,
            "perParentSemanticsAgree": (bom["qtyPerAssembly"] == len(bom["instanceIds"])) if bom else None,
            "status": "RECONCILED" if bom else "R16_ONLY_NO_R17_BOM_LINE",
        })
    bad_bom = [x for x in qty_rows if x["r17BomQtyPerAssembly"] is not None and not x["perParentSemanticsAgree"]]
    if bad_bom:
        conflict("CF-08", "BOM_QTY_INSTANCE_COUNT_MISMATCH",
                 f"{len(bad_bom)} 条 R-17 bomLine 的 qtyPerAssembly 与 instanceIds 数量不符",
                 bad_bom, "按每父装配实例计算 qty 时两者必须相等；不等则 BOM 与实例层脱节。", severity="P0")
    # R-16 的 12 项冲突必须全部保留
    preserved.append({
        "id": "PD-02", "topic": "R-16 已发现的 12 项数量冲突",
        "r16": "qtyConflicts 12 条（前盘式件整车 qty 按四轮盘式标注 vs 本变型后轴鼓式）",
        "r17": "quantityFacts 只有 PART-30-009 一条；未表达这 12 项冲突",
        "reconciliation": "**全部 12 项原样保留在本对照表 r16QtyConflictsPreserved，不静默消掉**。"
                          "R-17 夹具只覆盖 FL 单角，未涉及后轴鼓式，因此不冲突但也未裁决。",
        "status": "PRESERVED_NOT_RESOLVED",
    })

    # ---------- 未映射清单 ----------
    mapped_pdef = {x["partId"] for x in pdef_mapping if x["existsInR16"]}
    mapped_pi = {x["r16InstanceId"] for x in pin_mapping if x["r16InstanceId"]}
    mapped_ai = {x["r16AssemblyInstanceId"] for x in asminst_mapping if x["r16AssemblyInstanceId"]}
    mapped_sys = {x["r16SystemId"] for x in system_mapping if x["status"] == "MAPPED"}
    unmapped = {
        "r16OnlySystems": sorted({s["id"] for s in a["systems"]} - mapped_sys),
        "r16OnlyPartDefinitionsCount": len(a["partDefinitions"]) - len(mapped_pdef),
        "r16OnlyPartInstancesCount": len(a["partInstances"]) - len(mapped_pi),
        "r16OnlyAssemblyInstancesCount": len(a["assemblyInstances"]) - len(mapped_ai),
        "r17OnlyPartInstances": [x["r17InstanceId"] for x in pin_mapping if x["status"] != "MAPPED"],
        "r17OnlyAssemblyInstances": [x["r17AssemblyInstanceId"] for x in asminst_mapping if x["status"] != "MAPPED"],
        "r17OnlyFramesCount": sum(1 for x in frame_mapping if x["status"] != "MAPPED_ASSEMBLY_LEVEL"),
        "policy": "未映射节点一律保留并列出，**不为强行统一而丢弃真实节点**；R-16 的 493 定义/278 实例是详细树，R-17 是简化夹具，覆盖差是预期而非缺陷。",
    }

    # ---------- 覆盖统计 ----------
    coverage = {
        "systemsMapped": sum(1 for x in system_mapping if x["status"] == "MAPPED"),
        "systemsR16Only": sum(1 for x in system_mapping if x["status"] == "R16_ONLY_UNMAPPED"),
        "systemsR17Only": sum(1 for x in system_mapping if x["status"] == "R17_ONLY_UNMAPPED"),
        "assemblyDefinitionsMapped": sum(1 for x in asmdef_mapping if x["existsInRP01"]),
        "assemblyDefinitionsWithDrift": sum(1 for x in asmdef_mapping if x["nameDrift"]),
        "assemblyInstancesMapped": sum(1 for x in asminst_mapping if x["status"] == "MAPPED"),
        "assemblyInstancesUnmapped": sum(1 for x in asminst_mapping if x["status"] != "MAPPED"),
        "partDefinitionsMapped": sum(1 for x in pdef_mapping if x["status"] == "MAPPED"),
        "partDefinitionsUnmapped": sum(1 for x in pdef_mapping if x["status"] != "MAPPED"),
        "partInstancesMapped": sum(1 for x in pin_mapping if x["status"] == "MAPPED"),
        "partInstancesUnmapped": sum(1 for x in pin_mapping if x["status"] != "MAPPED"),
        "partInstancesParentLevelMismatch": len(plevel),
        "partInstancesParentLevelMismatchUnmapped": len(plevel_unmapped),
        "framesMappedAssemblyLevel": sum(1 for x in frame_mapping if x["status"] == "MAPPED_ASSEMBLY_LEVEL"),
        "framesUnmapped": sum(1 for x in frame_mapping if x["status"] != "MAPPED_ASSEMBLY_LEVEL"),
        "r18RoleMappings": len(role_mapping),
        "r17IntraFixtureDuplicateInstanceIds": sum(
            len([k for k, n in __import__("collections").Counter(
                [p["instanceId"] for p in s["partInstances"]]).items() if n > 1]) for s in (v, f)),
        "r17CrossFixtureSharedInstanceIds": len(
            {p["instanceId"] for p in v["partInstances"]} & {p["instanceId"] for p in f["partInstances"]}),
        "qtyRowsReconciled": sum(1 for x in qty_rows if x["status"] == "RECONCILED"),
        "r16QtyConflictsPreserved": len(a.get("qtyConflicts", [])),
    }

    # ---------- 补丁候选（只提议）----------
    patches = [
        {"id": "P-21-01", "target": "R-17（DeepSeek）", "proposal": "给占位总成另立 ID 前缀（如 PH-50-001），或加 isPlaceholder=true + canonicalName 字段，避免与 RP-01 真实 ID 同值异义",
         "evidence": "CF-01：6 个占位总成复用真实 ID", "executed": False},
        {"id": "P-21-02", "target": "R-17（DeepSeek）", "proposal": "frames[] 增加 valueBasis 字段；凡数值原点来自演示代码一律 DEMO_ASSUMPTION",
         "evidence": "CF-07：非零数值原点无 valueBasis", "executed": False},
        {"id": "P-21-03", "target": "R-17（DeepSeek）", "proposal": "assemblies[] 的实例主键改名 assemblyInstanceId，与 assemblyDefinitions[].assemblyId 分离，避免同名字段承载两个命名空间",
         "evidence": "CF-02", "executed": False},
        {"id": "P-21-04", "target": "总控 RP-07", "proposal": "裁决规范父级层级：轮辋归车轮总成还是轮端总成；转向节归转向节总成还是悬架总成；卡钳支架归制动模块还是卡钳总成",
         "evidence": "CF-06：3 类父级不一致", "executed": False},
        {"id": "P-21-05", "target": "R-16（本人，需总控批准）", "proposal": "补 fidelityTarget 字段与 U-* ↔ PR-* 未知登记对照；把 CG-FASTENER 候选提交 R-17 采纳",
         "evidence": "enumMapping.fidelityTarget / unknowns 两处 R17_ONLY_GAP", "executed": False},
        {"id": "P-21-06", "target": "总控 RP-07", "proposal": "R-16 的 12 项数量冲突与 R-17 的 quantityFacts 合并为统一 qty 事实表，按每父装配实例口径",
         "evidence": "PD-02", "executed": False},
        {"id": "P-21-07", "target": "R-16（本人，需总控批准）",
         "proposal": "把 qtyPerCorner 改名为 instancesPerCorner 并给每个实例加 quantity:1，或在文档明确「qtyPerCorner 属零件/角位层级，不属单个实例」；"
                     "整车总数 = 实例计数，不是 Σ qtyPerCorner",
         "evidence": "DeepSeek R-22 MSG-20261115-2240：按实例累加 qtyPerCorner 会把螺柱 20 算成 100；已核实与 R-16 V03 一致",
         "executed": False},
        {"id": "P-21-08", "target": "R-16 + R-17（需总控裁决）",
         "proposal": "双方显式声明变型对齐关系：或统一 variantId，或声明「不同变型，跨夹具仅候选对应」；R-16 补 Project 层，R-17 补齐其余 9 个选择组",
         "evidence": "CF-09：VAR-R16-BOF-ICE vs VV-A-SWB-STD，13 个已映射实例隐含假设同一变型",
         "executed": False},
    ]

    conflict("CF-02", "FIELD_NAME_OVERLOADED",
             "R-17 用 assemblyId 同时承载总成定义与总成实例两个命名空间",
             {"assemblyDefinitions[].assemblyId": "ASSY-30-001（定义）",
              "assemblies[].assemblyId": "ASM-WHEEL-END-FL（实例）",
              "partInstances[].assemblyId": "指向实例命名空间 ASM-*"},
             "跨数组按 assemblyId 直接 join 会产生错误结果。对照表一律经 definitionRef + corner 解析，"
             "不做裸 join。建议 R-17 改名（P-21-03）。", severity="P1")

    conflict("CF-05", "FRAME_GRANULARITY_MISMATCH",
             "R-16 每总成实例一个 Frame，R-17 每零件实例也有 Frame",
             {"r16Frames": len(a["mountFrames"]), "r17Frames": len(v["frames"]),
              "r16Granularity": "ASSEMBLY_INSTANCE_LEVEL", "r17Granularity": "PART_INSTANCE_LEVEL"},
             "粒度不同不是错误：R-17 需要零件级 Frame 才能表达 Joint。对照表按总成实例级对齐，"
             "零件级 Frame 标 R17_ONLY 保留，**不强行合并也不丢弃**。需总控裁决规范粒度。", severity="P1")

    fixture = {
        "schemaVersion": "R21-TREE-DOMAIN-MAPPING-0.1",
        "artifact": "vehicle-tree-domain-mapping",
        "owner": "qwen4", "taskId": "R-21", "date": "2026-11-15",
        "status": "CANDIDATE_NOT_FROZEN",
        "purpose": "把 R-16 详细整车树与 R-17 可执行领域夹具建立机器可读、可核验对照；保留差异，不丢弃真实节点，不把空几何贴成实体，不静默消掉数量冲突。",
        "authorityPolicy": {
            "canonical": "RP-01（已验收）——名称与父级的规范权威",
            "r16": "详细工程树：13 系统 / 493 定义 / 278 实例",
            "r17": "可执行领域夹具：10 系统 / 11 定义 / 14 实例（简化，非缺陷）",
            "r18": "候选位姿：INST-SLA-* 非规范身份，按角色映射",
            "rule": "任何一方都不得覆盖 RP-01 规范名；差异并列保留并标 status",
        },
        "inputs": inputs,
        "fieldMapping": field_mapping,
        "variantAlignment": variant_alignment,
        "enumMapping": enum_mapping,
        "systemMapping": system_mapping,
        "assemblyDefinitionMapping": asmdef_mapping,
        "assemblyInstanceMapping": asminst_mapping,
        "partDefinitionMapping": pdef_mapping,
        "partInstanceMapping": pin_mapping,
        "frameMapping": frame_mapping,
        "r18RoleMapping": role_mapping,
        "qtyReconciliation": qty_rows,
        "r16QtyConflictsPreserved": a.get("qtyConflicts", []),
        "conflicts": conflicts,
        "preservedDifferences": preserved,
        "unmapped": unmapped,
        "coverage": coverage,
        "patchProposals": patches,
        "invariants": {
            "noSourceFileModified": True,
            "noGeometryFabricated": True,
            "dormanNotInstalled": True,
            "unknownPreserved": True,
            "noNewPersistentPort": True,
            "r16QtyConflictsNotSilentlyDropped": True,
        },
        "summary": {
            "conflicts": len(conflicts),
            "conflictsP0": sum(1 for x in conflicts if x["severity"] == "P0"),
            "preservedDifferences": len(preserved),
            "patchProposals": len(patches),
            "patchProposalsExecuted": sum(1 for x in patches if x["executed"]),
            **coverage,
        },
    }
    return fixture


def main():
    fx = build()
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(fx, fh, ensure_ascii=False, indent=2)
    print("R-21 MAPPING BUILT ->", os.path.relpath(OUT, ROOT))
    for k, v in fx["summary"].items():
        print("  %-38s %s" % (k, v))


if __name__ == "__main__":
    main()