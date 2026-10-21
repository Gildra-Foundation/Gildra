export type MdtNode = { id: string; npcId: number; name: string; x: number; y: number; floor: number; group: string; forces: number; boss: boolean };
export type MdtDataset = { source: string; sha256: string; checkedAt: string; total: number; image: string; nodes: MdtNode[]; route: { url: string; author: string; name: string; status: string; errors: string[]; notes: {ru: string; en: string}[]; pulls: string[][] } };

export type DungeonSourceReviewData = {
  checkedAt: string;
  facts: {ru: string; en: string; source: string}[];
  corrections: {ru: string; en: string}[];
};
