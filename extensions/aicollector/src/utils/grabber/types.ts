/**
 * Visual Grabber Type Definitions
 */

export interface SelectionBoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface GrabberOverlayCallbacks {
  onExit: () => void;
  onFullPageCapture: () => void;
}
