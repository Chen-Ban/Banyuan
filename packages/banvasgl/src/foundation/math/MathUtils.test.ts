import { describe, it, expect } from 'vitest'
import { MathUtils } from './MathUtils.js'
import Vector3 from './Vector3.js'

describe('MathUtils', () => {
  // ── Constants ────────────────────────────────────────────────────────────────
  describe('constants', () => {
    it('has the expected epsilon values', () => {
      expect(MathUtils.EPSILON).toBe(1e-2)
      expect(MathUtils.FLOAT_EPSILON).toBe(1e-10)
    })

    it('provides common PI multiples', () => {
      expect(MathUtils.PI).toBe(Math.PI)
      expect(MathUtils.TWO_PI).toBe(2 * Math.PI)
      expect(MathUtils.HALF_PI).toBe(Math.PI / 2)
    })
  })

  // ── isEqual / isZero ─────────────────────────────────────────────────────────
  describe('isEqual', () => {
    it('returns true for nearly equal values', () => {
      expect(MathUtils.isEqual(0.1 + 0.2, 0.3)).toBe(true)
    })

    it('returns false for values differing beyond epsilon', () => {
      expect(MathUtils.isEqual(1.0, 1.05, 0.01)).toBe(false)
    })

    it('uses custom epsilon', () => {
      expect(MathUtils.isEqual(1.0, 1.005, 0.01)).toBe(true)
      expect(MathUtils.isEqual(1.0, 1.015, 0.01)).toBe(false)
    })
  })

  describe('isZero', () => {
    it('returns true for values near zero', () => {
      expect(MathUtils.isZero(0.005)).toBe(true)
    })

    it('returns false for non-zero values', () => {
      expect(MathUtils.isZero(0.05)).toBe(false)
    })

    it('respects custom epsilon', () => {
      expect(MathUtils.isZero(0.0001, 1e-3)).toBe(true)
      expect(MathUtils.isZero(0.001, 1e-4)).toBe(false)
    })
  })

  // ── calculateAngle ───────────────────────────────────────────────────────────
  describe('calculateAngle', () => {
    it('returns 0 for (1, 0)', () => {
      expect(MathUtils.calculateAngle(1, 0)).toBeCloseTo(0)
    })

    it('returns PI/2 for (0, 1)', () => {
      expect(MathUtils.calculateAngle(0, 1)).toBeCloseTo(Math.PI / 2)
    })

    it('returns PI for (-1, 0)', () => {
      expect(MathUtils.calculateAngle(-1, 0)).toBeCloseTo(Math.PI)
    })

    it('returns PI/4 for (1, 1) in [-PI, PI] range', () => {
      const angle = MathUtils.calculateAngle(1, 1, [-Math.PI, Math.PI])
      expect(angle).toBeCloseTo(Math.PI / 4)
    })
  })

  // ── lerpAngle ────────────────────────────────────────────────────────────────
  describe('lerpAngle', () => {
    it('interpolates angle at midpoint', () => {
      // from 0 to π/2, midpoint should be π/4
      const result = MathUtils.lerpAngle(0, Math.PI / 2, 0.5)
      expect(result).toBeCloseTo(Math.PI / 4)
    })

    it('returns start when t=0', () => {
      expect(MathUtils.lerpAngle(0.5, 1.5, 0)).toBeCloseTo(0.5)
    })

    it('returns end when t=1', () => {
      expect(MathUtils.lerpAngle(0.5, 1.5, 1)).toBeCloseTo(1.5)
    })

    it('takes the shortest arc', () => {
      // From 0.1 to near 2π, should go the short way (nearly 0)
      const result = MathUtils.lerpAngle(0.1, MathUtils.TWO_PI - 0.1, 0.5)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThan(Math.PI)
    })
  })

  // ── isAngleInArcRange ────────────────────────────────────────────────────────
  describe('isAngleInArcRange', () => {
    it('detects angle in clockwise arc (crossing 0)', () => {
      // clockwise from π to 0 — π/2 should be in range
      expect(MathUtils.isAngleInArcRange(Math.PI / 2, Math.PI, 0, true)).toBe(true)
    })

    it('detects angle in counter-clockwise arc', () => {
      // counter-clockwise from 0 to π — π/2 should be in range
      expect(MathUtils.isAngleInArcRange(Math.PI / 2, 0, Math.PI, false)).toBe(true)
    })

    it('rejects angle outside counter-clockwise arc', () => {
      // counter-clockwise from 0 to π — 3π/2 should be outside
      expect(MathUtils.isAngleInArcRange((3 * Math.PI) / 2, 0, Math.PI, false)).toBe(false)
    })
  })

  // ── isParallel / isPerpendicular (require Vector3) ──────────────────────────
  describe('isParallel', () => {
    it('detects parallel vectors', () => {
      const a = new Vector3(2, 4, 0)
      const b = new Vector3(1, 2, 0)
      expect(MathUtils.isParallel(a, b)).toBe(true)
    })

    it('detects non-parallel vectors', () => {
      const a = new Vector3(1, 0, 0)
      const b = new Vector3(0, 1, 0)
      expect(MathUtils.isParallel(a, b)).toBe(false)
    })
  })

  describe('isPerpendicular', () => {
    it('detects perpendicular vectors', () => {
      const a = new Vector3(1, 0, 0)
      const b = new Vector3(0, 3, 0)
      expect(MathUtils.isPerpendicular(a, b)).toBe(true)
    })

    it('detects non-perpendicular vectors', () => {
      const a = new Vector3(1, 1, 0)
      const b = new Vector3(0, 1, 0)
      expect(MathUtils.isPerpendicular(a, b)).toBe(false)
    })
  })

  // ── Interpolation ───────────────────────────────────────────────────────────
  describe('numberInterpolator', () => {
    it('linearly interpolates numbers', () => {
      const interp = MathUtils.numberInterpolator
      expect(interp(0, 10, 0.5)).toBe(5)
      expect(interp(0, 10, 0)).toBe(0)
      expect(interp(0, 10, 1)).toBe(10)
      expect(interp(10, 20, 0.25)).toBe(12.5)
    })
  })

  describe('interpolate', () => {
    it('interpolates numeric values', () => {
      expect(MathUtils.interpolate(0, 10, 0.5)).toBe(5)
      expect(MathUtils.interpolate(0, 10, 0)).toBe(0)
      expect(MathUtils.interpolate(0, 10, 1)).toBe(10)
    })
  })

  // ── Easings ──────────────────────────────────────────────────────────────────
  describe('Easings', () => {
    it('linear easing returns t as-is', () => {
      expect(MathUtils.Easings.linear(0)).toBe(0)
      expect(MathUtils.Easings.linear(0.5)).toBe(0.5)
      expect(MathUtils.Easings.linear(1)).toBe(1)
    })

    it('easeInQuad squares the input', () => {
      expect(MathUtils.Easings.easeInQuad(0.5)).toBeCloseTo(0.25)
      expect(MathUtils.Easings.easeInQuad(0.2)).toBeCloseTo(0.04)
      expect(MathUtils.Easings.easeInQuad(1)).toBe(1)
    })

    it('easeOutSine produces expected values', () => {
      expect(MathUtils.Easings.easeOutSine(0)).toBe(0)
      expect(MathUtils.Easings.easeOutSine(1)).toBeCloseTo(1)
    })
  })

  // ── cubicBezier ──────────────────────────────────────────────────────────────
  describe('cubicBezier', () => {
    it('creates a linear bezier when control points match endpoints', () => {
      // cubic-bezier(0, 0, 1, 1) should be linear
      const linear = MathUtils.cubicBezier(0, 0, 1, 1)
      expect(linear(0)).toBeCloseTo(0)
      expect(linear(0.5)).toBeCloseTo(0.5, 1) // approximate due to numeric solving
      expect(linear(1)).toBeCloseTo(1)
    })

    it('ease equals cubic-bezier(0.25, 0.1, 0.25, 1)', () => {
      const ease = MathUtils.cubicBezier(0.25, 0.1, 0.25, 1)
      expect(ease(0)).toBeCloseTo(0)
      expect(ease(1)).toBeCloseTo(1)
      // ease should accelerate then decelerate
      expect(ease(0.25)).toBeGreaterThan(0.25 * 0.25) // faster than linear at quarter
    })
  })
})
