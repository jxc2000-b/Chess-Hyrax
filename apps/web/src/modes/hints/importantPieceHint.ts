import { engineService } from "@hyrax/engine";
import type { HintContext, HintModule } from "./types";

type ImportantPiecePrepared = {
  square: string | null;
};

function isImportantPiecePrepared(prepared: unknown): prepared is ImportantPiecePrepared {
  return typeof prepared === "object" && prepared !== null && "square" in prepared;
}

export const importantPieceHint: HintModule = {
  id: "important-piece",
  label: "Important piece",
  canRun: (ctx: HintContext) => Boolean(ctx.position && ctx.fen),
  async prepare(ctx: HintContext): Promise<ImportantPiecePrepared> {
    const analysis = await engineService.analyze(ctx.fen, { priority: "high" });
    const square = analysis.bestMove?.slice(0, 2) || null;
    return { square: square && square.length === 2 ? square : null };
  },
  apply(ctx: HintContext, prepared: unknown) {
    if (!isImportantPiecePrepared(prepared) || !prepared.square) {
      return;
    }
    ctx.boardRef.current?.addCoachSquareMarker(prepared.square, "important");
  },
  clear(ctx: HintContext) {
    ctx.boardRef.current?.clearCoachSquareMarkers();
  },
};
