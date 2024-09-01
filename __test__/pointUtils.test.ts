import { isPointInPath } from 'utils/pointUtil'

test('isPointInpath', () => {
  expect(
    isPointInPath({ x: 5, y: 5, w: 1 }, [
      { x: 0, y: 0, w: 1 },
      { x: 10, y: 0, w: 1 },
      { x: 10, y: 10, w: 1 },
      { x: 0, y: 10, w: 1 },
    ]),
  ).toBe(true)
  expect(
    isPointInPath({ x: 5, y: 5, w: 1 }, [
      { x: 0, y: 10, w: 1 },
      { x: 10, y: 10, w: 1 },
      { x: 10, y: 20, w: 1 },
      { x: 0, y: 20, w: 1 },
    ]),
  ).toBe(false)
})
