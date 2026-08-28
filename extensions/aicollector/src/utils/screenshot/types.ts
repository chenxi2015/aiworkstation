/**
 * Screenshot System Type Definitions
 */

export interface AreaPageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenshotProgress {
  slice: number;
  totalSlices: number;
  percent: number;
}

export interface CapturedSlice {
  dataUrl: string;
  /**
   * Unified page coordinate of the captured frame's client origin (0, 0),
   * i.e. for any client point (cx, cy) in the frame: pageY = cy + scrollY.
   */
  scrollX: number;
  scrollY: number;
  /**
   * Client-rect of the valid scrolled-content viewport inside the frame.
   * For global window scroll this is the full viewport (0, 0, viewportW, viewportH);
   * for a nested scroll container it is the container's visible client box.
   * Only pixels within this region represent scrolled target content.
   */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** Full captured frame size in CSS px (used to derive the device scale factor) */
  viewportW: number;
  viewportH: number;
}

export interface HiddenElementState {
  element: HTMLElement;
  originalVisibility: string;
}

export interface ScreenshotOptions {
  /**
   * Overlap ratio between successive scroll steps (default: 0.4 = 40% overlap)
   */
  overlapRatio?: number;
  /**
   * Maximum slices allowed for safety (default: 60, auto-raised when the
   * estimated slice count exceeds it)
   */
  maxSlices?: number;
  /**
   * Custom background color for master canvas before stitching (default: '#ffffff')
   */
  backgroundColor?: string;
}
