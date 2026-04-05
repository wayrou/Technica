import type { KeyValueRecord } from "./common";
import type { GearStats } from "./gear";

export interface UnitLoadoutDocument {
  primaryWeapon: string;
  secondaryWeapon: string;
  helmet: string;
  chestpiece: string;
  accessory1: string;
  accessory2: string;
}

export type UnitSpawnRole = "player" | "enemy";

export interface UnitDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  currentClassId: string;
  spawnRole: UnitSpawnRole;
  enemySpawnFloorOrdinals: number[];
  stats: {
    maxHp: number;
    atk: GearStats["atk"];
    def: GearStats["def"];
    agi: GearStats["agi"];
    acc: GearStats["acc"];
  };
  loadout: UnitLoadoutDocument;
  traits: string[];
  pwr: number;
  recruitCost: number;
  startingInRoster: boolean;
  deployInParty: boolean;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
