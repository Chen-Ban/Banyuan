import { lazy } from 'react'
import { HorAlign, RenderTextOptions, VerAlign, Box } from 'store/types/Template.type'
import { Random } from 'mockjs'

export const emptyBox = (): Omit<Box, 'path'> => ({
  size: {
    height: 0,
    width: 0,
  },
  location: {
    x: 0,
    y: 0,
    w: 1,
  },
})

export const randomFontOptions = Array.from({ length: 10 }, () => ({
  fontFamily: 'Arial',
  fontWeight: 'normal',
  // fontSize: Random.integer(24, 48),
  fontSize: 24,
  italicly: false,
  underLine: false,
  color: 0x000000,
  characterWidth: [],
}))

//TODO抽取出构造函数，传入属性构建，或抽离成常量；方便拓展(后续再考虑数据库存储)
export default [
  {
    componentId: '0001-001',
    componentName: '一级标题二级sd一级标题二级标题黑',
    component: lazy(() => import('./TextTemplate')),
    propName: 'title',

    options: {
      rowsIndex: ['0-4', '4-8', '8-12', '12-17'],
      paragrahsIndex: ['0-8', '8-17'],
      paragrahs: {
        '0-8': {
          rows: {
            '0-4': {
              font: {
                '0-4': randomFontOptions[Random.integer(0, 9)],
              },
              contentBox: emptyBox(),
              rowIndex: 0,
            },
            '4-8': {
              font: {
                '4-6': randomFontOptions[Random.integer(0, 9)],
                '6-8': randomFontOptions[Random.integer(0, 9)],
              },
              contentBox: emptyBox(),
              rowIndex: 1,
            },
          },
          contentBox: emptyBox(),
          preGap: 0,
          postGap: 0,
          paragrahIndex: 0,
        },
        '8-17': {
          rows: {
            '8-12': {
              font: {
                '8-12': randomFontOptions[Random.integer(0, 9)],
              },
              contentBox: emptyBox(),
              rowIndex: 2,
            },
            '12-17': {
              font: {
                '12-16': randomFontOptions[Random.integer(0, 9)],
                '16-17': randomFontOptions[Random.integer(0, 9)],
              },
              contentBox: emptyBox(),
              rowIndex: 3,
            },
          },
          contentBox: emptyBox(),
          preGap: 0,
          postGap: 0,
          paragrahIndex: 1,
        },
      },
      isAdoptiveHeight: true,
      selection: '17-17',
      selectionBoxes: [],
      minContentWidth: Infinity,
      align: { vertical: VerAlign.TOP, horizontal: HorAlign.LEFT },
      contentBox: {
        size: { width: 0, height: 0 },
        location: { x: 0, y: 0, w: 1 },
        path: [],
      },
      Leading: 1,
    } as RenderTextOptions,
    type: '文本',
  },
  // {
  //   componentId: '0001-001',
  //   componentName: '标题',
  //   propName: 'content',
  //   component: lazy(() => import('./TextTemplate')),
  //   options: {
  //     rowsIndex: ['0-2'],
  //     paragrahsIndex: ['0-2'],
  //     paragrahs: {
  //       '0-2': {
  //         rows: {
  //           '0-2': {
  //             font: {
  //               '0-2': randomFontOptions[Random.integer(0, 9)],
  //             },
  //             contentBox: emptyBox(),
  //             rowIndex: 0,
  //           },
  //         },
  //         contentBox: emptyBox(),
  //         preGap: 0,
  //         postGap: 10,
  //         paragrahIndex: 0,
  //       },
  //     },
  //     isAdoptiveHeight: true,

  //     selection: '2-2',
  //     selectionBoxes: [],
  //     minContentWidth: Infinity,
  //     align: { vertical: VerAlign.MIDDLE, horizontal: HorAlign.CENTER },
  //     contentBox: {
  //       size: { width: 0, height: 0 },
  //       location: { x: 0, y: 0, w: 1 },
  //       path: [],
  //     },
  //     Leading: 3,
  //   } as RenderTextOptions,
  //   type: '文本',
  // },
  {
    componentId: '0001-002',
    componentName: '正文文本',
    propName: 'content',
    component: lazy(() => import('./TextTemplate')),
    options: {
      rowsIndex: ['0-4'],
      paragrahsIndex: ['0-4'],
      paragrahs: {
        '0-4': {
          rows: {
            '0-4': {
              font: {
                '0-2': randomFontOptions[Random.integer(0, 9)],
                '2-4': randomFontOptions[Random.integer(0, 9)],
              },
              contentBox: emptyBox(),
              rowIndex: 0,
            },
          },
          contentBox: emptyBox(),
          preGap: 0,
          postGap: 10,
          paragrahIndex: 0,
        },
      },
      isAdoptiveHeight: true,

      selection: '4-4',
      selectionBoxes: [],
      minContentWidth: Infinity,
      align: { vertical: VerAlign.TOP, horizontal: HorAlign.LEFT },
      contentBox: {
        size: { width: 0, height: 0 },
        location: { x: 0, y: 0, w: 1 },
        path: [],
      },
      Leading: 1,
    } as RenderTextOptions,

    type: '文本',
  },
]
