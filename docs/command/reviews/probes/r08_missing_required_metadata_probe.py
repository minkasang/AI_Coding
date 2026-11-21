"""CARLAB R-08 audit regression, 2026-11-21.
A VERIFIED_VALID registry entry without required path/hash must FAIL CLOSED.
This deliberately exits 1 on the currently observed bug and never mutates project data.
"""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'cad/experiments/asset_quality_v1'))
import quality_gate as gate

cfg = json.loads((ROOT / 'cad/experiments/asset_quality_v1/config_verified_spec_sample.json').read_text(encoding='utf-8'))
cfg['parts']['hub']['source'].update({
    'sourceId': 'SRC-TEST-GENUINE-EVIDENCE-FILE-01',
    'drawingNumber': 'DWG-TEST-VERIFIED-2026',
    'revision': 'A',
    'applicableScope': 'PLATFORM-GEN3-FRONT-CORNER'
})
original = gate.get_provenance_registry
scenarios = ('missing_path_and_hash', 'missing_hash')
incorrect = []
try:
    for scenario in scenarios:
        registry = copy.deepcopy(original())
        record = registry['sources']['SRC-TEST-GENUINE-EVIDENCE-FILE-01']
        if scenario == 'missing_path_and_hash':
            record['verificationRecord'] = {}
        else:
            record['verificationRecord'].pop('evidenceSha256', None)
        gate.get_provenance_registry = lambda registry=registry: registry
        result = gate.Gate1_InputProvenance.evaluate(cfg, strict_provenance=True)
        print(f'{scenario}: passed={result.passed}, error={result.error_code}')
        if result.passed:
            incorrect.append(scenario)
finally:
    gate.get_provenance_registry = original

if incorrect:
    print('FAIL: production OEM_SPEC accepted with required evidence metadata absent:', ', '.join(incorrect))
    sys.exit(1)
print('PASS: missing mandatory OEM evidence path/hash is rejected')
