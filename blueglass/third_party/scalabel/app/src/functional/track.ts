// Copyright 2025 Intel Corporation
// SPDX: Apache-2.0

import { TrackType } from "../types/state"

/**
 * Check if tracks overlap in items
 *
 * @param tracks
 */
export function tracksOverlapping(tracks: TrackType[]): boolean {
  const itemIndices = new Set<number>()
  for (const track of tracks) {
    for (const key of Object.keys(track.labels)) {
      const index = Number(key)
      if (itemIndices.has(index)) {
        return true
      }
      itemIndices.add(index)
    }
  }
  return false
}
