// Custom cm-chessboard extension that paints a small icon in the upper-right
// corner of a square (e.g., a book badge for opening moves). The icon is
// rendered as an SVG <image> so any standalone SVG file can be dropped in
// without needing to merge sprites.

import { Extension, EXTENSION_POINT } from 'cm-chessboard/src/model/Extension.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

type CornerBadge = {
  role: string;
  square: string;
  iconUrl: string;
};

type ChessboardView = {
  markersTopLayer: SVGGElement;
  squareToPoint(square: string): { x: number; y: number };
  squareWidth: number;
};

type ChessboardInstance = {
  view: ChessboardView;
  addCornerBadge?: (iconUrl: string, square: string) => void;
  setCornerBadge?: (role: string, iconUrl: string, square: string) => void;
  removeCornerBadge?: (role: string) => void;
  removeCornerBadges?: () => void;
};

export class CornerBadges extends Extension {
  private readonly badges: CornerBadge[] = [];
  private layer: SVGGElement | null = null;
  private nextLegacyId = 1;

  constructor(chessboard: ChessboardInstance) {
    super(chessboard);

    this.registerExtensionPoint(EXTENSION_POINT.afterRedrawBoard, () => {
      this.redraw();
    });

    this.registerExtensionPoint(EXTENSION_POINT.destroy, () => {
      this.layer?.remove();
      this.layer = null;
    });

    chessboard.addCornerBadge = (iconUrl, square) => {
      const badge = { role: `legacy-${this.nextLegacyId++}`, iconUrl, square };
      // console.log("[corner-badges] add", badge);
      this.badges.push(badge);
      this.redraw();
    };

    chessboard.setCornerBadge = (role, iconUrl, square) => {
      const existingIndex = this.badges.findIndex((badge) => badge.role === role);
      if (existingIndex !== -1) {
        this.badges.splice(existingIndex, 1);
      }
      const badge = { role, iconUrl, square };
      // console.log("[corner-badges] set", badge);
      this.badges.push(badge);
      this.redraw();
    };

    chessboard.removeCornerBadge = (role) => {
      const existingIndex = this.badges.findIndex((badge) => badge.role === role);
      if (existingIndex === -1) {
        // console.log("[corner-badges] remove skipped", { role });
        return;
      }
      // console.log("[corner-badges] remove", this.badges[existingIndex]);
      this.badges.splice(existingIndex, 1);
      this.redraw();
    };

    chessboard.removeCornerBadges = () => {
      // console.log("[corner-badges] clear", { count: this.badges.length, badges: [...this.badges] });
      this.badges.length = 0;
      this.redraw();
    };
  }

  private redraw(): void {
    const view = (this.chessboard as ChessboardInstance).view;
    if (!view || view.squareWidth <= 0) {
      return;
    }

    this.layer?.remove();
    this.layer = null;

    if (this.badges.length === 0) {
      return;
    }

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'corner-badges');

    const iconSize = view.squareWidth * 0.42;

    for (const badge of this.badges) {
      const point = view.squareToPoint(badge.square);
      if (!point) {
        continue;
      }

      const image = document.createElementNS(SVG_NS, 'image');
      image.setAttribute('href', badge.iconUrl);
      image.setAttributeNS(XLINK_NS, 'xlink:href', badge.iconUrl);
      image.setAttribute('x', String(point.x + view.squareWidth - iconSize * 0.65));
      image.setAttribute('y', String(point.y - iconSize * 0.35));
      image.setAttribute('width', String(iconSize));
      image.setAttribute('height', String(iconSize));
      layer.appendChild(image);
    }

    view.markersTopLayer.appendChild(layer);
    this.layer = layer;
    // console.log("[corner-badges] rendered", { count: this.badges.length, badges: [...this.badges] });
  }
}
