"""Independent CARLAB R-08 evidence-forgery probe (read-only).
Run: .venv/Scripts/python.exe docs/command/reviews/probes/r08_forged_source_probe.py
Expected current behaviour (BUG): invalid arbitrary strings are approved.
"""
from pathlib import Path
import copy
import json
import sys

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "cad" / "experiments" / "asset_quality_v1"))
from quality_gate import Gate1_InputProvenance

base = json.loads((ROOT / "cad/experiments/asset_quality_v1/config_verified_spec_sample.json").read_text(encoding="utf-8"))
fake = copy.deepcopy(base)
fake["parts"]["hub"]["source"] = {
    "sourceId": "DOES-NOT-EXIST",
    "drawingNumber": "FAKE-DRAWING",
    "applicableScope": "FAKE-VEHICLE",
}
result = Gate1_InputProvenance.evaluate(fake)
print("R08_FORGED_OEM_SOURCE_PROBE", {
    "fake_source_passed": result.passed,
    "error_code": result.error_code,
    "rule": "unresolvable/fabricated source must not qualify as verified OEM",
})
if result.passed:
    print("FAIL: placeholder strings falsely accepted as verified OEM evidence")
    sys.exit(1)
print("PASS: forged evidence rejected")
