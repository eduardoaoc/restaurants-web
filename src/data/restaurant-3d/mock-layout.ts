import type { RestaurantLayout } from '@/types/restaurant-3d/restaurant-layout'

/**
 * Mock floor for the 3D lab: 2×2-seat, 3×4-seat, 1×6-seat, 1×8-seat tables.
 * Tables are spaced so there is at least ~1.5 m of clear walking space
 * between the outer edge of any two sets of chairs.
 */
export const mockLayout: RestaurantLayout = {
  tables: [
    { id: 'table-1', number: 1, seats: 2, shape: 'round', position: { x: -5, z: -3.5 }, rotation: 0 },
    { id: 'table-2', number: 2, seats: 4, shape: 'square', position: { x: -1.5, z: -3.5 }, rotation: 0 },
    { id: 'table-3', number: 3, seats: 4, shape: 'round', position: { x: 2, z: -3.5 }, rotation: 0 },
    { id: 'table-4', number: 4, seats: 2, shape: 'square', position: { x: 5.5, z: -3.5 }, rotation: 0 },
    { id: 'table-5', number: 5, seats: 6, shape: 'rectangular', position: { x: -3.5, z: 1.5 }, rotation: 0 },
    { id: 'table-6', number: 6, seats: 8, shape: 'rectangular', position: { x: 2.5, z: 1.5 }, rotation: 0 },
    { id: 'table-7', number: 7, seats: 4, shape: 'rectangular', position: { x: 6.75, z: 1.5 }, rotation: 90 },
  ],
}
