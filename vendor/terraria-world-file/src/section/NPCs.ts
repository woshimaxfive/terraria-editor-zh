import type BinaryReader from '../BinaryReader'
import BinarySaver from '../BinarySaver'
import type { WorldProperties } from '../FileReader'
import type { Section } from '../sections'
import type { Pillar, TownNPC } from '../types'

export class NPCsData {
  townNPCs!: TownNPC[]
  pillars!: Pillar[]
  shimmeredNPCIds?: number[]
}

export default class NPCsIO implements Section.IODefinition<NPCsData> {
  public parse(reader: BinaryReader, world: WorldProperties): NPCsData {
    const data = new NPCsData()

    const shimmeredNPCIds = world.version >= 268 ? reader.readArray(reader.readInt32(), () => reader.readInt32()) : []

    data.shimmeredNPCIds = shimmeredNPCIds
    data.townNPCs = reader.readArrayUntil(
      () => reader.readBoolean(),
      () => this.parseNPC(reader, world, shimmeredNPCIds),
    )

    data.pillars = reader.readArrayUntil(
      () => reader.readBoolean(),
      () => this.parsePillar(reader),
    )

    return data
  }

  private parseNPC(reader: BinaryReader, world: WorldProperties, shimmeredNPCIds: number[]) {
    const NPC: TownNPC = {
      id: reader.readInt32(),
      name: reader.readString(),
      position: {
        x: reader.readFloat32(),
        y: reader.readFloat32(),
      },
      homeless: reader.readBoolean(),
      homePosition: {
        x: reader.readInt32(),
        y: reader.readInt32(),
      },
    }

    if (world.version >= 213) {
      const flags = reader.readUInt8()
      NPC.variationFlags = flags
      if (flags & 1) NPC.variationIndex = reader.readInt32()
    }

    if (world.version >= 315) {
      NPC.homelessDespawn = reader.readBoolean()
    }

    if (shimmeredNPCIds.includes(NPC.id)) {
      NPC.shimmered = true
    }

    return NPC
  }

  private parsePillar(reader: BinaryReader): Pillar {
    return {
      id: reader.readInt32(),
      position: {
        x: reader.readFloat32(),
        y: reader.readFloat32(),
      },
    }
  }

  public save(saver: BinarySaver, data: NPCsData, world: WorldProperties): void {
    if (world.version >= 268) {
      saver.saveArray(
        data.shimmeredNPCIds ?? data.townNPCs.filter((NPC) => NPC.shimmered).map(NPC => NPC.id),
        (length) => saver.saveInt32(length),
        (id) => saver.saveInt32(id),
      )
    }

    data.townNPCs.forEach((NPC) => {
      saver.saveBoolean(true)
      saver.saveInt32(NPC.id)
      saver.saveString(NPC.name)
      saver.saveFloat32(NPC.position.x)
      saver.saveFloat32(NPC.position.y)
      saver.saveBoolean(NPC.homeless)
      saver.saveInt32(NPC.homePosition.x)
      saver.saveInt32(NPC.homePosition.y)

      if (world.version >= 213) {
        const flags = (NPC.variationFlags ?? 0) & ~1
        saver.saveUInt8(flags | (NPC.variationIndex !== undefined ? 1 : 0))
        if (NPC.variationIndex !== undefined) saver.saveInt32(NPC.variationIndex)
      }

      if (world.version >= 315) {
        saver.saveBoolean(NPC.homelessDespawn ?? false)
      }
    })
    saver.saveBoolean(false)

    data.pillars.forEach((NPC) => {
      saver.saveBoolean(true)
      saver.saveInt32(NPC.id)
      saver.saveFloat32(NPC.position.x)
      saver.saveFloat32(NPC.position.y)
    })
    saver.saveBoolean(false)
  }
}
