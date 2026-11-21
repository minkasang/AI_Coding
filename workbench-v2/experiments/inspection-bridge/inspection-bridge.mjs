import * as THREE from 'three';
import { MeasureTool } from './measure-tool.mjs';
import { syncAxialClip } from './clip-sync.mjs';

/**
 * Adapts R-15 measure/clip to EngineeringViewport + ProjectStore (inspect workview only).
 */
export class InspectionBridge {
  /**
   * @param {{
   *   viewport: import('../../viewport.js').EngineeringViewport,
   *   ui: { measureBtn: HTMLElement, clipBtn: HTMLElement, clipAxis: HTMLSelectElement, clipPos: HTMLInputElement, clipInline: HTMLElement, readout: HTMLElement, toolsRoot: HTMLElement },
   *   getMode: () => string,
   *   onToast: (msg: string) => void,
   * }} opts
   */
  constructor({ viewport, ui, getMode, onToast, canInspectGeometry = () => true }) {
    this.viewport = viewport;
    this.ui = ui;
    this.getMode = getMode;
    this.onToast = onToast;
    this.canInspectGeometry = canInspectGeometry;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.measure = new MeasureTool(viewport.measureGroup);
    this.clip = { enabled: false, axis: 'y', t: 0.35 };
    this._onPointer = this._onPointer.bind(this);
    this._bindUi();
    window.addEventListener('carlab:workview-changed', () => this._syncMode());
    this._syncMode();
  }
  syncInspectability() {
    const ok = this.canInspectGeometry();
    this.ui.measureBtn.disabled = !ok;
    this.ui.clipBtn.disabled = !ok;
    if (this.ui.toolsRoot) {
      this.ui.toolsRoot.dataset.geometryLocked = ok ? 'false' : 'true';
    }
    if (!ok) {
      if (this.measure.enabled) {
        this.measure.setEnabled(false);
        this.ui.measureBtn.classList.remove('on');
        this.ui.measureBtn.setAttribute('aria-pressed', 'false');
      }
      if (this.clip.enabled) this._setClip(false);
      if (this.ui.readout) this.ui.readout.hidden = true;
    }
  }
  _syncMode() {
    const inspect = this.getMode() === 'inspect';
    this.ui.toolsRoot.hidden = !inspect;
    if (!inspect) {
      this.measure.setEnabled(false);
      this._setClip(false);
      this.ui.measureBtn.classList.remove('on');
      this.ui.clipBtn.classList.remove('on');
      this.ui.clipBtn.setAttribute('aria-pressed', 'false');
      this.ui.measureBtn.setAttribute('aria-pressed', 'false');
      this.ui.readout.hidden = true;
    }
    this.viewport.canvas.removeEventListener('pointerdown', this._onPointer, true);
    if (inspect) {
      this.viewport.canvas.addEventListener('pointerdown', this._onPointer, true);
    }
    this.syncInspectability();
  }
  _bindUi() {
    this.ui.measureBtn.addEventListener('click', () => {
      if (this.getMode() !== 'inspect') return;
      if (!this.canInspectGeometry()) {
        this.onToast('当前对象无工程几何，不能测距');
        return;
      }
      const on = !this.measure.enabled;
      this.measure.setEnabled(on);
      this.ui.measureBtn.classList.toggle('on', on);
      this.ui.measureBtn.setAttribute('aria-pressed', String(on));
      this.ui.readout.hidden = !on && !this.measure.points.length;
      this.onToast(on ? '测距：点两下模型表面（非 CMM）' : '已关闭测距');
    });
    this.ui.clipBtn.addEventListener('click', () => {
      if (this.getMode() !== 'inspect') return;
      if (!this.canInspectGeometry()) {
        this.onToast('当前对象无工程几何，不能剖切');
        return;
      }
      this._setClip(!this.clip.enabled);
    });
    this.ui.clipAxis.addEventListener('change', () => {
      this.clip.axis = this.ui.clipAxis.value;
      this._applyClip();
    });
    this.ui.clipPos.addEventListener('input', () => {
      this.clip.t = Number(this.ui.clipPos.value) / 100;
      this._applyClip();
    });
  }
  _setClip(on) {
    this.clip.enabled = on;
    this.ui.clipBtn.classList.toggle('on', on);
    this.ui.clipBtn.setAttribute('aria-pressed', String(on));
    if (this.ui.clipInline) this.ui.clipInline.hidden = !on;
    this._applyClip();
    this.onToast(on ? '剖切：视觉截面 only' : '已关闭剖切');
  }
  _applyClip() {
    const bounds = this.viewport.getClipBounds();
    if (!bounds) return;
    syncAxialClip(this.viewport.renderer, this.viewport.scene, this.clipPlane, this.clip, bounds);
  }
  _onPointer(event) {
    if (!this.measure.enabled || this.getMode() !== 'inspect') return;
    const hit = this.viewport.intersectPointer(event);
    if (!hit) return;
    event.stopPropagation();
    const result = this.measure.addPoint(hit.point);
    if (result?.formatted) {
      this.ui.readout.hidden = false;
      this.ui.readout.innerHTML =
        `<p class="measure-label">两点距离（场景三角几何 · ASSUMED）</p><strong>${result.formatted}</strong>`;
      this.onToast('测距：' + result.formatted);
    }
  }
}