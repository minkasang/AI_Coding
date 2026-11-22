"""Build an integral arm on the C-01 knuckle, in its original part coordinates."""

from math import isfinite
from pathlib import Path
import sys

import numpy as np
from build123d import BuildPart, Face, Mode, Solid, Wire, add

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "vehicle-cad-pipeline-v1"))
from model import CUT, cone, cylinder, datum, finish, matrix, require  # noqa: E402

ARM_ID = "C05-FL-KNUCKLE-STEERING-DEMO"
STUD_ID = "C05-FL-STEERING-OUTER-BALL-STUD"
GRADE = "DEMO_ASSUMPTION"


def checked_arm(config):
    fields = {"reachMm", "axialStationMm", "mouthYMm", "seatDepthMm", "bossDiameterMm", "largeDiameterMm",
              "smallDiameterMm", "webAttachXMm", "webInsetMm", "webThicknessMm", "webAttachAxialWidthMm",
              "webTipAxialWidthMm"}
    require(set(config) == {"unit", "sourceGrade", "arm", "stud"} and config["unit"] == "mm"
            and config["sourceGrade"] == GRADE, "Expected mm / DEMO_ASSUMPTION C-05 parameters")
    arm = config["arm"]
    require(set(arm) == fields and all(type(value) in (float, int) and isfinite(value) for value in arm.values()),
            "Arm parameters must be finite mm dimensions")
    require(all(arm[key] > 0 for key in fields - {"axialStationMm", "mouthYMm"}), "Arm dimensions must be positive")
    require(arm["bossDiameterMm"] - arm["largeDiameterMm"] >= 4
            and arm["largeDiameterMm"] > arm["smallDiameterMm"], "Outside boss or taper diameter is invalid")
    require(arm["webInsetMm"] + arm["webThicknessMm"] < arm["seatDepthMm"],
            "Web must end between the two machined boss faces")
    require(arm["reachMm"] - arm["webAttachXMm"] > arm["bossDiameterMm"] / 2,
            "Outer boss and arm attachment must be separated")
    return arm


def mount_location(arm):
    return datum((arm["reachMm"], arm["mouthYMm"], arm["axialStationMm"]), (0, 1, 0))


def make_knuckle(original, arm):
    x, y, z = arm["reachMm"], arm["mouthYMm"], arm["axialStationMm"]
    depth = arm["seatDepthMm"]
    attach, tip = arm["webAttachXMm"], x - arm["bossDiameterMm"] / 8
    a_half, t_half = arm["webAttachAxialWidthMm"] / 2, arm["webTipAxialWidthMm"] / 2
    lower_y = y - arm["webInsetMm"] - arm["webThicknessMm"]
    corners = [(attach, lower_y, z - a_half), (tip, lower_y, z - t_half),
               (tip, lower_y, z + t_half), (attach, lower_y, z + a_half)]
    web = Solid.extrude(Face(Wire.make_polygon(corners, close=True)), (0, arm["webThicknessMm"], 0))
    seat = mount_location(arm)
    slope = (arm["largeDiameterMm"] - arm["smallDiameterMm"]) / depth
    cutter = cone(arm["smallDiameterMm"] - slope * CUT, arm["largeDiameterMm"] + slope * CUT,
                  -depth - CUT, depth + 2 * CUT)
    with BuildPart() as part:
        add(original)
        add(web)
        add(seat * cylinder(arm["bossDiameterMm"], -depth, depth))
        add(seat * cutter, mode=Mode.SUBTRACT)
    result = finish(part.part)
    result.label = ARM_ID
    return result


def measured_seat(shape, arm, full_circles, near):
    """Find the two actual trims of the added cone and the directed mouth axis."""
    reference = np.array(matrix(mount_location(arm)))
    origin, axis = reference[:3, 3], reference[:3, 2]
    for face in shape.faces():
        if face.geom_type.name != "CONE":
            continue
        circles = sorted(full_circles(face), key=lambda circle: circle.radius, reverse=True)
        if len(circles) != 2:
            continue
        mouth, exit_rim = circles
        if not near(mouth.center, origin):
            continue
        span = mouth.center - exit_rim.center
        depth = float(np.linalg.norm(span))
        require(near(depth, arm["seatDepthMm"]) and near(span / depth, axis)
                and near([2 * circle.radius for circle in circles], [arm["largeDiameterMm"], arm["smallDiameterMm"]]),
                "STEP outer taper geometry differs from design")
        measured = reference.copy()
        measured[:3, 3], measured[:3, 2] = mouth.center, span / depth
        evidence = {"surface": "CONE", "measuredTrimDepthMm": round(depth, 10),
                    "rims": [{"centerMm": circle.center.tolist(), "diameterMm": round(2 * circle.radius, 10)}
                             for circle in circles]}
        return measured, evidence
    raise ValueError("STEP contains no complete new steering taper mouth and exit")
