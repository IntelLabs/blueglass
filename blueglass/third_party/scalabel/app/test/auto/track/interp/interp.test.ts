// Copyright 2025 Intel Corporation
// SPDX: Apache-2.0

import _ from "lodash"

import { addBox2dLabel } from "../../../../src/action/box2d"
import { TrackInterp } from "../../../../src/auto/track/interp/interp"
import { dispatch, getState } from "../../../../src/common/session"
import { LabelType, RectType, SimpleRect } from "../../../../src/types/state"
import { setupTestStore } from "../../../components/util"
import { emptyTrackingTask } from "../../../test_states/test_track_objects"

beforeEach(() => {
  setupTestStore(emptyTrackingTask)
})

test("2D box linear interpolation", () => {
  const interp: TrackInterp = new TrackInterp()
  const box: SimpleRect = { x1: 0, y1: 0, x2: 20, y2: 20 }

  // Making some labels and shapes
  for (let i = 0; i < 8; ++i) {
    dispatch(addBox2dLabel(i, -1, [], {}, box))
  }
  const state = getState()
  const labels = state.task.items.map((item) =>
    _.sample(item.labels)
  ) as LabelType[]
  let shapes = state.task.items.map((item, index) => [
    item.shapes[labels[index].shapes[0]]
  ]) as RectType[][]

  // Change the middle label
  const newLabel = _.cloneDeep(labels[4])
  const newShape = _.cloneDeep(shapes[4])
  labels.forEach((l) => {
    l.manual = false
  })
  labels[1].manual = true
  labels[6].manual = true

  const newBox: SimpleRect = { x1: 36, y1: 72, x2: 32, y2: 44 }
  newShape[0] = { ...newShape[0], ...newBox }

  shapes = interp.interp(newLabel, newShape, labels, shapes) as RectType[][]
  expect(shapes[4][0]).toMatchObject(newBox)
  // Only update between manual labels
  expect(shapes[0][0]).toMatchObject(box)
  expect(shapes[7][0]).toMatchObject(box)
  expect(shapes[1][0]).toMatchObject(box)
  expect(shapes[6][0]).toMatchObject(box)
  // Copying results
  expect(shapes[2][0]).toMatchObject(newBox)
  expect(shapes[3][0]).toMatchObject(newBox)
  expect(shapes[5][0]).toMatchObject(newBox)
})
