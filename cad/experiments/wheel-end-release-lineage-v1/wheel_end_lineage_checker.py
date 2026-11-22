"""
CARLAB Wheel End Release Lineage & Provenance Checker (v1.0.0)
Task: R-43 (03.45)
Author: Gemini 3.8 Flash (gemini-3-8-flash)

Validates release packages for C-03 (ball studs) and C-04 (wheel center / rim datum).
Applies R-08 and R-34 quality gate discipline:
- Enforces DEMO_ASSUMPTION source grade and prevents unverified vendor/OEM upgrades
- Blocks dynamic playback (playbackAllowed == false) and enforces candidate partial geometry
- Verifies full lineage chain: Snapshot -> C-01 (wheel-end) -> C-02 (datums) -> C-03 (studs) -> C-04 (rim)
- Dual-mode operation: FULL_PACKAGE_RELEASE (disk files & snapshot) vs METADATA_ONLY (schema & declarations)
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

ALLOWED_SOURCE_GRADES = {
    "DEMO_ASSUMPTION",
    "DEMO_ESTIMATE",
}

PROJECT_ROOT = Path(__file__).resolve().parents[3]


@dataclass
class LineageCheckResult:
    passed: bool
    package_id: str
    package_type: str  # "C03_BALL_STUDS" | "C04_WHEEL_CENTER" | "UNKNOWN"
    error_code: Optional[str] = None
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)
    summary: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "packageId": self.package_id,
            "packageType": self.package_type,
            "errorCode": self.error_code,
            "message": self.message,
            "details": self.details,
            "summary": self.summary,
        }


class WheelEndLineageChecker:
    @staticmethod
    def evaluate(
        manifest: Dict[str, Any],
        package_dir: Optional[Path] = None,
        snapshot_file: Optional[Path] = None,
        c01_dir: Optional[Path] = None,
        c02_file: Optional[Path] = None,
        c03_dir: Optional[Path] = None,
        metadata_only: bool = False,
        strict_mode: bool = True,
    ) -> LineageCheckResult:
        package_id = str(manifest.get("packageId", "UNKNOWN_PACKAGE"))
        schema_ver = str(manifest.get("schemaVersion", "")).strip()

        if schema_ver == "carlab.c03DemoBallStuds/1":
            pkg_type = "C03_BALL_STUDS"
        elif schema_ver == "carlab.c04DemoWheelCenter/1":
            pkg_type = "C04_WHEEL_CENTER"
        else:
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type="UNKNOWN",
                error_code="ERR_INPUT_SCHEMA_INVALID",
                message=f"Unrecognized or unsupported schemaVersion: '{schema_ver}'.",
                details={"schemaVersion": schema_ver},
            )

        # -------------------------------------------------------------
        # 1. Root Schema Validation
        # -------------------------------------------------------------
        if pkg_type == "C03_BALL_STUDS":
            mandatory_sections = [
                "schemaVersion",
                "packageId",
                "sourceGrade",
                "effectiveParameters",
                "sources",
                "sha256",
                "frames",
                "studs",
                "motionInput",
            ]
        else:  # C04_WHEEL_CENTER
            mandatory_sections = [
                "schemaVersion",
                "packageId",
                "sourceGrade",
                "asset",
                "sha256",
                "sources",
                "effectiveParameters",
                "frames",
                "hubMountingFace",
                "referenceSections",
                "spindle",
                "wheelCenter",
                "signedOffset",
                "boltPattern",
                "motionInput",
            ]

        for sec in mandatory_sections:
            if sec not in manifest or manifest[sec] is None:
                return LineageCheckResult(
                    passed=False,
                    package_id=package_id,
                    package_type=pkg_type,
                    error_code="ERR_INPUT_SCHEMA_INVALID",
                    message=f"Package '{package_id}' manifest is missing mandatory section: '{sec}'.",
                    details={"missingSection": sec},
                )

        # -------------------------------------------------------------
        # 2. Source Grade Enforcement
        # -------------------------------------------------------------
        source_grade = str(manifest.get("sourceGrade", "")).strip()
        if source_grade not in ALLOWED_SOURCE_GRADES:
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type=pkg_type,
                error_code="ERR_UNVERIFIED_SOURCE_UPGRADE",
                message=(
                    f"Package '{package_id}' claims sourceGrade '{source_grade}', but demonstration packages "
                    f"MUST NOT claim unverified OEM or production status without certified drawings."
                ),
                details={"claimedGrade": source_grade, "allowed": list(ALLOWED_SOURCE_GRADES)},
            )

        # -------------------------------------------------------------
        # 3. Demonstration Boundaries & Playback Isolation
        # -------------------------------------------------------------
        motion_input = manifest.get("motionInput", {})
        if motion_input.get("playbackAllowed") is not False:
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type=pkg_type,
                error_code="ERR_ILLEGAL_PLAYBACK_ENABLED",
                message=(
                    f"Package '{package_id}' has playbackAllowed={motion_input.get('playbackAllowed')}. "
                    f"Demonstration inputs must keep playbackAllowed=false until full closed-loop vehicle registration."
                ),
                details={"playbackAllowed": motion_input.get("playbackAllowed")},
            )

        if motion_input.get("existingR28Registration") != "REGISTRATION_BLOCKED":
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type=pkg_type,
                error_code="ERR_UNVERIFIED_VEHICLE_CLAIM",
                message=f"Package '{package_id}' must maintain existingR28Registration='REGISTRATION_BLOCKED'.",
                details={"existingR28Registration": motion_input.get("existingR28Registration")},
            )

        # Snapshot binding sameVehicleClaim check
        sources_section = manifest.get("sources", {})
        snapshot_meta = sources_section.get("snapshot", {})
        if snapshot_meta.get("sameVehicleClaim") is True:
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type=pkg_type,
                error_code="ERR_UNVERIFIED_VEHICLE_CLAIM",
                message=f"Package '{package_id}' declares sameVehicleClaim=true! Demonstration models cannot certify same-vehicle production release.",
                details={"sameVehicleClaim": True},
            )

        # Candidate partial geometry check for C03
        if pkg_type == "C03_BALL_STUDS":
            studs_meta = manifest.get("studs", {})
            for stud_key in ("upper", "lower"):
                cand = studs_meta.get(stud_key, {}).get("candidateAssembly", {})
                if cand.get("status") != "CANDIDATE_PARTIAL_GEOMETRY":
                    return LineageCheckResult(
                        passed=False,
                        package_id=package_id,
                        package_type=pkg_type,
                        error_code="ERR_UNVERIFIED_VEHICLE_CLAIM",
                        message=f"C-03 {stud_key} ball stud candidateAssembly status must be 'CANDIDATE_PARTIAL_GEOMETRY'.",
                        details={"candidateAssembly": cand},
                    )

        # -------------------------------------------------------------
        # 4. Manifest Asset Hashes Completeness
        # -------------------------------------------------------------
        sha_manifest = manifest.get("sha256", {})
        if not isinstance(sha_manifest, dict) or len(sha_manifest) == 0:
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type=pkg_type,
                error_code="ERR_INPUT_EMPTY_ASSET_HASHES",
                message=f"Package '{package_id}' sha256 asset hash manifest is empty or invalid.",
                details={"sha256": sha_manifest},
            )

        # Expected asset files
        if pkg_type == "C03_BALL_STUDS":
            expected_assets = ["upper-ball-stud.step", "lower-ball-stud.step"]
        else:  # C04_WHEEL_CENTER
            expected_assets = ["rim-datum.step"]

        for asset_name in expected_assets:
            if asset_name not in sha_manifest or not str(sha_manifest[asset_name]).strip():
                return LineageCheckResult(
                    passed=False,
                    package_id=package_id,
                    package_type=pkg_type,
                    error_code="ERR_INPUT_MISSING_ASSET_HASH",
                    message=f"Package '{package_id}' is missing required asset hash for '{asset_name}'.",
                    details={"missingAsset": asset_name},
                )

        # -------------------------------------------------------------
        # 5. Dependency Lineage Verification (sources)
        # -------------------------------------------------------------
        # 5a. Snapshot source check
        expected_snap_hash = snapshot_meta.get("snapshotSha256")
        if not expected_snap_hash or not str(expected_snap_hash).strip():
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type=pkg_type,
                error_code="ERR_INPUT_SCHEMA_INVALID",
                message=f"Package '{package_id}' sources.snapshot is missing 'snapshotSha256'.",
                details={"sourcesSnapshot": snapshot_meta},
            )

        # 5b. C-01 source check
        c01_source = sources_section.get("c01", {})
        if not c01_source.get("packageId") or not c01_source.get("manifestSha256"):
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type=pkg_type,
                error_code="ERR_INPUT_SCHEMA_INVALID",
                message=f"Package '{package_id}' sources.c01 is missing packageId or manifestSha256.",
                details={"c01Source": c01_source},
            )

        # Check against actual C-01 on disk if c01_dir provided
        if c01_dir is not None:
            c01_path = Path(c01_dir)
            c01_manifest_file = c01_path / "manifest.json"
            if c01_manifest_file.is_file():
                actual_c01_m_hash = hashlib.sha256(c01_manifest_file.read_bytes()).hexdigest()
                if actual_c01_m_hash.lower() != str(c01_source.get("manifestSha256")).strip().lower():
                    return LineageCheckResult(
                        passed=False,
                        package_id=package_id,
                        package_type=pkg_type,
                        error_code="ERR_DEPENDENCY_HASH_MISMATCH",
                        message=(
                            f"Package '{package_id}' claims C-01 manifestSha256 '{c01_source.get('manifestSha256')}', "
                            f"but disk C-01 manifest has actual hash '{actual_c01_m_hash}'."
                        ),
                        details={"expected": c01_source.get("manifestSha256"), "actual": actual_c01_m_hash},
                    )

        # 5c. C-02 source check
        c02_source = sources_section.get("c02", {})
        if not c02_source.get("datumsSha256"):
            return LineageCheckResult(
                passed=False,
                package_id=package_id,
                package_type=pkg_type,
                error_code="ERR_INPUT_SCHEMA_INVALID",
                message=f"Package '{package_id}' sources.c02 is missing datumsSha256.",
                details={"c02Source": c02_source},
            )

        # Check against actual C-02 on disk if c02_file provided
        if c02_file is not None:
            c02_p = Path(c02_file)
            if c02_p.is_file():
                actual_c02_hash = hashlib.sha256(c02_p.read_bytes()).hexdigest()
                if actual_c02_hash.lower() != str(c02_source.get("datumsSha256")).strip().lower():
                    return LineageCheckResult(
                        passed=False,
                        package_id=package_id,
                        package_type=pkg_type,
                        error_code="ERR_DEPENDENCY_HASH_MISMATCH",
                        message=(
                            f"Package '{package_id}' claims C-02 datumsSha256 '{c02_source.get('datumsSha256')}', "
                            f"but disk C-02 has actual hash '{actual_c02_hash}'."
                        ),
                        details={"expected": c02_source.get("datumsSha256"), "actual": actual_c02_hash},
                    )

        # 5d. C-04 specific: C-03 source check
        if pkg_type == "C04_WHEEL_CENTER":
            c03_source = sources_section.get("c03", {})
            if not c03_source.get("packageId") or not c03_source.get("manifestSha256") or not c03_source.get("stepSha256"):
                return LineageCheckResult(
                    passed=False,
                    package_id=package_id,
                    package_type=pkg_type,
                    error_code="ERR_INPUT_SCHEMA_INVALID",
                    message=f"C-04 package '{package_id}' sources.c03 is missing packageId, manifestSha256, or stepSha256.",
                    details={"c03Source": c03_source},
                )

            # Check against actual C-03 on disk if c03_dir provided
            if c03_dir is not None:
                c03_p = Path(c03_dir)
                c03_m_file = c03_p / "manifest.json"
                if c03_m_file.is_file():
                    actual_c03_m_hash = hashlib.sha256(c03_m_file.read_bytes()).hexdigest()
                    if actual_c03_m_hash.lower() != str(c03_source.get("manifestSha256")).strip().lower():
                        return LineageCheckResult(
                            passed=False,
                            package_id=package_id,
                            package_type=pkg_type,
                            error_code="ERR_DEPENDENCY_HASH_MISMATCH",
                            message=(
                                f"Package '{package_id}' claims C-03 manifestSha256 '{c03_source.get('manifestSha256')}', "
                                f"but disk C-03 manifest has actual hash '{actual_c03_m_hash}'."
                            ),
                            details={"expected": c03_source.get("manifestSha256"), "actual": actual_c03_m_hash},
                        )

                # Check C-03 step files in C-04's sources.c03.stepSha256
                for s_rel, s_expected in c03_source.get("stepSha256", {}).items():
                    step_p = c03_p / s_rel
                    if step_p.is_file():
                        act_s_hash = hashlib.sha256(step_p.read_bytes()).hexdigest()
                        if act_s_hash.lower() != str(s_expected).strip().lower():
                            return LineageCheckResult(
                                passed=False,
                                package_id=package_id,
                                package_type=pkg_type,
                                error_code="ERR_DEPENDENCY_HASH_MISMATCH",
                                message=(
                                    f"Package '{package_id}' claims C-03 step '{s_rel}' hash '{s_expected}', "
                                    f"but disk STEP has actual hash '{act_s_hash}'."
                                ),
                                details={"step": s_rel, "expected": s_expected, "actual": act_s_hash},
                            )

        # -------------------------------------------------------------
        # 6. Physical Directory & Snapshot Verification (Full Mode)
        # -------------------------------------------------------------
        verified_files_count = 0
        if not metadata_only:
            # Package directory required
            if package_dir is None:
                return LineageCheckResult(
                    passed=False,
                    package_id=package_id,
                    package_type=pkg_type,
                    error_code="ERR_PACKAGE_DIRECTORY_REQUIRED",
                    message=f"Full release verification for '{package_id}' requires 'package_dir'. Pass metadata_only=True for standalone metadata check.",
                    details={"packageDir": None},
                )

            p_dir = Path(package_dir)
            if not p_dir.exists() or not p_dir.is_dir():
                return LineageCheckResult(
                    passed=False,
                    package_id=package_id,
                    package_type=pkg_type,
                    error_code="ERR_PACKAGE_DIRECTORY_NOT_FOUND",
                    message=f"Package directory '{package_dir}' does not exist on disk or is not a directory.",
                    details={"packageDir": str(package_dir)},
                )

            # Snapshot file required
            if snapshot_file is None:
                return LineageCheckResult(
                    passed=False,
                    package_id=package_id,
                    package_type=pkg_type,
                    error_code="ERR_SNAPSHOT_FILE_REQUIRED",
                    message=f"Full release verification for '{package_id}' requires 'snapshot_file'. Pass metadata_only=True for standalone metadata check.",
                    details={"snapshotFile": None},
                )

            s_file = Path(snapshot_file)
            if not s_file.exists() or not s_file.is_file():
                return LineageCheckResult(
                    passed=False,
                    package_id=package_id,
                    package_type=pkg_type,
                    error_code="ERR_SNAPSHOT_FILE_NOT_FOUND",
                    message=f"Snapshot file '{snapshot_file}' does not exist on disk or is not a file.",
                    details={"snapshotFile": str(snapshot_file)},
                )

            # Snapshot binding hash match
            actual_snap_hash = hashlib.sha256(s_file.read_bytes()).hexdigest()
            if actual_snap_hash.lower() != str(expected_snap_hash).strip().lower():
                return LineageCheckResult(
                    passed=False,
                    package_id=package_id,
                    package_type=pkg_type,
                    error_code="ERR_SNAPSHOT_BINDING_MISMATCH",
                    message=f"Snapshot binding SHA-256 mismatch! Package claims '{expected_snap_hash}', disk snapshot is '{actual_snap_hash}'.",
                    details={"expected": expected_snap_hash, "actual": actual_snap_hash},
                )

            # Verify every physical asset in sha256
            for rel_file, expected_hash in sha_manifest.items():
                file_p = p_dir / rel_file
                if not file_p.is_file():
                    return LineageCheckResult(
                        passed=False,
                        package_id=package_id,
                        package_type=pkg_type,
                        error_code="ERR_ASSET_FILE_MISSING",
                        message=f"Physical asset file '{rel_file}' is missing from package directory at '{file_p}'.",
                        details={"missingFile": str(file_p)},
                    )
                actual_hash = hashlib.sha256(file_p.read_bytes()).hexdigest()
                if actual_hash.lower() != str(expected_hash).strip().lower():
                    return LineageCheckResult(
                        passed=False,
                        package_id=package_id,
                        package_type=pkg_type,
                        error_code="ERR_ASSET_HASH_MISMATCH",
                        message=f"Physical asset '{rel_file}' hash mismatch! Expected: {expected_hash}, actual: {actual_hash}.",
                        details={"file": rel_file, "expected": expected_hash, "actual": actual_hash},
                    )
                verified_files_count += 1

        # -------------------------------------------------------------
        # 7. Summary & Result Formulation
        # -------------------------------------------------------------
        verification_mode = "METADATA_ONLY" if metadata_only else "FULL_PACKAGE_RELEASE"

        summary = {
            "packageId": package_id,
            "packageType": pkg_type,
            "schemaVersion": schema_ver,
            "sourceGrade": source_grade,
            "verificationMode": verification_mode,
            "verifiedFilesCount": verified_files_count,
            "expectedAssetsCount": len(expected_assets),
            "playbackAllowed": False,
            "existingR28Registration": "REGISTRATION_BLOCKED",
            "sameVehicleClaim": False,
            "lineageDependencies": list(sources_section.keys()),
            "demonstrationNotice": (
                f"Package '{package_id}' verified as {source_grade} demonstration asset. "
                "No OEM production drawings released. Kinematic playback remains disabled."
            ),
        }

        if metadata_only:
            pass_msg = (
                f"Package '{package_id}' ({pkg_type}) PASSES metadata-only quality gate "
                f"(schema, sourceGrade, lineage declarations, and asset hashes verified; disk files not validated)."
            )
        else:
            pass_msg = (
                f"Package '{package_id}' ({pkg_type}) PASSES full package release quality gate as verified "
                f"{source_grade} demonstration asset with {verified_files_count} disk assets and lineage dependencies validated."
            )

        return LineageCheckResult(
            passed=True,
            package_id=package_id,
            package_type=pkg_type,
            error_code=None,
            message=pass_msg,
            details={"verificationMode": verification_mode},
            summary=summary,
        )
