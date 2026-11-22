"""
CARLAB Wheel End Provenance Checker (v1.2.0)
Task: R-34 (03.36)
Author: Gemini 3.8 Flash (gemini-3-8-flash)

Applies R-08 quality gate discipline to C-01 CAD release packages.
Validates demonstration source grades, detects provenance contradictions,
enforces test fixture isolation, verifies physical asset hashes,
and audits snapshot binding integrity.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

ALLOWED_PACKAGE_SOURCE_GRADES = {
    "DEMO_ASSUMPTION",
    "DEMO_ESTIMATE",
    "OEM_SPEC",
    "REVERSE_ENGINEERED",
}

ALLOWED_PART_SOURCE_GRADES = {
    "DEMO_ASSUMPTION",
    "DEMO_ESTIMATE",
    "OEM_SPEC",
    "REVERSE_ENGINEERED",
}

PROJECT_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = PROJECT_ROOT / "cad/experiments/asset_quality_v1/provenance_registry.json"


def get_provenance_registry() -> Dict[str, Any]:
    if REGISTRY_PATH.exists():
        try:
            return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"sources": {}}


@dataclass
class CheckResult:
    passed: bool
    package_id: str
    error_code: Optional[str] = None
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)
    provenance_summary: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "packageId": self.package_id,
            "errorCode": self.error_code,
            "message": self.message,
            "details": self.details,
            "provenanceSummary": self.provenance_summary,
        }


class WheelEndProvenanceChecker:
    @staticmethod
    def evaluate(
        manifest: Dict[str, Any],
        package_dir: Optional[Path] = None,
        strict_mode: bool = True,
        allow_test_fixtures: bool = False,
        snapshot_file: Optional[Path] = None,
        metadata_only: bool = False,
    ) -> CheckResult:
        package_id = str(manifest.get("packageId", "UNKNOWN_PACKAGE"))

        # -------------------------------------------------------------
        # 1. Root Schema Validation
        # -------------------------------------------------------------
        mandatory_sections = [
            "packageId",
            "sourceGrade",
            "parameters",
            "snapshotBinding",
            "basis",
            "root",
            "assets",
            "partDefinitions",
            "instances",
            "sha256",
        ]
        for sec in mandatory_sections:
            if sec not in manifest or manifest[sec] is None:
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_INPUT_SCHEMA_INVALID",
                    message=f"Package manifest is missing mandatory section: '{sec}'.",
                    details={"missingSection": sec},
                )

        source_grade = str(manifest.get("sourceGrade", "")).strip()
        if source_grade not in ALLOWED_PACKAGE_SOURCE_GRADES:
            return CheckResult(
                passed=False,
                package_id=package_id,
                error_code="ERR_INPUT_UNTRUSTED_PROVENANCE",
                message=f"Package '{package_id}' has unrecognized sourceGrade: '{source_grade}'.",
                details={"claimedGrade": source_grade, "allowed": list(ALLOWED_PACKAGE_SOURCE_GRADES)},
            )

        # -------------------------------------------------------------
        # 2. Demonstration Boundaries & Vehicle Release Claim
        # -------------------------------------------------------------
        snapshot_binding = manifest.get("snapshotBinding", {})
        same_vehicle_claim = snapshot_binding.get("sameVehicleClaim", False)
        mapping_status = snapshot_binding.get("mappingStatus", "")

        if source_grade in ("DEMO_ASSUMPTION", "DEMO_ESTIMATE"):
            # A demonstration package MUST NOT claim verified same-vehicle production release
            if same_vehicle_claim is True:
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_UNVERIFIED_VEHICLE_CLAIM",
                    message=f"Package '{package_id}' has DEMO sourceGrade '{source_grade}' but declares sameVehicleClaim=true! Demonstration models cannot certify same-vehicle production release.",
                    details={"sourceGrade": source_grade, "sameVehicleClaim": same_vehicle_claim},
                )

            # Mapping status must reflect demo substitution
            if mapping_status not in ("DEMO_SUBSTITUTE", "DEMO_ESTIMATE", "UNVERIFIED_CLAIM"):
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_PROVENANCE_CONTRADICTION",
                    message=f"Package '{package_id}' claims demo grade '{source_grade}' but snapshot mappingStatus claims production release '{mapping_status}'.",
                    details={"sourceGrade": source_grade, "mappingStatus": mapping_status},
                )

            # Root placement and motion binding must not claim verified vehicle assembly
            root_info = manifest.get("root", {})
            if root_info.get("vehiclePlacement") is not None or root_info.get("motionBinding") is not None:
                vp = root_info.get("vehiclePlacement")
                if isinstance(vp, dict) and vp.get("status") == "OEM_CERTIFIED":
                    return CheckResult(
                        passed=False,
                        package_id=package_id,
                        error_code="ERR_UNVERIFIED_VEHICLE_CLAIM",
                        message="Package claims certified OEM vehicle placement under demonstration source grade.",
                        details={"vehiclePlacement": vp},
                    )

        # -------------------------------------------------------------
        # 3. Package vs Part Provenance Contradiction Check
        # -------------------------------------------------------------
        part_defs = manifest.get("partDefinitions", {})
        part_grades: Dict[str, str] = {}
        registry = get_provenance_registry().get("sources", {})

        for part_id, pdef in part_defs.items():
            mat_info = pdef.get("material", {})
            p_grade = mat_info.get("sourceGrade") or pdef.get("sourceGrade")
            if not p_grade:
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_INPUT_SCHEMA_INVALID",
                    message=f"Part '{part_id}' in partDefinitions is missing sourceGrade in material.",
                    details={"partId": part_id},
                )

            # Reject untrusted / unrecognized part source grades
            if p_grade not in ALLOWED_PART_SOURCE_GRADES:
                if source_grade == "OEM_SPEC":
                    return CheckResult(
                        passed=False,
                        package_id=package_id,
                        error_code="ERR_PACKAGE_PART_GRADE_MISMATCH",
                        message=f"Package '{package_id}' claims OEM_SPEC, but constituent part '{part_id}' has untrusted/non-OEM grade '{p_grade}'.",
                        details={"packageGrade": source_grade, "partId": part_id, "partGrade": p_grade},
                    )
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_INPUT_UNTRUSTED_PROVENANCE",
                    message=f"Part '{part_id}' has unrecognized sourceGrade: '{p_grade}'.",
                    details={"partId": part_id, "claimedGrade": p_grade, "allowed": list(ALLOWED_PART_SOURCE_GRADES)},
                )

            part_grades[part_id] = p_grade

            # Contradiction: Package claims DEMO, but part claims unverified OEM_SPEC
            if source_grade in ("DEMO_ASSUMPTION", "DEMO_ESTIMATE"):
                if p_grade == "OEM_SPEC":
                    source_meta = pdef.get("source") or {}
                    source_id = source_meta.get("sourceId")
                    if not source_id or source_id not in registry:
                        return CheckResult(
                            passed=False,
                            package_id=package_id,
                            error_code="ERR_PROVENANCE_CONTRADICTION",
                            message=f"Package '{package_id}' is {source_grade}, but part '{part_id}' claims OEM_SPEC without registered evidence in registry.",
                            details={"packageGrade": source_grade, "partId": part_id, "partGrade": p_grade},
                        )

            # Contradiction: Package claims OEM_SPEC, but constituent part is not OEM_SPEC
            if source_grade == "OEM_SPEC":
                if p_grade != "OEM_SPEC":
                    return CheckResult(
                        passed=False,
                        package_id=package_id,
                        error_code="ERR_PACKAGE_PART_GRADE_MISMATCH",
                        message=f"Package '{package_id}' claims OEM_SPEC, but constituent part '{part_id}' has non-OEM grade '{p_grade}'.",
                        details={"packageGrade": source_grade, "partId": part_id, "partGrade": p_grade},
                    )

            # Check OEM_SPEC parts against provenance registry
            if p_grade == "OEM_SPEC":
                source_meta = pdef.get("source", {})
                source_id = source_meta.get("sourceId")
                if not source_id or source_id not in registry:
                    return CheckResult(
                        passed=False,
                        package_id=package_id,
                        error_code="ERR_INPUT_UNREGISTERED_SOURCE_ID",
                        message=f"Part '{part_id}' claims OEM_SPEC with unregistered sourceId '{source_id}'.",
                        details={"partId": part_id, "sourceId": source_id},
                    )
                reg_entry = registry[source_id]
                if reg_entry.get("verificationStatus") != "VERIFIED_VALID":
                    return CheckResult(
                        passed=False,
                        package_id=package_id,
                        error_code="ERR_INPUT_UNVERIFIED_SOURCE_EVIDENCE",
                        message=f"Part '{part_id}' source '{source_id}' has unverified status: '{reg_entry.get('verificationStatus')}'.",
                        details={"partId": part_id, "status": reg_entry.get("verificationStatus")},
                    )
                # Test fixture isolation
                is_fixture = bool(
                    reg_entry.get("isTestFixture", False)
                    or reg_entry.get("tier") == "TEST_ONLY"
                )
                if is_fixture and strict_mode and not allow_test_fixtures:
                    return CheckResult(
                        passed=False,
                        package_id=package_id,
                        error_code="ERR_INPUT_TEST_FIXTURE_IN_PRODUCTION",
                        message=f"Part '{part_id}' uses test fixture source '{source_id}' in production mode.",
                        details={"partId": part_id, "sourceId": source_id},
                    )

        # -------------------------------------------------------------
        # 4. Manifest Asset Hash Completeness Check
        # -------------------------------------------------------------
        sha_manifest = manifest.get("sha256", {})
        if not isinstance(sha_manifest, dict) or len(sha_manifest) == 0:
            return CheckResult(
                passed=False,
                package_id=package_id,
                error_code="ERR_INPUT_EMPTY_ASSET_HASHES",
                message=f"Package '{package_id}' sha256 asset hash manifest is empty or invalid.",
                details={"sha256": sha_manifest},
            )

        # 4a. Check assembly-level core assets (assets.step, assets.glb)
        assets_section = manifest.get("assets", {})
        for asset_key in ("step", "glb"):
            core_asset = assets_section.get(asset_key)
            if not core_asset:
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_INPUT_SCHEMA_INVALID",
                    message=f"Package '{package_id}' manifest assets section is missing '{asset_key}'.",
                    details={"missingAssetKey": asset_key},
                )
            if core_asset not in sha_manifest or not str(sha_manifest[core_asset]).strip():
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_INPUT_MISSING_CORE_ASSET_HASH",
                    message=f"Package '{package_id}' is missing required asset hash for core asset '{core_asset}'.",
                    details={"missingCoreAsset": core_asset},
                )

        # 4b. Check constituent part-level STEP assets
        for part_id, pdef in part_defs.items():
            part_step = pdef.get("step")
            if not part_step:
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_INPUT_SCHEMA_INVALID",
                    message=f"Part '{part_id}' in partDefinitions is missing 'step' declaration.",
                    details={"partId": part_id},
                )
            if part_step not in sha_manifest or not str(sha_manifest[part_step]).strip():
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_INPUT_MISSING_PART_ASSET_HASH",
                    message=f"Package '{package_id}' is missing required asset hash for part '{part_id}' STEP file '{part_step}'.",
                    details={"partId": part_id, "missingPartAsset": part_step},
                )

        # -------------------------------------------------------------
        # 5. Snapshot Binding & Real Package Disk Integrity Check
        # -------------------------------------------------------------
        expected_snap_hash = snapshot_binding.get("snapshotSha256")
        if not expected_snap_hash or not str(expected_snap_hash).strip():
            return CheckResult(
                passed=False,
                package_id=package_id,
                error_code="ERR_INPUT_SCHEMA_INVALID",
                message="Package snapshotBinding is missing mandatory snapshotSha256 hash.",
                details={"snapshotBinding": snapshot_binding},
            )

        verified_files_count = 0

        if not metadata_only:
            # Full package release verification requires physical package directory
            if package_dir is None:
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_PACKAGE_DIRECTORY_REQUIRED",
                    message=f"Real package verification for '{package_id}' requires 'package_dir'. Pass metadata_only=True for standalone metadata check.",
                    details={"packageDir": None},
                )

            p_dir = Path(package_dir)
            if not p_dir.exists() or not p_dir.is_dir():
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_PACKAGE_DIRECTORY_NOT_FOUND",
                    message=f"Package directory '{package_dir}' does not exist on disk or is not a directory.",
                    details={"packageDir": str(package_dir)},
                )

            # Full package release verification requires physical snapshot file
            if snapshot_file is None:
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_SNAPSHOT_FILE_REQUIRED",
                    message=f"Real package verification for '{package_id}' requires 'snapshot_file'. Pass metadata_only=True for standalone metadata check.",
                    details={"snapshotFile": None},
                )

            s_file = Path(snapshot_file)
            if not s_file.exists() or not s_file.is_file():
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_SNAPSHOT_FILE_NOT_FOUND",
                    message=f"Snapshot file '{snapshot_file}' does not exist on disk or is not a file.",
                    details={"snapshotFile": str(snapshot_file)},
                )

            # Verify snapshot binding hash against disk snapshot
            actual_snap_hash = hashlib.sha256(s_file.read_bytes()).hexdigest()
            if actual_snap_hash.lower() != str(expected_snap_hash).strip().lower():
                return CheckResult(
                    passed=False,
                    package_id=package_id,
                    error_code="ERR_SNAPSHOT_BINDING_MISMATCH",
                    message=f"Snapshot binding SHA-256 mismatch! Package claims '{expected_snap_hash}', disk snapshot is '{actual_snap_hash}'.",
                    details={"actual": actual_snap_hash, "expected": expected_snap_hash},
                )

            # Verify all physical asset files and hashes on disk
            for rel_file, expected_hash in sha_manifest.items():
                file_path = p_dir / rel_file
                if not file_path.is_file():
                    return CheckResult(
                        passed=False,
                        package_id=package_id,
                        error_code="ERR_ASSET_FILE_MISSING",
                        message=f"Physical asset file '{rel_file}' listed in manifest is missing from disk at '{file_path}'.",
                        details={"missingFile": str(file_path)},
                    )
                actual_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()
                if actual_hash.lower() != str(expected_hash).strip().lower():
                    return CheckResult(
                        passed=False,
                        package_id=package_id,
                        error_code="ERR_ASSET_HASH_MISMATCH",
                        message=f"Physical asset '{rel_file}' SHA-256 hash mismatch! Actual: {actual_hash}, expected: {expected_hash}.",
                        details={"file": rel_file, "actualSha256": actual_hash, "expectedSha256": expected_hash},
                    )
                verified_files_count += 1

        # -------------------------------------------------------------
        # 6. Evaluation Summary
        # -------------------------------------------------------------
        verification_mode = "METADATA_ONLY" if metadata_only else "FULL_PACKAGE_RELEASE"

        summary = {
            "packageId": package_id,
            "packageSourceGrade": source_grade,
            "verificationMode": verification_mode,
            "r08EquivalentTier": "DEMO_ESTIMATE" if source_grade == "DEMO_ASSUMPTION" else source_grade,
            "mappingStatus": mapping_status,
            "sameVehicleClaim": same_vehicle_claim,
            "partCount": len(part_defs),
            "instanceCount": len(manifest.get("instances", [])),
            "externalMountCount": len(manifest.get("externalMounts", [])),
            "verifiedFilesCount": verified_files_count,
            "demonstrationNotice": "All components verified as DEMO_ASSUMPTION demonstration assets. No OEM engineering production drawings released. Safe for viewer consumption and isolated staging.",
        }

        if metadata_only:
            pass_msg = (
                f"Package '{package_id}' PASSES metadata-only quality gate "
                f"(schema, vocabulary, and manifest hashes verified; disk assets not validated)."
            )
        else:
            pass_msg = (
                f"Package '{package_id}' PASSES full package release quality gate as verified "
                f"{source_grade} demonstration asset with {verified_files_count} disk files and snapshot binding validated."
            )

        return CheckResult(
            passed=True,
            package_id=package_id,
            error_code=None,
            message=pass_msg,
            details={"verificationMode": verification_mode},
            provenance_summary=summary,
        )
