// Copyright 2025 Intel Corporation
// SPDX: Apache-2.0

import { alert } from "../../common/alert"
import { Severity } from "../../types/common"
import {
  changeLabelsProps,
  linkLabels,
  mergeTracks,
  startLinkTrack,
  stopLinkTrack,
  unlinkLabels,
  splitTrack
} from "../../action/common"
import { selectLabels, unselectLabels } from "../../action/select"
import Session from "../../common/session"
import { addVisibilityListener } from "../../common/window"
import { Key } from "../../const/common"
import { getLinkedLabelIds } from "../../functional/common"
import { getSelectedTracks } from "../../functional/state_util"
import { tracksOverlapping } from "../../functional/track"
import { Size2D } from "../../math/size2d"
import { Vector2D } from "../../math/vector2d"
import { IdType, State } from "../../types/state"
import { commit2DLabels } from "../states"
import { Label2D, Label2DModifier } from "./label2d"
import { Label2DList, makeDrawableLabel2D } from "./label2d_list"
import { checkModifierFromKeyboard } from "./label2d_modifier"
import { makeTrack } from "../../functional/states"

/**
 * List of drawable labels
 * ViewController for the labels
 */
export class Label2DHandler {
  /** Drawable label list */
  private readonly _labelList: Label2DList
  /** Recorded state of last update */
  private _state: State
  /** Highlighted label */
  private _highlightedLabel: Label2D | null
  /** The hashed list of keys currently down */
  private readonly _pressedKey: Set<string>
  /** Index of currently selected item */
  private _selectedItemIndex: number
  /** Active modifier */
  private _modifier: Label2DModifier | null

  /**
   * Constructor
   *
   * @param labelList
   */
  constructor(labelList: Label2DList) {
    this._highlightedLabel = null
    this._state = Session.getState()
    this._pressedKey = new Set<string>()
    this._selectedItemIndex = -1
    this._labelList = labelList
    this._modifier = null

    addVisibilityListener(() => this.onVisibilityChange())
  }

  /** get highlightedLabel for state inspection */
  public get highlightedLabel(): Label2D | null {
    return this._highlightedLabel
  }

  /**
   * Process mouse down action
   *
   * @param coord
   * @param labelIndex
   * @param _labelIndex
   * @param handleIndex
   */
  public onMouseDown(
    coord: Vector2D,
    _labelIndex: number,
    handleIndex: number
  ): boolean {
    if (!this.hasSelectedLabels() || !this.isEditingSelectedLabels()) {
      if (this._highlightedLabel !== null) {
        this.selectHighlighted()
      } else {
        if (this.isKeyDown(Key.META) || this.isKeyDown(Key.CONTROL)) {
          return false
        }
        Session.dispatch(
          selectLabels(
            {},
            -1,
            [],
            this._state.user.select.category,
            this._state.user.select.attributes
          )
        )
        this._labelList.selectedLabels.length = 0
        const state = this._state
        // TODO: Refactor the relation between handler, label list and label
        const label = makeDrawableLabel2D(
          this._labelList,
          state.task.config.labelTypes[state.user.select.labelType],
          state.task.config.label2DTemplates
        )
        if (label !== null) {
          label.initTemp(state, coord)
          if (this.isKeyDown(Key.S_LOW)) {
            // When s is pressed, this initialized label will not propagated.
            label.single = true
          }
          this._labelList.selectedLabels.push(label)
          this._labelList.labelList.push(label)
          label.onMouseDown(coord, handleIndex)
        }

        this._highlightedLabel = label
      }
    }
    if (
      this.hasSelectedLabels() &&
      !this.isKeyDown(Key.META) &&
      !this.isKeyDown(Key.CONTROL)
    ) {
      for (const label of this._labelList.selectedLabels) {
        if (label !== this._highlightedLabel) {
          label.setHighlighted(true, 0)
        }
        // If the label is temporary, it has been called mouse down when it is
        // created. Somehow, Meta key can appear randomly after the session is
        // idle for a while, which will cause this code segmentation unexecuted
        if (!label.temporary) {
          label.onMouseDown(coord, handleIndex)
        }
      }
    }
    return true
  }

  /**
   * Process mouse up action
   *
   * @param coord
   * @param labelIndex
   * @param handleIndex
   * @param _labelIndex
   * @param _handleIndex
   */
  public onMouseUp(
    coord: Vector2D,
    _labelIndex: number,
    _handleIndex: number
  ): void {
    // Hijack the event by the modifier.
    if (this._modifier !== null) {
      // Notify the modifier only when a handler is clicked.
      if (_labelIndex >= 0 && _handleIndex >= 0) {
        const label = this._labelList.labelList[_labelIndex]
        this._modifier.onClickHandler(label, _handleIndex)
      }
      return
    }

    if (this.hasSelectedLabels() && !this.isKeyDown(Key.META)) {
      const labelsToRemove: Label2D[] = []
      this._labelList.selectedLabels.forEach((selectedLabel) => {
        selectedLabel.onMouseUp(coord)
        if (selectedLabel !== this._highlightedLabel) {
          selectedLabel.setHighlighted(false)
        }
        if (!selectedLabel.isValid() && !selectedLabel.editing) {
          labelsToRemove.push(selectedLabel)
        }
      })
      commit2DLabels([...this._labelList.popUpdatedLabels()])
      this._labelList.clearUpdatedLabels()

      for (const label of labelsToRemove) {
        const labelListIndex = this._labelList.labelList.indexOf(label)
        if (labelListIndex >= 0) {
          this._labelList.labelList.splice(labelListIndex, 1)
        }
        const selectedIndex = this._labelList.selectedLabels.indexOf(label)
        if (selectedIndex >= 0) {
          this._labelList.selectedLabels.splice(selectedIndex, 1)
        }
      }
    }
  }

  /**
   * Process mouse move action
   *
   * @param coord
   * @param canvasLimit
   * @param labelIndex
   * @param handleIndex
   */
  public onMouseMove(
    coord: Vector2D,
    canvasLimit: Size2D,
    labelIndex: number,
    handleIndex: number
  ): boolean {
    // Freeze the selected labels when a modifier is activated.
    if (this._modifier === null) {
      if (this.hasSelectedLabels() && this.isEditingSelectedLabels()) {
        for (const label of this._labelList.selectedLabels) {
          label.onMouseMove(coord, canvasLimit, labelIndex, handleIndex)
          label.setManual()
        }
        return true
      }
    }

    if (labelIndex >= 0) {
      if (this._highlightedLabel === null) {
        this._highlightedLabel = this._labelList.labelList[labelIndex]
      }
      if (this._highlightedLabel.index !== labelIndex) {
        this._highlightedLabel.setHighlighted(false)
        this._highlightedLabel = this._labelList.labelList[labelIndex]
      }
      this._highlightedLabel.setHighlighted(true, handleIndex)
    } else if (this._highlightedLabel !== null) {
      this._highlightedLabel.setHighlighted(false)
      this._highlightedLabel = null
    }

    return false
  }

  /**
   * Handle keyboard down events
   *
   * @param e
   */
  public onKeyDown(e: KeyboardEvent): void {
    // Hijack the event by the modifier.
    if (this._modifier != null) {
      this._modifier.onKeyDown(e)
      return
    }

    this._pressedKey.add(e.key)

    // Propagate the key-down event only when exactly one key is pressed.
    // Otherwise, pressing `Ctrl + D` will delete the active label.
    if (this._pressedKey.size === 1) {
      for (const sl of this._labelList.selectedLabels) {
        if (sl.onKeyDown(e.key)) {
          continue
        }

        const l = this._labelList.selectedLabels[0]
        const i = this._labelList.labelList.indexOf(l)
        this._labelList.labelList.splice(i, 1)
        this._labelList.selectedLabels.length = 0
      }
    }

    // Check if some modifier is suitable when `Ctrl` is pressed.
    if (this.isKeyDown(Key.CONTROL) || this.isKeyDown(Key.META)) {
      const { selectedLabels: labels } = this._labelList
      const modifier = checkModifierFromKeyboard(labels, e)
      if (modifier != null) {
        // Hit one.
        e.preventDefault()

        // Somehow the `_highlightedLabel` will be set null after entering
        // the modifying mode. Therefore, we remember the old value and
        // set it back later.
        const old = this._highlightedLabel
        modifier.onFinish(() => {
          this._modifier = null
          this._highlightedLabel = old
        })
        this._modifier = modifier

        // No fallthrough.
        return
      }
    }

    switch (e.key) {
      case Key.L_LOW:
        if (this.isKeyDown(Key.CONTROL) || this.isKeyDown(Key.META)) {
          // Track link mode
          Session.dispatch(startLinkTrack())
        } else if (!this._state.task.config.tracking) {
          // Linking
          this.linkLabels()
        } else if (!this._state.session.trackLinking) {
          // Enable link in trakcing mode when track linking is not activated.
          this.linkLabels()
        }
        break
      case Key.L_UP:
        if (!this._state.task.config.tracking) {
          // Unlinking
          this.unlinkLabels()
        }
        break
      case Key.ARROW_UP:
        // Only change order when one label is selected
        if (this._labelList.selectedLabels.length === 1) {
          const label = this._labelList.selectedLabels[0]
          this.swapOrders(label.index, label.index + 1)
        }
        break
      case Key.ARROW_DOWN:
        if (this._labelList.selectedLabels.length === 1) {
          const label = this._labelList.selectedLabels[0]
          this.swapOrders(label.index, label.index - 1)
        }
        break
      case Key.B_LOW:
      case Key.B_UP:
        if (this._labelList.selectedLabels.length === 1) {
          const selectedLabel = this._labelList.selectedLabels[0]
          this.changeLabelOrder(selectedLabel.index, 0)
        }
        break
      case Key.F_LOW:
      case Key.F_UP:
        if (this._labelList.selectedLabels.length === 1) {
          const selectedLabel = this._labelList.selectedLabels[0]
          this.changeLabelOrder(
            selectedLabel.index,
            this._labelList.labelList.length - 1
          )
        }
        break
      case Key.U_LOW:
      case Key.U_UP:
        if (this._state.task.config.tracking) {
          this.unlinkTrack()
        }
        break
      case Key.ENTER:
        if (this._state.session.trackLinking) {
          this.mergeTracks()
        } else {
          commit2DLabels([...this._labelList.popUpdatedLabels()])
        }
        break
      case Key.SPACE:
        if (this.hasSelectedLabels()) {
          for (const label of this._labelList.selectedLabels) {
            if (!label.temporary) {
              label.changeChecked()
              commit2DLabels([...this._labelList.popUpdatedLabels()])
            }
          }
        }
        break
      case Key.ESCAPE:
        if (this._state.session.trackLinking) {
          Session.dispatch(stopLinkTrack())
        }
        break
    }
  }

  /**
   * Update state
   *
   * @param state
   */
  public updateState(state: State): void {
    this._state = state
    if (this._selectedItemIndex !== state.user.select.item) {
      this._highlightedLabel = null
    }
    this._selectedItemIndex = state.user.select.item
  }

  /**
   * Handle keyboard up events
   *
   * @param e
   */
  public onKeyUp(e: KeyboardEvent): void {
    this._pressedKey.delete(e.key)
    for (const selectedLabel of this._labelList.selectedLabels) {
      selectedLabel.onKeyUp(e.key)
    }
  }

  /**
   * Handling function for canvas visibility change
   *
   * @param _isVisible
   */
  public onVisibilityChange(): void {
    this._pressedKey.delete(Key.META)
    this._pressedKey.delete(Key.CONTROL)
  }

  /** returns whether selectedLabels is empty */
  private hasSelectedLabels(): boolean {
    return this._labelList.selectedLabels.length !== 0
  }

  /** returns whether selectedLabels is editing */
  private isEditingSelectedLabels(): boolean {
    for (const label of this._labelList.selectedLabels) {
      if (label.editing) {
        return true
      }
    }
    return false
  }

  /**
   * Whether a specific key is pressed down
   *
   * @param key - the key to check
   */
  private isKeyDown(key: Key): boolean {
    return this._pressedKey.has(key)
  }

  /** Select highlighted label, if any */
  private selectHighlighted(): void {
    if (this._highlightedLabel !== null) {
      const item = this._state.task.items[this._state.user.select.item]
      const labelIds = this._highlightedLabel.isValid()
        ? getLinkedLabelIds(item, this._highlightedLabel.labelId)
        : [this._highlightedLabel.labelId]
      const highlightedAlreadySelected =
        this._labelList.selectedLabels.includes(this._highlightedLabel)
      if (this.isKeyDown(Key.CONTROL) || this.isKeyDown(Key.META)) {
        if (highlightedAlreadySelected) {
          Session.dispatch(
            unselectLabels(
              this._labelList.selectedLabelIds,
              this._selectedItemIndex,
              labelIds
            )
          )
        } else {
          Session.dispatch(
            selectLabels(
              this._labelList.selectedLabelIds,
              this._selectedItemIndex,
              labelIds,
              this._highlightedLabel.category[0],
              this._highlightedLabel.attributes,
              true
            )
          )
        }
      } else if (!highlightedAlreadySelected) {
        Session.dispatch(
          selectLabels(
            this._labelList.selectedLabelIds,
            this._selectedItemIndex,
            labelIds,
            this._highlightedLabel.category[0],
            this._highlightedLabel.attributes
          )
        )
      }
    }
  }

  /** link selected labels */
  private linkLabels(): void {
    Session.dispatch(
      linkLabels(
        this._state.user.select.item,
        this._labelList.selectedLabels.map((label) => label.labelId)
      )
    )
  }

  /** unlink selected labels */
  private unlinkLabels(): void {
    Session.dispatch(
      unlinkLabels(
        this._state.user.select.item,
        this._labelList.selectedLabels.map((label) => label.labelId)
      )
    )
  }

  /**
   * swap label orders, given label indices
   *
   * @param index1
   * @param index2
   */
  private swapOrders(index1: number, index2: number): void {
    // Check that indices are valid
    if (
      index1 >= 0 &&
      index2 >= 0 &&
      index1 < this._labelList.labelList.length &&
      index2 < this._labelList.labelList.length
    ) {
      const label1 = this._labelList.get(index1)
      const label2 = this._labelList.get(index2)
      Session.dispatch(
        changeLabelsProps(
          [this._selectedItemIndex],
          [[label1.labelId, label2.labelId]],
          [[{ order: label2.order }, { order: label1.order }]]
        )
      )
    }
  }

  /**
   * move label to nth position
   *
   * @param index
   * @param newPosition
   */
  private changeLabelOrder(index: number, newPosition: number): void {
    const labels = this._labelList.labelList
    if (
      index >= 0 &&
      index < labels.length &&
      newPosition >= 0 &&
      newPosition < labels.length &&
      index !== newPosition
    ) {
      const start = Math.min(index, newPosition)
      const end = Math.max(index, newPosition)
      const labelIds: IdType[] = []
      const props = []
      for (let i = start; i <= end; i++) {
        labelIds.push(labels[i].labelId)
        props.push({ order: labels[i].order })
      }
      if (index < newPosition) {
        const labelId = labelIds.shift()
        if (labelId !== undefined) {
          labelIds.push(labelId)
        }
      } else {
        const labelId = labelIds.pop()
        if (labelId !== undefined) {
          labelIds.unshift(labelId)
        }
      }
      Session.dispatch(
        changeLabelsProps([this._selectedItemIndex], [labelIds], [props])
      )
    }
  }

  /**
   * Merge different tracks
   */
  private mergeTracks(): void {
    const tracks = getSelectedTracks(this._state)
    if (!tracksOverlapping(tracks)) {
      Session.dispatch(mergeTracks(tracks.map((t) => t.id)))
      alert(Severity.SUCCESS, "Selected tracks have been successfuly linked.")
    } else {
      alert(Severity.WARNING, "Selected tracks have overlapping frames.")
    }
  }

  /**
   * Unlink selected track
   */
  private unlinkTrack(): void {
    const select = this._state.user.select
    const track = getSelectedTracks(this._state)[0]
    const newTrackId = makeTrack().id

    Session.dispatch(splitTrack(track.id, newTrackId, select.item))
  }
}
