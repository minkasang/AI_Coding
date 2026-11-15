/**
 * Explicit CAD URLs keyed by instanceId only — never by partId or assembly.
 * Prevents cloning the hub demo GLB onto other corners or the whole vehicle.
 */
export const KNOWN_CAD_BY_INSTANCE = Object.freeze({
  'INST-HUB-FL': Object.freeze({
    cadUrl: '/viewer/experiments/engineering-viewer/assets/wheel_hub_assembly.glb',
    mappingStatus: 'DEMO_SUBSTITUTE',
    units: 'm',
    up: 'Y',
    note: '仅 INST-HUB-FL 的演示替代件；不得复制到其它角位或冒充整车'
  })
});