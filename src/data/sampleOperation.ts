import type { OperationDocument } from "../types/operation";
import { isoNow } from "../utils/date";

export function createBlankOperation(): OperationDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "new_operation",
    codename: "UNTITLED OPERATION",
    description: "",
    recommendedPower: 25,
    floors: [
      {
        id: "floor_1",
        name: "Floor 1",
        startingRoomId: "room_start",
        rooms: [
          {
            id: "room_start",
            label: "Start",
            type: "tavern",
            x: 0,
            y: 0,
            connections: [],
            shopInventory: [],
            metadata: {}
          }
        ]
      }
    ],
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleOperation(): OperationDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "op_glass_harbor",
    codename: "GLASS HARBOR",
    description: "Secure the harbor relay and break the fogbound ambush chain.",
    recommendedPower: 48,
    floors: [
      {
        id: "floor_glass_harbor_1",
        name: "Glass Harbor - Breakwater",
        startingRoomId: "room_harbor_start",
        rooms: [
          {
            id: "room_harbor_start",
            label: "Dock Ingress",
            type: "tavern",
            x: 0,
            y: 0,
            connections: ["room_fog_channel"],
            shopInventory: [],
            metadata: {}
          },
          {
            id: "room_fog_channel",
            label: "Fog Channel",
            type: "battle",
            x: 1,
            y: 0,
            connections: ["room_relay_quay"],
            battleTemplate: "fog_skirmish",
            shopInventory: [],
            metadata: {
              weather: "fog"
            }
          },
          {
            id: "room_relay_quay",
            label: "Relay Quay",
            type: "boss",
            x: 2,
            y: 0,
            connections: [],
            shopInventory: ["weapon_iron_longsword"],
            metadata: {
              objective: "secure_relay"
            }
          }
        ]
      }
    ],
    metadata: {
      biome: "harbor"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
