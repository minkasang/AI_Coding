/**
 * 读取 R-02 提案中的 Frame 关系，不把它当成已经冻结的生产规范。
 * FR-VEHICLE：+X 左、+Y 上、+Z 前，单位 m。
 * FR-ENGINEERING：x 前、y 左、z 上。p_R = [yE, zE, xE]。
 */

export function engineeringToVehicle(point) {
  return [point[1], point[2], point[0]];
}

export function vehicleToEngineering(point) {
  return [point[2], point[0], point[1]];
}

export function determinant(matrix) {
  const a = matrix;
  return a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
    - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
    + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
}

export function toVehicleMeters(point, frameId, units) {
  let value = point.map(Number);
  if (units === 'mm') value = value.map((v) => v * 0.001);
  else if (units !== 'm') return { ok: false, code: 'KIN-E-UNITS' };
  if (frameId === 'FR-ENGINEERING') value = engineeringToVehicle(value);
  else if (frameId !== 'FR-VEHICLE') return { ok: false, code: 'KIN-E-FRAME' };
  return { ok: true, point: value };
}

export function directionToVehicle(direction, frameId) {
  if (frameId === 'FR-ENGINEERING') return normalize(engineeringToVehicle(direction));
  if (frameId === 'FR-VEHICLE') return normalize(direction);
  return null;
}

export function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length < 1e-15) return null;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
