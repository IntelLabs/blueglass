// Copyright 2025 Intel Corporation
// SPDX: Apache-2.0

import * as React from "react"

export type Size = string | number

export type Split = "vertical" | "horizontal"

export interface SplitPaneProps {
  allowResize?: boolean
  className?: string
  primary?: "first" | "second"
  minSize?: Size
  maxSize?: Size
  defaultSize?: Size
  size?: Size
  split?: "vertical" | "horizontal"
  onDragStarted?: () => void
  onDragFinished?: (newSize: number) => void
  onChange?: (newSize: number) => void
  onResizerClick?: (event: MouseEvent) => void
  onResizerDoubleClick?: (event: MouseEvent) => void
  style?: React.CSSProperties
  resizerStyle?: React.CSSProperties
  paneStyle?: React.CSSProperties
  pane1Style?: React.CSSProperties
  pane2Style?: React.CSSProperties
  resizerClassName?: string
  step?: number
}

export interface SplitPaneState {
  active: boolean
  resized: boolean
}

/**
 * SplitPane.
 */
declare class SplitPane extends React.Component<
  SplitPaneProps,
  SplitPaneState
> {
  constructor()

  onMouseDown(event: MouseEvent): void

  onTouchStart(event: TouchEvent): void

  onMouseMove(event: MouseEvent): void

  onTouchMove(event: TouchEvent): void

  onMouseUp(): void

  static getSizeUpdate(
    props: SplitPaneProps,
    state: SplitPaneState
  ): Partial<SplitPaneState>

  static defaultProps: SplitPaneProps
}

export default SplitPane

export interface PaneProps {
  className?: string
  size?: Size
  split?: Split
  style?: React.CSSProperties
  eleRef?: (el: HTMLDivElement) => void
}

/**
 * A pane in a SplitPane.
 */
declare class Pane extends React.PureComponent<PaneProps> {}

export { Pane }
