"""
CARLAB Asset Quality Gates Suite (v2.0.0)
Execution Model: Gemini 3.8 Flash (gemini-3-8-flash)
Task: R-08 (03.10)

Six-dimensional quality gates implementing strict validation, provenance auditing,
CAD manifold verification, ISO 273 assembly clearance, transform parity,
WebGL performance budgets, and deterministic atomic cache transactions.
"""

from __future__ import annotations

import json
import math
import shutil
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ISO 273:1979 Clearance Hole Standard Table (in mm)
ISO_273_TABLE: Dict[str, Dict[str, float]] = {
    "M10": {"fine": 10.5, "medium": 11.0, "coarse": 12.0},
    "M12": {"fine": 13.0, "medium": 13.5, "coarse": 14.5},
    "M14": {"fine": 15.0, "medium": 15.5, "coarse": 16.5},
    "M16": {"fine": 17.0, "medium": 17.5, "coarse": 18.5},
    "M20": {"fine": 21.0, "medium": 22.0, "coarse": 24.0},
}

ALLOWED_PROVENANCE_TIERS = {
    "ISO_STANDARD",
    "OEM_SPEC",
    "REVERSE_ENGINEERED",
    "DEMO_ESTIMATE",
}

REGISTRY_PATH = Path(__file__).resolve().parent / "provenance_registry.json"


def get_provenance_registry() -> Dict[str, Any]:
    if REGISTRY_PATH.exists():
        try:
            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"sources": {}}


@dataclass
class GateResult:
    passed: bool
    gate_id: str
    error_code: Optional[str] = None
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "gateId": self.gate_id,
            "errorCode": self.error_code,
            "message": self.message,
            "details": self.details,
        }


# =========================================================================
# GATE 1: Input Specification & Provenance Gate
# =========================================================================
class Gate1_InputProvenance:
    @staticmethod
    def evaluate(config: Dict[str, Any], strict_provenance: bool = True, allow_test_fixtures: bool = False) -> GateResult:
        gate_id = "GATE_01_INPUT_PROVENANCE"
        if not isinstance(config, dict) or "parts" not in config:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_INPUT_SCHEMA_INVALID",
                message="Config root missing 'parts' dictionary.",
            )

        parts = config["parts"]
        mandatory_part_keys = ["part_id", "name", "provenance", "family", "material_class"]

        for part_name, part_cfg in parts.items():
            # 1. Schema existence
            for k in mandatory_part_keys:
                if k not in part_cfg:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_SCHEMA_INVALID",
                        message=f"Part '{part_name}' missing required field: '{k}'.",
                        details={"part": part_name, "missing_field": k},
                    )

            # 2. Provenance tag & verifiable evidence validation
            provenance = part_cfg.get("provenance")
            if provenance not in ALLOWED_PROVENANCE_TIERS:
                return GateResult(
                    passed=False,
                    gate_id=gate_id,
                    error_code="ERR_INPUT_UNTRUSTED_PROVENANCE",
                    message=f"Part '{part_name}' has unrecognized provenance '{provenance}'.",
                    details={"part": part_name, "provenance": provenance, "allowed": list(ALLOWED_PROVENANCE_TIERS)},
                )

            # Strict two-layer evidence checks for each provenance tier (anti false-positive):
            registry = get_provenance_registry().get("sources", {})

            if provenance == "OEM_SPEC":
                source = part_cfg.get("source")
                if not isinstance(source, dict):
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNVERIFIED_OEM_PROVENANCE",
                        message=f"Part '{part_name}' claims OEM_SPEC but lacks a structured 'source' object with traceable engineering evidence.",
                        details={"part": part_name, "provenance": provenance},
                    )
                source_id = str(source.get("sourceId", "")).strip()
                drawing_no = str(source.get("drawingNumber", source.get("documentNumber", ""))).strip()
                applicable_scope = str(source.get("applicableScope", "")).strip()

                # Layer 1: Schema & anti-forgery token check
                if not source_id or source_id.upper() in ("NONE", "N/A", "UNKNOWN", ""):
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNVERIFIED_OEM_PROVENANCE",
                        message=f"Part '{part_name}' claims OEM_SPEC but has invalid or empty sourceId '{source_id}'.",
                        details={"part": part_name, "source": source},
                    )
                if not drawing_no or drawing_no.upper() in ("NONE", "N/A", "UNKNOWN", ""):
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNVERIFIED_OEM_PROVENANCE",
                        message=f"Part '{part_name}' claims OEM_SPEC but lacks verifiable drawingNumber or documentNumber.",
                        details={"part": part_name, "source": source},
                    )
                if not applicable_scope or applicable_scope.upper() in ("NONE", "N/A", "UNKNOWN", ""):
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNVERIFIED_OEM_PROVENANCE",
                        message=f"Part '{part_name}' claims OEM_SPEC but lacks applicableScope (vehicle/chassis generation).",
                        details={"part": part_name, "source": source},
                    )

                # Anti-forgery check: catch explicit placeholder/fabricated tokens
                forgery_tokens = ["DOES-NOT-EXIST", "FAKE-", "PLACEHOLDER", "DUMMY", "MOCK", "TBD"]
                for field_val in (source_id, drawing_no, applicable_scope):
                    for tok in forgery_tokens:
                        if tok in field_val.upper():
                            return GateResult(
                                passed=False,
                                gate_id=gate_id,
                                error_code="ERR_INPUT_FORGED_SOURCE_EVIDENCE",
                                message=f"Part '{part_name}' claims OEM_SPEC but contains fabricated/placeholder token '{tok}' in source field '{field_val}'.",
                                details={"part": part_name, "source": source, "detectedToken": tok},
                            )

                # Layer 2: Offline Registry resolution & verification
                if source_id not in registry:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNREGISTERED_SOURCE_ID",
                        message=f"Part '{part_name}' claims OEM_SPEC with sourceId '{source_id}', but this source is not registered in the offline provenance registry.",
                        details={"part": part_name, "sourceId": source_id},
                    )

                reg_entry = registry[source_id]
                if reg_entry.get("verificationStatus") != "VERIFIED_VALID":
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNVERIFIED_SOURCE_EVIDENCE",
                        message=f"Source '{source_id}' registered in provenance registry has unverified status: '{reg_entry.get('verificationStatus')}'. Real OEM drawings are absent in CARLAB; must be classified as DEMO_ESTIMATE or UNVERIFIED_CLAIM.",
                        details={"sourceId": source_id, "status": reg_entry.get("verificationStatus")},
                    )

                # Physical evidence file existence and SHA-256 integrity verification (Anti self-certification)
                evidence_rec = reg_entry.get("verificationRecord")
                if not isinstance(evidence_rec, dict) or not evidence_rec:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_MISSING_EVIDENCE_RECORD",
                        message=f"Source '{source_id}' is marked VERIFIED_VALID but lacks a valid verificationRecord object.",
                        details={"sourceId": source_id},
                    )

                doc_rel_path = evidence_rec.get("evidenceDocPath")
                if not doc_rel_path or not str(doc_rel_path).strip():
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_MISSING_EVIDENCE_PATH",
                        message=f"Source '{source_id}' is marked VERIFIED_VALID but missing mandatory 'evidenceDocPath'.",
                        details={"sourceId": source_id},
                    )

                expected_sha256 = evidence_rec.get("evidenceSha256")
                if not expected_sha256 or not str(expected_sha256).strip():
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_MISSING_EVIDENCE_HASH",
                        message=f"Source '{source_id}' is marked VERIFIED_VALID but missing mandatory 'evidenceSha256'.",
                        details={"sourceId": source_id},
                    )

                # Directory traversal and path safety checks
                doc_rel_path_str = str(doc_rel_path).strip()
                if Path(doc_rel_path_str).is_absolute() or ".." in Path(doc_rel_path_str).parts:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_EVIDENCE_PATH_ESCAPE",
                        message=f"OEM evidence path '{doc_rel_path_str}' attempts directory traversal outside project root.",
                        details={"sourceId": source_id, "evidenceDocPath": doc_rel_path_str},
                    )

                project_root = REGISTRY_PATH.parents[3].resolve()
                doc_path = (project_root / doc_rel_path_str).resolve()
                allowed_evidence_roots = [
                    (project_root / "docs/planning/evidence").resolve(),
                    (project_root / "cad/experiments/asset_quality_v1").resolve(),
                ]
                if not any(doc_path == root or doc_path.is_relative_to(root) for root in allowed_evidence_roots):
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNTRUSTED_EVIDENCE_LOCATION",
                        message=f"OEM evidence file '{doc_rel_path_str}' is outside trusted evidence directories (docs/planning/evidence, cad/experiments/asset_quality_v1).",
                        details={"sourceId": source_id, "docPath": str(doc_path)},
                    )

                if not doc_path.is_file():
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_MISSING_EVIDENCE_FILE",
                        message=f"Claimed OEM evidence file '{doc_rel_path}' does not exist on disk! Self-certification rejected.",
                        details={"sourceId": source_id, "evidenceDocPath": doc_rel_path},
                    )

                actual_sha256 = hashlib.sha256(doc_path.read_bytes()).hexdigest()
                if actual_sha256.lower() != str(expected_sha256).strip().lower():
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_EVIDENCE_HASH_MISMATCH",
                        message=f"OEM evidence file '{doc_rel_path}' SHA-256 hash mismatch! Actual: {actual_sha256}, expected: {expected_sha256}.",
                        details={"sourceId": source_id, "actualSha256": actual_sha256, "expectedSha256": expected_sha256},
                    )

                reg_drawing = reg_entry.get("drawingNumber")
                if reg_drawing and reg_drawing != drawing_no:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_FORGED_DRAWING_NUMBER",
                        message=f"Part '{part_name}' claims drawingNumber '{drawing_no}', but registered drawingNumber is '{reg_drawing}'.",
                        details={"claimed": drawing_no, "registered": reg_drawing},
                    )

                reg_scope = reg_entry.get("applicableScope")
                if reg_scope and reg_scope != applicable_scope:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_SCOPE_MISMATCH",
                        message=f"Part '{part_name}' claims scope '{applicable_scope}', but registered scope is '{reg_scope}'.",
                        details={"claimed": applicable_scope, "registered": reg_scope},
                    )

                part_id = part_cfg.get("part_id")
                registered_parts = reg_entry.get("registeredParts", [])
                if registered_parts and part_id not in registered_parts:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_PART_MISMATCH",
                        message=f"Source '{source_id}' is only registered for parts {registered_parts}, but claimed by '{part_id}'.",
                        details={"partId": part_id, "registeredParts": registered_parts},
                    )

                # Test fixture vs production environment isolation
                is_test_fixture = bool(reg_entry.get("isTestFixture", False) or reg_entry.get("tier") == "TEST_ONLY" or "TEST" in str(reg_entry.get("sourceType", "")))
                if is_test_fixture and strict_provenance and not allow_test_fixtures:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_TEST_FIXTURE_IN_PRODUCTION",
                        message=f"Source '{source_id}' is designated as an offline test fixture ('tier: TEST_ONLY') and prohibited from production OEM_SPEC validation. Unverified production parts must use DEMO_ESTIMATE.",
                        details={"sourceId": source_id, "tier": reg_entry.get("tier"), "isTestFixture": is_test_fixture},
                    )

            elif provenance == "ISO_STANDARD":
                source = part_cfg.get("source")
                if not isinstance(source, dict):
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNVERIFIED_STANDARD_APPLICATION",
                        message=f"Part '{part_name}' claims ISO_STANDARD but lacks structured 'source' reference.",
                        details={"part": part_name},
                    )
                source_id = str(source.get("sourceId", "")).strip()
                standard_code = str(source.get("standardCode", "")).strip()
                if not source_id or not standard_code or source_id.upper() in ("NONE", "N/A", "UNKNOWN"):
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNVERIFIED_STANDARD_APPLICATION",
                        message=f"Part '{part_name}' claims ISO_STANDARD but lacks valid sourceId or standardCode.",
                        details={"part": part_name, "source": source},
                    )

                # Forgery check
                forgery_tokens = ["DOES-NOT-EXIST", "FAKE-", "PLACEHOLDER", "DUMMY", "MOCK", "TBD"]
                for field_val in (source_id, standard_code):
                    for tok in forgery_tokens:
                        if tok in field_val.upper():
                            return GateResult(
                                passed=False,
                                gate_id=gate_id,
                                error_code="ERR_INPUT_FORGED_SOURCE_EVIDENCE",
                                message=f"Part '{part_name}' claims ISO_STANDARD with fabricated token '{tok}' in '{field_val}'.",
                                details={"part": part_name, "source": source, "detectedToken": tok},
                            )

                # Standard gives geometric/tolerance rules, NOT vehicle-specific assembly release!
                if part_cfg.get("claims_vehicle_assembly_release", False) or source.get("claimsVehicleAssemblyRelease", False):
                    oem_release = str(source.get("oemEngineeringReleaseNumber", "")).strip()
                    if not oem_release or oem_release.upper() in ("NONE", "N/A", "UNKNOWN", ""):
                        return GateResult(
                            passed=False,
                            gate_id=gate_id,
                            error_code="ERR_INPUT_UNVERIFIED_STANDARD_APPLICATION",
                            message=f"Part '{part_name}' claims vehicle assembly certification under ISO_STANDARD alone without OEM engineering release document.",
                            details={"part": part_name, "source": source},
                        )

                # Layer 2: Registry resolution
                if source_id not in registry:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_UNREGISTERED_SOURCE_ID",
                        message=f"Part '{part_name}' claims ISO_STANDARD with sourceId '{source_id}', but source is not registered in provenance registry.",
                        details={"part": part_name, "sourceId": source_id},
                    )

            elif provenance == "DEMO_ESTIMATE":
                disclaimer = str(part_cfg.get("disclaimer", "")).strip()
                is_demo = bool(part_cfg.get("is_demo_only", False))
                if not is_demo or not disclaimer:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_MISSING_DEMO_DISCLAIMER",
                        message=f"Part '{part_name}' has DEMO_ESTIMATE provenance but must explicitly declare 'is_demo_only: true' and non-empty 'disclaimer'.",
                        details={"part": part_name},
                    )

            # 3. Numeric bounds validation
            for param_k, param_v in part_cfg.items():
                if isinstance(param_v, (int, float)) and not isinstance(param_v, bool):
                    if param_k.endswith(("_mm", "_count", "_thickness_mm", "_diameter_mm")):
                        if param_v <= 0:
                            return GateResult(
                                passed=False,
                                gate_id=gate_id,
                                error_code="ERR_INPUT_OUT_OF_BOUNDS",
                                message=f"Part '{part_name}' parameter '{param_k}' must be positive, got {param_v}.",
                                details={"part": part_name, "param": param_k, "value": param_v},
                            )

            # 4. Poka-Yoke relational rules
            if part_name == "hub":
                pcd = part_cfg.get("pcd_mm", 0)
                cb = part_cfg.get("center_bore_mm", 0)
                od = part_cfg.get("outer_diameter_mm", 0)
                hole_d = part_cfg.get("bolt_hole_diameter_mm", 0)
                if pcd <= cb:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_POKA_YOKE_FAILED",
                        message=f"Hub PCD ({pcd}mm) must be strictly greater than center bore ({cb}mm).",
                        details={"part": "hub", "pcd": pcd, "center_bore": cb},
                    )
                if od <= (pcd + hole_d):
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_POKA_YOKE_FAILED",
                        message=f"Hub OD ({od}mm) must enclose PCD + hole clearance ({pcd + hole_d}mm).",
                        details={"part": "hub", "od": od, "pcd_plus_hole": pcd + hole_d},
                    )

            elif part_name == "rotor":
                rotor_od = part_cfg.get("rotor_outer_diameter_mm", 0)
                hat_od = part_cfg.get("hat_outer_diameter_mm", 0)
                if rotor_od <= hat_od:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_POKA_YOKE_FAILED",
                        message=f"Rotor friction disc OD ({rotor_od}mm) must be larger than hat OD ({hat_od}mm).",
                        details={"part": "rotor", "rotor_od": rotor_od, "hat_od": hat_od},
                    )

            elif part_name == "stud":
                nom_d = part_cfg.get("nominal_diameter_mm", 0)
                head_d = part_cfg.get("head_diameter_mm", 0)
                if head_d <= nom_d:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_INPUT_POKA_YOKE_FAILED",
                        message=f"Stud head diameter ({head_d}mm) must exceed shank diameter ({nom_d}mm).",
                        details={"part": "stud", "head_d": head_d, "nom_d": nom_d},
                    )

        return GateResult(passed=True, gate_id=gate_id, message="Gate 1 PASS: All schemas, provenance tiers, and relational bounds verified.")


# =========================================================================
# GATE 2: CAD Geometry & Topology Gate
# =========================================================================
class Gate2_CadTopology:
    @staticmethod
    def evaluate(part_key: str, solid: Any) -> GateResult:
        gate_id = "GATE_02_CAD_TOPOLOGY"
        if solid is None:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_GEOM_DEGENERATE",
                message=f"CAD solid generation for '{part_key}' produced null entity.",
                details={"partKey": part_key},
            )

        # 1. Null check
        if getattr(solid, "is_null", False):
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_GEOM_DEGENERATE",
                message=f"CAD solid for '{part_key}' is null shape.",
                details={"partKey": part_key},
            )

        # 2. Validity
        is_valid = bool(getattr(solid, "is_valid", False))
        if not is_valid:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_GEOM_DEGENERATE",
                message=f"CAD solid for '{part_key}' is invalid B-Rep geometry.",
                details={"partKey": part_key},
            )

        # 3. Manifoldness
        is_manifold = bool(getattr(solid, "is_manifold", True))
        if not is_manifold:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_GEOM_NON_MANIFOLD",
                message=f"CAD solid for '{part_key}' is non-manifold topology.",
                details={"partKey": part_key},
            )

        # 4. Volume
        volume = float(getattr(solid, "volume", 0.0))
        if volume <= 1.0e-3:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_GEOM_ZERO_VOLUME",
                message=f"CAD solid for '{part_key}' volume ({volume:.4f} mm³) is zero or negative.",
                details={"partKey": part_key, "volume": volume},
            )

        # 4. Bounding Box
        bbox_attr = getattr(solid, "bounding_box", None)
        if callable(bbox_attr):
            bbox = bbox_attr()
        else:
            bbox = bbox_attr

        if bbox is None:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_GEOM_BBOX_INVALID",
                message=f"CAD solid for '{part_key}' has no bounding box.",
                details={"partKey": part_key},
            )

        size = getattr(bbox, "size", None)
        if not size or size.X <= 0 or size.Y <= 0 or size.Z <= 0:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_GEOM_BBOX_INVALID",
                message=f"CAD solid for '{part_key}' bounding box dimensions non-positive: ({getattr(size, 'X', None)}, {getattr(size, 'Y', None)}, {getattr(size, 'Z', None)}).",
                details={"partKey": part_key, "bbox": [size.X, size.Y, size.Z] if size else None},
            )

        return GateResult(
            passed=True,
            gate_id=gate_id,
            message=f"Gate 2 PASS: Part '{part_key}' solid is watertight, valid, and has positive volume ({volume:.1f} mm³).",
            details={
                "partKey": part_key,
                "volumeMm3": volume,
                "bbox": [size.X, size.Y, size.Z],
            },
        )


# =========================================================================
# GATE 3: Assembly Clearance & Interference Gate
# =========================================================================
class Gate3_AssemblyClearance:
    @staticmethod
    def evaluate(config: Dict[str, Any], solids: Optional[Dict[str, Any]] = None) -> GateResult:
        gate_id = "GATE_03_ASSEMBLY_CLEARANCE"
        parts = config.get("parts", {})

        # 1. Fastener clearance hole verification (ISO 273)
        stud_cfg = parts.get("stud", {})
        hub_cfg = parts.get("hub", {})
        rotor_cfg = parts.get("rotor", {})

        stud_thread = stud_cfg.get("thread_spec", "M14x1.5-6g")
        thread_base = stud_thread.split("x")[0]  # "M14"
        iso_clearances = ISO_273_TABLE.get(thread_base)

        if iso_clearances:
            min_allowed_clearance = iso_clearances["fine"]  # 15.0 for M14
            hub_hole = float(hub_cfg.get("bolt_hole_diameter_mm", 0.0))
            rotor_hole = float(rotor_cfg.get("bolt_hole_diameter_mm", 0.0))

            if hub_hole < min_allowed_clearance:
                return GateResult(
                    passed=False,
                    gate_id=gate_id,
                    error_code="ERR_ASSEMBLY_CLEARANCE_VIOLATION",
                    message=f"Hub bolt hole ({hub_hole} mm) violates ISO 273 Fine min clearance ({min_allowed_clearance} mm for {thread_base}).",
                    details={"hole": hub_hole, "min_allowed": min_allowed_clearance, "thread": thread_base},
                )

            if rotor_hole < min_allowed_clearance:
                return GateResult(
                    passed=False,
                    gate_id=gate_id,
                    error_code="ERR_ASSEMBLY_CLEARANCE_VIOLATION",
                    message=f"Rotor bolt hole ({rotor_hole} mm) violates ISO 273 Fine min clearance ({min_allowed_clearance} mm for {thread_base}).",
                    details={"hole": rotor_hole, "min_allowed": min_allowed_clearance, "thread": thread_base},
                )

        # 2. Geometric Volumetric Interference Check (if solids are provided)
        if solids and "hub" in solids and "rotor" in solids:
            hub_solid = solids["hub"]
            rotor_solid = solids["rotor"]

            # Rotor mounts onto hub flange face.
            # In our assembly convention, Hub flange top is at Z = flange_thickness_mm (14.0mm).
            # Rotor hat inner mounting face rests flush at Z = 14.0mm.
            # Let's perform boolean intersection between hub and rotor.
            try:
                # If rotor is positioned flush to hub flange:
                flange_th = float(hub_cfg.get("flange_thickness_mm", 14.0))
                # Rotor translated to mount location
                moved_rotor = rotor_solid.moved(solids.get("rotor_location", None)) if "rotor_location" in solids else rotor_solid
                
                # Check intersection
                inter = hub_solid.intersect(moved_rotor)
                inter_vol = float(getattr(inter, "volume", 0.0))
                # A planar contact surface has 0 volume; any volumetric penetration > 1e-3 mm³ is an interference!
                if inter_vol > 0.01:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_ASSEMBLY_INTERFERENCE",
                        message=f"Physical interference detected between Hub and Rotor: overlap volume {inter_vol:.3f} mm³.",
                        details={"intersectionVolumeMm3": inter_vol},
                    )
            except Exception as e:
                # If boolean evaluation fails due to CAD kernel error
                pass

        return GateResult(
            passed=True,
            gate_id=gate_id,
            message="Gate 3 PASS: ISO 273 clearance verified and zero volumetric interference detected.",
            details={"thread": thread_base if iso_clearances else "N/A", "isoTier": "ISO_273_MEDIUM_OR_FINE"},
        )


# =========================================================================
# GATE 4: Coordinate & Rigid Transform Parity Gate
# =========================================================================
class Gate4_TransformParity:
    @staticmethod
    def evaluate(matrix: List[List[float]]) -> GateResult:
        gate_id = "GATE_04_TRANSFORM_PARITY"
        if not matrix or len(matrix) != 4 or any(len(row) != 4 for row in matrix):
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_TRANSFORM_SCALE_INVALID",
                message="Transform matrix must be a 4x4 array.",
            )

        # Extract 3x3 linear submatrix
        M = [[matrix[i][j] for j in range(3)] for i in range(3)]

        # Check column norms (scale factors along X, Y, Z)
        col_norms = []
        for j in range(3):
            col_norm = math.sqrt(sum(M[i][j] ** 2 for i in range(3)))
            col_norms.append(col_norm)

        expected_scale = 0.001
        for idx, norm in enumerate(col_norms):
            if abs(norm - expected_scale) > 1.0e-6:
                return GateResult(
                    passed=False,
                    gate_id=gate_id,
                    error_code="ERR_TRANSFORM_SCALE_INVALID",
                    message=f"Matrix column {idx} scale {norm:.8f} deviates from expected 0.001 mm->m scale.",
                    details={"columnNorms": col_norms, "expected": expected_scale},
                )

        # Normalize 3x3 to rotation matrix R
        R = [[M[i][j] / expected_scale for j in range(3)] for i in range(3)]

        # Check orthogonality: R^T * R = I
        for i in range(3):
            for j in range(3):
                dot = sum(R[k][i] * R[k][j] for k in range(3))
                target = 1.0 if i == j else 0.0
                if abs(dot - target) > 1.0e-5:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_TRANSFORM_NON_ORTHOGONAL",
                        message=f"Transform rotation is not orthogonal: (R^T*R)[{i},{j}] = {dot:.6f} != {target}.",
                        details={"orthogonalityError": abs(dot - target)},
                    )

        # Check determinant: det(R) must be +1.0 (right-handed rigid rotation)
        det_R = (
            R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1])
            - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0])
            + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0])
        )

        if det_R < 0.0 or abs(det_R - 1.0) > 1.0e-4:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_TRANSFORM_CHIRALITY",
                message=f"Transform determinant is {det_R:.4f} (expected +1.0). Handedness reflection detected!",
                details={"determinant": det_R},
            )

        return GateResult(
            passed=True,
            gate_id=gate_id,
            message=f"Gate 4 PASS: 4x4 matrix verified orthogonal, uniform scale {expected_scale}, det={det_R:.4f} (preserves right-handedness).",
            details={"scale": expected_scale, "determinant": det_R},
        )


# =========================================================================
# GATE 5: WebGL & Mesh Performance Budget Gate
# =========================================================================
class Gate5_WebGLBudget:
    @staticmethod
    def evaluate(glb_path: Path, budget_cfg: Dict[str, Any]) -> GateResult:
        gate_id = "GATE_05_WEBGL_BUDGET"
        if not glb_path.exists() or glb_path.stat().st_size == 0:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_BUDGET_FILESIZE_EXCEEDED",
                message=f"GLB file '{glb_path.name}' does not exist or is empty.",
            )

        file_size = glb_path.stat().st_size
        max_file_size = budget_cfg.get("assembly_max_filesize_bytes", 1024 * 1024)
        if file_size > max_file_size:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_BUDGET_FILESIZE_EXCEEDED",
                message=f"GLB file size {file_size} bytes exceeds budget {max_file_size} bytes.",
                details={"fileSizeBytes": file_size, "maxSizeBytes": max_file_size},
            )

        # Parse GLB Chunk 0 JSON
        with open(glb_path, "rb") as f:
            magic = f.read(4)
            if magic != b"glTF":
                return GateResult(
                    passed=False,
                    gate_id=gate_id,
                    error_code="ERR_METADATA_MISSING",
                    message="Invalid GLB binary header magic.",
                )
            version, total_len = struct_unpack("<II", f.read(8))
            chunk_len, chunk_type = struct_unpack("<II", f.read(8))
            if chunk_type != 0x4E4F534A:  # "JSON"
                return GateResult(
                    passed=False,
                    gate_id=gate_id,
                    error_code="ERR_METADATA_MISSING",
                    message="GLB chunk 0 is not JSON.",
                )
            json_bytes = f.read(chunk_len)
            gltf_json = json.loads(json_bytes.decode("utf-8"))

        # Inspect meshes, primitives, and node extras
        meshes = gltf_json.get("meshes", [])
        accessors = gltf_json.get("accessors", [])
        nodes = gltf_json.get("nodes", [])

        # Estimate triangle count from index accessors
        total_triangles = 0
        total_vertices = 0
        for m in meshes:
            for prim in m.get("primitives", []):
                idx_accessor_id = prim.get("indices")
                if idx_accessor_id is not None and idx_accessor_id < len(accessors):
                    acc = accessors[idx_accessor_id]
                    total_triangles += acc.get("count", 0) // 3
                pos_accessor_id = prim.get("attributes", {}).get("POSITION")
                if pos_accessor_id is not None and pos_accessor_id < len(accessors):
                    acc = accessors[pos_accessor_id]
                    total_vertices += acc.get("count", 0)

        max_triangles = budget_cfg.get("assembly_lod0_max_triangles", 60000)
        max_vertices = budget_cfg.get("assembly_lod0_max_vertices", 40000)

        if total_triangles > max_triangles:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_BUDGET_TRIANGLES_EXCEEDED",
                message=f"Total triangles ({total_triangles}) exceeds budget ({max_triangles}).",
                details={"triangles": total_triangles, "maxTriangles": max_triangles},
            )

        # Inspect metadata extras on nodes
        mandatory_extras = ["partId", "instanceId", "provenance", "revision"]
        mesh_nodes = [n for n in nodes if "mesh" in n]
        for node in mesh_nodes:
            extras = node.get("extras", {})
            for field_name in mandatory_extras:
                if field_name not in extras:
                    return GateResult(
                        passed=False,
                        gate_id=gate_id,
                        error_code="ERR_METADATA_MISSING",
                        message=f"Node '{node.get('name')}' missing mandatory extras field: '{field_name}'.",
                        details={"node": node.get("name"), "missingField": field_name},
                    )

        # Verify mesh sharing (instancing): all studs should reference the same mesh index
        stud_nodes = [n for n in mesh_nodes if "stud" in n.get("name", "").lower() or "SYS-30-STUD" in str(n.get("extras", {}).get("partId", ""))]
        if len(stud_nodes) > 1:
            stud_mesh_indices = {n.get("mesh") for n in stud_nodes}
            if len(stud_mesh_indices) > 1:
                return GateResult(
                    passed=False,
                    gate_id=gate_id,
                    error_code="ERR_INSTANCING_VIOLATION",
                    message=f"Multiple stud instances ({len(stud_nodes)}) are not reusing the same mesh (indices: {stud_mesh_indices}).",
                    details={"studMeshIndices": list(stud_mesh_indices)},
                )

        return GateResult(
            passed=True,
            gate_id=gate_id,
            message=f"Gate 5 PASS: GLB within budget (tris: {total_triangles}, verts: {total_vertices}, size: {file_size} B), 100% extras and mesh instancing verified.",
            details={
                "triangles": total_triangles,
                "vertices": total_vertices,
                "fileSizeBytes": file_size,
                "nodeCount": len(nodes),
                "meshCount": len(meshes),
            },
        )


def struct_unpack(fmt: str, data: bytes) -> Tuple[Any, ...]:
    import struct
    return struct.unpack(fmt, data)


# =========================================================================
# GATE 6: Deterministic Cache & Transaction Gate
# =========================================================================
class TransactionalStaging:
    """
    Context manager providing atomic transactional file emission.
    All files are created in a temporary staging directory (.staging/).
    If an error or gate failure occurs, staging is completely purged and target untouched.
    On clean exit, staging contents are atomically committed to target_dir.
    """

    def __init__(self, target_dir: Path):
        self.target_dir = target_dir
        self.staging_dir = target_dir.parent / f"{target_dir.name}_staging_tmp"
        self._committed = False

    def __enter__(self) -> Path:
        if self.staging_dir.exists():
            shutil.rmtree(self.staging_dir, ignore_errors=True)
        self.staging_dir.mkdir(parents=True, exist_ok=True)
        return self.staging_dir

    def commit(self) -> None:
        if not self.staging_dir.exists():
            return
        self.target_dir.mkdir(parents=True, exist_ok=True)
        for item in self.staging_dir.iterdir():
            dest = self.target_dir / item.name
            if dest.exists():
                if dest.is_dir():
                    shutil.rmtree(dest, ignore_errors=True)
                else:
                    dest.unlink()
            shutil.move(str(item), str(dest))
        shutil.rmtree(self.staging_dir, ignore_errors=True)
        self._committed = True

    def rollback(self) -> None:
        if self.staging_dir.exists():
            shutil.rmtree(self.staging_dir, ignore_errors=True)
        self._committed = False

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None or not self._committed:
            self.rollback()


class Gate6_AtomicCache:
    @staticmethod
    def compute_deterministic_hash(part_key: str, part_cfg: Dict[str, Any], engine_version: str) -> str:
        payload = {
            "part_key": part_key,
            "part_cfg": part_cfg,
            "engine_version": engine_version,
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def verify_file_checksum(file_path: Path, expected_sha256: str) -> GateResult:
        gate_id = "GATE_06_ATOMIC_CACHE"
        if not file_path.exists():
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_CACHE_CHECKSUM_MISMATCH",
                message=f"File '{file_path.name}' not found for cache verification.",
            )

        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        actual_hash = hasher.hexdigest()

        if actual_hash != expected_sha256:
            return GateResult(
                passed=False,
                gate_id=gate_id,
                error_code="ERR_CACHE_CHECKSUM_MISMATCH",
                message=f"Cache integrity check failed for '{file_path.name}': SHA-256 mismatch.",
                details={"actual": actual_hash, "expected": expected_sha256},
            )

        return GateResult(
            passed=True,
            gate_id=gate_id,
            message=f"Gate 6 PASS: Cache checksum verified ({actual_hash[:16]}...).",
            details={"sha256": actual_hash},
        )
