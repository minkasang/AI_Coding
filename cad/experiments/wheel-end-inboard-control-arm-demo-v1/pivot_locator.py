"""Build and independently measure a CAD locator with two coaxial bearing holes."""

from math import isfinite
from pathlib import Path
import sys

import numpy as np
from build123d import Box, BuildPart, Location, Mode, add

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "vehicle-cad-pipeline-v1"),
               str(HERE.parent / "wheel-end-wheel-center-demo-v1")]
from model import CUT, cylinder, datum, finish, matrix, require  # noqa: E402
from rim import full_circles, near  # noqa: E402

GRADE = "DEMO_ASSUMPTION"
LOCAL_REAR = np.array([0, 0, 1])


def asset_id(side):
    return f"C07-FL-{side.upper()}-PIVOT-LOCATOR"


def step_name(side):
    return f"{side}-pivot-locator.step"


def checked(config):
    require(set(config) == {"unit", "sourceGrade", "corner", "upper", "lower"}
            and config["unit"] == "mm" and config["sourceGrade"] == GRADE, "Expected mm / DEMO_ASSUMPTION pivot parameters")
    require(config["corner"] == "FL", "C-07 locators pair only with the same-source FL wheel end")
    signed = {"rearwardFromOuterMm", "upwardFromOuterMm", "axisRisePer100Mm"}
    positive = {"inboardFromOuterMm", "supportSpanMm", "earThicknessMm", "earOuterDiameterMm", "boreDiameterMm",
                "bridgeInnerOffsetMm", "bridgeWidthMm", "bridgeHeightMm"}
    for side in ("upper", "lower"):
        values = config[side]
        require(set(values) == signed | positive and all(type(v) in (float, int) and isfinite(v) for v in values.values())
                and all(values[key] > 0 for key in positive), f"{side}: expected finite signed and positive mm parameters")
        require(values["supportSpanMm"] > values["earThicknessMm"], f"{side}: need two separate bore support ears")
        require(values["boreDiameterMm"] / 2 < values["bridgeInnerOffsetMm"] < values["earOuterDiameterMm"] / 2,
                f"{side}: bridge must join each ear outside the bore")
    return config


def make_locator(side, data):
    span, thick = data["supportSpanMm"], data["earThicknessMm"]
    width = data["bridgeWidthMm"]
    bridge_x = -data["bridgeInnerOffsetMm"] - width / 2
    with BuildPart() as bracket:
        bridge = Box(width, data["bridgeHeightMm"], span + thick, mode=Mode.PRIVATE)
        add(Location((bridge_x, 0, 0)) * bridge)
        for sign in (-1, 1):
            base = (sign * span - thick) / 2
            add(cylinder(data["earOuterDiameterMm"], base, thick))
        add(cylinder(data["boreDiameterMm"], -(span + thick) / 2 - CUT, span + thick + 2 * CUT), mode=Mode.SUBTRACT)
    solid = finish(bracket.part)
    solid.label = asset_id(side)
    return solid


def nominal_transform(data, measured_outer_mm):
    center = measured_outer_mm + np.array([-data["inboardFromOuterMm"], data["rearwardFromOuterMm"],
                                          data["upwardFromOuterMm"]])
    aft = (0, 1, data["axisRisePer100Mm"] / 100)
    return np.array(matrix(datum(tuple(center), aft, (1, 0, 0))))


def measure_bores(shape, data):
    bores = []
    diameter = data["boreDiameterMm"]
    thickness = data["earThicknessMm"]
    for face in shape.faces():
        if face.geom_type.name != "CYLINDER":
            continue
        circles = [rim for rim in full_circles(face) if near(2 * rim.radius, diameter)
                   and near(abs(rim.axis @ LOCAL_REAR), 1)]
        if len(circles) != 2:
            continue
        front, rear = sorted(circles, key=lambda rim: rim.center[2])
        require(near(front.center[:2], [0, 0]) and near(rear.center[:2], [0, 0])
                and near(rear.center - front.center, LOCAL_REAR * thickness),
                "STEP bore is displaced or trimmed off the common manufacturing axis")
        bores.append(((front.center + rear.center) / 2, float(2 * front.radius), [front.center, rear.center]))
    require(len(bores) == 2, "STEP must contain two independent cylindrical bore faces with complete trims")
    bores.sort(key=lambda row: row[0][2])
    front, rear = (row[0] for row in bores)
    span = rear - front
    length = float(np.linalg.norm(span))
    require(near(length, data["supportSpanMm"]) and length > 0 and near(span / length, LOCAL_REAR)
            and near((front + rear) / 2, [0, 0, 0]), "Measured supports are asymmetric or share a degenerate axis")
    return bores, span / length, length
