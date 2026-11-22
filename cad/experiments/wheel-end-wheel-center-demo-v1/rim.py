"""Generate a simplified rim and measure its datum planes from an imported STEP."""

from dataclasses import dataclass
from math import isfinite, pi
from pathlib import Path
import sys

import numpy as np
from build123d import BuildPart, Location, Mode, add
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Circle

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "vehicle-cad-pipeline-v1"))
from model import CUT, cylinder, finish, require  # noqa: E402

GRADE = "DEMO_ASSUMPTION"
ASSET_ID = "C04-FL-RIM-DATUM"
TOL_MM = 1e-5
LOCAL_OUT = np.array([0, 0, 1])


def near(left, right):
    return np.allclose(left, right, rtol=0, atol=TOL_MM)


def vector(occ):
    return np.array([occ.X(), occ.Y(), occ.Z()])


@dataclass(frozen=True)
class Rim:
    offset: float
    width: float
    barrel_od: float
    wall: float
    rise: float
    return_depth: float
    flange_length: float
    web_thickness: float
    pilot_bore: float
    stud_bore: float
    stud_centers: tuple

    @property
    def barrel_id(self):
        return self.barrel_od - 2 * self.wall

    @property
    def flange_od(self):
        return self.barrel_od + 2 * self.rise

    @property
    def flange_id(self):
        return self.barrel_id - 2 * self.return_depth

    @property
    def inboard(self):
        return -self.offset - self.width / 2

    @property
    def outboard(self):
        return -self.offset + self.width / 2


def design(config, hub_pilot, stud_diameter, stud_centers):
    items = ("nominalOffsetMm", "referenceWidthMm", "barrelOuterDiameterMm", "barrelWallMm",
             "endFlangeRadialRiseMm", "endFlangeRadialReturnMm", "endFlangeLengthMm", "mountingWebThicknessMm",
             "pilotRadialGapMm", "studRadialGapMm")
    require(set(config) == {"unit", "sourceGrade", *items} and config["unit"] == "mm" and config["sourceGrade"] == GRADE,
            "Expected mm / DEMO_ASSUMPTION rim parameters")
    require(all(type(config[name]) in (int, float) and isfinite(config[name]) for name in items)
            and all(config[name] > 0 for name in items[1:]), "Expected finite signed offset and positive mm dimensions")
    values = [config[name] for name in items]
    profile = Rim(*values[:8], hub_pilot + 2 * values[8], stud_diameter + 2 * values[9], stud_centers)
    require(profile.inboard + profile.flange_length < 0
            and profile.outboard - profile.flange_length > profile.web_thickness,
            "Wheel offset puts the mounting web in an end flange or outside the barrel")
    require(profile.flange_id > profile.pilot_bore, "End flanges must retain a hollow opening")
    radius = np.linalg.norm(profile.stud_centers[0])
    require(radius > (profile.pilot_bore + profile.stud_bore) / 2
            and 2 * radius + profile.stud_bore < profile.flange_id,
            "Pilot or stud clearance bores violate the web ligaments")
    for index, first in enumerate(profile.stud_centers):
        for second in profile.stud_centers[index + 1:]:
            require(np.linalg.norm(np.array(first) - second) > profile.stud_bore, "Stud bores overlap")
    return profile


def ring(od, bore, z, length):
    return cylinder(od, z, length) - cylinder(bore, z - CUT, length + 2 * CUT)


def make_solid(profile):
    with BuildPart() as wheel:
        add(ring(profile.barrel_od, profile.barrel_id, profile.inboard, profile.width))
        for z in (profile.inboard, profile.outboard - profile.flange_length):
            add(ring(profile.flange_od, profile.flange_id, z, profile.flange_length))
        add(cylinder(profile.barrel_od - profile.wall, 0, profile.web_thickness))
        cut_length = profile.web_thickness + 2 * CUT
        add(cylinder(profile.pilot_bore, -CUT, cut_length), mode=Mode.SUBTRACT)
        for x, y in profile.stud_centers:
            hole = Location((x, y, 0)) * cylinder(profile.stud_bore, -CUT, cut_length)
            add(hole, mode=Mode.SUBTRACT)
    solid = finish(wheel.part)
    solid.label = ASSET_ID
    return solid


@dataclass(frozen=True)
class Circle:
    center: np.ndarray
    axis: np.ndarray
    radius: float


def full_circles(face):
    for edge in face.edges():
        curve = BRepAdaptor_Curve(edge.wrapped)
        if curve.GetType() != GeomAbs_Circle:
            continue
        circle = curve.Circle()
        if near(edge.length, 2 * pi * circle.Radius()):
            yield Circle(vector(circle.Location()), vector(circle.Axis().Direction()), circle.Radius())


def matching_circle(circles, diameter, xy):
    return next((circle for circle in circles if near(2 * circle.radius, diameter)
                 and near(circle.center[:2], xy) and near(abs(circle.axis @ LOCAL_OUT), 1)), None)


def measure(shape, profile):
    planar_faces = [list(full_circles(face)) for face in shape.faces() if face.geom_type.name == "PLANE"]
    # The largest full planar circles lie on the two raised flange sections.
    greatest_radius = max(circle.radius for face in planar_faces for circle in face)
    flange_faces = [(face, circle) for face in planar_faces for circle in face if near(circle.radius, greatest_radius)]
    in_face, in_rim = min(flange_faces, key=lambda item: item[1].center @ LOCAL_OUT)
    out_face, out_rim = max(flange_faces, key=lambda item: item[1].center @ LOCAL_OUT)
    span = out_rim.center - in_rim.center
    width = float(np.linalg.norm(span))
    require(width > TOL_MM and near(width, profile.width), "STEP rim section width drift")
    axis = span / width
    require(near(axis, LOCAL_OUT) and near(abs(in_rim.axis @ axis), 1)
            and near(abs(out_rim.axis @ axis), 1), "STEP flange axes are not aligned and outboard")
    in_inner = matching_circle(in_face, profile.flange_id, in_rim.center[:2])
    out_inner = matching_circle(out_face, profile.flange_id, out_rim.center[:2])
    require(near(greatest_radius * 2, profile.flange_od) and in_inner is not None and out_inner is not None,
            "STEP terminal reference sections are not symmetric annuli")
    bounds = shape.bounding_box(optimal=True)
    require(near([in_rim.center[2], out_rim.center[2]], [bounds.min.Z, bounds.max.Z]),
            "STEP reference circles are not on the terminal planes")

    # Locate the mounting web by its pilot and five bolt holes at the same face.
    web = []
    for face in planar_faces:
        pilot = matching_circle(face, profile.pilot_bore, [0, 0])
        if pilot and all(matching_circle(face, profile.stud_bore, xy) is not None for xy in profile.stud_centers):
            web.append(pilot)
    require(len(web) == 2, "STEP web requires two through-bored planes")
    mount, outside_web = sorted(web, key=lambda circle: circle.center @ axis)
    center = (in_rim.center + out_rim.center) / 2
    offset = float((mount.center - center) @ axis)
    require(near(mount.center - center, axis * offset) and near(mount.center, [0, 0, 0])
            and near((outside_web.center - mount.center) @ axis, profile.web_thickness),
            "STEP web position or mounting axis drift")
    require(near(offset, profile.offset), "STEP-derived signed wheel offset differs from design")
    return {
        "inboard": in_rim.center, "outboard": out_rim.center, "mount": mount.center, "center": center,
        "outboardAxis": axis, "referenceWidthMm": width, "signedOffsetMm": offset,
        "referenceOuterDiameterMm": 2 * greatest_radius, "referenceInnerDiameterMm": 2 * in_inner.radius,
        "pilotBoreDiameterMm": 2 * mount.radius,
    }
