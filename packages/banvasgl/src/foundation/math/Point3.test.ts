import { describe, it, expect } from 'vitest'
import Point3 from './Point3.js'
import Vector3 from './Vector3.js'

describe('Point3', () => {
  it('creates a point with given values', () => {
    const p = new Point3(1, 2, 3)
    expect(p.x).toBe(1)
    expect(p.y).toBe(2)
    expect(p.z).toBe(3)
  })

  it('provides an origin static getter', () => {
    const origin = Point3.origin
    expect(origin.x).toBe(0)
    expect(origin.y).toBe(0)
    expect(origin.z).toBe(0)
  })

  it('adds a vector to the point (translation)', () => {
    const p = new Point3(1, 2, 3)
    const v = new Vector3(4, 5, 6)
    const result = p.add(v)
    expect(result.x).toBe(5)
    expect(result.y).toBe(7)
    expect(result.z).toBe(9)
  })

  it('subtracts another point to get a displacement vector', () => {
    const a = new Point3(4, 5, 6)
    const b = new Point3(1, 2, 3)
    const result = a.subtract(b)
    expect(result instanceof Vector3).toBe(true)
    expect(result.x).toBe(3)
    expect(result.y).toBe(3)
    expect(result.z).toBe(3)
  })

  it('calculates distance between two points', () => {
    const a = new Point3(0, 0, 0)
    const b = new Point3(3, 4, 0)
    const dist = a.distance(b)
    expect(dist).toBe(5)
  })

  it('calculates distance symmetrically', () => {
    const a = new Point3(3, 4, 0)
    const b = new Point3(0, 0, 0)
    expect(a.distance(b)).toBe(5)
  })

  it('deep copies itself', () => {
    const p = new Point3(1, 2, 3)
    const clone = p.copy()
    expect(clone.x).toBe(1)
    expect(clone.y).toBe(2)
    expect(clone.z).toBe(3)
    expect(clone).not.toBe(p)
  })

  it('serializes to JSON', () => {
    const p = new Point3(1, 2, 3)
    const json = p.toJSON()
    expect(json).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('deserializes from JSON', () => {
    const p = Point3.fromJSON({ x: 1, y: 2, z: 3 })
    expect(p.x).toBe(1)
    expect(p.y).toBe(2)
    expect(p.z).toBe(3)
  })

  it('creates points from a flat array', () => {
    const data = [1, 2, 3, 4, 5, 6]
    const points = Point3.fromArray(data)
    expect(points).toHaveLength(2)
    expect(points[0].toJSON()).toEqual({ x: 1, y: 2, z: 3 })
    expect(points[1].toJSON()).toEqual({ x: 4, y: 5, z: 6 })
  })

  it('checks if two points are the same within epsilon', () => {
    const a = new Point3(1, 2, 3)
    const b = new Point3(1, 2, 3.0005)
    expect(a.isSame(b)).toBe(true)
  })

  it('detects different points', () => {
    const a = new Point3(1, 2, 3)
    const b = new Point3(1, 2, 4)
    expect(a.isSame(b)).toBe(false)
  })
})
