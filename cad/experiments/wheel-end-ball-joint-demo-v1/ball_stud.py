"""Define one ball stud in the large-mouth seating frame, with geometry in mm."""

from dataclasses import dataclass
from math import isfinite, tan
from pathlib import Path
import sys

import numpy as np
from build123d import BuildPart, Location, Mode, Sphere, add
from OCP.BRepAdaptor import BRepAdaptor_Surface

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "vehicle-cad-pipeline-v1"))
from model import cone, cylinder, finish, require  # noqa: E402

TOL_MM = 1e-5


def near(left, right):
    return np.allclose(left, right, rtol=0, atol=TOL_MM)


def vector(occ):
    return np.array([occ.X(), occ.Y(), occ.Z()])


@dataclass(frozen=True)
class BallStud:
    side: str
    ball_diameter: float
    ball_center_offset: float
    neck_diameter: float
    collar_diameter: float
    collar_thickness: float
    radial_gap: float
    tip_allowance: float
    bore_entrance_diameter: float
    bore_trim_depth: float
    bore_radius_slope: float

    @property
    def stem_depth(self):
        return self.bore_trim_depth - self.tip_allowance

    @property
    def artifact_id(self):
        return f"C03-{self.side.upper()}-BALL-STUD"

    @property
    def filename(self):
        return f"{self.side}-ball-stud.step"

    def bore_radius(self, z):
        return self.bore_entrance_diameter / 2 + z * self.bore_radius_slope


def profile(side, source, config, boss_od):
    sizes = ("ballDiameter", "ballCenterOffset", "neckDiameter", "collarDiameter", "collarThickness", "radialGap",
             "tipAxialAllowance")
    require(isinstance(config, dict) and set(config) == set(sizes), f"{side}: missing or unknown parameters")
    require(all(type(config[key]) in (float, int) and 0 < config[key] < 1000 and isfinite(config[key])
                for key in sizes), f"{side}: expected positive finite mm dimensions")
    entry, exit_rim = source["rims"]
    depth = source["measuredTrimDepthMm"]
    slope = (entry["diameterMm"] - exit_rim["diameterMm"]) / (2 * depth)
    require(source["surface"] == "CONE" and depth > 0 and slope > 0, f"{side}: expected measured opening taper")
    shape = BallStud(side, *(config[key] for key in sizes), entry["diameterMm"], depth, slope)
    require(shape.stem_depth > 1 and shape.bore_radius(-shape.stem_depth) > shape.radial_gap,
            f"{side}: impossible stem depth or radial gap")
    require(0.01 <= shape.radial_gap <= 0.25, f"{side}: demo radius gap must be between 0.01 and 0.25 mm")
    require(shape.bore_entrance_diameter + 2 < shape.collar_diameter < boss_od,
            f"{side}: collar contact ring must lie on the boss")
    require(shape.neck_diameter < shape.collar_diameter
            and shape.neck_diameter < shape.ball_diameter * 0.8
            and shape.ball_center_offset - shape.ball_diameter / 2 > shape.collar_thickness,
            f"{side}: ball and collar must be separated by a neck")
    return shape


def make_solid(p):
    shaft_tip = 2 * (p.bore_radius(-p.stem_depth) - p.radial_gap)
    shaft_mouth = p.bore_entrance_diameter - 2 * p.radial_gap
    radius = p.ball_diameter / 2
    neck_top = p.ball_center_offset - radius / 2
    with BuildPart() as stud:
        add(cone(shaft_tip, shaft_mouth, -p.stem_depth, p.stem_depth))
        add(cylinder(p.collar_diameter, 0, p.collar_thickness))
        add(cylinder(p.neck_diameter, p.collar_thickness, neck_top - p.collar_thickness))
        add(Location((0, 0, p.ball_center_offset)) * Sphere(radius, mode=Mode.PRIVATE))
    result = finish(stud.part)
    result.label = p.artifact_id
    return result


def measured_features(shape, p):
    spheres, tapers = [], []
    for face in shape.faces():
        if face.geom_type.name == "SPHERE":
            spheres.append(BRepAdaptor_Surface(face.wrapped).Sphere())
        if face.geom_type.name == "CONE":
            tapers.append(BRepAdaptor_Surface(face.wrapped).Cone())
    require(len(spheres) == len(tapers) == 1, f"{p.side}: STEP requires one spherical ball and one tapered stem")
    ball, stem = spheres[0], tapers[0]
    center = vector(ball.Location())
    require(near(center, [0, 0, p.ball_center_offset]) and near(2 * ball.Radius(), p.ball_diameter),
            f"{p.side}: STEP ball differs from the parametric design")
    axis = vector(stem.Axis().Direction())
    require(near(axis, [0, 0, 1]) and near(vector(stem.Location())[:2], [0, 0])
            and near(tan(stem.SemiAngle()), p.bore_radius_slope), f"{p.side}: stem axis or taper slope changed")
    gaps = []
    for z in (0, -p.stem_depth):
        stem_radius = stem.RefRadius() + (z - stem.Location().Z()) * tan(stem.SemiAngle())
        gaps.append(p.bore_radius(z) - stem_radius)
    require(near(gaps, [p.radial_gap] * 2), f"{p.side}: STEP radius clearance differs from the design")
    require(near(shape.bounding_box().min.Z, -p.stem_depth), f"{p.side}: STEP tip is not at the specified depth")
    return center, axis, gaps
