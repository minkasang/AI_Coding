"""R-08: independent proof a registry record cannot self-certify OEM evidence.

Checks path existence for claimed verified OEM records. This is a regression
probe: until Gate1 fails closed on missing/unverified artifacts, results
must not be called actual OEM provenance.
"""
import json
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[4]
registry = json.loads((root / 'cad/experiments/asset_quality_v1/provenance_registry.json').read_text(encoding='utf-8'))
bad = []
for ref, entry in registry.get('sources', {}).items():
    if entry.get('sourceType') != 'OEM_ENGINEERING_DRAWING' or entry.get('verificationStatus') != 'VERIFIED_VALID':
        continue
    evidence = entry.get('verificationRecord', {})
    path = root / str(evidence.get('evidenceDocPath', ''))
    if not path.is_file():
        bad.append((ref, str(path)))
for ref, path in bad:
    print(f'MISSING_ACTUAL_OEM_EVIDENCE {ref}: {path}')
if bad:
    print('FAIL: registry VERIFIED_VALID is unsupported by existing evidence files')
    sys.exit(1)
print('PASS: all registry OEM VERIFIED_VALID paths exist (hash verification still required)')
