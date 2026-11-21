"""Bind only existing snapshot identities and solve static CAD datum mates."""

import hashlib
import json
from copy import deepcopy
from pathlib import Path

from build123d import Color, Compound

from model import datum, make_part, matrix, require

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def sha256(path):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def load_assembly():
    spec = read_json(HERE / "assembly.json")
    snapshot_spec = spec["snapshot"]
    path = REPO / snapshot_spec["path"]
    snapshot_bytes = path.read_bytes()
    snapshot = json.loads(snapshot_bytes)
    index = read_json(REPO / snapshot_spec["consumerIndex"])
    digest = hashlib.sha256(snapshot_bytes).hexdigest()
    require(snapshot["snapshotId"] == index["snapshotId"] == snapshot_spec["snapshotId"]
            and snapshot["revision"] == snapshot_spec["revision"]
            and digest == index["snapshotSha256"], "Assembly identity: snapshot ID, revision or SHA-256 mismatch")
    canonical = {row["partInstanceId"]: row for row in snapshot["tree"]["partInstances"]}
    require(len(canonical) == len(snapshot["tree"]["partInstances"]), "Assembly identity: duplicate snapshot instances")
    part_definitions = {row["partDefinitionId"]: row for row in snapshot["tree"]["partDefinitions"]}

    repeated = spec["repeatedPlacement"]
    rules = list(spec["placements"])
    for index, instance in enumerate(repeated["partInstanceIds"], 1):
        rules.append({
            "partInstanceId": instance, "partId": repeated["partId"], "parent": repeated["parent"],
            "parentMount": f"{repeated['parentMountPrefix']}{index}", "childMount": repeated["childMount"],
            "constraint": repeated["constraint"],
        })
        require(canonical.get(instance, {}).get("ordinal") == index, f"Assembly identity: ordinal mismatch for {instance}")
    require(len({row["partInstanceId"] for row in rules}) == len(rules), "Assembly identity: duplicate rules")
    for row in rules:
        instance = row["partInstanceId"]
        item = canonical.get(instance, {})
        require(item.get("partId") == row["partId"] and item.get("corner") == "FL",
                f"Assembly identity: {instance} is missing or refers to a different definition")
        row["assemblyInstanceId"] = item["assemblyInstanceId"]
        row["snapshotFrameId"] = item["frameId"]
        row["label"] = part_definitions[row["partId"]]["name"]

    binding = {
        "snapshotId": snapshot["snapshotId"], "revision": snapshot["revision"], "snapshotSha256": digest,
        "variantId": snapshot["variant"]["variantId"], "selectionKey": "partInstanceId",
        "mappingStatus": "DEMO_SUBSTITUTE", "sameVehicleClaim": False,
    }
    return spec, rules, binding


def solve(spec, rules, parameters):
    count = len(spec["repeatedPlacement"]["partInstanceIds"])
    parts = {part_id: make_part(part_id, parameters, count) for part_id in dict.fromkeys(r["partId"] for r in rules)}
    root = spec["root"]
    anchor = datum(root["origin"], root["zAxis"], root["xAxis"])
    locations = {}
    posed = {}
    instances = []
    groups = {}
    for row in rules:
        instance = row["partInstanceId"]
        child = parts[row["partId"]]
        if row["parent"] is None:
            require(row["constraint"] == "FIXTURE_ANCHOR" and row["parentMount"] == "root"
                    and not instances, "Assembly requires exactly one fixture anchor before mates")
            target = anchor
        else:
            require(row["parent"] in locations, f"Unresolved mate parent: {row['parent']}")
            require(row["constraint"] in ("COAXIAL_AND_AXIAL_STOP", "COAXIAL_NEUTRAL_AXIAL_PLACEMENT"),
                    f"Unsupported CAD placement constraint: {row['constraint']}")
            parent = next(item for item in instances if item["partInstanceId"] == row["parent"])
            target = locations[row["parent"]] * parts[parent["partId"]].mounts[row["parentMount"]]
        local_mount = child.mounts[row["childMount"]]
        location = target * local_mount.inverse()
        locations[instance] = location
        # The build123d STEP reader uses product labels for occurrences. Distinct XDE
        # products preserve each PI label, while the GLB still shares stud geometry.
        solid = deepcopy(child.solid).move(location)
        solid.label = instance
        solid.color = Color(*child.color)
        posed[instance] = solid
        groups.setdefault(row["assemblyInstanceId"], []).append(solid)
        instances.append({**row, "rootFromPartCad": matrix(location)})
    compound = Compound(label=root["frameId"], children=[
        Compound(label=assembly_id, children=members) for assembly_id, members in groups.items()
    ])
    return parts, instances, posed, compound
