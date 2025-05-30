// Copyright 2025 Intel Corporation
// SPDX: Apache-2.0

import _ from "lodash"

import {
  IdType,
  ItemType,
  ShapeType,
  State,
  TrackType,
  ViewerConfigType
} from "../types/state"
import { makeItem } from "./states"
import { ViewerConfigTypeName } from "../const/common"

// TODO- move these to selector file and use hierarchical structure

/**
 * Get the current item from state
 *
 * @param {State} state
 * @returns {ItemType}: If no item is selected, return a new item with id -1
 */
export function getCurrentItem(state: State): ItemType {
  if (state.user.select.item < 0) {
    return makeItem()
  } else {
    return state.task.items[state.user.select.item]
  }
}

/**
 * Get the number of labels on the item
 *
 * @param state
 * @param itemIndex
 */
export function getNumLabels(state: State, itemIndex: number): number {
  return _.size(state.task.items[itemIndex].labels)
}

/**
 * Get the number of shapes on the item
 *
 * @param state
 * @param itemIndex
 */
export function getNumShapes(state: State, itemIndex: number): number {
  return _.size(state.task.items[itemIndex].labels)
}

/**
 * Get the track with the specified id
 *
 * @param state
 * @param trackIndex
 * @param trackId
 */
export function getTrack(state: State, trackId: string): TrackType {
  return state.task.tracks[trackId]
}

/**
 * Get the total number of tracks
 *
 * @param state
 */
export function getNumTracks(state: State): number {
  return _.size(state.task.tracks)
}

/**
 * Get the total number of items
 *
 * @param state
 */
export function getNumItems(state: State): number {
  return _.size(state.task.items)
}

/**
 * Get the number of labels associated with the track
 *
 * @param track
 */
export function getNumLabelsForTrack(track: TrackType): number {
  return _.size(track.labels)
}

/**
 * Get the number of labels for the track with the given id
 *
 * @param state
 * @param trackId
 */
export function getNumLabelsForTrackId(state: State, trackId: IdType): number {
  const track = getTrack(state, trackId)
  return getNumLabelsForTrack(track)
}

/**
 * Get the id of the label in the track at the specified item
 *
 * @param state
 * @param trackIdx
 * @param trackId
 * @param itemIdx
 */
export function getLabelInTrack(
  state: State,
  trackId: string,
  itemIdx: number
): IdType {
  return state.task.tracks[trackId].labels[itemIdx]
}

/**
 * Get all labels that are currently selected
 *
 * @param state
 */
export function getSelectedLabels(state: State): { [index: number]: string[] } {
  return state.user.select.labels
}

/**
 * Get the category of the specified label
 *
 * @param state
 * @param itemIdx
 * @param itemIndex
 * @param labelId
 */
export function getCategory(
  state: State,
  itemIndex: number,
  labelId: IdType
): number[] {
  return state.task.items[itemIndex].labels[labelId].category
}

/**
 * Get shape from the state
 *
 * @param state
 * @param itemIndex
 * @param labelId
 * @param shapeIndex
 */
export function getShape(
  state: State,
  itemIndex: number,
  labelId: IdType,
  shapeIndex: number
): ShapeType {
  const item = state.task.items[itemIndex]
  const shapeId = item.labels[labelId].shapes[shapeIndex]
  return item.shapes[shapeId]
}

/**
 * Retrieve shapes from the state
 *
 * @param state
 * @param itemIndex
 * @param labelId
 */
export function getShapes(
  state: State,
  itemIndex: number,
  labelId: IdType
): ShapeType[] {
  const item = state.task.items[itemIndex]
  return item.labels[labelId].shapes.map((s) => item.shapes[s])
}

/**
 * Check if frame is loaded
 *
 * @param state
 * @param item
 * @param sensor
 */
export function isFrameLoaded(
  state: State,
  item: number,
  sensor: number
): boolean {
  return state.session.itemStatuses[item].sensorDataLoaded[sensor]
}

/**
 * Check if current frame is loaded
 *
 * @param state
 * @param sensor
 */
export function isCurrentFrameLoaded(state: State, sensor: number): boolean {
  return isFrameLoaded(state, state.user.select.item, sensor)
}

/**
 * Check whether item is loaded
 *
 * @param state
 * @param item
 */
export function isItemLoaded(state: State, item: number): boolean {
  const loadedMap = state.session.itemStatuses[item].sensorDataLoaded

  for (const loaded of Object.values(loadedMap)) {
    if (!loaded) {
      return false
    }
  }

  return true
}

/**
 * Check whether the current item is loaded
 *
 * @param {State} state
 * @returns boolean
 */
export function isCurrentItemLoaded(state: State): boolean {
  return isItemLoaded(state, state.user.select.item)
}

/**
 * Get config associated with viewer id
 *
 * @param state
 * @param viewerId
 */
export function getCurrentViewerConfig(
  state: State,
  viewerId: number
): ViewerConfigType {
  if (viewerId in state.user.viewerConfigs) {
    return state.user.viewerConfigs[viewerId]
  }
  throw new Error(`Viewer id ${viewerId} not found`)
}

/**
 * Get the tracks and ids of all selected tracks
 * Selected tracks can be in the same item, or different items (linking)
 *
 * @param state
 */
export function getSelectedTracks(state: State): TrackType[] {
  const selectedLabels = getSelectedLabels(state)
  const tracks: TrackType[] = []
  const added = new Set<string>()

  for (const key of Object.keys(selectedLabels)) {
    const itemIndex = Number(key)
    for (const labelId of selectedLabels[itemIndex]) {
      const trackId = state.task.items[itemIndex].labels[labelId].track

      // Deduplicate since linked labels belongs to same track.
      if (added.has(trackId)) {
        continue
      }
      added.add(trackId)

      tracks.push(getTrack(state, trackId))
    }
  }

  return tracks
}

/**
 * Get set of sensor types
 *
 * @param state
 */
export function getSensorTypes(state: State): Set<ViewerConfigTypeName> {
  const sensors = Object.entries(state.task.sensors).map(([key, val]) => {
    if (key === undefined) {
      throw new Error("Sensor key is undefined")
    } else {
      switch (val.type) {
        case "image":
          return ViewerConfigTypeName.IMAGE
        case "pointcloud":
          return ViewerConfigTypeName.POINT_CLOUD
        case "image_3d":
          return ViewerConfigTypeName.IMAGE_3D
        case "homography":
          return ViewerConfigTypeName.HOMOGRAPHY
        default:
          return ViewerConfigTypeName.UNKNOWN
      }
    }
  })

  return new Set(sensors)
}

/**
 * Get minimum sensor ids for each item type
 *
 * @param state
 */
export function getMinSensorIds(state: State): { [type: string]: number } {
  const sensorIds = Object.keys(state.task.sensors)
    .map((key) => Number(key))
    .sort((a, b) => a - b)

  const minSensorIds: { [type: string]: number } = {
    [ViewerConfigTypeName.IMAGE]: -1,
    [ViewerConfigTypeName.IMAGE_3D]: -1,
    [ViewerConfigTypeName.HOMOGRAPHY]: -1,
    [ViewerConfigTypeName.POINT_CLOUD]: -1
  }

  if (sensorIds.length > 1) {
    for (const sensorId of sensorIds) {
      if (state.task.sensors[sensorId].type === ViewerConfigTypeName.IMAGE) {
        minSensorIds[ViewerConfigTypeName.IMAGE] = sensorId
        minSensorIds[ViewerConfigTypeName.IMAGE_3D] = sensorId
        minSensorIds[ViewerConfigTypeName.HOMOGRAPHY] = sensorId
        break
      }
    }
    for (const sensorId of sensorIds) {
      if (
        state.task.sensors[sensorId].type === ViewerConfigTypeName.POINT_CLOUD
      ) {
        minSensorIds[ViewerConfigTypeName.POINT_CLOUD] = sensorId
        break
      }
    }
  }

  return minSensorIds
}
