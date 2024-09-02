import ITextOptionsManage from './ITextOptionsManage'
import {
  Point,
  RenderTextOptions,
  Selection,
  FontOptions,
  Range,
  RowOptions,
  HorAlign,
  VerAlign,
  Box,
  Size,
  Path,
  TextNode,
} from 'src/store/types/Template.type'
import { computeRelativePoint, isPointInPath, isPointOnPath } from 'utils/pointUtil'
import { generateBoxPath } from 'src/utils/boxUtils'
import SelectionManage from '../SelectionManage/SelectionManage'
import { ArrowKeys, ComposingArrowKeys } from 'src/constants/CanvasEvent'
import { SelectionObj } from '../SelectionManage/ISelectionManage'

export default class TextOptionsManage implements ITextOptionsManage {
  ctx: CanvasRenderingContext2D

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  getInputStartLocation(node: TextNode, mousdownPoint: Point, mouseupPoint: Point): Point {
    const rmdp = computeRelativePoint(mousdownPoint, node.structure.contentBox.location)
    const rmup = computeRelativePoint(mouseupPoint, node.structure.contentBox.location)
    const direction = this.relativeLocation2Index(node, rmup) - this.relativeLocation2Index(node, rmdp)
    return direction >= 0 ? mouseupPoint : mousdownPoint
  }

  regulateOptions(node: TextNode): RenderTextOptions {
    const options = structuredClone(node.options)
    let rowOffset = 0
    /**---------------------------------------------------------
     *                     分离selection                        -
     -----------------------------------------------------------*/
    for (const pOptions of Object.values(options.paragrahs)) {
      for (const [rSelection, rOptions] of Object.entries(pOptions.rows)) {
        const breakPoints: number[] = []
        let walkedWidth = 0
        const { startIndex, endIndex } = SelectionManage.parseSelection(rSelection as Selection)
        for (const [fSelection, fOptions] of Object.entries(rOptions.font)) {
          const { startIndex, endIndex } = SelectionManage.parseSelection(fSelection as Selection)
          for (let i = startIndex; i < endIndex; i++) {
            const characterWidth = fOptions.characterWidth[i - startIndex]
            const restWidth = node.structure.contentBox.size.width - walkedWidth
            if (restWidth < characterWidth) {
              breakPoints.push(i)
              walkedWidth = characterWidth //如果为0，最终会多一个出来
            } else {
              walkedWidth += characterWidth
            }
          }
        }

        //删除当前行行
        delete pOptions.rows[rSelection as Selection]

        breakPoints.push(endIndex)

        //根据分离点，重整字体区间
        for (const [fSelection, fOptions] of Object.entries(rOptions.font)) {
          const { startIndex, endIndex } = SelectionManage.parseSelection(fSelection as Selection)
          delete rOptions.font[fSelection as Selection]
          //有可能一个字体区间内有多个分离点
          const breakPointsInFontRange = breakPoints.filter((point) => point > startIndex && point < endIndex)
          if (breakPointsInFontRange.length != 0) {
            breakPointsInFontRange.push(endIndex)
            const breakedFontRange = Object.fromEntries(
              breakPointsInFontRange.map((point, i) => {
                const newSelection = SelectionManage.difference(
                  { startIndex: i === 0 ? startIndex : breakPointsInFontRange[i - 1], endIndex },
                  { startIndex: point, endIndex },
                )![0]

                return [
                  SelectionManage.stringifySelection(newSelection),
                  {
                    ...fOptions,
                    characterWidth: fOptions.characterWidth.slice(
                      newSelection.startIndex - startIndex,
                      newSelection.endIndex - startIndex,
                    ),
                  },
                ]
              }),
            )
            Object.assign(rOptions.font, breakedFontRange)
          } else {
            rOptions.font[fSelection as Selection] = fOptions
          }
        }

        //根据分离点，重整行区间
        const newRowRange = Object.fromEntries(
          breakPoints.map((point, i) => {
            const newSelection = SelectionManage.difference(
              {
                startIndex: i === 0 ? startIndex : breakPoints[i - 1],
                endIndex,
              },
              { startIndex: point, endIndex },
            )![0]
            const rowIndex = i + rowOffset
            options.rowsIndex[rowIndex] = SelectionManage.stringifySelection(newSelection)
            const newOptions = Object.fromEntries(
              Object.keys(rOptions.font)
                .filter((f) =>
                  SelectionManage.isContained(SelectionManage.parseSelection(f as Selection), newSelection),
                )
                .map((f) => [f, rOptions.font[f as Selection]]),
            )
            return [
              SelectionManage.stringifySelection(newSelection),
              {
                contentBox: {
                  size: { width: 0, height: 0 },
                  location: { x: 0, y: 0, w: 1 },
                },
                font: newOptions,
                rowIndex,
              } as RowOptions,
            ]
          }),
        )
        pOptions.rows = newRowRange
        rowOffset += breakPoints.length
      }
    }
    /**---------------------------------------------------------
     *                     合并fontSelection                        -
     -----------------------------------------------------------*/
    for (const pOptions of Object.values(options.paragrahs)) {
      for (const rOptions of Object.values(pOptions.rows)) {
        const fSelections = Object.keys(rOptions.font)
        for (let p = 0, q = 1; p < fSelections.length, q < fSelections.length; p = q + 1, q = p + 1) {
          let characterWidths = [...rOptions.font[fSelections[p] as Selection].characterWidth]
          while (
            JSON.stringify({ ...rOptions.font[fSelections[p] as Selection], characterWidth: 0 }) ===
            JSON.stringify({ ...rOptions.font[fSelections[q] as Selection], characterWidth: 0 })
          ) {
            characterWidths = [...characterWidths, ...rOptions.font[fSelections[q] as Selection].characterWidth]
            delete rOptions.font[fSelections[q] as Selection]
            q++
          }
          const newSelection = SelectionManage.stringifySelection({
            startIndex: SelectionManage.parseSelection(fSelections[p] as Selection).startIndex,
            endIndex: SelectionManage.parseSelection(fSelections[q - 1] as Selection).endIndex,
          })
          rOptions.font[newSelection] = {
            ...rOptions.font[fSelections[p] as Selection],
            characterWidth: characterWidths,
          }
          delete rOptions.font[fSelections[p] as Selection]
        }
      }
    }

    return options
  }
  computeSelectionBoxes(_options: RenderTextOptions): Box[] {
    const options = structuredClone(_options)
    const selection = SelectionManage.parseSelection(options.selection)
    //根据selection计算selectionBoxs
    const selectionBoxes: Box[] = []

    if (SelectionManage.isZeroSelection(selection)) {
      const relativeLocation = this.selection2RelativeLocation(options, options.selection)[0]
      const fOptions = this.getFontOptionByindex(options, selection.startIndex)!

      const interBoxLocation: Point = {
        ...relativeLocation,
        y: relativeLocation.y + fOptions.fontSize * 1.2 * (options.Leading - 1),
      }
      const interBoxSize: Size = {
        width: 1,
        height: fOptions.fontSize * 1.2,
      }
      const interBoxPath = generateBoxPath(interBoxLocation, interBoxSize)
      selectionBoxes.push({
        size: interBoxSize,
        location: interBoxLocation,
        path: interBoxPath,
      })
    } else {
      for (const [pSelection, paragrahOptions] of Object.entries(options.paragrahs)) {
        const pSelObj = SelectionManage.parseSelection(pSelection as Selection)
        if (SelectionManage.isOverlap(selection, pSelObj)) {
          for (const [rSelection, rowOptions] of Object.entries(paragrahOptions.rows)) {
            const rSelObj = SelectionManage.parseSelection(rSelection as Selection)
            if (SelectionManage.isOverlap(selection, rSelObj)) {
              const interSelection = SelectionManage.intersect(selection, rSelObj)!
              const interSelectionLocation = this.selection2RelativeLocation(
                options,
                SelectionManage.stringifySelection(interSelection),
              )
              const interBoxLocation: Point = {
                x: interSelectionLocation[0].x,
                y: interSelectionLocation[0].y,
                w: 1,
              }
              const interBoxSize: Size = {
                width: interSelectionLocation[1].x - interSelectionLocation[0].x,
                height: rowOptions.contentBox.size.height,
              }
              const interBoxPath: Path = generateBoxPath(interBoxLocation, interBoxSize)
              selectionBoxes.push({
                size: interBoxSize,
                location: interBoxLocation,
                path: interBoxPath,
              })
            }
          }
        }
      }
    }
    return selectionBoxes
  }
  modifyTextContentLocation(node: TextNode): RenderTextOptions {
    //根据对齐方式计算文本内容的起点:相对节点内容盒的偏移
    const contentSize = node.structure.contentBox.size
    const options = structuredClone(node.options)
    const alignment = options.align
    //水平/垂直坐标(相对于父盒子的偏移)
    switch (alignment.horizontal) {
      case HorAlign.LEFT:
        options.contentBox.location.x = 0

        for (const paragraphOptions of Object.values(options.paragrahs)) {
          paragraphOptions.contentBox.location.x = 0
          for (const rowOptions of Object.values(paragraphOptions.rows)) {
            rowOptions.contentBox.location.x = 0
          }
        }
        break
      case HorAlign.JUSTIFY:
        //文本框将节点框撑大
        options.contentBox.location.x = 0
        options.contentBox.size.width = contentSize.width
        for (const paragraphOptions of Object.values(options.paragrahs)) {
          paragraphOptions.contentBox.location.x = 0
          paragraphOptions.contentBox.size.width = contentSize.width
          for (const [rowSelection, rowOptions] of Object.entries(paragraphOptions.rows)) {
            const rowContentBox = rowOptions.contentBox
            const { startIndex, endIndex } = SelectionManage.parseSelection(rowSelection as Selection)
            const characterLength = endIndex - startIndex
            const spareWidthPerCharacter = (contentSize.width - rowContentBox.size.width) / characterLength
            for (const fontOptions of Object.values(rowOptions.font)) {
              fontOptions.characterWidth = fontOptions.characterWidth.map((w) => (w += spareWidthPerCharacter)) //在这里直接加，每次渲染都需要重新根据option计算字符宽度，不会累计
            }
            rowOptions.contentBox.size.width = contentSize.width
            rowOptions.contentBox.location.x = 0
          }
        }
        break
      case HorAlign.CENTER:
        options.contentBox.location.x = (contentSize.width - options.contentBox.size.width) / 2
        for (const paragrahOptions of Object.values(options.paragrahs)) {
          paragrahOptions.contentBox.location.x =
            (options.contentBox.size.width - paragrahOptions.contentBox.size.width) / 2
          for (const rowOptions of Object.values(paragrahOptions.rows)) {
            rowOptions.contentBox.location.x =
              (paragrahOptions.contentBox.size.width - rowOptions.contentBox.size.width) / 2
          }
        }
        break
      case HorAlign.RIGHT:
        options.contentBox.location.x = contentSize.width - options.contentBox.size.width
        for (const paragrahOptions of Object.values(options.paragrahs)) {
          paragrahOptions.contentBox.location.x = options.contentBox.size.width - paragrahOptions.contentBox.size.width
          for (const rowOptions of Object.values(paragrahOptions.rows)) {
            rowOptions.contentBox.location.x = paragrahOptions.contentBox.size.width - rowOptions.contentBox.size.width
          }
        }
        break
    }
    switch (alignment.vertical) {
      case VerAlign.TOP:
        {
          options.contentBox.location.y = 0
          let accParaHeight = 0
          for (const paragrahOptions of Object.values(options.paragrahs)) {
            paragrahOptions.contentBox.location.y = accParaHeight
            let accRowHeight = 0
            for (const rowOptions of Object.values(paragrahOptions.rows)) {
              rowOptions.contentBox.location.y = accRowHeight
              accRowHeight += rowOptions.contentBox.size.height
            }
            accParaHeight += paragrahOptions.contentBox.size.height
          }
        }
        break
      case VerAlign.MIDDLE:
        {
          options.contentBox.location.y = (contentSize.height - options.contentBox.size.height) / 2
          let accParaHeight = 0
          for (const paragrahOptions of Object.values(options.paragrahs)) {
            paragrahOptions.contentBox.location.y = accParaHeight
            let accRowHeight = 0
            for (const rowOptions of Object.values(paragrahOptions.rows)) {
              rowOptions.contentBox.location.y = accRowHeight
              accRowHeight += rowOptions.contentBox.size.height
            }
            accParaHeight += paragrahOptions.contentBox.size.height
          }
        }
        break
      case VerAlign.BOTTOM:
        {
          options.contentBox.location.y = contentSize.height - options.contentBox.size.height
          let accParaHeight = 0
          for (const paragrahOptions of Object.values(options.paragrahs)) {
            paragrahOptions.contentBox.location.y = accParaHeight
            let accRowHeight = 0
            for (const rowOptions of Object.values(paragrahOptions.rows)) {
              rowOptions.contentBox.location.y = accRowHeight
              accRowHeight += rowOptions.contentBox.size.height
            }
            accParaHeight += paragrahOptions.contentBox.size.height
          }
        }
        break
    }

    return options
  }
  combineRows(_options: RenderTextOptions): RenderTextOptions {
    const options = structuredClone(_options)
    for (const [pSelection, pOptions] of Object.entries(options.paragrahs)) {
      let fRange: Range<FontOptions> | undefined
      for (const rOptions of Object.values(pOptions.rows)) {
        fRange = fRange ? this.mergeRange(fRange, rOptions.font) : structuredClone(rOptions.font)
      }
      options.paragrahs[pSelection as Selection] = {
        contentBox: {
          size: { width: 0, height: 0 },
          location: { x: 0, y: 0, w: 1 },
        },
        preGap: 0,
        postGap: 0,
        paragrahIndex: pOptions.paragrahIndex,
        rows: {
          [pSelection]: {
            font: fRange,
            contentBox: {
              size: { width: 0, height: 0 },
              location: { x: 0, y: 0, w: 1 },
            },
            rowIndex: pOptions.paragrahIndex,
          } as RowOptions,
        },
      }
    }
    return options
  }
  modifyOptionsSize(_options: RenderTextOptions, content: string): RenderTextOptions {
    const options = structuredClone(_options)
    const { paragrahs, Leading, rowsIndex, paragrahsIndex } = options

    const heightPerParagrah: number[] = Array.from({ length: paragrahsIndex.length }, () => 0)
    const widthPerParagrah: number[] = Array.from({ length: paragrahsIndex.length }, () => 0)
    const heightPerRow: number[] = Array.from({ length: rowsIndex.length }, () => 0) //每一行的最大字体高度
    const widthPerRow: number[] = Array.from({ length: rowsIndex.length }, () => 0) //每一行的宽度

    let maxCharacterWidth = -Infinity //缩放时确定的最小宽度为最大字符宽度

    for (const { rows, paragrahIndex, contentBox, preGap, postGap } of Object.values(paragrahs)) {
      for (const { font, rowIndex, contentBox } of Object.values(rows)) {
        for (const [subRange, fontOptions] of Object.entries(font)) {
          //计算每行的高度，由最大的字高决定（1.2为默认在行框上下有10%行高大小的间隔，不可变）
          heightPerRow[rowIndex] = Math.max(heightPerRow[rowIndex], fontOptions.fontSize * Leading * 1.2)

          const { startIndex, endIndex } = SelectionManage.parseSelection(subRange as Selection)
          fontOptions.characterWidth = []
          //获取每个字符的宽度（如果只计算一个字符宽度会造成英文和中文宽度不一致的情况还是用的统一宽度，导致文字坍塌）
          //考虑字符间距和空格的计算
          for (let i = startIndex; i < endIndex; i++) {
            const characterWidth = this.computeCharacterWidth(content[i], fontOptions)
            fontOptions.characterWidth[i - startIndex] = characterWidth
            widthPerRow[rowIndex] += characterWidth
            maxCharacterWidth = Math.max(maxCharacterWidth, characterWidth)
          }
        }
        contentBox.size.width = widthPerRow[rowIndex]
        contentBox.size.height = heightPerRow[rowIndex]
        widthPerParagrah[paragrahIndex] = Math.max(widthPerParagrah[paragrahIndex], widthPerRow[rowIndex])
        heightPerParagrah[paragrahIndex] += heightPerRow[rowIndex]
      }
      contentBox.size.width = widthPerParagrah[paragrahIndex]
      contentBox.size.height = heightPerParagrah[paragrahIndex] + preGap + postGap
    }

    options.minContentWidth = maxCharacterWidth
    options.contentBox.size.height = heightPerParagrah.reduce((pre, cur) => pre + cur)
    options.contentBox.size.width = Math.max(...widthPerParagrah)
    return options
  }
  modifyOptions(options: RenderTextOptions, oldSelection: SelectionObj, input: string): void {
    const inputCacheLength = input.length
    const deleteLength = oldSelection.endIndex - oldSelection.startIndex
    const isSelectAll = oldSelection.startIndex === 0 && oldSelection.endIndex === this.getLastFontIndex(options)

    /** -----------------------------------------------------
     *                     1、删除后的映射表                 -
     -------------------------------------------------------*/
    const pSelectionMap: { [sel: Selection]: Selection[] } = {}
    const rSelectionMap: { [sel: Selection]: Selection[] } = {}

    for (const pSelection of options.paragrahsIndex.values()) {
      const psObj = SelectionManage.parseSelection(pSelection)
      //获取删除后区间的映射表
      if (SelectionManage.isOverlap(psObj, oldSelection)) {
        const differenceSelections = SelectionManage.difference(psObj, oldSelection) || [
          {
            startIndex: Infinity,
            endIndex: Infinity,
          } as SelectionObj,
        ]

        pSelectionMap[pSelection] = differenceSelections.map((differenceSelection) =>
          SelectionManage.stringifySelection(differenceSelection),
        )
      } else {
        pSelectionMap[pSelection] = [pSelection]
      }
    }

    for (const rSelection of options.rowsIndex) {
      const rsObj = SelectionManage.parseSelection(rSelection)
      if (SelectionManage.isOverlap(rsObj, oldSelection)) {
        const differenceSelections = SelectionManage.difference(rsObj, oldSelection) || [
          {
            startIndex: Infinity,
            endIndex: Infinity,
          } as SelectionObj,
        ]
        rSelectionMap[rSelection] = differenceSelections.map((differenceSelection) =>
          SelectionManage.stringifySelection(differenceSelection),
        )
      } else {
        rSelectionMap[rSelection] = [rSelection]
      }
    }
    const pCombinedMap = Object.fromEntries(
      Object.entries(pSelectionMap).filter((item) => new Set([item[0], item[1][0]]).size === 2),
    )
    const actKeys = Object.keys(pCombinedMap).filter(
      (p) => pCombinedMap[p][0] != (`${Infinity}-${Infinity}` as Selection),
    ) as Selection[]
    const pCombinedSet: Selection[] = actKeys.length === 2 ? actKeys : []

    /** -----------------------------------------------------
    *                     1*:如果删除所有内容                -
    -------------------------------------------------------*/
    if (isSelectAll) {
      pSelectionMap[options.paragrahsIndex[0]] = ['0-0']
      rSelectionMap[options.rowsIndex[0]] = ['0-0']
    }

    /** -----------------------------------------------------
    *                     2:将输入序列加入映射表中            -
    -------------------------------------------------------*/
    for (const pSelection of options.paragrahsIndex) {
      const pSelObj = SelectionManage.parseSelection(pSelection)
      pSelectionMap[pSelection] = [
        SelectionManage.stringifySelection(
          SelectionManage.merge(...pSelectionMap[pSelection].map((s) => SelectionManage.parseSelection(s))),
        ),
      ]
      //如果当前序列收到了影响
      if (
        pSelObj.endIndex >= oldSelection.startIndex &&
        pSelectionMap[pSelection][0] != (`${Infinity}-${Infinity}` as Selection)
      ) {
        let offset
        //选区和段落右相交或者右外切
        if (
          (SelectionManage.isExterior(pSelObj, oldSelection) && pSelObj.startIndex === oldSelection.endIndex) ||
          (SelectionManage.isOverlap(pSelObj, oldSelection) &&
            !SelectionManage.isContained(pSelObj, oldSelection) &&
            pSelObj.endIndex > oldSelection.endIndex &&
            oldSelection.startIndex <= pSelObj.startIndex)
        ) {
          offset = [
            oldSelection.startIndex === 0 ? -deleteLength : inputCacheLength - deleteLength,
            inputCacheLength - deleteLength,
          ]
        }
        //选区在段落左边且不相交也不外切
        else if (pSelObj.startIndex > oldSelection.endIndex) {
          offset = [inputCacheLength - deleteLength, inputCacheLength - deleteLength]
        }
        //选区和段落左相切，左相交，包含于
        else {
          offset = [0, inputCacheLength]
        }
        pSelectionMap[pSelection] = [
          SelectionManage.stringifySelection(
            SelectionManage.offsetSelection(SelectionManage.parseSelection(pSelectionMap[pSelection][0]), offset),
          ),
        ]
      }
      const toChangedParaIndex = options.paragrahsIndex.findIndex((p) => p === pSelection)
      options.paragrahsIndex[toChangedParaIndex] = pSelectionMap[pSelection][0]
    }
    options.paragrahsIndex = options.paragrahsIndex.filter((p) => p != (`${Infinity}-${Infinity}` as Selection))

    for (const rSelection of options.rowsIndex) {
      const rSelObj = SelectionManage.parseSelection(rSelection)
      rSelectionMap[rSelection] = [
        SelectionManage.stringifySelection(
          SelectionManage.merge(...rSelectionMap[rSelection].map((s) => SelectionManage.parseSelection(s))),
        ),
      ]
      if (rSelObj.endIndex >= oldSelection.startIndex) {
        let offset
        if (
          (SelectionManage.isExterior(rSelObj, oldSelection) && rSelObj.startIndex === oldSelection.endIndex) ||
          (SelectionManage.isOverlap(rSelObj, oldSelection) &&
            !SelectionManage.isContained(rSelObj, oldSelection) &&
            rSelObj.endIndex > oldSelection.endIndex &&
            oldSelection.startIndex <= rSelObj.startIndex)
        ) {
          offset = [
            oldSelection.startIndex === 0 ? -deleteLength : inputCacheLength - deleteLength,
            inputCacheLength - deleteLength,
          ]
        } else if (rSelObj.startIndex > oldSelection.endIndex) {
          offset = [inputCacheLength - deleteLength, inputCacheLength - deleteLength]
        } else {
          offset = [0, inputCacheLength]
        }
        rSelectionMap[rSelection] = [
          SelectionManage.stringifySelection(
            SelectionManage.offsetSelection(SelectionManage.parseSelection(rSelectionMap[rSelection][0]), offset),
          ),
        ]
      }
      const toChangedRowIndex = options.rowsIndex.findIndex((r) => r === rSelection)
      options.rowsIndex[toChangedRowIndex] = rSelectionMap[rSelection][0]
    }
    options.rowsIndex = options.rowsIndex.filter((r) => r != (`${Infinity}-${Infinity}` as Selection))

    /** -----------------------------------------------------
    *                     3:更新段落（先加后删)               -
    --------------------------------------------------------*/
    for (const [pSelection, pOptions] of Object.entries(options.paragrahs)) {
      if (
        pSelectionMap[pSelection as Selection][0] != (`${Infinity}-${Infinity}` as Selection) &&
        !pCombinedSet.includes(pSelection as Selection)
      ) {
        options.paragrahs[pSelectionMap[pSelection as Selection][0] as Selection] = {
          ...pOptions,
          paragrahIndex: options.paragrahsIndex.findIndex((p) => p === pSelectionMap[pSelection as Selection][0]),
        }
      } else if (pCombinedSet.findIndex((p) => p === pSelection) === 1) {
        const curOption = pOptions
        const lastOption = options.paragrahs[pCombinedSet[0] as Selection]
        const mergedSelection = SelectionManage.stringifySelection(
          SelectionManage.merge(
            ...pCombinedSet.map((p) => pSelectionMap[p][0]).map((p) => SelectionManage.parseSelection(p)),
          ),
        )
        const curIndex = options.paragrahsIndex.findIndex((p) => p === pSelectionMap[pCombinedSet[0]][0])
        options.paragrahsIndex.splice(curIndex, 2, mergedSelection)

        options.paragrahs[mergedSelection] = {
          ...lastOption,
          rows: {
            ...lastOption.rows,
            ...curOption.rows,
          },
        }
      }
    }
    Object.keys(pSelectionMap).forEach((p) => {
      if (
        !SelectionManage.isSameSelection(
          SelectionManage.parseSelection(p as Selection),
          SelectionManage.parseSelection(pSelectionMap[p as Selection][0]),
        )
      ) {
        delete options.paragrahs[p as Selection]
      }
    })

    /** -----------------------------------------------------
            *                     4:更新行区间                             -
            -------------------------------------------------------*/
    for (const pOptions of Object.values(options.paragrahs)) {
      for (const [rSelection, rOptions] of Object.entries(pOptions.rows)) {
        delete pOptions.rows[rSelection as Selection]
        if (rSelectionMap[rSelection as Selection][0] != (`${Infinity}-${Infinity}` as Selection)) {
          pOptions.rows[rSelectionMap[rSelection as Selection][0]] = {
            ...rOptions,
            rowIndex: options.rowsIndex.findIndex((r) => r === rSelectionMap[rSelection as Selection][0]),
          }
        }
      }
    }
    /** -----------------------------------------------------
            *                     5:更新字体区间                     -
            -------------------------------------------------------*/

    font: for (const pOptions of Object.values(options.paragrahs)) {
      for (const rOptions of Object.values(pOptions.rows)) {
        for (const [fSelection, fOptions] of Object.entries(rOptions.font)) {
          const fSeObj = SelectionManage.parseSelection(fSelection as Selection)

          if (isSelectAll) {
            options.paragrahs[options.paragrahsIndex[0]].rows[options.rowsIndex[0]].font = {
              [SelectionManage.stringifySelection({ startIndex: 0, endIndex: inputCacheLength })]: { ...fOptions },
            }
            break font
          }

          if (fSeObj.endIndex >= oldSelection.startIndex) {
            delete rOptions.font[fSelection as Selection]
            const diffSelection = SelectionManage.difference(fSeObj, oldSelection)
            if (oldSelection.startIndex === 0) {
              if (diffSelection && diffSelection.length === 1) {
                if (diffSelection[0].startIndex === oldSelection.endIndex) {
                  rOptions.font[`${0}-${inputCacheLength}`] = { ...fOptions }
                  rOptions.font[
                    SelectionManage.stringifySelection(
                      SelectionManage.offsetSelection(diffSelection[0], [
                        inputCacheLength - deleteLength,
                        inputCacheLength - deleteLength,
                      ]),
                    )
                  ] = { ...fOptions }
                } else {
                  const newSelection = SelectionManage.stringifySelection(
                    SelectionManage.offsetSelection(diffSelection[0], [
                      inputCacheLength - deleteLength,
                      inputCacheLength - deleteLength,
                    ]),
                  )
                  rOptions.font[newSelection] = { ...fOptions }
                }
              }
            } else {
              if (diffSelection && diffSelection.length === 2) {
                const newSelection = SelectionManage.stringifySelection(
                  SelectionManage.offsetSelection(SelectionManage.merge(...diffSelection), [0, inputCacheLength]),
                )
                rOptions.font[newSelection] = { ...fOptions }
              } else if (diffSelection && diffSelection.length === 1) {
                if (diffSelection[0].endIndex === oldSelection.startIndex) {
                  const newSelection = SelectionManage.stringifySelection(
                    SelectionManage.offsetSelection(diffSelection[0], [0, inputCacheLength]),
                  )
                  rOptions.font[newSelection] = { ...fOptions }
                } else {
                  const newSelection = SelectionManage.stringifySelection(
                    SelectionManage.offsetSelection(diffSelection[0], [
                      inputCacheLength - deleteLength,
                      inputCacheLength - deleteLength,
                    ]),
                  )
                  rOptions.font[newSelection] = { ...fOptions }
                }
              }
            }
          }
        }
      }
    }
  }
  /**
   * @description 边框重叠处容易出错(根源在于计算叉乘时，是用向量计算而不是用线段计算，超出线段也会认为在线上)
   */
  relativeLocation2Index(node: TextNode, locationInTC: Point): number {
    const options = node.options
    const textContentBox = options.contentBox
    const indexOfCursorLocation: number = 0
    const pLength = options.paragrahsIndex.length //文本段落数
    const rLength = options.rowsIndex.length // 文本行数
    for (const pOptions of Object.values(options.paragrahs)) {
      //将相应区域扩散到节点框边界
      const diffusionPLocation: Point = {
        x: 0,
        y: pOptions.paragrahIndex === 0 ? 0 : textContentBox.location.y + pOptions.contentBox.location.y,
        w: 1,
      }
      const diffusionPSize = {
        width: node.structure.contentBox.size.width,
        height:
          pOptions.paragrahIndex === 0
            ? textContentBox.location.y + pOptions.contentBox.location.y + pOptions.contentBox.size.height
            : pOptions.paragrahIndex === pLength - 1
              ? node.structure.contentBox.size.height - textContentBox.location.y - pOptions.contentBox.location.y
              : pOptions.contentBox.size.height,
      }
      const diffusionPPath = generateBoxPath(diffusionPLocation, diffusionPSize)

      if (
        isPointInPath(locationInTC, diffusionPPath) ||
        (isPointOnPath(locationInTC, diffusionPPath) && locationInTC.y != diffusionPLocation.y + diffusionPSize.height)
      ) {
        for (const [rSelection, rOptions] of Object.entries(pOptions.rows)) {
          const diffusionRLocation: Point = {
            x: 0,
            y:
              rOptions.rowIndex == 0
                ? 0
                : textContentBox.location.y + pOptions.contentBox.location.y + rOptions.contentBox.location.y,
            w: 1,
          }
          const diffusionRSize = {
            width: node.structure.contentBox.size.width,
            height:
              rOptions.rowIndex == 0
                ? textContentBox.location.y +
                  pOptions.contentBox.location.y +
                  rOptions.contentBox.location.y +
                  rOptions.contentBox.size.height
                : rOptions.rowIndex == rLength - 1
                  ? node.structure.contentBox.size.height -
                    textContentBox.location.y -
                    pOptions.contentBox.location.y -
                    rOptions.contentBox.location.y
                  : rOptions.contentBox.size.height,
          }
          const diffusionRPath = generateBoxPath(diffusionRLocation, diffusionRSize)

          if (
            isPointInPath(locationInTC, diffusionRPath) ||
            (isPointOnPath(locationInTC, diffusionRPath) &&
              locationInTC.y != diffusionRLocation.y + diffusionRSize.height)
          ) {
            //去除掉左侧空白部分（后续可能会再加上装饰节点宽度）
            let walkedWidth =
              textContentBox.location.x + pOptions.contentBox.location.x + rOptions.contentBox.location.x

            //如果超过了实际行宽
            if (locationInTC.x > walkedWidth + rOptions.contentBox.size.width) {
              return SelectionManage.parseSelection(rSelection as Selection).endIndex
            }

            //点击了行内
            for (const [fselection, fOptions] of Object.entries(rOptions.font)) {
              const { startIndex, endIndex } = SelectionManage.parseSelection(fselection as Selection)
              for (let i = startIndex; i < endIndex; i++) {
                const restWidth = locationInTC.x - walkedWidth
                const characterWidth = fOptions.characterWidth[i - startIndex]

                if (restWidth < characterWidth) {
                  return restWidth <= characterWidth / 2 ? i : i + 1
                } else {
                  walkedWidth += characterWidth
                }
              }
            }
          }
        }
      }
    }
    return indexOfCursorLocation
  }
  relativeLocation2PIndex(node: TextNode, locationInTC: Point): number {
    const options = node.options
    const textContentBox = options.contentBox
    let pIndexofCursorLocation: number = 0
    const pLength = options.paragrahsIndex.length

    for (const [pSelection, pOptions] of Object.entries(options.paragrahs)) {
      //将相应区域扩散到节点框边界
      const diffusionPLocation: Point = {
        x: 0,
        y: pOptions.paragrahIndex == 0 ? 0 : textContentBox.location.y + pOptions.contentBox.location.y,
        w: 1,
      }
      const diffusionPSize = {
        width: node.structure.contentBox.size.width,
        height:
          pOptions.paragrahIndex == 0
            ? textContentBox.location.y + pOptions.contentBox.location.y + pOptions.contentBox.size.height
            : pOptions.paragrahIndex == pLength - 1
              ? node.structure.contentBox.size.height - textContentBox.location.y - pOptions.contentBox.location.y
              : pOptions.contentBox.size.height,
      }
      const diffusionPath = generateBoxPath(diffusionPLocation, diffusionPSize)
      if (isPointInPath(locationInTC, diffusionPath) || isPointOnPath(locationInTC, diffusionPath)) {
        pIndexofCursorLocation = options.paragrahsIndex.findIndex((p) => pSelection === p)
      }
    }
    return pIndexofCursorLocation
  }
  selection2RelativeLocation(options: RenderTextOptions, selection: Selection): Point[] {
    const selectionObj = SelectionManage.parseSelection(selection)

    let startIndexRSelection

    let endIndexRSelection
    if (SelectionManage.isZeroSelection(selectionObj)) {
      endIndexRSelection = startIndexRSelection = options.rowsIndex.find((ps) =>
        SelectionManage.isContained(selectionObj, SelectionManage.parseSelection(ps)),
      )
    } else {
      startIndexRSelection = options.rowsIndex.findLast((ps) =>
        SelectionManage.isContained(
          { startIndex: selectionObj.startIndex, endIndex: selectionObj.startIndex },
          SelectionManage.parseSelection(ps),
        ),
      )

      endIndexRSelection = options.rowsIndex.find((ps) =>
        SelectionManage.isContained(
          { startIndex: selectionObj.endIndex, endIndex: selectionObj.endIndex },
          SelectionManage.parseSelection(ps),
        ),
      )
    }

    if (!startIndexRSelection || !endIndexRSelection) {
      throw new Error(`selection:${selectionObj.startIndex}-${selectionObj.endIndex} 不在任何区间内`)
    }

    let startIndexXOffsetInRow = 0
    let startIndexYOffsetInRow = 0

    seek: for (const pOptions of Object.values(options.paragrahs)) {
      for (const [rSelection, rOptions] of Object.entries(pOptions.rows)) {
        if (rSelection === startIndexRSelection) {
          startIndexXOffsetInRow +=
            options.contentBox.location.x + pOptions.contentBox.location.x + rOptions.contentBox.location.x
          for (const [fSelection, fOptions] of Object.entries(rOptions.font)) {
            const { startIndex, endIndex } = SelectionManage.parseSelection(fSelection as Selection)
            for (let i = startIndex; i < endIndex; i++) {
              if (i < selectionObj.startIndex) {
                startIndexXOffsetInRow += fOptions.characterWidth[i - startIndex]
              }
            }
          }
          break seek
        }
        startIndexYOffsetInRow += rOptions.contentBox.size.height
      }
    }

    let endIndexXOffsetInRow = 0
    let endIndexYOffsetInRow = 0

    seek: for (const pOptions of Object.values(options.paragrahs)) {
      for (const [rSelection, rOptions] of Object.entries(pOptions.rows)) {
        if (rSelection === endIndexRSelection) {
          endIndexXOffsetInRow +=
            options.contentBox.location.x + pOptions.contentBox.location.x + rOptions.contentBox.location.x
          for (const [fSelection, fOptions] of Object.entries(rOptions.font)) {
            const { startIndex, endIndex } = SelectionManage.parseSelection(fSelection as Selection)
            for (let i = startIndex; i < endIndex; i++) {
              if (i < selectionObj.endIndex) {
                endIndexXOffsetInRow += fOptions.characterWidth[i - startIndex]
              }
            }
          }
          break seek
        }

        endIndexYOffsetInRow += rOptions.contentBox.size.height
      }
    }

    return [
      {
        x: startIndexXOffsetInRow,
        y: options.contentBox.location.y + startIndexYOffsetInRow,
        w: 1,
      },
      {
        x: endIndexXOffsetInRow,
        y: options.contentBox.location.y + endIndexYOffsetInRow,
        w: 1,
      },
    ]
  }

  computeCharacterWidth(character: string, fontOptions: FontOptions): number {
    this.ctx.font = `${fontOptions.fontSize}px ${fontOptions.fontFamily} ${fontOptions.italicly ? 'italic' : 'normal'} ${fontOptions.fontWeight}`
    const { actualBoundingBoxRight: right, actualBoundingBoxLeft: left } = this.ctx.measureText(character)
    //字符宽度=测量值+左右两侧的边距（默认存在不可更改）；增加的字符间距增加在字符末尾（分散对齐时也将剩余间距加在字符末尾）
    //空格的宽度：实际测量ppt中为18 / 60，12 / 40；（空格像素/字体高度）
    return (
      (right + left || fontOptions.fontSize * 0.3) + fontOptions.letterSpace + Math.floor(fontOptions.fontSize / 10)
    )
  }
  getLastFontIndex(options: RenderTextOptions): number {
    const pLength = options.paragrahsIndex.length
    const lastSelection = SelectionManage.parseSelection(options.paragrahsIndex[pLength - 1])
    return lastSelection.endIndex
  }
  getLastFont(options: RenderTextOptions): FontOptions {
    const i = this.getLastFontIndex(options)
    return this.getFontOptionByindex(options, i)!
  }
  getFontOptionByindex(options: RenderTextOptions, index: number): FontOptions | undefined {
    const selectionObj = SelectionManage.parseSelection(`${index}-${index}`)

    const pSelection = options.paragrahsIndex.find((ps) =>
      SelectionManage.isContained(selectionObj, SelectionManage.parseSelection(ps)),
    )
    const rSelection = options.rowsIndex.find((ps) =>
      SelectionManage.isContained(selectionObj, SelectionManage.parseSelection(ps)),
    )
    if (!pSelection || !rSelection) {
      throw new Error(`selection:${selectionObj.startIndex}-${selectionObj.endIndex} 不在任何区间内`)
    }

    for (const [fSelection, fOptions] of Object.entries(options.paragrahs[pSelection].rows[rSelection].font)) {
      const { startIndex, endIndex } = SelectionManage.parseSelection(fSelection as Selection)

      for (let i = startIndex; i <= endIndex; i++) {
        if (i === index) {
          return fOptions
        }
      }
    }
  }
  getArrowCursorSelection(
    options: RenderTextOptions,
    arrowKeys: ArrowKeys | ComposingArrowKeys,
    direction: number,
  ): SelectionObj {
    const selectionObj = SelectionManage.parseSelection(options.selection)
    const isZeroSelection = SelectionManage.isZeroSelection(selectionObj)
    //当前选中区间需要变更的索引
    const selectionTerminal = direction >= 0 ? selectionObj.endIndex : selectionObj.startIndex
    const staticIndex = direction >= 0 ? selectionObj.startIndex : selectionObj.endIndex

    //该文本节点的最大文字索引值
    const maxSelectionIndex = SelectionManage.parseSelection(options.rowsIndex[options.rowsIndex.length - 1]).endIndex
    //获取当前行索引
    const curRowSelectionIndex = options.rowsIndex.findIndex((r) => {
      const rowSlectionObj = SelectionManage.parseSelection(r)
      return (
        (rowSlectionObj.startIndex <= selectionTerminal && rowSlectionObj.endIndex > selectionTerminal) ||
        (selectionTerminal === maxSelectionIndex && rowSlectionObj.endIndex === maxSelectionIndex)
      )
    })
    //当前行区间
    const curRowSelection = SelectionManage.parseSelection(options.rowsIndex[curRowSelectionIndex])
    //当前行长度
    const curRowLength = curRowSelection.endIndex - curRowSelection.startIndex
    let newSelection: SelectionObj = selectionObj
    switch (arrowKeys) {
      case ArrowKeys.ARROWRIGHT: {
        const nextTerminalIndex = isZeroSelection
          ? Math.min(maxSelectionIndex, selectionTerminal + 1)
          : selectionObj.endIndex
        newSelection = {
          startIndex: nextTerminalIndex,
          endIndex: nextTerminalIndex,
        }
        break
      }
      case ArrowKeys.ARROWDOWN: {
        if (isZeroSelection) {
          let nextTerminalIndex
          const nextRowSelectionIndex = Math.min(options.rowsIndex.length - 1, curRowSelectionIndex + 1)
          if (nextRowSelectionIndex != curRowSelectionIndex) {
            const nextRowSelection = SelectionManage.parseSelection(options.rowsIndex[nextRowSelectionIndex])
            const nextRowLength = nextRowSelection.endIndex - nextRowSelection.startIndex
            const terminalPercent = (selectionTerminal - curRowSelection.startIndex) / curRowLength
            nextTerminalIndex = nextRowSelection.startIndex + Math.floor(nextRowLength * terminalPercent)
          } else {
            nextTerminalIndex = curRowSelection.endIndex
          }

          newSelection = {
            startIndex: nextTerminalIndex,
            endIndex: nextTerminalIndex,
          }
        }

        break
      }
      case ArrowKeys.ARROWLEFT: {
        const nextTerminalIndex = isZeroSelection ? Math.max(0, selectionTerminal - 1) : selectionObj.startIndex
        newSelection = {
          startIndex: nextTerminalIndex,
          endIndex: nextTerminalIndex,
        }
        break
      }
      case ArrowKeys.ARROWUP: {
        if (isZeroSelection) {
          const nextRowSelectionIndex = Math.max(0, curRowSelectionIndex - 1)
          let nextTerminalIndex
          if (nextRowSelectionIndex != curRowSelectionIndex) {
            const nextRowSelection = SelectionManage.parseSelection(options.rowsIndex[nextRowSelectionIndex])
            const nextRowLength = nextRowSelection.endIndex - nextRowSelection.startIndex
            const terminalPercent = (selectionTerminal - curRowSelection.startIndex) / curRowLength
            nextTerminalIndex = nextRowSelection.startIndex + Math.floor(nextRowLength * terminalPercent)
          } else {
            nextTerminalIndex = curRowSelection.startIndex
          }
          newSelection = {
            startIndex: nextTerminalIndex,
            endIndex: nextTerminalIndex,
          }
        }
        break
      }
      case ComposingArrowKeys.SELECTION_UP: {
        const nextRowSelectionIndex = Math.max(0, curRowSelectionIndex - 1)
        let nextTerminalIndex
        if (nextRowSelectionIndex != curRowSelectionIndex) {
          const nextRowSelection = SelectionManage.parseSelection(options.rowsIndex[nextRowSelectionIndex])
          const nextRowLength = nextRowSelection.endIndex - nextRowSelection.startIndex
          const terminalPercent = (selectionTerminal - curRowSelection.startIndex) / curRowLength
          nextTerminalIndex = nextRowSelection.startIndex + Math.floor(nextRowLength * terminalPercent)
        } else {
          nextTerminalIndex = curRowSelection.startIndex
        }
        newSelection = {
          startIndex: Math.min(staticIndex, nextTerminalIndex),
          endIndex: Math.max(staticIndex, nextTerminalIndex),
        }

        break
      }
      case ComposingArrowKeys.SELECTION_DOWN: {
        let nextTerminalIndex
        const nextRowSelectionIndex = Math.min(options.rowsIndex.length - 1, curRowSelectionIndex + 1)
        if (nextRowSelectionIndex != curRowSelectionIndex) {
          const nextRowSelection = SelectionManage.parseSelection(options.rowsIndex[nextRowSelectionIndex])
          const nextRowLength = nextRowSelection.endIndex - nextRowSelection.startIndex
          const terminalPercent = (selectionTerminal - curRowSelection.startIndex) / curRowLength
          nextTerminalIndex = nextRowSelection.startIndex + Math.floor(nextRowLength * terminalPercent)
        } else {
          nextTerminalIndex = curRowSelection.endIndex
        }
        newSelection = {
          startIndex: Math.min(staticIndex, nextTerminalIndex),
          endIndex: Math.max(staticIndex, nextTerminalIndex),
        }
        break
      }
      case ComposingArrowKeys.SELECTION_LEFT: {
        const nextTerminalIndex = Math.max(0, selectionTerminal - 1)
        newSelection = {
          startIndex: Math.min(staticIndex, nextTerminalIndex),
          endIndex: Math.max(staticIndex, nextTerminalIndex),
        }

        break
      }
      case ComposingArrowKeys.SELECTION_RIGHT: {
        const nextTerminalIndex = Math.min(maxSelectionIndex, selectionTerminal + 1)
        newSelection = {
          startIndex: Math.min(staticIndex, nextTerminalIndex),
          endIndex: Math.max(staticIndex, nextTerminalIndex),
        }
        break
      }
    }
    return newSelection
  }
  mergeRange(preRange: Range<FontOptions>, _curRange: Range<FontOptions>): Range<FontOptions> {
    const curRange = structuredClone(_curRange)
    const preSelection = SelectionManage.toSortedSelection(Object.keys(preRange) as Selection[])
    const preLastSelection = preSelection[preSelection.length - 1] as Selection
    const curSelection = SelectionManage.toSortedSelection(Object.keys(curRange) as Selection[])
    const curFirstSelection = curSelection[0] as Selection

    const preLastFontOptions = preRange[preLastSelection]
    const curFirstFontOptions = curRange[curFirstSelection]

    let newRange = {}
    if (JSON.stringify(preLastFontOptions) == JSON.stringify(curFirstFontOptions)) {
      const newSelection = SelectionManage.stringifySelection({
        startIndex: SelectionManage.parseSelection(preLastSelection).startIndex,
        endIndex: SelectionManage.parseSelection(curFirstSelection).endIndex,
      })
      const newOptions = preLastFontOptions
      delete preRange[preLastSelection]
      delete curRange[curFirstSelection]
      newRange = {
        [newSelection]: newOptions,
      }
    }
    return {
      ...preRange,
      ...newRange,
      ...curRange,
    }
  }
  //由于数据结构设计和渲染问题，暂不处理空行分段
  breakOptions(options: RenderTextOptions, index: number): void {
    const pSelectionMap: { [sel: Selection]: SelectionObj[] } = {}
    const rSelectionMap: { [sel: Selection]: SelectionObj[] } = {}

    for (const pSelection of options.paragrahsIndex.values()) {
      const psObj = SelectionManage.parseSelection(pSelection)
      //如何标注这种情况？
      if (psObj.startIndex < index && psObj.endIndex > index) {
        pSelectionMap[pSelection] = SelectionManage.difference(psObj, { startIndex: index, endIndex: index })!
      }
    }
    for (const rSelection of options.rowsIndex.values()) {
      const rsObj = SelectionManage.parseSelection(rSelection)
      //如何标注这种情况？
      if (rsObj.startIndex < index && rsObj.endIndex > index) {
        rSelectionMap[rSelection] = SelectionManage.difference(rsObj, { startIndex: index, endIndex: index })!
      }
    }

    const breakPSelection = Object.values(pSelectionMap)[0] || []
    const breakRSelection = Object.values(rSelectionMap)[0] || []
    if (breakPSelection.length != 2) {
      return
    }

    options.paragrahsIndex.map((p, i) => {
      if (pSelectionMap[p] != null) {
        options.paragrahsIndex.splice(i, 1, ...pSelectionMap[p].map((bp) => SelectionManage.stringifySelection(bp)))
      }
    })

    options.rowsIndex.map((r, i) => {
      if (rSelectionMap[r] != null) {
        options.rowsIndex.splice(i, 1, ...rSelectionMap[r].map((br) => SelectionManage.stringifySelection(br)))
      }
    })

    for (const [pSelection, pOptions] of Object.entries(options.paragrahs)) {
      const psObj = SelectionManage.parseSelection(pSelection as Selection)
      if (psObj.startIndex < index && psObj.endIndex > index) {
        delete options.paragrahs[pSelection as Selection]
        options.paragrahs[SelectionManage.stringifySelection(breakPSelection[0])] = {
          ...JSON.parse(JSON.stringify(pOptions)),
          paragrahIndex: pOptions.paragrahIndex,
        }
        options.paragrahs[SelectionManage.stringifySelection(breakPSelection[1])] = {
          ...JSON.parse(JSON.stringify(pOptions)),
          paragrahIndex: pOptions.paragrahIndex + 1,
        }
      } else if (index < psObj.startIndex) {
        pOptions.paragrahIndex += 1
      }
    }

    for (const [pSelection, pOptions] of Object.entries(options.paragrahs)) {
      if (pSelection === SelectionManage.stringifySelection(breakPSelection[0])) {
        for (const [rSelection, rOptions] of Object.entries(pOptions.rows)) {
          const rsObj = SelectionManage.parseSelection(rSelection as Selection)
          if (rsObj.startIndex < index && rsObj.endIndex > index) {
            delete pOptions.rows[rSelection as Selection]
            pOptions.rows[SelectionManage.stringifySelection(breakRSelection[0])] = rOptions

            for (const [fSelection, fOptions] of Object.entries(rOptions.font)) {
              const fsObj = SelectionManage.parseSelection(rSelection as Selection)
              if (fsObj.startIndex < index && fsObj.endIndex > index) {
                delete rOptions.font[fSelection as Selection]
                rOptions.font[SelectionManage.stringifySelection({ startIndex: fsObj.startIndex, endIndex: index })] = {
                  ...fOptions,
                }
              } else if (fsObj.startIndex > index) {
                delete rOptions.font[fSelection as Selection]
              }
            }
          } else if (rsObj.startIndex >= index) {
            delete pOptions.rows[rSelection as Selection]
          }
        }
      }
      if (pSelection === SelectionManage.stringifySelection(breakPSelection[1])) {
        for (const [rSelection, rOptions] of Object.entries(pOptions.rows)) {
          const rsObj = SelectionManage.parseSelection(rSelection as Selection)
          if (rsObj.startIndex < index && rsObj.endIndex > index) {
            delete pOptions.rows[rSelection as Selection]
            pOptions.rows[SelectionManage.stringifySelection(breakRSelection[1])] = {
              ...rOptions,
              rowIndex: ++rOptions.rowIndex,
            }

            for (const [fSelection, fOptions] of Object.entries(rOptions.font)) {
              const fsObj = SelectionManage.parseSelection(rSelection as Selection)
              if (fsObj.startIndex < index && fsObj.endIndex > index) {
                delete rOptions.font[fSelection as Selection]
                rOptions.font[SelectionManage.stringifySelection({ startIndex: index, endIndex: fsObj.endIndex })] =
                  fOptions
              } else if (fsObj.endIndex < index) {
                delete rOptions.font[fSelection as Selection]
              }
            }
          } else if (rsObj.endIndex <= index) {
            delete pOptions.rows[rSelection as Selection]
          } else {
            pOptions.rows[rSelection as Selection] = { ...rOptions, rowIndex: ++rOptions.rowIndex }
          }
        }
      }
    }
  }
}
