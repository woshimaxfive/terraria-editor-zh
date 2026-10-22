import type BinarySaver from '../BinarySaver'
import type BinaryReader from '../BinaryReader'
import type { Section } from '../sections'

// Persist only powers actually present. Desktop TEdit also understands three
// player powers in world files; retaining them does not expose a new UI feature.
const powers = [
  [0, 'freezeTime', 'boolean'],
  [5, 'godModePower', 'boolean'],
  [8, 'modifyTimeRate', 'number'],
  [9, 'freezeRainPower', 'boolean'],
  [10, 'freezeWindDirectionAndStrength', 'boolean'],
  [11, 'farPlacementRangePower', 'boolean'],
  [12, 'difficultySliderPower', 'number'],
  [13, 'stopBiomeSpreadPower', 'boolean'],
  [14, 'spawnRateSliderPerPlayerPower', 'number'],
] as const

type PowerName = typeof powers[number][1]
type PowerRecord = { type: number; marker: number; payload: Uint8Array }
const definition = (type: number) => {
  const entry = powers.find(power => power[0] === type)
  if (!entry) throw new Error(`Unknown creative power type: ${type}`)
  return entry
}
const valueOf = (record: PowerRecord): number | boolean => {
  const kind = definition(record.type)[2]
  if (record.payload.length !== (kind === 'boolean' ? 1 : 4)) throw new Error('Invalid creative power payload')
  return kind === 'boolean' ? Boolean(record.payload[0]) :
    new DataView(record.payload.buffer, record.payload.byteOffset, 4).getFloat32(0, true)
}

export class CreativePowersData {
  freezeTime?: boolean
  godModePower?: boolean
  modifyTimeRate?: number
  freezeRainPower?: boolean
  freezeWindDirectionAndStrength?: boolean
  farPlacementRangePower?: boolean
  difficultySliderPower?: number
  stopBiomeSpreadPower?: boolean
  spawnRateSliderPerPlayerPower?: number
  // Enumerable metadata survives structuredClone. Preserve duplicate records,
  // noncanonical true bytes, signed zero and float NaN payloads unchanged.
  records?: PowerRecord[]
}

export default class CreativePowersIO implements Section.IODefinition<CreativePowersData> {
  public parse(reader: BinaryReader): CreativePowersData {
    const data = new CreativePowersData()
    data.records = []
    let marker: number
    while ((marker = reader.readUInt8()) !== 0) {
      const type = reader.readUInt16(), [, name, kind] = definition(type)
      const record = { type, marker, payload: reader.readBytes(kind === 'boolean' ? 1 : 4) }
      data.records.push(record)
      Object.assign(data, { [name]: valueOf(record) })
    }
    return data
  }

  save(saver: BinarySaver, data: CreativePowersData): void {
    const records = data.records ?? [], last = new Map<PowerName, number>()
    records.forEach((record, index) => last.set(definition(record.type)[1], index))
    const saveValue = (type: number, name: PowerName, kind: 'boolean' | 'number') => {
      const value = data[name]
      if (typeof value !== kind) throw new Error(`Invalid creative power value: ${name}`)
      saver.saveUInt8(1)
      saver.saveUInt16(type)
      if (kind === 'boolean') saver.saveBoolean(value as boolean)
      else saver.saveFloat32(value as number)
    }
    records.forEach((record, index) => {
      const [type, name, kind] = definition(record.type)
      const original = valueOf(record)
      if (!Number.isInteger(record.marker) || record.marker < 1 || record.marker > 255) {
        throw new Error('Invalid creative power marker')
      }
      if (data[name] === undefined) return
      if (index === last.get(name) && !Object.is(data[name], original)) saveValue(type, name, kind)
      else {
        saver.saveUInt8(record.marker)
        saver.saveUInt16(type)
        saver.saveBytes(record.payload)
      }
    })
    for (const [type, name, kind] of powers) {
      if (!last.has(name) && data[name] !== undefined) saveValue(type, name, kind)
    }
    saver.saveBoolean(false)
  }
}
