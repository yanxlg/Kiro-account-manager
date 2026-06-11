import type { IslandApi } from './island'

declare global {
  interface Window {
    islandApi: IslandApi
  }
}

export {}
