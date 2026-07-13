// Minimal ambient types for cm-chessboard (the package ships no .d.ts).
// Covers only the surface the app imports today; extend as needed.

declare module 'cm-chessboard' {
  export const BORDER_TYPE: Record<string, string>;
  export const COLOR: Record<string, string>;
  export const INPUT_EVENT_TYPE: Record<string, string>;

  export class Chessboard {
    constructor(element: HTMLElement, options?: unknown);
    setPosition(fen: string, animated?: boolean): Promise<void>;
    destroy(): void;
    enableMoveInput(
      handler: (event: unknown) => boolean | void,
      color?: string
    ): void;
    disableMoveInput(): void;
    removeLegalMovesMarkers?(): void;
    addLegalMovesMarkers?(moves: unknown[]): void;
    addArrow?(type: unknown, from: string, to: string): void;
    removeArrows?(type?: unknown, from?: string, to?: string): void;
    addMarker?(type: unknown, square: string): void;
    removeMarkers?(type?: unknown, square?: string): void;
    addCornerBadge?(iconUrl: string, square: string): void;
    removeCornerBadges?(): void;
  }
}

declare module 'cm-chessboard/src/model/Extension.js' {
  export const EXTENSION_POINT: {
    positionChanged: string;
    boardChanged: string;
    moveInputToggled: string;
    moveInput: string;
    beforeRedrawBoard: string;
    afterRedrawBoard: string;
    redrawBoard: string;
    animation: string;
    destroy: string;
  };

  export class Extension {
    chessboard: unknown;
    constructor(chessboard: unknown);
    registerExtensionPoint(
      name: string,
      callback: (data?: unknown) => void
    ): void;
  }
}

declare module 'cm-chessboard/assets/chessboard.css';
declare module 'cm-chessboard/assets/extensions/markers/markers.css';
declare module 'cm-chessboard/assets/extensions/arrows/arrows.css';

declare module 'cm-chessboard/src/extensions/markers/Markers.js' {
  type MarkerTypeValue = {
    class: string;
    slice: string;
    position?: string;
  };

  export const MARKER_TYPE: {
    frame: MarkerTypeValue;
    framePrimary: MarkerTypeValue;
    frameDanger: MarkerTypeValue;
    circle: MarkerTypeValue;
    circlePrimary: MarkerTypeValue;
    circleDanger: MarkerTypeValue;
    circleDangerFilled: MarkerTypeValue;
    square: MarkerTypeValue;
    dot: MarkerTypeValue;
    bevel: MarkerTypeValue;
  };

  export class Markers {
    constructor(...args: unknown[]);
  }
}

declare module 'cm-chessboard/src/extensions/arrows/Arrows.js' {
  export const ARROW_TYPE: {
    default: { class: string };
    success: { class: string };
    secondary: { class: string };
    warning: { class: string };
    info: { class: string };
    danger: { class: string };
  };
  export class Arrows {
    constructor(...args: unknown[]);
  }
}

declare module 'cm-chessboard/src/extensions/right-click-annotator/RightClickAnnotator.js' {
  export const ARROW_TYPE: Record<string, { class: string }>;
  export const MARKER_TYPE: Record<string, { class: string; slice: string }>;

  export class RightClickAnnotator {
    constructor(...args: unknown[]);
  }
}
