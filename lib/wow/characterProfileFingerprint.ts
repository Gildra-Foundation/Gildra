import { createHash } from "node:crypto";
import type { CharacterAuditSnapshot } from "./characterAudit";

export function characterProfileFingerprint(snapshot: CharacterAuditSnapshot) {
  return createHash("sha256").update(JSON.stringify({
    character: snapshot.slug,
    specialization: snapshot.specialization.slug,
    loadout: snapshot.activeTalentLoadout ?? "",
    equipment: snapshot.gear.map((item) => [
      item.slotType,
      item.itemId,
      item.itemLevel,
      item.modificationIds?.enchantments ?? item.details.enchant?.name ?? "",
      item.details.enchant?.active ?? false,
      item.modificationIds?.gems ?? item.details.sockets?.map((socket) => [socket.gem, socket.effect, socket.filled]) ?? [],
    ]),
  })).digest("hex").slice(0, 24);
}
