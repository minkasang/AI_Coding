"""B-rep locator and inner datum pin in a local frame with +Z out of the bore."""

from math import isfinite
from pathlib import Path
import sys

import numpy as np
from build123d import Align, Box, BuildPart, Location, Mode, Sphere, add
from OCP.BRepAdaptor import BRepAdaptor_Surface

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "vehicle-cad-pipeline-v1"),
               str(HERE.parent / "wheel-end-wheel-center-demo-v1")]
from model import CUT, cone, cylinder, finish, require  # noqa: E402
from rim import full_circles, near, vector  # noqa: E402

GRADE = "DEMO_ASSUMPTION"
LOCATOR_ID = "C06-FL-INNER-PIVOT-FIXTURE"
PIN_ID = "C06-FL-INNER-BALL-DATUM-PIN"
LOCAL_OUT = np.array([0, 0, 1])
OFFSET_FIELDS = {"inboardMm", "rearwardMm", "upwardMm"}
LOCATOR_FIELDS = {"blockWidthMm", "blockHeightMm", "blockDepthMm", "boreDepthMm",
                  "attachmentHoleDiameterMm", "attachmentHolePitchMm"}
PIN_FIELDS = {"stemDiameterMm", "stemDepthMm", "radialClearanceMm", "tipChamferMm", "collarDiameterMm",
              "collarThicknessMm", "neckDiameterMm", "ballDiameterMm", "ballOffsetMm"}


def checked(config):
    require(set(config) == {"unit", "sourceGrade", "corner", "neutralOffset", "locator", "pin"}
            and config["unit"] == "mm" and config["sourceGrade"] == GRADE,
            "Expected mm / DEMO_ASSUMPTION C-06 parameters")
    require(config["corner"] == "FL", "C-06 neutral fixture pairs only with the approved C-05 FL outer end")
    for section, fields in (("neutralOffset", OFFSET_FIELDS), ("locator", LOCATOR_FIELDS), ("pin", PIN_FIELDS)):
        values = config[section]
        require(set(values) == fields and all(type(value) in (float, int) and isfinite(value) for value in values.values()),
                f"{section}: expected finite mm dimensions")
    offset, locator, pin = (config[key] for key in ("neutralOffset", "locator", "pin"))
    require(offset["inboardMm"] > 0 and all(value > 0 for values in (locator, pin) for value in values.values()),
            "Expected a positive inboard displacement and positive locator/pin dimensions")
    clearance = pin["radialClearanceMm"]
    bore_d = pin["stemDiameterMm"] + 2 * clearance
    ring_d = pin["collarDiameterMm"]
    require(pin["stemDepthMm"] < locator["boreDepthMm"] < locator["blockDepthMm"],
            "Blind bore must leave material at the bottom and clearance at the pin tip")
    require(0 < pin["tipChamferMm"] < min(pin["stemDiameterMm"] / 2, pin["stemDepthMm"]),
            "Pin tip chamfer is invalid")
    require(bore_d < ring_d < min(locator["blockWidthMm"], locator["blockHeightMm"]),
            "Collar must lie on the locator face and surround the bore")
    diameter = locator["attachmentHoleDiameterMm"]
    pitch = locator["attachmentHolePitchMm"]
    require(ring_d + diameter < pitch < locator["blockWidthMm"] - diameter
            and diameter < locator["blockHeightMm"], "Locator plate attachment holes run outside the plate or collar")
    require(pin["neckDiameterMm"] < min(ring_d, 0.8 * pin["ballDiameterMm"])
            and pin["ballOffsetMm"] - pin["ballDiameterMm"] / 2 > pin["collarThicknessMm"],
            "Ball and collar must be separated by a neck")
    return offset, locator, pin


def make_locator(locator, pin):
    depth = locator["blockDepthMm"]
    bore = locator["boreDepthMm"]
    hole_pitch = locator["attachmentHolePitchMm"]
    bore_d = pin["stemDiameterMm"] + 2 * pin["radialClearanceMm"]
    with BuildPart() as part:
        block = Box(locator["blockWidthMm"], locator["blockHeightMm"], depth,
                    align=(Align.CENTER, Align.CENTER, Align.MAX), mode=Mode.PRIVATE)
        add(block)
        add(cylinder(bore_d, -bore, bore + CUT), mode=Mode.SUBTRACT)
        for sign in (-1, 1):
            location = Location((sign * hole_pitch / 2, 0, 0))
            add(location * cylinder(locator["attachmentHoleDiameterMm"], -depth - CUT, depth + 2 * CUT),
                mode=Mode.SUBTRACT)
    result = finish(part.part)
    result.label = LOCATOR_ID
    return result


def make_pin(pin):
    depth, chamfer = pin["stemDepthMm"], pin["tipChamferMm"]
    stem = pin["stemDiameterMm"]
    radius = pin["ballDiameterMm"] / 2
    top = pin["ballOffsetMm"] - radius / 2
    collar = pin["collarThicknessMm"]
    with BuildPart() as part:
        add(cone(stem - 2 * chamfer, stem, -depth, chamfer))
        add(cylinder(stem, -depth + chamfer, depth - chamfer))
        add(cylinder(pin["collarDiameterMm"], 0, collar))
        add(cylinder(pin["neckDiameterMm"], collar, top - collar))
        add(Location((0, 0, pin["ballOffsetMm"])) * Sphere(radius, mode=Mode.PRIVATE))
    result = finish(part.part)
    result.label = PIN_ID
    return result


def read_sphere(shape):
    spheres = [BRepAdaptor_Surface(face.wrapped).Sphere() for face in shape.faces() if face.geom_type.name == "SPHERE"]
    require(len(spheres) == 1, "Expected a single spherical STEP face for the ball datum")
    return vector(spheres[0].Location()), float(2 * spheres[0].Radius())


def coaxial_rims(shape, xy, diameter):
    for face in shape.faces():
        if face.geom_type.name != "CYLINDER":
            continue
        circles = [c for c in full_circles(face) if near(c.center[:2], xy)
                   and near(2 * c.radius, diameter) and near(abs(c.axis @ LOCAL_OUT), 1)]
        if len(circles) == 2:
            return sorted(circles, key=lambda circle: circle.center[2])
    raise ValueError(f"Missing STEP cylinder at ({xy[0]:g},{xy[1]:g}) for Ø{diameter:g}")


def read_contact_geometry(fixture, stud, locator, pin):
    bore_d = pin["stemDiameterMm"] + 2 * pin["radialClearanceMm"]
    bottom, mouth = coaxial_rims(fixture, [0, 0], bore_d)
    require(near(mouth.center, [0, 0, 0]) and near(bottom.center, [0, 0, -locator["boreDepthMm"]]),
            "Wrong STEP bore trim positions")
    for sign in (-1, 1):
        xy = [sign * locator["attachmentHolePitchMm"] / 2, 0]
        lower, upper = coaxial_rims(fixture, xy, locator["attachmentHoleDiameterMm"])
        require(near([lower.center[2], upper.center[2]], [-locator["blockDepthMm"], 0]),
                "Locator plate attachment hole is not through")
    stem_tip, stem_top = coaxial_rims(stud, [0, 0], pin["stemDiameterMm"])
    tip_z = stud.bounding_box(optimal=True).min.Z
    require(near(stem_top.center, [0, 0, 0]) and near(stem_tip.center[2], tip_z + pin["tipChamferMm"])
            and near(tip_z, -pin["stemDepthMm"]), "Pin STEP shank or tip drift")
    gap = mouth.radius - stem_top.radius
    tip = float(tip_z - bottom.center[2])
    center, diameter = read_sphere(stud)
    require(near(center, [0, 0, pin["ballOffsetMm"]]) and near(diameter, pin["ballDiameterMm"])
            and near(gap, pin["radialClearanceMm"]) and tip > 0, "STEP ball or fit differs from design")
    return center, {"boreDiameterMm": round(2 * mouth.radius, 8), "stemDiameterMm": round(2 * stem_top.radius, 8),
                    "radialGapMm": round(gap, 8), "blindBoreDepthMm": round(-bottom.center[2], 8),
                    "seatedTipGapMm": round(tip, 8)}
