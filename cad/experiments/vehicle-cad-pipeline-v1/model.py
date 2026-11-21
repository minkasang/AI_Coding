"""Editable demonstration wheel end. B-reps and datums share dimensions in mm."""

from dataclasses import dataclass
from math import cos, isfinite, pi, sin

from build123d import Align, BuildPart, Cone, Cylinder, Face, Location, Mode, Plane, Solid, Torus, Wire, add

GRADE = "DEMO_ASSUMPTION"
MIN_Z = (Align.CENTER, Align.CENTER, Align.MIN)
CUT = 0.1  # mm of overtravel for cutters through planar faces


def require(condition, detail):
    if not condition:
        raise ValueError(detail)


def datum(origin=(0, 0, 0), normal=(0, 0, 1), clock=(1, 0, 0)):
    return Plane(origin=origin, x_dir=clock, z_dir=normal).location


def matrix(location):
    trsf = location.wrapped.Transformation()
    return [[trsf.Value(i, j) for j in range(1, 5)] for i in range(1, 4)] + [[0, 0, 0, 1]]


def cylinder(diameter, base_z, height):
    return Location((0, 0, base_z)) * Cylinder(diameter / 2, height, align=MIN_Z, mode=Mode.PRIVATE)


def cone(bottom, top, base_z, height):
    return Location((0, 0, base_z)) * Cone(bottom / 2, top / 2, height, align=MIN_Z, mode=Mode.PRIVATE)


def bolt_centers(pcd, count):
    return [(pcd / 2 * cos(i * 2 * pi / count), pcd / 2 * sin(i * 2 * pi / count)) for i in range(count)]


def validate_parameters(config, template, count):
    def check_shape(actual, expected, path):
        require(isinstance(actual, dict) and actual.keys() == expected.keys(), f"{path}: missing or unknown keys")
        for key, default in expected.items():
            value = actual[key]
            name = f"{path}.{key}"
            if isinstance(default, dict):
                check_shape(value, default, name)
            elif isinstance(default, (int, float)):
                require(type(value) in (int, float) and isfinite(value), f"{name}: expected finite number")
                if key != "offsetX":
                    require(value > 0, f"{name}: expected positive dimension")
            else:
                require(isinstance(value, str) and value.strip(), f"{name}: expected nonempty text")

    check_shape(config, template, "parameters")
    require(config["units"] == "mm" and config["sourceGrade"] == GRADE, "Only mm / DEMO_ASSUMPTION accepted")
    b, h, s, k = (config[name] for name in ("bearing", "hub", "stud", "knuckle"))
    wall = 3  # demo minimum remaining wall in these features, mm
    groove = b["grooveRadius"]
    require((b["innerOD"] - b["bore"]) / 2 - groove >= wall, "bearing: inner race wall below 3 mm")
    require((b["outerOD"] - b["outerID"]) / 2 - groove >= wall, "bearing: outer race wall below 3 mm")
    require(b["raceSpacing"] > 2 * groove and b["width"] - b["raceSpacing"] >= 2 * (groove + 2),
            "bearing: raceways overlap or break through end faces")
    require(b["outerID"] > b["innerOD"], "bearing: rings require radial separation")
    for name, gap in (
        ("journal", h["journalRadialGap"]), ("bearing seat", k["seatRadialGap"]), ("stud bore", s["radialGap"])
    ):
        require(0.01 <= gap <= 0.12, f"{name}: demo radial gap must be 0.01–0.12 mm")
    require(b["innerOD"] < k["shoulderID"] < b["outerID"], "knuckle: shoulder must clear inner ring and support outer ring")
    require((k["housingOD"] - b["outerOD"]) / 2 - k["seatRadialGap"] >= wall, "knuckle: bearing housing wall below 3 mm")
    require(b["bore"] < h["collarOD"] < b["innerOD"], "hub: journal shoulder must contact only inner ring")
    require(h["standOff"] - s["headThickness"] >= 1, "hub: stud heads need axial clearance to knuckle face")
    require(h["pilotLength"] > h["pilotChamfer"] > 0 and h["pilotOD"] > h["driveOpening"] + 2 * (wall + h["pilotChamfer"]),
            "hub: invalid pilot")
    require(b["width"] > h["shaftEndChamfer"] and
            (b["bore"] - h["driveOpening"]) / 2 - h["journalRadialGap"] - h["shaftEndChamfer"] >= wall,
            "hub: drive opening or chamfer leaves insufficient journal wall")
    require(s["headOD"] > s["bodyOD"] + 2 * s["radialGap"] and s["beyondFlange"] > s["noseChamfer"]
            and s["bodyOD"] / 2 > s["noseChamfer"], "stud: invalid head or nose chamfer")
    require((h["lugPCD"] - max(h["pilotOD"], h["collarOD"]) - s["headOD"]) / 2 >= wall,
            "hub: lug PCD puts stud heads too close to spigot")
    require((h["flangeOD"] - h["lugPCD"] - s["headOD"]) / 2 >= wall, "hub: lug PCD runs outside flange rim")
    require(h["lugPCD"] * sin(pi / count) > s["headOD"] + 2 * wall, "hub: adjacent stud heads are too close")
    require(h["scallopDepth"] < (h["flangeOD"] - h["lugPCD"]) / 2, "hub: scallop cuts into the stud circle")
    seat_od = b["outerOD"] + 2 * k["seatRadialGap"]
    for name in ("upper", "lower"):
        ear = k[name]
        require(ear["seatSmallOD"] < ear["seatLargeOD"] and (ear["bossOD"] - ear["seatLargeOD"]) / 2 >= wall,
                f"knuckle {name}: invalid taper or less than 3 mm mounting-boss wall")
        require(ear["offsetY"] - ear["bossDepth"] > k["housingOD"] / 2,
                f"knuckle {name}: tapered seat intersects the bearing housing")
        require(abs(ear["offsetX"]) + ear["bossOD"] / 2 < seat_od / 2,
                f"knuckle {name}: boss offset exceeds the supported web width")


@dataclass
class Part:
    solid: Solid
    mounts: dict
    description: str
    material: str
    color: tuple


def finish(shape):
    solids = shape.solids()
    require(len(solids) == 1 and solids[0].is_valid and solids[0].volume > 0, "Expected one valid positive-volume B-rep solid")
    return solids[0]


def make_bearing(p, outer):
    b = p["bearing"]
    width = b["width"]
    od = b["outerOD"] if outer else b["innerOD"]
    bore = b["outerID"] if outer else b["bore"]
    with BuildPart() as shape:
        add(cylinder(od, -width, width))
        add(cylinder(bore, -width - CUT, width + 2 * CUT), mode=Mode.SUBTRACT)
        for direction in (-1, 1):
            z = (-width + direction * b["raceSpacing"]) / 2
            track = (bore if outer else od) / 2
            add(Location((0, 0, z)) * Torus(track, b["grooveRadius"], mode=Mode.PRIVATE), mode=Mode.SUBTRACT)
    name = ("Bearing outer ring with two concave raceways" if outer
            else "Paired inner rings represented by one envelope with two raceways")
    return Part(finish(shape.part), {"frontFace": datum(), "backFace": datum((0, 0, -width))},
                name, "bearing steel assumption", (0.42, 0.47, 0.53) if outer else (0.65, 0.69, 0.74))


def make_hub(p, count):
    b, h, s = p["bearing"], p["hub"], p["stud"]
    flange = h["flangeThickness"]
    back = -h["standOff"]
    end = back - b["width"]
    journal = b["bore"] - 2 * h["journalRadialGap"]
    chamfer = h["shaftEndChamfer"]
    pilot = h["pilotOD"]
    lip = h["pilotChamfer"]
    holes = bolt_centers(h["lugPCD"], count)
    with BuildPart() as shape:
        add(cylinder(h["flangeOD"], 0, flange))
        add(cylinder(h["collarOD"], back, -back))
        add(cylinder(journal, end + chamfer, b["width"] - chamfer))
        add(cone(journal - 2 * chamfer, journal, end, chamfer))
        add(cylinder(pilot, flange, h["pilotLength"] - lip))
        add(cone(pilot, pilot - 2 * lip, flange + h["pilotLength"] - lip, lip))
        add(cylinder(h["driveOpening"], end - CUT, flange + h["pilotLength"] - end + 2 * CUT),
            mode=Mode.SUBTRACT)
        for x, y in holes:
            bore = s["bodyOD"] + 2 * s["radialGap"]
            add(Location((x, y, 0)) * cylinder(bore, -CUT, flange + 2 * CUT), mode=Mode.SUBTRACT)
        notch_radius = h["flangeOD"] / 5
        notch_diameter = h["flangeOD"] + 2 * (notch_radius - h["scallopDepth"])
        march = Location((0, 0, 0), (0, 0, 180 / count))
        for x, y in bolt_centers(notch_diameter, count):
            add(march * Location((x, y, 0)) * cylinder(2 * notch_radius, -CUT, flange + 2 * CUT),
                mode=Mode.SUBTRACT)

    mounts = {"journalShoulder": datum((0, 0, back)), "wheelMatingFace": datum((0, 0, flange))}
    mounts.update({f"studSeat{index}": datum((x, y, 0)) for index, (x, y) in enumerate(holes, 1)})
    return Part(finish(shape.part), mounts, "Scalloped wheel hub flange, pilot and stepped hollow journal",
                "forged steel assumption", (0.52, 0.56, 0.62))


def make_stud(p):
    s = p["stud"]
    length = p["hub"]["flangeThickness"] + s["beyondFlange"]
    with BuildPart() as shape:
        add(cylinder(s["headOD"], -s["headThickness"], s["headThickness"]))
        add(cylinder(s["bodyOD"], 0, length - s["noseChamfer"]))
        add(cone(s["bodyOD"], s["bodyOD"] - 2 * s["noseChamfer"], length - s["noseChamfer"], s["noseChamfer"]))
    return Part(finish(shape.part), {"headSeat": datum(), "outboardNose": datum((0, 0, length))},
                "Headed wheel stud with chamfered end and simplified plain shank",
                "fastener steel assumption", (0.28, 0.32, 0.38))


def make_knuckle(p):
    b, k = p["bearing"], p["knuckle"]
    width = b["width"]
    mounts = {"bearingSeatFront": datum(), "bearingSeatBack": datum((0, 0, -width))}
    with BuildPart() as shape:
        add(cylinder(k["housingOD"], -width - k["shoulderDepth"], width + k["shoulderDepth"]))
        for name, sign in (("upper", 1), ("lower", -1)):
            ear = k[name]
            x, y, z = ear["offsetX"], sign * ear["offsetY"], -width / 2
            radius = ear["bossOD"] / 2
            ear_axis = datum((x, y, z), (0, sign, 0))
            mounts[f"{name}BallJointSeat"] = ear_axis
            web_from = (b["outerOD"] + k["housingOD"]) / 4 - 3
            half = radius * 0.72
            web_z = z - radius * 0.56
            corners = [
                (-radius, sign * web_from, web_z), (radius, sign * web_from, web_z),
                (x + half, y - sign * ear["bossDepth"] / 2, web_z),
                (x - half, y - sign * ear["bossDepth"] / 2, web_z),
            ]
            web = Solid.extrude(Face(Wire.make_polygon(corners, close=True)), (0, 0, radius * 1.12))
            add(web)
            add(ear_axis * cylinder(ear["bossOD"], -ear["bossDepth"], ear["bossDepth"]))
        add(cylinder(k["shoulderID"], -width - k["shoulderDepth"] - CUT, width + k["shoulderDepth"] + 2 * CUT),
            mode=Mode.SUBTRACT)
        add(cylinder(b["outerOD"] + 2 * k["seatRadialGap"], -width, width + CUT), mode=Mode.SUBTRACT)
        for name in ("upper", "lower"):
            ear = k[name]
            depth = ear["bossDepth"]
            slope = (ear["seatLargeOD"] - ear["seatSmallOD"]) / depth
            cutter = cone(ear["seatSmallOD"] - slope * CUT, ear["seatLargeOD"] + slope * CUT,
                          -depth - CUT, depth + 2 * CUT)
            add(mounts[f"{name}BallJointSeat"] * cutter, mode=Mode.SUBTRACT)
    return Part(finish(shape.part), mounts, "Stepped bearing carrier with load-spreading webs and tapered upper/lower ball-joint seats",
                "cast steel assumption", (0.24, 0.30, 0.36))


def make_part(part_id, p, count):
    match part_id:
        case "PART-20-016":
            return make_knuckle(p)
        case "PART-30-001":
            return make_bearing(p, outer=True)
        case "PART-30-002":
            return make_bearing(p, outer=False)
        case "PART-30-006":
            return make_hub(p, count)
        case "PART-30-009":
            return make_stud(p)
        case _:
            raise ValueError(f"Unsupported CAD part definition: {part_id}")
